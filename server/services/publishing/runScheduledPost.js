const prisma = require("../../lib/prisma");
const { publishYouTubePost } = require("./youtubePublisher");
const { publishInstagramPost } = require("./instagramPublisher");

const RUNNABLE_STATUSES = ["DRAFT", "QUEUED", "FAILED", "RETRYING"];
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;

function normalizePublishResult(result) {
  const responsePayload =
    result?.responsePayload ||
    result?.raw ||
    result ||
    {};

  const platformPostId =
    result?.platformPostId ||
    result?.videoId ||
    result?.mediaId ||
    responsePayload?.id ||
    responsePayload?.publishedMedia?.id ||
    null;

  const requestPayload =
    result?.requestPayload ||
    responsePayload?.requestPayload ||
    {
      note: "Request payload was not returned by publisher.",
    };

  return {
    platform: result?.platform || "",
    platformPostId,
    requestPayload,
    responsePayload,
  };
}

function getErrorMessage(error) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.error?.message ||
    error?.message ||
    "Publishing failed."
  );
}

function getErrorResponsePayload(error) {
  return (
    error?.responsePayload ||
    error?.response?.data ||
    error?.error ||
    {
      message: getErrorMessage(error),
    }
  );
}

function isStaleProcessingSchedule(schedule) {
  if (!schedule || schedule.status !== "PROCESSING") return false;

  const updatedAtTime = new Date(
    schedule.updatedAt || schedule.createdAt || Date.now()
  ).getTime();

  if (Number.isNaN(updatedAtTime)) return false;

  return Date.now() - updatedAtTime > PROCESSING_TIMEOUT_MS;
}

class ScheduledPostExecutionError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = "ScheduledPostExecutionError";
    this.code = code;
    Object.assign(this, extra);
  }
}

async function loadScheduledPost(scheduledPostId) {
  return prisma.scheduledPost.findUnique({
    where: { id: scheduledPostId },
    include: {
      socialAccount: true,
      clip: true,
      publishAttempts: true,
    },
  });
}

async function resetStaleProcessingSchedule(schedule) {
  console.log(
    `[PublishRunner] Recovering stale PROCESSING schedule ${schedule.id}`
  );

  await prisma.scheduledPost.update({
    where: { id: schedule.id },
    data: {
      status: "RETRYING",
      errorMessage:
        "Recovered stale PROCESSING job. Previous worker did not finish cleanly.",
    },
  });
}

async function claimScheduledPostForExecution(
  scheduledPostId,
  { skipIfAlreadyHandled = false } = {},
) {
  let claimResult = await prisma.scheduledPost.updateMany({
    where: {
      id: scheduledPostId,
      status: {
        in: RUNNABLE_STATUSES,
      },
    },
    data: {
      status: "PROCESSING",
      errorMessage: null,
    },
  });

  if (claimResult.count === 1) {
    return { claimed: true };
  }

  const current = await loadScheduledPost(scheduledPostId);

  if (!current) {
    throw new ScheduledPostExecutionError(
      "NOT_FOUND",
      `Scheduled post not found: ${scheduledPostId}`,
    );
  }

  if (current.status === "PUBLISHED") {
    if (skipIfAlreadyHandled) {
      return {
        skipped: true,
        reason: "already_published",
        scheduledPost: current,
      };
    }

    throw new ScheduledPostExecutionError(
      "ALREADY_PUBLISHED",
      "This scheduled post is already published",
      { scheduledPost: current },
    );
  }

  if (current.status === "PROCESSING") {
    const stale = isStaleProcessingSchedule(current);

    if (!stale) {
      if (skipIfAlreadyHandled) {
        return {
          skipped: true,
          reason: "already_processing",
          scheduledPost: current,
        };
      }

      throw new ScheduledPostExecutionError(
        "ALREADY_PROCESSING",
        "This scheduled post is already being processed",
        { scheduledPost: current },
      );
    }

    await resetStaleProcessingSchedule(current);

    claimResult = await prisma.scheduledPost.updateMany({
      where: {
        id: scheduledPostId,
        status: "RETRYING",
      },
      data: {
        status: "PROCESSING",
        errorMessage: null,
      },
    });

    if (claimResult.count === 1) {
      return { claimed: true, recovered: true };
    }

    const latest = await loadScheduledPost(scheduledPostId);

    if (skipIfAlreadyHandled) {
      return {
        skipped: true,
        reason: `not_claimed_after_stale_recovery_${String(
          latest?.status || "unknown"
        ).toLowerCase()}`,
        scheduledPost: latest,
      };
    }

    throw new ScheduledPostExecutionError(
      "CLAIM_FAILED_AFTER_STALE_RECOVERY",
      "Could not claim stale processing schedule after recovery.",
      { scheduledPost: latest },
    );
  }

  if (skipIfAlreadyHandled) {
    return {
      skipped: true,
      reason: `not_runnable_${String(current.status || "unknown").toLowerCase()}`,
      scheduledPost: current,
    };
  }

  throw new ScheduledPostExecutionError(
    "NOT_RUNNABLE",
    `Cannot run scheduled post from status ${current.status}`,
    { scheduledPost: current },
  );
}

async function publishScheduledPost(scheduledPost) {
  const platform = String(scheduledPost.platform || "").toUpperCase();

  if (platform === "YOUTUBE") {
    return publishYouTubePost(scheduledPost);
  }

  if (platform === "INSTAGRAM") {
    return publishInstagramPost(scheduledPost);
  }

  throw new ScheduledPostExecutionError(
    "UNSUPPORTED_PLATFORM",
    `Unsupported platform: ${scheduledPost.platform}`,
  );
}

async function markScheduledPostFailed({
  scheduledPostId,
  nextAttemptNumber,
  error,
}) {
  const message = getErrorMessage(error);
  const responsePayload = getErrorResponsePayload(error);

  await prisma.$transaction([
    prisma.publishAttempt.create({
      data: {
        scheduledPostId,
        attemptNumber: nextAttemptNumber,
        status: "failed",
        requestPayloadJson: error?.requestPayload || null,
        responsePayloadJson: responsePayload || null,
        errorMessage: message,
      },
    }),
    prisma.scheduledPost.update({
      where: { id: scheduledPostId },
      data: {
        status: "FAILED",
        errorMessage: message,
      },
    }),
  ]);
}

async function runScheduledPostById(
  scheduledPostId,
  { skipIfAlreadyHandled = false } = {},
) {
  const claim = await claimScheduledPostForExecution(scheduledPostId, {
    skipIfAlreadyHandled,
  });

  if (claim.skipped) {
    return {
      skipped: true,
      reason: claim.reason,
      schedule: claim.scheduledPost,
    };
  }

  const scheduledPost = await loadScheduledPost(scheduledPostId);

  if (!scheduledPost) {
    throw new ScheduledPostExecutionError(
      "NOT_FOUND",
      `Scheduled post not found after claim: ${scheduledPostId}`,
    );
  }

  const nextAttemptNumber =
    (await prisma.publishAttempt.count({
      where: { scheduledPostId },
    })) + 1;

  try {
    console.log("[PublishRunner] Publishing schedule:", {
      scheduledPostId,
      platform: scheduledPost.platform,
      title: scheduledPost.title,
      clipId: scheduledPost.clipId,
      accountId: scheduledPost.socialAccountId,
    });

    const result = await publishScheduledPost(scheduledPost);
    const normalizedPublishResult = normalizePublishResult(result);

    if (!normalizedPublishResult.platformPostId) {
      throw new Error("Publishing completed but no platform post ID was returned.");
    }

    await prisma.$transaction([
      prisma.publishAttempt.create({
        data: {
          scheduledPostId,
          attemptNumber: nextAttemptNumber,
          status: "success",
          requestPayloadJson: normalizedPublishResult.requestPayload,
          responsePayloadJson: normalizedPublishResult.responsePayload,
        },
      }),
      prisma.scheduledPost.update({
        where: { id: scheduledPostId },
        data: {
          status: "PUBLISHED",
          platformPostId: normalizedPublishResult.platformPostId,
          errorMessage: null,
          publishedAt: new Date(),
        },
      }),
    ]);

    console.log("[PublishRunner] Published schedule successfully:", {
      scheduledPostId,
      platformPostId: normalizedPublishResult.platformPostId,
    });

    return normalizedPublishResult;
  } catch (error) {
    console.error("[PublishRunner] Publish failed:", {
      scheduledPostId,
      message: getErrorMessage(error),
      error,
    });

    try {
      await markScheduledPostFailed({
        scheduledPostId,
        nextAttemptNumber,
        error,
      });
    } catch (dbError) {
      console.error("[PublishRunner] Failed to mark schedule as FAILED:", {
        scheduledPostId,
        originalError: getErrorMessage(error),
        dbError,
      });
    }

    throw error;
  }
}

module.exports = {
  runScheduledPostById,
  ScheduledPostExecutionError,
};