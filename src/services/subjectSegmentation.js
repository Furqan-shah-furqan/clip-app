/**
 * Subject Segmentation Service
 * Real-time video person cutout using MediaPipe Selfie Segmentation.
 * Enables the "Behind the Person" caption layering architecture.
 * 
 * Layer 1 (Bottom): Base <video>
 * Layer 2 (Middle): Caption Overlay (z-index: 2)
 * Layer 3 (Top):    Canvas with segmented speaker (z-index: 3)
 */

let selfieSegmentationInstance = null;
let isModelLoading = false;
let isModelReady = false;
let loadPromise = null;

/**
 * Dynamically loads MediaPipe Selfie Segmentation from CDN if not already in window
 */
export async function loadMediaPipeSelfieSegmentation() {
  if (typeof window === "undefined") return null;
  if (window.SelfieSegmentation) {
    isModelReady = true;
    return window.SelfieSegmentation;
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    isModelLoading = true;
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js";
    script.crossOrigin = "anonymous";
    script.async = true;

    script.onload = () => {
      isModelLoading = false;
      isModelReady = true;
      console.log("[SubjectSegmentation] MediaPipe Selfie Segmentation script loaded successfully.");
      resolve(window.SelfieSegmentation);
    };

    script.onerror = (err) => {
      isModelLoading = false;
      console.warn("[SubjectSegmentation] Failed to load MediaPipe from CDN, using graceful depth fallback.", err);
      resolve(null);
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}

/**
 * Creates and initializes a segmentation pipeline between a video and canvas
 */
export function createSubjectSegmentation({
  video,
  canvas,
  onReady,
  onError,
}) {
  let isRunning = false;
  let animFrameId = null;
  let isProcessingFrame = false;
  let selfieSeg = null;

  async function init() {
    try {
      const SelfieSegmentationClass = await loadMediaPipeSelfieSegmentation();
      if (!SelfieSegmentationClass) {
        onReady?.(false);
        return;
      }

      selfieSeg = new SelfieSegmentationClass({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
      });

      selfieSeg.setOptions({
        modelSelection: 1, // 1 = landscape/fast (optimized for 60fps mobile preview)
        selfieMode: false,
      });

      selfieSeg.onResults((results) => {
        isProcessingFrame = false;
        if (!canvas || !video || !isRunning) return;

        const ctx = canvas.getContext("2d", { willReadFrequently: false });
        if (!ctx) return;

        const w = video.videoWidth || 360;
        const h = video.videoHeight || 640;

        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }

        ctx.clearRect(0, 0, w, h);
        ctx.save();

        // 1. Draw the segmentation mask of the foreground person
        ctx.drawImage(results.segmentationMask, 0, 0, w, h);

        // 2. Keep only the person's pixels from the live video
        ctx.globalCompositeOperation = "source-in";
        ctx.drawImage(results.image, 0, 0, w, h);

        ctx.restore();
      });

      selfieSegmentationInstance = selfieSeg;
      onReady?.(true);
    } catch (err) {
      console.warn("[SubjectSegmentation] Initialization failed:", err);
      onError?.(err);
    }
  }

  function renderFallback() {
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width || 360;
    const h = canvas.height || 640;
    ctx.clearRect(0, 0, w, h);

    // Graceful fallback: subtle depth silhouette gradient creating believable 3D separation
    ctx.save();
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.55, w * 0.15, w * 0.5, h * 0.55, w * 0.65);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.7, "rgba(0,0,0,0.1)");
    grad.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function tick() {
    if (!isRunning) return;

    if (video && video.readyState >= 2 && !video.paused && !video.ended) {
      if (selfieSeg && !isProcessingFrame) {
        isProcessingFrame = true;
        selfieSeg
          .send({ image: video })
          .catch(() => {
            isProcessingFrame = false;
            renderFallback();
          });
      }
    }

    animFrameId = requestAnimationFrame(tick);
  }

  function start() {
    if (isRunning) return;
    isRunning = true;

    if (!selfieSeg) {
      init().then(() => {
        if (isRunning) tick();
      });
    } else {
      tick();
    }
  }

  function stop() {
    isRunning = false;
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function processSingleFrame() {
    if (video && video.readyState >= 2 && selfieSeg && !isProcessingFrame) {
      isProcessingFrame = true;
      selfieSeg
        .send({ image: video })
        .catch(() => {
          isProcessingFrame = false;
          renderFallback();
        });
    } else {
      renderFallback();
    }
  }

  return {
    start,
    stop,
    processSingleFrame,
    destroy: stop,
  };
}
