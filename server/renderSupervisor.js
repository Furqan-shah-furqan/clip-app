/**
 * ClipFlow Render Process Supervisor
 *
 * Runs Express API and BullMQ Generation Worker as two separate Node child processes
 * inside ONE Render Free Web Service container.
 *
 * Handles process monitoring, isolated restart backoff, and graceful shutdown.
 */

const { spawn } = require("child_process");
const path = require("path");

console.log("=================================================");
console.log("[Supervisor] Starting ClipFlow Supervisor");
console.log("[Supervisor] Running Web API + Worker in single service");
console.log("=================================================");

let isShuttingDown = false;

const services = {
  web: {
    name: "Web API",
    script: path.resolve(__dirname, "server.js"),
    process: null,
    restartTimeout: null,
    healthyTimer: null,
    backoffMs: 2000,
    restartCount: 0,
  },
  worker: {
    name: "GenerationWorker",
    script: path.resolve(__dirname, "queue", "generationWorker.js"),
    process: null,
    restartTimeout: null,
    healthyTimer: null,
    backoffMs: 2000,
    restartCount: 0,
  },
};

function startService(key) {
  if (isShuttingDown) return;

  const svc = services[key];
  if (!svc) return;

  console.log(`[Supervisor] Launching ${svc.name} (${path.relative(process.cwd(), svc.script)})...`);

  const child = spawn(process.execPath, [svc.script], {
    cwd: path.resolve(__dirname, ".."),
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });

  svc.process = child;

  // Set health timer to reset backoff once the service stays alive for 60 seconds
  if (svc.healthyTimer) clearTimeout(svc.healthyTimer);
  svc.healthyTimer = setTimeout(() => {
    if (svc.process && !svc.process.killed) {
      if (svc.restartCount > 0) {
        console.log(`[Supervisor] ${svc.name} has stabilized. Resetting restart backoff.`);
      }
      svc.backoffMs = 2000;
      svc.restartCount = 0;
    }
  }, 60000);

  child.on("exit", (code, signal) => {
    svc.process = null;
    if (svc.healthyTimer) clearTimeout(svc.healthyTimer);

    if (isShuttingDown) {
      console.log(`[Supervisor] ${svc.name} exited during shutdown (code: ${code}, signal: ${signal}).`);
      return;
    }

    svc.restartCount++;
    const delay = svc.backoffMs;
    console.warn(
      `[Supervisor] ${svc.name} exited unexpectedly (code: ${code}, signal: ${signal}). Restarting in ${delay / 1000}s (attempt #${svc.restartCount})...`
    );

    // Exponential backoff: 2s -> 4s -> 8s -> 16s -> max 30s
    svc.backoffMs = Math.min(svc.backoffMs * 2, 30000);

    svc.restartTimeout = setTimeout(() => {
      startService(key);
    }, delay);
  });

  child.on("error", (err) => {
    console.error(`[Supervisor] Failed to spawn ${svc.name}:`, err.message);
  });
}

// Start both child processes with explicit logging
console.log("[Supervisor] Starting web process");
startService("web");

console.log("[Supervisor] Starting generation worker");
startService("worker");

// ── Graceful Shutdown ─────────────────────────────────────────────────────────

async function handleShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[Supervisor] Received ${signal}. Shutting down child processes gracefully...`);

  // Cancel any scheduled restarts
  for (const key of Object.keys(services)) {
    const svc = services[key];
    if (svc.restartTimeout) clearTimeout(svc.restartTimeout);
    if (svc.healthyTimer) clearTimeout(svc.healthyTimer);
  }

  const childStopPromises = Object.keys(services).map((key) => {
    const svc = services[key];
    return new Promise((resolve) => {
      if (!svc.process || svc.process.killed) {
        return resolve();
      }

      let resolved = false;
      const forceKillTimeout = setTimeout(() => {
        if (!resolved && svc.process && !svc.process.killed) {
          console.warn(`[Supervisor] ${svc.name} did not terminate in time. Forcing SIGKILL...`);
          try {
            svc.process.kill("SIGKILL");
          } catch {}
        }
        resolved = true;
        resolve();
      }, 8000);

      svc.process.once("exit", () => {
        clearTimeout(forceKillTimeout);
        if (!resolved) {
          resolved = true;
          console.log(`[Supervisor] ${svc.name} exited cleanly.`);
          resolve();
        }
      });

      try {
        svc.process.kill("SIGTERM");
      } catch {
        clearTimeout(forceKillTimeout);
        resolve();
      }
    });
  });

  await Promise.all(childStopPromises);
  console.log("[Supervisor] All services stopped. Exiting supervisor cleanly.");
  process.exit(0);
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));
