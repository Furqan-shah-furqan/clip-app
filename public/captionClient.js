/* Shared by the clip gallery and caption editor. Transcription is asynchronous;
   playback uses the returned timestamps, never WebSocket arrival time. */
(function (root) {
  const pending = new Map();
  async function requestJson(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Caption request failed (${response.status}).`);
      return data;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("Caption server did not respond. Click Sync Audio to retry.");
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function run(payload) {
    let data = await requestJson("/api/captions/preview", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, async: true }),
    });
    const deadline = Date.now() + 30 * 60 * 1000;
    while (data.status === "queued" || data.status === "processing") {
      if (!data.jobId) throw new Error("Caption server returned no job ID.");
      if (Date.now() > deadline) throw new Error("Caption queue is taking too long. Click Sync Audio to reconnect.");
      await new Promise(resolve => setTimeout(resolve, 2000));
      data = await requestJson(`/api/captions/jobs/${encodeURIComponent(data.jobId)}`);
    }
    if (data.status === "failed" || data.error) throw new Error(data.error || "Transcription failed.");
    if (!Array.isArray(data.segments) || !data.segments.length) throw new Error("No speech detected in this clip.");
    return data;
  }
  root.ClipCaptionClient = {
    generate(payload) {
      const key = JSON.stringify(payload);
      if (!pending.has(key)) {
        pending.set(key, run(payload).finally(() => pending.delete(key)));
      }
      return pending.get(key);
    },
  };
})(globalThis);
