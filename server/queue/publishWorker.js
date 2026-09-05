const { Worker } = require("bullmq");
const redis = require("../lib/redis");
const {
  runScheduledPostById,
} = require("../services/publishing/runScheduledPost");

const publishWorker = new Worker(
  "publish-jobs",
  async (job) => {
    const { scheduledPostId } = job.data || {};

    if (!scheduledPostId) {
      throw new Error("Missing scheduledPostId in publish job data");
    }

    console.log(`[PublishWorker] Starting job ${job.id} for schedule ${scheduledPostId}`);

    const result = await runScheduledPostById(scheduledPostId, {
      skipIfAlreadyHandled: true,
    });

    if (result?.skipped) {
      console.log(
        `[PublishWorker] Skipped schedule ${scheduledPostId}: ${result.reason}`,
      );
    }

    return result;
  },
  {
    connection: redis,
  },
);

publishWorker.on("completed", (job, result) => {
  console.log(`[PublishWorker] Completed job ${job.id}`, result);
});

publishWorker.on("failed", (job, err) => {
  console.error("[PublishWorker] Failed job full error:", err);

  console.error("[PublishWorker] Failed job details:", {
    jobId: job?.id,
    jobName: job?.name,
    jobData: job?.data,
    message: err?.message,
    details: err?.details,
    code: err?.code,
    response: err?.response?.data,
    stack: err?.stack,
  });
});

publishWorker.on("error", (err) => {
  console.error("[PublishWorker] Worker error:", err);
});

module.exports = publishWorker;