const { Queue } = require("bullmq");
const redis = require("../lib/redis");

const publishQueue = new Queue("publish-jobs", {
  connection: redis
});

function getPublishJobId(scheduledPostId) {
  return `scheduled-post-${scheduledPostId}`;
}

async function addPublishJob({ scheduledPostId, runAt }) {
  const delay = Math.max(new Date(runAt).getTime() - Date.now(), 0);

  return publishQueue.add(
    "publish-post",
    { scheduledPostId },
    {
      jobId: getPublishJobId(scheduledPostId),
      delay,
      removeOnComplete: 100,
      removeOnFail: 100
    }
  );
}

async function removePublishJob(scheduledPostId) {
  const jobId = getPublishJobId(scheduledPostId);
  const job = await publishQueue.getJob(jobId);

  if (!job) return false;

  await job.remove();
  return true;
}

module.exports = {
  publishQueue,
  addPublishJob,
  removePublishJob,
  getPublishJobId
};