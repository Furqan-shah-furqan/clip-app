/**
 * Subject Segmentation Service (Browser Runtime)
 * Enables real-time video speaker cutout using MediaPipe Selfie Segmentation.
 * Dual-layer composition: Video (Layer 1) -> Captions (Layer 2) -> Segmented Subject (Layer 3)
 */
(function (global) {
  let selfieSegInstance = null;
  let isModelLoading = false;
  let isModelReady = false;
  let loadPromise = null;

  function loadMediaPipe() {
    if (global.SelfieSegmentation) {
      isModelReady = true;
      return Promise.resolve(global.SelfieSegmentation);
    }
    if (loadPromise) return loadPromise;

    loadPromise = new Promise(function (resolve) {
      isModelLoading = true;
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js";
      script.crossOrigin = "anonymous";
      script.async = true;

      script.onload = function () {
        isModelLoading = false;
        isModelReady = true;
        console.log("[SubjectSegmentation] MediaPipe Selfie Segmentation loaded in browser.");
        resolve(global.SelfieSegmentation);
      };

      script.onerror = function (err) {
        isModelLoading = false;
        console.warn("[SubjectSegmentation] MediaPipe CDN unavailable, using depth fallback.", err);
        resolve(null);
      };

      document.head.appendChild(script);
    });

    return loadPromise;
  }

  function createSubjectSegmentation(options) {
    const video = options.video;
    const canvas = options.canvas;
    const onReady = options.onReady;
    const onError = options.onError;

    let isRunning = false;
    let animFrameId = null;
    let isProcessingFrame = false;
    let selfieSeg = null;

    function renderFallback() {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = canvas.width || 360;
      const h = canvas.height || 640;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      const grad = ctx.createRadialGradient(w * 0.5, h * 0.55, w * 0.15, w * 0.5, h * 0.55, w * 0.65);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(0.7, "rgba(0,0,0,0.1)");
      grad.addColorStop(1, "rgba(0,0,0,0.45)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    function init() {
      return loadMediaPipe().then(function (SelfieSegClass) {
        if (!SelfieSegClass) {
          if (onReady) onReady(false);
          return;
        }

        selfieSeg = new SelfieSegClass({
          locateFile: function (file) {
            return "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/" + file;
          },
        });

        selfieSeg.setOptions({
          modelSelection: 1, // landscape/fast
          selfieMode: false,
        });

        selfieSeg.onResults(function (results) {
          isProcessingFrame = false;
          if (!canvas || !video || !isRunning) return;

          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          const w = video.videoWidth || 360;
          const h = video.videoHeight || 640;

          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }

          ctx.clearRect(0, 0, w, h);
          ctx.save();
          ctx.drawImage(results.segmentationMask, 0, 0, w, h);
          ctx.globalCompositeOperation = "source-in";
          ctx.drawImage(results.image, 0, 0, w, h);
          ctx.restore();
        });

        selfieSegInstance = selfieSeg;
        if (onReady) onReady(true);
      }).catch(function (err) {
        console.warn("[SubjectSegmentation] Init error:", err);
        if (onError) onError(err);
      });
    }

    function tick() {
      if (!isRunning) return;

      if (video && video.readyState >= 2 && !video.paused && !video.ended) {
        if (selfieSeg && !isProcessingFrame) {
          isProcessingFrame = true;
          selfieSeg.send({ image: video }).catch(function () {
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
        init().then(function () {
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
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    function processSingleFrame() {
      if (video && video.readyState >= 2 && selfieSeg && !isProcessingFrame) {
        isProcessingFrame = true;
        selfieSeg.send({ image: video }).catch(function () {
          isProcessingFrame = false;
          renderFallback();
        });
      } else {
        renderFallback();
      }
    }

    return {
      start: start,
      stop: stop,
      processSingleFrame: processSingleFrame,
      destroy: stop,
    };
  }

  global.SubjectSegmentation = {
    loadMediaPipe: loadMediaPipe,
    createSubjectSegmentation: createSubjectSegmentation,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.SubjectSegmentation;
  }
})(typeof window !== "undefined" ? window : globalThis);
