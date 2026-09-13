const { Queue } = require("bullmq");
const redis = require("../lib/redis");

const GENERATION_QUEUE_NAME = "clip-generation-jobs";

const generationQueue = new Queue(GENERATION_QUEUE_NAME, {
  connection: redis,
});

function getGenerationBullJobId(generationJobId) {
  return `generation-${generationJobId}`;
}

/**
 * Enqueues a generation job by its database GenerationJob ID.
 * Payload keeps minimal metadata; the PostgreSQL record is the authoritative state.
 */
async function addGenerationJob(generationJobId) {
  if (!generationJobId) {
    throw new Error("generationJobId is required to enqueue generation job");
  }

  const bullJobId = getGenerationBullJobId(generationJobId);

  return generationQueue.add(
    "generate-smart-clips",
    { generationJobId },
    {
      jobId: bullJobId,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: 100,
      removeOnFail: 100,
    }
  );
}

async function removeGenerationJob(generationJobId) {
  const bullJobId = getGenerationBullJobId(generationJobId);
  const job = await generationQueue.getJob(bullJobId);

  if (!job) return false;

  await job.remove();
  return true;
}

module.exports = {
  GENERATION_QUEUE_NAME,
  generationQueue,
  addGenerationJob,
  removeGenerationJob,
  getGenerationBullJobId,
};
