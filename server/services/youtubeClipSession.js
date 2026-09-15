const path = require("path");
const { smartGenerateClip } = require("./smartClipService");
const { downloadYouTubeSource, cleanupFile } = require("./youtubeDownloader");

// One instance per generation job. A full-source fallback is downloaded once,
// even when several moments fail, and is removed when the job finishes.
function createYouTubeClipSession({ sourceUrl, sourceDir, isCancelled = () => false,
  onFallback = () => {}, generate = smartGenerateClip, download = downloadYouTubeSource,
  cleanup = cleanupFile }) {
  const sourcePath = path.join(sourceDir, "quota_fallback_source.mp4");
  let limited = false;
  let sourcePromise;

  async function checkCancelled() {
    if (await isCancelled()) throw new Error("Job cancelled by user");
  }

  return {
    async generate(options) {
      await checkCancelled();
      if (!limited) {
        try { return await generate(options); }
        catch (err) {
          if (err.code !== "FAST_DOWNLOAD_LIMIT") throw err;
          limited = true;
        }
      }
      await checkCancelled();
      if (!sourcePromise) {
        onFallback();
        // Keep a rejected promise too: do not retry exhausted fallback providers
        // once per remaining moment in the same job.
        sourcePromise = Promise.resolve().then(() => download({
          sourceUrl, targetPath: sourcePath, skipFast: true,
        }));
      }
      const inputPath = await sourcePromise;
      await checkCancelled();
      // This is the FULL source: retain original start/end times, not zero.
      return generate({ ...options, inputPath });
    },
    dispose() {
      if (sourcePromise) cleanup(sourcePath);
    },
  };
}

module.exports = { createYouTubeClipSession };
