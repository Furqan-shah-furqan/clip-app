const { randomUUID } = require("crypto");

// One transcription at a time in this web process. No paid worker is required.
function createCaptionJobQueue({ run, getKey, maxJobs = 20, ttlMs = 3600000 }) {
  const jobs = new Map();
  let tail = Promise.resolve();
  function prune() {
    for (const [id, job] of jobs) {
      if (job.finishedAt && Date.now() - job.finishedAt > ttlMs) jobs.delete(id);
    }
  }
  function start(input) {
    prune();
    const key = getKey(input);
    const existing = [...jobs.values()].find(j => j.key === key && j.status !== "failed");
    if (existing) return existing;
    for (const [id, job] of jobs) {
      if (jobs.size < maxJobs) break;
      if (job.finishedAt) jobs.delete(id);
    }
    if (jobs.size >= maxJobs) {
      throw Object.assign(new Error("Caption queue is full. Try again shortly."), { statusCode: 429 });
    }
    const job = { id: randomUUID(), key, status: "queued" };
    jobs.set(job.id, job);
    job.promise = tail.then(async () => {
      job.status = "processing";
      try {
        job.result = await run(input);
        job.status = "completed";
      } catch (error) {
        job.error = error.message || "Transcription failed";
        job.status = "failed";
      } finally {
        job.finishedAt = Date.now();
      }
    });
    tail = job.promise;
    return job;
  }
  return { start, get(id) { prune(); return jobs.get(id); } };
}

module.exports = { createCaptionJobQueue };
