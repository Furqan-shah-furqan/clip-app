const prisma = require("../../lib/prisma");
const { publishYouTubePost } = require("./youtubePublisher");
const { publishInstagramPost } = require("./instagramPublisher");

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

const RUNNABLE_STATUSES = ["DRAFT", "QUEUED", "FAILED", "RETRYING"];

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

async function claimScheduledPostForExecution(
  scheduledPostId,
  { skipIfAlreadyHandled = false } = {},
) {
  const claimResult = await prisma.scheduledPost.updateMany({
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

  if (skipIfAlreadyHandled) {
    return {
      skipped: true,
      reason: `not_runnable_${current.status.toLowerCase()}`,
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

    return normalizedPublishResult;
  } catch (error) {
    await prisma.$transaction([
      prisma.publishAttempt.create({
        data: {
          scheduledPostId,
          attemptNumber: nextAttemptNumber,
          status: "failed",
          requestPayloadJson: error.requestPayload || null,
          responsePayloadJson: error.responsePayload || null,
          errorMessage: error.message,
        },
      }),
      prisma.scheduledPost.update({
        where: { id: scheduledPostId },
        data: {
          status: "FAILED",
          errorMessage: error.message,
        },
      }),
    ]);

    throw error;
  }
}

module.exports = {
  runScheduledPostById,
  ScheduledPostExecutionError,
};