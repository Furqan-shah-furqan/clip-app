const prisma = require("../lib/prisma");
const { addPublishJob, removePublishJob } = require("../queue/publishQueue");

const EDITABLE_STATUSES = ["DRAFT", "QUEUED", "FAILED", "RETRYING"];
const CANCELLABLE_STATUSES = ["DRAFT", "QUEUED", "FAILED", "RETRYING"];
const RETRYABLE_STATUSES = ["FAILED", "CANCELLED"];

class ScheduleMutationError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = "ScheduleMutationError";
    this.code = code;
    Object.assign(this, extra);
  }
}

function buildScheduleInclude() {
  return {
    socialAccount: true,
    clip: true,
    publishAttempts: true
  };
}

async function getScheduledPostById(id) {
  return prisma.scheduledPost.findUnique({
    where: { id },
    include: buildScheduleInclude()
  });
}

async function createScheduledPost(payload) {
  const {
    userId,
    socialAccountId,
    clipId,
    platform,
    title,
    caption,
    hashtags,
    visibility,
    scheduledFor
  } = payload;

  const scheduledPost = await prisma.scheduledPost.create({
    data: {
      userId,
      socialAccountId,
      clipId,
      platform,
      title,
      caption,
      hashtags,
      visibility,
      scheduledFor: new Date(scheduledFor),
      status: "QUEUED"
    }
  });

  await addPublishJob({
    scheduledPostId: scheduledPost.id,
    runAt: scheduledPost.scheduledFor
  });

  return getScheduledPostById(scheduledPost.id);
}

async function listScheduledPosts() {
  return prisma.scheduledPost.findMany({
    include: buildScheduleInclude(),
    orderBy: {
      scheduledFor: "asc"
    }
  });
}

function assertFutureDate(value, fieldName = "scheduledFor") {
  const when = new Date(value);

  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
    throw new ScheduleMutationError(
      "INVALID_SCHEDULE_TIME",
      `${fieldName} must be a valid future datetime`
    );
  }

  return when;
}

async function updateScheduledPost(id, updates) {
  const schedule = await getScheduledPostById(id);

  if (!schedule) {
    throw new ScheduleMutationError("NOT_FOUND", "Scheduled post not found");
  }

  if (!EDITABLE_STATUSES.includes(schedule.status)) {
    throw new ScheduleMutationError(
      "NOT_EDITABLE",
      `Cannot edit a schedule in ${schedule.status} status`,
      { schedule }
    );
  }

  const data = {};
  let shouldRescheduleQueuedJob = false;

  if (updates.title !== undefined) {
    const title = String(updates.title || "").trim();
    if (!title) {
      throw new ScheduleMutationError("INVALID_TITLE", "Title is required");
    }
    data.title = title.slice(0, 100);
  }

  if (updates.caption !== undefined) {
    data.caption = updates.caption == null ? null : String(updates.caption);
  }

  if (updates.hashtags !== undefined) {
    data.hashtags = updates.hashtags == null ? null : String(updates.hashtags);
  }

  if (updates.visibility !== undefined) {
    data.visibility = updates.visibility == null ? null : String(updates.visibility);
  }

  if (updates.scheduledFor !== undefined) {
    const when = assertFutureDate(updates.scheduledFor);
    data.scheduledFor = when;
    shouldRescheduleQueuedJob = schedule.status === "QUEUED";
  }

  if (!Object.keys(data).length) {
    throw new ScheduleMutationError(
      "NO_UPDATES",
      "No editable fields were provided"
    );
  }

  await prisma.scheduledPost.update({
    where: { id },
    data
  });

  if (shouldRescheduleQueuedJob) {
    await removePublishJob(id);
    await addPublishJob({
      scheduledPostId: id,
      runAt: data.scheduledFor
    });
  }

  return getScheduledPostById(id);
}

async function cancelScheduledPost(id) {
  const schedule = await getScheduledPostById(id);

  if (!schedule) {
    throw new ScheduleMutationError("NOT_FOUND", "Scheduled post not found");
  }

  if (schedule.status === "PUBLISHED") {
    throw new ScheduleMutationError(
      "ALREADY_PUBLISHED",
      "Cannot cancel an already published schedule",
      { schedule }
    );
  }

  if (schedule.status === "PROCESSING") {
    throw new ScheduleMutationError(
      "ALREADY_PROCESSING",
      "Cannot cancel a schedule that is currently processing",
      { schedule }
    );
  }

  if (schedule.status === "CANCELLED") {
    throw new ScheduleMutationError(
      "ALREADY_CANCELLED",
      "This schedule is already cancelled",
      { schedule }
    );
  }

  if (!CANCELLABLE_STATUSES.includes(schedule.status)) {
    throw new ScheduleMutationError(
      "NOT_CANCELLABLE",
      `Cannot cancel a schedule in ${schedule.status} status`,
      { schedule }
    );
  }

  await removePublishJob(id);

  await prisma.scheduledPost.update({
    where: { id },
    data: {
      status: "CANCELLED",
      errorMessage: null
    }
  });

  return getScheduledPostById(id);
}

async function retryScheduledPost(id, options = {}) {
  const schedule = await getScheduledPostById(id);

  if (!schedule) {
    throw new ScheduleMutationError("NOT_FOUND", "Scheduled post not found");
  }

  if (schedule.status === "PUBLISHED") {
    throw new ScheduleMutationError(
      "ALREADY_PUBLISHED",
      "Cannot retry an already published schedule",
      { schedule }
    );
  }

  if (schedule.status === "PROCESSING") {
    throw new ScheduleMutationError(
      "ALREADY_PROCESSING",
      "Cannot retry a schedule that is currently processing",
      { schedule }
    );
  }

  if (!RETRYABLE_STATUSES.includes(schedule.status)) {
    throw new ScheduleMutationError(
      "NOT_RETRYABLE",
      `Only FAILED or CANCELLED schedules can be retried. Current status: ${schedule.status}`,
      { schedule }
    );
  }

  const runAt = options.scheduledFor
    ? assertFutureDate(options.scheduledFor)
    : new Date(Date.now() + 5000);

  await removePublishJob(id);

  await prisma.scheduledPost.update({
    where: { id },
    data: {
      status: "QUEUED",
      scheduledFor: runAt,
      errorMessage: null,
      platformPostId: null,
      publishedAt: null
    }
  });

  await addPublishJob({
    scheduledPostId: id,
    runAt
  });

  return getScheduledPostById(id);
}

module.exports = {
  createScheduledPost,
  listScheduledPosts,
  getScheduledPostById,
  updateScheduledPost,
  cancelScheduledPost,
  retryScheduledPost,
  ScheduleMutationError
};