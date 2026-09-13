require("dotenv").config();
const { Worker } = require("bullmq");
const { createRedisClient } = require("../lib/redis");
const defaultRedis = require("../lib/redis");
const prisma = require("../lib/prisma");
const {
  GENERATION_QUEUE_NAME,
  WORKER_HEARTBEAT_KEY,
  WORKER_HEARTBEAT_TTL_SEC,
  WORKER_HEARTBEAT_INTERVAL_MS,
} = require("./generationConstants");
const {
  runSmartGeneration,
  cleanSmartClipError,
} = require("../services/smartGenerationService");
const { terminateJobProcess } = require("../services/smartClipService");

const concurrency = Math.max(
  1,
  parseInt(process.env.GENERATION_WORKER_CONCURRENCY || "1", 10)
);

console.log("[GenerationWorker] Starting...");

// Dedicated connection for the BullMQ Worker (handles blocking BRPOP/BLPOP commands)
const workerConnection = createRedisClient("GenerationWorker");

// ── Heartbeat Mechanism ───────────────────────────────────────────────────────
let heartbeatInterval = null;

async function sendWorkerHeartbeat() {
  try {
    await defaultRedis.set(
      WORKER_HEARTBEAT_KEY,
      String(Date.now()),
      "EX",
      WORKER_HEARTBEAT_TTL_SEC
    );
  } catch (err) {
    console.warn(`[GenerationWorker] Heartbeat write failed: ${err.message}`);
  }
}

async function startHeartbeat() {
  await sendWorkerHeartbeat();
  heartbeatInterval = setInterval(sendWorkerHeartbeat, WORKER_HEARTBEAT_INTERVAL_MS);
}

// ── Validate Database and Start Worker ────────────────────────────────────────
async function initWorker() {
  try {
    // 1. Verify Prisma database connectivity
    await prisma.$queryRaw`SELECT 1`;
    console.log("[GenerationWorker] Database ready");

    // 2. Verify Redis connectivity
    await defaultRedis.ping();
    console.log("[GenerationWorker] Redis ready");

    console.log(`[GenerationWorker] Queue: ${GENERATION_QUEUE_NAME}`);
    console.log(`[GenerationWorker] Concurrency: ${concurrency}`);

    // 3. Start worker heartbeat in Redis
    await startHeartbeat();
    console.log("[GenerationWorker] Heartbeat started");

    console.log("[GenerationWorker] Ready and waiting for jobs");
  } catch (err) {
    console.error(`[GenerationWorker] Startup check failed: ${err.message}`);
    process.exit(1);
  }
}

initWorker();

const generationWorker = new Worker(
  GENERATION_QUEUE_NAME,
  async (job) => {
    const { generationJobId } = job.data || {};

    if (!generationJobId) {
      throw new Error("Missing generationJobId in generation job payload");
    }

    console.log(`[GenerationWorker] Active job ${job.id} for GenerationJob ID: ${generationJobId}`);

    // 1. Fetch persistent GenerationJob from Prisma
    const dbJob = await prisma.generationJob.findUnique({
      where: { id: generationJobId },
    });

    // Handle Case B: BullMQ job exists but database record does not
    if (!dbJob) {
      console.warn(
        `[GenerationWorker] GenerationJob record ${generationJobId} not found in database. Removing stale queue job.`
      );
      return { skipped: true, reason: "Record not found in database" };
    }

    // Check if job is already completed or cancelled before processing
    if (dbJob.status === "COMPLETED") {
      console.log(
        `[GenerationWorker] Job ${generationJobId} is already COMPLETED. Skipping duplicate execution.`
      );
      return { skipped: true, reason: "Already completed" };
    }

    if (dbJob.cancelRequestedAt || dbJob.status === "CANCELLED") {
      console.log(`[GenerationWorker] Job ${generationJobId} was cancelled before starting`);
      await prisma.generationJob.update({
        where: { id: generationJobId },
        data: {
          status: "CANCELLED",
          stage: "Cancelled by user",
          completedAt: new Date(),
        },
      });
      return { cancelled: true };
    }

    // 2. Claim job immediately in database (Proves queue consumption)
    const attemptCount = (dbJob.attemptCount || 0) + 1;
    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: {
        attemptCount,
        startedAt: dbJob.startedAt || new Date(),
        status: "TRANSCRIBING",
        stage: "Starting generation...",
        progress: 5,
        bullJobId: job.id,
      },
    });

    console.log(`[GenerationWorker] Job ${job.id} started (claimed in database as TRANSCRIBING)`);

    const isCancelled = async () => {
      const current = await prisma.generationJob.findUnique({
        where: { id: generationJobId },
        select: { cancelRequestedAt: true, status: true },
      });
      return Boolean(current?.cancelRequestedAt || current?.status === "CANCELLED");
    };

    let lastProgressTime = Date.now();

    const onProgress = async (progressPercent, stageMessage) => {
      lastProgressTime = Date.now();
      console.log(
        `[GenerationWorker][${generationJobId}] [${progressPercent}%] ${stageMessage}`
      );

      let status = "RENDERING";
      if (progressPercent <= 25) status = "TRANSCRIBING";
      else if (progressPercent <= 45) status = "SELECTING_MOMENTS";
      else if (progressPercent <= 64 && stageMessage.toLowerCase().includes("download")) status = "DOWNLOADING";
      else if (progressPercent >= 98) status = "FINALIZING";

      try {
        await prisma.generationJob.update({
          where: { id: generationJobId },
          data: {
            progress: progressPercent,
            stage: stageMessage,
            status,
          },
        });
        await job.updateProgress(progressPercent);
      } catch (err) {
        console.warn(
          `[GenerationWorker][${generationJobId}] Progress update failed:`,
          err.message
        );
      }
    };

    try {
      // 3. Execute smart generation pipeline in isolated workspace
      const result = await runSmartGeneration({
        generationJobId,
        payload: dbJob.requestJson,
        onProgress,
        isCancelled,
      });

      // 4. Handle YouTube AWAITING_UPLOAD case
      if (result.needsUpload) {
        console.log(
          `[GenerationWorker][${generationJobId}] YouTube direct download unavailable. Setting AWAITING_UPLOAD.`
        );
        await prisma.generationJob.update({
          where: { id: generationJobId },
          data: {
            status: "AWAITING_UPLOAD",
            stage:
              result.message ||
              "YouTube video download unavailable. Please upload source video directly.",
            suggestionsJson: result.suggestions || [],
            errorMessage: result.message || null,
          },
        });
        return result;
      }

      // 5. Success: persist results to database
      console.log(
        `[GenerationWorker][${generationJobId}] Generated ${result.clips?.length || 0} clips successfully.`
      );

      await prisma.generationJob.update({
        where: { id: generationJobId },
        data: {
          status: "COMPLETED",
          progress: 100,
          stage: "Completed",
          suggestionsJson: result.suggestions || [],
          resultJson: { clips: result.clips || [] },
          completedAt: new Date(),
          errorMessage: null,
        },
      });

      return result;
    } catch (err) {
      if (err.message === "Job cancelled by user") {
        console.log(`[GenerationWorker][${generationJobId}] Cancelled by user`);
        terminateJobProcess(generationJobId);
        await prisma.generationJob.update({
          where: { id: generationJobId },
          data: {
            status: "CANCELLED",
            stage: "Cancelled by user",
            completedAt: new Date(),
          },
        });
        return { cancelled: true };
      }

      const cleanMsg = cleanSmartClipError(err);
      const maxAttempts = job.opts.attempts || 3;
      const currentAttempt = (job.attemptsMade || 0) + 1;
      const isFinalAttempt = currentAttempt >= maxAttempts;

      if (isFinalAttempt) {
        console.error(
          `[GenerationWorker][${generationJobId}] Final attempt ${currentAttempt}/${maxAttempts} failed: ${cleanMsg}`
        );
        await prisma.generationJob.update({
          where: { id: generationJobId },
          data: {
            status: "FAILED",
            errorMessage: cleanMsg.slice(0, 500),
            stage: `Generation failed: ${cleanMsg.slice(0, 100)}`,
            completedAt: new Date(),
          },
        });
      } else {
        console.warn(
          `[GenerationWorker][${generationJobId}] Attempt ${currentAttempt}/${maxAttempts} failed. Re-queuing for retry... Error: ${cleanMsg}`
        );
        await prisma.generationJob.update({
          where: { id: generationJobId },
          data: {
            status: "QUEUED",
            stage: `Retrying (attempt ${currentAttempt + 1} of ${maxAttempts})...`,
            errorMessage: `Attempt ${currentAttempt} failed: ${cleanMsg.slice(0, 200)}`,
          },
        });
      }

      throw err;
    }
  },
  {
    connection: workerConnection,
    concurrency,
  }
);

generationWorker.on("completed", (job) => {
  console.log(`[GenerationWorker] Job ${job.id} completed`);
});

generationWorker.on("failed", (job, err) => {
  console.error(
    `[GenerationWorker] Job ${job?.id} failed: ${err.message}`
  );
});

generationWorker.on("error", (err) => {
  console.error("[GenerationWorker] Worker error:", err.message);
});

// Graceful shutdown handling
let isShuttingDown = false;
const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[GenerationWorker] Received ${signal}. Closing worker gracefully...`);

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  try {
    await defaultRedis.del(WORKER_HEARTBEAT_KEY);
  } catch {}

  try {
    await generationWorker.close();
    console.log("[GenerationWorker] BullMQ worker closed successfully.");
    await prisma.$disconnect();
    console.log("[GenerationWorker] Prisma disconnected.");
    process.exit(0);
  } catch (err) {
    console.error("[GenerationWorker] Error during shutdown:", err.message);
    process.exit(1);
  }
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

module.exports = generationWorker;
