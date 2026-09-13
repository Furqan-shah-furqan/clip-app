require("dotenv").config();
const { Worker } = require("bullmq");
const redis = require("../lib/redis");
const prisma = require("../lib/prisma");
const { GENERATION_QUEUE_NAME } = require("./generationQueue");
const {
  runSmartGeneration,
  cleanSmartClipError,
} = require("../services/smartGenerationService");
const { terminateJobProcess } = require("../services/smartClipService");

const concurrency = Math.max(
  1,
  parseInt(process.env.GENERATION_WORKER_CONCURRENCY || "1", 10)
);

console.log(
  `[GenerationWorker] Initializing worker on queue "${GENERATION_QUEUE_NAME}" with concurrency: ${concurrency}`
);

const generationWorker = new Worker(
  GENERATION_QUEUE_NAME,
  async (job) => {
    const { generationJobId } = job.data || {};

    if (!generationJobId) {
      throw new Error("Missing generationJobId in generation job payload");
    }

    console.log(`[GenerationWorker] Picked up job ${job.id} for GenerationJob ID: ${generationJobId}`);

    // 1. Fetch persistent GenerationJob from Prisma
    const dbJob = await prisma.generationJob.findUnique({
      where: { id: generationJobId },
    });

    if (!dbJob) {
      throw new Error(`GenerationJob record ${generationJobId} not found in database`);
    }

    // Check if cancellation was already requested
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

    // 2. Mark started & update attempt info
    const attemptCount = (dbJob.attemptCount || 0) + 1;
    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: {
        attemptCount,
        startedAt: dbJob.startedAt || new Date(),
        status: "TRANSCRIBING",
        stage: "Starting smart generation...",
        progress: 5,
        bullJobId: job.id,
      },
    });

    const isCancelled = async () => {
      const current = await prisma.generationJob.findUnique({
        where: { id: generationJobId },
        select: { cancelRequestedAt: true, status: true },
      });
      return Boolean(current?.cancelRequestedAt || current?.status === "CANCELLED");
    };

    const onProgress = async (progressPercent, stageMessage) => {
      console.log(
        `[GenerationWorker][${generationJobId}] [${progressPercent}%] ${stageMessage}`
      );

      let status = "RENDERING";
      if (progressPercent <= 25) status = "TRANSCRIBING";
      else if (progressPercent <= 45) status = "SELECTING_MOMENTS";
      else if (progressPercent <= 55 && stageMessage.toLowerCase().includes("download")) status = "DOWNLOADING";
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
    connection: redis,
    concurrency,
  }
);

generationWorker.on("completed", (job) => {
  console.log(`[GenerationWorker] BullMQ job ${job.id} marked completed`);
});

generationWorker.on("failed", (job, err) => {
  console.error(
    `[GenerationWorker] BullMQ job ${job?.id} failed on attempt ${job?.attemptsMade}/${job?.opts?.attempts}: ${err.message}`
  );
});

generationWorker.on("error", (err) => {
  console.error("[GenerationWorker] Worker internal error:", err);
});

// Graceful shutdown handling
let isShuttingDown = false;
const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[GenerationWorker] Received ${signal}. Closing worker gracefully...`);

  try {
    await generationWorker.close();
    console.log("[GenerationWorker] BullMQ worker closed successfully.");
    await prisma.$disconnect();
    console.log("[GenerationWorker] Prisma disconnected.");
    process.exit(0);
  } catch (err) {
    console.error("[GenerationWorker] Error during shutdown:", err);
    process.exit(1);
  }
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

module.exports = generationWorker;
