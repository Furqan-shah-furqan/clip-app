const prisma = require("../lib/prisma");
const {
  generationQueue,
  addGenerationJob,
  getGenerationBullJobId,
} = require("../queue/generationQueue");

/**
 * Reconciles unfinished generation jobs on worker boot.
 * Essential for Render Free Tier where instances can sleep, restart, or redeploy.
 * PostgreSQL is the source of truth; BullMQ is the execution transport.
 */
async function reconcileInterruptedJobs() {
  console.log("[GenerationRecovery] Scanning for interrupted generation jobs...");

  try {
    const interruptedJobs = await prisma.generationJob.findMany({
      where: {
        status: {
          in: [
            "QUEUED",
            "TRANSCRIBING",
            "ANALYZING",
            "SELECTING_MOMENTS",
            "DOWNLOADING",
            "RENDERING",
            "FINALIZING",
          ],
        },
        cancelRequestedAt: null,
      },
      orderBy: { createdAt: "asc" },
    });

    if (!interruptedJobs.length) {
      console.log("[GenerationRecovery] No interrupted jobs found. Clean boot state.");
      return { recovered: 0, skipped: 0, failed: 0 };
    }

    console.log(
      `[GenerationRecovery] Found ${interruptedJobs.length} non-terminal job(s) to verify.`
    );

    let recovered = 0;
    let skipped = 0;
    let failed = 0;

    for (const job of interruptedJobs) {
      const bullJobId = getGenerationBullJobId(job.id);

      try {
        const existingBullJob = await generationQueue.getJob(bullJobId);

        if (existingBullJob) {
          const state = await existingBullJob.getState();

          // If job is already waiting or delayed in BullMQ, it's healthy and queued
          if (state === "waiting" || state === "delayed") {
            console.log(
              `[GenerationRecovery] Job ${job.id} is already in BullMQ queue (state: ${state}). Preserving.`
            );
            skipped++;
            continue;
          }

          // If active, it belonged to a previous dead process. Remove stale BullMQ lock.
          console.log(
            `[GenerationRecovery] Job ${job.id} in stale state "${state}". Removing old BullMQ job.`
          );
          try {
            await existingBullJob.remove();
          } catch (rmErr) {
            console.warn(
              `[GenerationRecovery] Could not remove stale BullMQ job ${bullJobId}:`,
              rmErr.message
            );
          }
        }

        const currentAttempts = Number(job.attemptCount || 0) + 1;

        // Bounded retry: if a job failed/restarted more than 5 times, fail it safely
        if (currentAttempts > 5) {
          console.warn(
            `[GenerationRecovery] Job ${job.id} exceeded max restart attempts (${currentAttempts}). Marking FAILED.`
          );
          await prisma.generationJob.update({
            where: { id: job.id },
            data: {
              status: "FAILED",
              stage: "Generation failed after multiple server restarts",
              errorMessage:
                "Job was interrupted repeatedly by server restarts and could not complete.",
              completedAt: new Date(),
            },
          });
          failed++;
          continue;
        }

        // Reset database record to recoverable QUEUED state
        console.log(
          `[GenerationRecovery] Re-queuing interrupted job ${job.id} (recovery attempt ${currentAttempts})...`
        );

        await prisma.generationJob.update({
          where: { id: job.id },
          data: {
            status: "QUEUED",
            stage: "Recovering interrupted generation...",
            progress: 5,
            attemptCount: currentAttempts,
          },
        });

        // Enqueue into BullMQ using deterministic ID
        await addGenerationJob(job.id);
        recovered++;
        console.log(`[GenerationRecovery] Successfully re-queued job ${job.id}`);
      } catch (jobErr) {
        console.error(
          `[GenerationRecovery] Error recovering job ${job.id}:`,
          jobErr.message
        );
      }
    }

    console.log(
      `[GenerationRecovery] Recovery complete: ${recovered} re-queued, ${skipped} already queued, ${failed} failed.`
    );
    return { recovered, skipped, failed };
  } catch (err) {
    console.error("[GenerationRecovery] Recovery scan failed:", err.message);
    return { recovered: 0, skipped: 0, failed: 0, error: err.message };
  }
}

module.exports = {
  reconcileInterruptedJobs,
};
