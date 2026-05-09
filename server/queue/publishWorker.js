const { Worker } = require("bullmq");
const redis = require("../lib/redis");
const { runScheduledPostById } = require("../services/publishing/runScheduledPost");

const publishWorker = new Worker(
  "publish-jobs",
  async (job) => {
    const { scheduledPostId } = job.data;

    const result = await runScheduledPostById(scheduledPostId, {
      skipIfAlreadyHandled: true
    });

    if (result?.skipped) {
      console.log(
        `[PublishWorker] Skipped schedule ${scheduledPostId}: ${result.reason}`
      );
    }

    return result;
  },
  {
    connection: redis
  }
);

publishWorker.on("completed", (job) => {
  console.log(`[PublishWorker] Completed job ${job.id}`);
});

publishWorker.on("failed", (job, err) => {
  console.error(`[PublishWorker] Failed job ${job?.id}:`, err.message);
});

module.exports = publishWorker;