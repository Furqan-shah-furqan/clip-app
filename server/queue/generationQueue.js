const { Queue } = require("bullmq");
const { createRedisClient } = require("../lib/redis");
const defaultRedis = require("../lib/redis");
const {
  GENERATION_QUEUE_NAME,
  WORKER_HEARTBEAT_KEY,
} = require("./generationConstants");

// Dedicated Redis connection for BullMQ Queue operations
const queueConnection = createRedisClient("GenerationQueue", "producer");

const generationQueue = new Queue(GENERATION_QUEUE_NAME, {
  connection: queueConnection,
});

generationQueue.on("error", (err) => console.error("[GenerationQueue] Redis unavailable:", err.message));

function getGenerationBullJobId(generationJobId) {
  return `generation-${generationJobId}`;
}

/**
 * Checks if the generation worker has posted a heartbeat recently.
 * @returns {Promise<boolean>}
 */
async function isGenerationWorkerAlive() {
  try {
    const exists = await defaultRedis.exists(WORKER_HEARTBEAT_KEY);
    return exists === 1;
  } catch {
    return false;
  }
}

async function getGenerationQueueHealth() {
  try {
    await queueConnection.ping();
    return { redis: "ready", worker: (await isGenerationWorkerAlive()) ? "ready" : "starting" };
  } catch {
    return { redis: "unavailable", worker: "unavailable" };
  }
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

  // Check worker heartbeat before enqueuing to produce actionable diagnostics
  const workerAlive = await isGenerationWorkerAlive();
  if (!workerAlive) {
    console.warn(
      `[GenerationQueue] Notice: No active generation worker heartbeat detected in Redis. Job ${generationJobId} will be queued, but ensure a background worker is running.`
    );
  }

  console.log(
    `[GenerationQueue] Adding generation job ${generationJobId} to queue "${GENERATION_QUEUE_NAME}" (BullMQ Job ID: ${bullJobId})`
  );

  const job = await generationQueue.add(
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

  console.log(
    `[GenerationQueue] Added generation job ${generationJobId}, BullMQ job id: ${job.id} on queue "${GENERATION_QUEUE_NAME}"`
  );

  return job;
}

async function removeGenerationJob(generationJobId) {
  const bullJobId = getGenerationBullJobId(generationJobId);
  const job = await generationQueue.getJob(bullJobId);

  if (!job) return false;

  await job.remove();
  console.log(`[GenerationQueue] Removed BullMQ job ${bullJobId} from queue "${GENERATION_QUEUE_NAME}"`);
  return true;
}

module.exports = {
  GENERATION_QUEUE_NAME,
  generationQueue,
  addGenerationJob,
  removeGenerationJob,
  getGenerationBullJobId,
  isGenerationWorkerAlive,
  getGenerationQueueHealth,
};
