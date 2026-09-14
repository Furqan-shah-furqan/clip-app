import React, { useState, useMemo, useRef, useEffect } from "react";
import PresetsGallery from "./PresetsGallery";
import { DEFAULT_PRESET } from "../../constants/captionPresets";

/**
 * RGBA Converter Helper: converts hex and opacity percentage to valid rgba string.
 */
function hexToRgba(hex = "#000000", opacity = 100) {
  if (typeof hex !== "string") {
    return `rgba(0, 0, 0, ${Math.max(0, Math.min(1, opacity / 100))})`;
  }
  if (hex === "transparent") return "transparent";

  // If already an rgb / rgba string
  if (hex.startsWith("rgba") || hex.startsWith("rgb")) {
    const match = hex.match(/[\d.]+/g);
    if (match && match.length >= 3) {
      const r = parseInt(match[0], 10) || 0;
      const g = parseInt(match[1], 10) || 0;
      const b = parseInt(match[2], 10) || 0;
      return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacity / 100))})`;
    }
  }

  const clean = hex.replace("#", "");
  let r = 0;
  let g = 0;
  let b = 0;

  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16) || 0;
    g = parseInt(clean[1] + clean[1], 16) || 0;
    b = parseInt(clean[2] + clean[2], 16) || 0;
  } else {
    r = parseInt(clean.substring(0, 2), 16) || 0;
    g = parseInt(clean.substring(2, 4), 16) || 0;
    b = parseInt(clean.substring(4, 6), 16) || 0;
  }

  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacity / 100))})`;
}

/**
 * Helper to parse time strings ("00:00:10.500", "01:23", "12.5") or numbers into seconds.
 */
function parseTimeToSeconds(val) {
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  if (!val || typeof val !== "string") return 0;
  const parts = val.trim().split(":");
  if (parts.length === 3) {
    return (
      (parseFloat(parts[0]) || 0) * 3600 +
      (parseFloat(parts[1]) || 0) * 60 +
      (parseFloat(parts[2]) || 0)
    );
  }
  if (parts.length === 2) {
    return (parseFloat(parts[0]) || 0) * 60 + (parseFloat(parts[1]) || 0);
  }
  return parseFloat(val) || 0;
}

/**
 * CaptionStudio Component
 * Full-featured Caption Studio matching ClipFlow Studio's layout.
 * Features:
 *  - Vertically Aligned Phone Mockup: Flush with control stack top to bottom (no height truncation)
 *  - Real-time Cadence Word Slicing with instant fallback to existing clip transcript
 *  - Fully Wired Background Pill, Opacity (0-100%), Box Padding (0-50px), Layered Neon Glow (0-60px)
 *  - 3-Layer Subject Segmentation ("Behind the Person") with MediaPipe Selfie Segmentation
 */
export default function CaptionStudio({
  clip = {
    id: "clip-demo",
    videoId: "5pV3D14y1FQ",
    videoUrl: "",
    title: "Viral Clip Moment",
    start: "00:00:10",
    end: "00:00:40",
    previewText: "THIS IS HOW YOU GO VIRAL",
  },
  onBack,
  onExport,
}) {
  // Inject Google Fonts directly into head if not already loaded
  useEffect(() => {
    const fontLinkId = "clipflow-caption-google-fonts";
    if (!document.getElementById(fontLinkId)) {
      const link = document.createElement("link");
      link.id = fontLinkId;
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Bebas+Neue&family=Cinzel:wght@700;900&family=Inter:wght@400;600;700;800;900&family=Montserrat:ital,wght@0,600;0,700;0,800;0,900;1,800;1,900&family=Playfair+Display:ital,wght@0,700;0,900;1,700;1,900&family=Poppins:wght@600;700;800;900&family=Syne:wght@700;800&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  // ── Unified Style State (Directly Bound to Preview & Sliders) ────────
  const [styleState, setStyleState] = useState(() => {
    const s = DEFAULT_PRESET.style || {};
    let initialBg = s.bgColor || "#000000";
    let initialOpacity = s.bgOpacity !== undefined ? s.bgOpacity : 85;

    if (typeof initialBg === "string" && initialBg.startsWith("rgba")) {
      const match = initialBg.match(/[\d.]+/g);
      if (match && match.length >= 4) {
        const r = parseInt(match[0], 10).toString(16).padStart(2, "0");
        const g = parseInt(match[1], 10).toString(16).padStart(2, "0");
        const b = parseInt(match[2], 10).toString(16).padStart(2, "0");
        initialBg = `#${r}${g}${b}`;
        initialOpacity = Math.round(parseFloat(match[3]) * 100);
      }
    } else if (initialBg === "transparent") {
      initialOpacity = 0;
      initialBg = "#000000";
    }

    return {
      fontFamily: s.fontFamily || "Montserrat",
      fontSize: s.fontSize || 28,
      fontWeight: s.fontWeight || "900",
      letterSpacing: s.letterSpacing !== undefined ? s.letterSpacing : 0,
      lineSpacing: s.lineSpacing || 1.2,
      letterCase: "ALL CAPS",
      wordsInRow: s.wordsInRow || "2 Words",
      textColor: s.textColor || "#FFFFFF",
      highlightColor: s.highlightColor || "#22C55E",
      backgroundColor: initialBg.startsWith("#") ? initialBg : "#000000",
      bgOpacity: initialOpacity,
      boxPadding: s.bgPadding !== undefined ? s.bgPadding : 10,
      neonGlow: s.shadowBlur || 0,
      strokeWidth: s.strokeWidth || 0,
      strokeColor: s.strokeColor || "#000000",
      textShadow: true,
      shadowOffsetX: 0,
      shadowOffsetY: 4,
      shadowBlur: 12,
      posX: 50,
      posY: 82,
      rotateAngle: 0,
      wordAnimation: s.wordAnimation || "pop",
      behindPerson: Boolean(DEFAULT_PRESET.behindPerson),
    };
  });

  // Presets Gallery Drawer State
  const [isPresetsGalleryOpen, setIsPresetsGalleryOpen] = useState(false);
  const [activePreset, setActivePreset] = useState(DEFAULT_PRESET.id);
  const [activePresetStyle, setActivePresetStyle] = useState(DEFAULT_PRESET.style);
  const [activePresetAssConfig, setActivePresetAssConfig] = useState(DEFAULT_PRESET.assConfig);

  // Export Loading State
  const [isExporting, setIsExporting] = useState(false);

  // Video playback & Realtime sync state
  const [currentTime, setCurrentTime] = useState(0);
  const videoRef = useRef(null);
  const segmentationCanvasRef = useRef(null);
  const segmentationPipelineRef = useRef(null);

  // Check if "Behind the Person" subject segmentation layer is active
  const isBehindPerson = useMemo(() => {
    return Boolean(
      styleState.behindPerson ||
      activePresetStyle?.behindPerson ||
      activePreset?.startsWith("btp-") ||
      activePresetStyle?.category === "Behind the Person"
    );
  }, [styleState.behindPerson, activePresetStyle, activePreset]);

  // Handle video playback time updates for instant frame-by-frame sync
  const handleTimeUpdate = (e) => {
    const curr = e?.target?.currentTime ?? (videoRef.current?.currentTime || 0);
    setCurrentTime(curr);
  };

  // Continuous animation frame loop to synchronize currentTime at 60fps
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let animId;
    const tick = () => {
      if (video && !video.paused && !video.ended) {
        setCurrentTime(video.currentTime);
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [clip.videoUrl]);

  // MediaPipe Selfie Segmentation for "Behind the Person" Layer 3
  useEffect(() => {
    const video = videoRef.current;
    const canvas = segmentationCanvasRef.current;

    if (!isBehindPerson || !video || !canvas) {
      if (segmentationPipelineRef.current) {
        segmentationPipelineRef.current.stop();
        segmentationPipelineRef.current = null;
      }
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    let isActive = true;
    let animFrameId = null;
    let isProcessing = false;
    let segmenter = null;

    const initSegmentation = async () => {
      try {
        if (!window.SelfieSegmentation) {
          await new Promise((resolve, reject) => {
            const scriptId = "mediapipe-selfie-segmentation-script";
            const existing = document.getElementById(scriptId);
            if (existing) {
              if (window.SelfieSegmentation) return resolve();
              existing.addEventListener("load", resolve);
              existing.addEventListener("error", reject);
              return;
            }
            const script = document.createElement("script");
            script.id = scriptId;
            script.src =
              "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js";
            script.crossOrigin = "anonymous";
            script.async = true;
            script.onload = () => resolve();
            script.onerror = (err) => reject(err);
            document.head.appendChild(script);
          });
        }

        if (!isActive || !window.SelfieSegmentation) return;

        segmenter = new window.SelfieSegmentation({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
        });

        segmenter.setOptions({ modelSelection: 1 });

        segmenter.onResults((results) => {
          isProcessing = false;
          if (!isActive || !canvas || !video) return;

          const ctx = canvas.getContext("2d", { willReadFrequently: false });
          if (!ctx) return;

          const width = video.videoWidth || canvas.width || 360;
          const height = video.videoHeight || canvas.height || 640;

          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }

          // Clear Layer 3 canvas
          ctx.clearRect(0, 0, width, height);

          // Draw the segmentation mask
          ctx.drawImage(results.segmentationMask, 0, 0, width, height);

          // Keep only pixels inside mask
          ctx.globalCompositeOperation = "source-in";

          // Draw video frame over the mask
          ctx.drawImage(results.image, 0, 0, width, height);

          // Reset composite operation
          ctx.globalCompositeOperation = "source-over";
        });

        const sendCurrentFrame = async () => {
          if (!isActive || !video || !segmenter || isProcessing) return;
          if (video.readyState < 2) return;
          isProcessing = true;
          try {
            await segmenter.send({ image: video });
          } catch (err) {
            isProcessing = false;
          }
        };

        const renderLoop = async () => {
          if (!isActive) return;

          if (
            video &&
            !video.paused &&
            !video.ended &&
            video.readyState >= 2 &&
            !isProcessing
          ) {
            isProcessing = true;
            try {
              await segmenter.send({ image: video });
            } catch (err) {
              isProcessing = false;
            }
          }

          animFrameId = requestAnimationFrame(renderLoop);
        };

        renderLoop();

        video.addEventListener("seeked", sendCurrentFrame);
        video.addEventListener("loadeddata", sendCurrentFrame);
        video.addEventListener("play", sendCurrentFrame);
        video.addEventListener("pause", sendCurrentFrame);

        segmentationPipelineRef.current = {
          stop: () => {
            isActive = false;
            if (animFrameId) cancelAnimationFrame(animFrameId);
            video.removeEventListener("seeked", sendCurrentFrame);
            video.removeEventListener("loadeddata", sendCurrentFrame);
            video.removeEventListener("play", sendCurrentFrame);
            video.removeEventListener("pause", sendCurrentFrame);
            try {
              segmenter?.close?.();
            } catch (_) {}
          },
        };
      } catch (err) {
        console.warn("[BehindThePerson] MediaPipe Segmentation fallback:", err);
      }
    };

    initSegmentation();

    return () => {
      isActive = false;
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (segmentationPipelineRef.current) {
        segmentationPipelineRef.current.stop();
        segmentationPipelineRef.current = null;
      }
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
  }, [isBehindPerson, clip.videoUrl]);

  // ── Instant Transcript Fallback: Extracts segments/words without UI freeze ──
  const transcriptSegments = useMemo(() => {
    const raw =
      clip.transcript ||
      clip.words ||
      clip.segments ||
      clip.captions ||
      clip.subtitleSegments ||
      null;

    const clipStartSec = parseTimeToSeconds(clip.start || clip.startTime || 0);

    if (Array.isArray(raw) && raw.length > 0) {
      // Direct word-level array: [{ word: "...", start: 0.2, end: 0.6 }]
      const isFlatWords = Boolean(raw[0]?.word && !raw[0]?.words && !raw[0]?.text);
      if (isFlatWords) {
        const segments = [];
        const wordsPerSeg = 4;
        for (let i = 0; i < raw.length; i += wordsPerSeg) {
          const chunk = raw.slice(i, i + wordsPerSeg);
          const segStart = parseTimeToSeconds(chunk[0].start);
          const segEnd = parseTimeToSeconds(chunk[chunk.length - 1].end);
          segments.push({
            id: `word-seg-${i}`,
            start: segStart,
            end: segEnd,
            text: chunk.map((w) => w.word).join(" "),
            words: chunk.map((w) => ({
              word: (w.word || "").trim(),
              start: parseTimeToSeconds(w.start),
              end: parseTimeToSeconds(w.end),
            })),
          });
        }
        return segments;
      }

      // Segment array with possible sub-words
      const firstSegStart = parseTimeToSeconds(raw[0].start || 0);
      const isAbsolute = firstSegStart >= clipStartSec - 2 && clipStartSec > 2;

      return raw.map((seg, sIdx) => {
        let segStart = parseTimeToSeconds(seg.start);
        let segEnd = parseTimeToSeconds(seg.end);

        if (isAbsolute) {
          segStart = Math.max(0, segStart - clipStartSec);
          segEnd = Math.max(segStart + 0.3, segEnd - clipStartSec);
        }

        const text = (seg.text || seg.content || "").trim();
        let words = [];

        if (Array.isArray(seg.words) && seg.words.length > 0) {
          words = seg.words
            .map((w) => {
              let wStart = parseTimeToSeconds(w.start);
              let wEnd = parseTimeToSeconds(w.end);
              if (isAbsolute) {
                wStart = Math.max(0, wStart - clipStartSec);
                wEnd = Math.max(wStart + 0.1, wEnd - clipStartSec);
              }
              return {
                word: (w.word || w.text || "").trim(),
                start: wStart,
                end: wEnd,
              };
            })
            .filter((w) => Boolean(w.word));
        } else {
          const tokens = text.split(/\s+/).filter(Boolean);
          const dur = Math.max(0.3, segEnd - segStart);
          const wDur = dur / Math.max(1, tokens.length);
          words = tokens.map((w, wIdx) => ({
            word: w,
            start: segStart + wIdx * wDur,
            end: segStart + (wIdx + 1) * wDur,
          }));
        }

        return {
          id: seg.id || `seg-${sIdx}`,
          start: segStart,
          end: segEnd,
          text,
          words,
        };
      });
    }

    // Instant Synthesized Fallback from previewText / text / title
    const rawText = (
      clip.previewText ||
      clip.text ||
      clip.title ||
      "THIS IS HOW YOU GO VIRAL"
    ).trim();
    const allWords = rawText.split(/\s+/).filter(Boolean);
    if (allWords.length === 0) return [];

    const segments = [];
    const wordsPerSeg = 4;
    const wordDuration = 0.38;
    const pauseBetweenSeg = 0.3;
    let curTime = 0.3;

    for (let i = 0; i < allWords.length; i += wordsPerSeg) {
      const chunk = allWords.slice(i, i + wordsPerSeg);
      const segStart = curTime;
      const segWords = chunk.map((w, idx) => {
        const wStart = segStart + idx * wordDuration;
        const wEnd = wStart + wordDuration;
        return { word: w, start: wStart, end: wEnd };
      });
      const segEnd = segStart + chunk.length * wordDuration;
      curTime = segEnd + pauseBetweenSeg;

      segments.push({
        id: `syn-seg-${i}`,
        start: segStart,
        end: segEnd,
        text: chunk.join(" "),
        words: segWords,
      });
    }

    return segments;
  }, [clip]);

  // ── Cadence Word Slicing: Single Element, Real-time Sync, Zero Ghosting ──
  const activeCaption = useMemo(() => {
    if (!transcriptSegments || transcriptSegments.length === 0) return null;

    const isVideoPaused = !videoRef.current || videoRef.current.paused;
    const isAtZero = currentTime <= 0.05;

    // Initial load at 0.0s: Show preview words so user can configure styles
    if (isVideoPaused && isAtZero) {
      const firstSeg = transcriptSegments[0];
      if (!firstSeg || !firstSeg.words || firstSeg.words.length === 0) return null;

      const cadence = styleState.wordsInRow || "2 Words";
      let previewWords = [];

      if (cadence === "1 Word") {
        previewWords = [{ text: firstSeg.words[0].word, isCurrent: true }];
      } else if (cadence === "2 Words") {
        previewWords = firstSeg.words.slice(0, 2).map((w, idx) => ({
          text: w.word,
          isCurrent: idx === 0,
        }));
      } else if (cadence === "3 Words") {
        previewWords = firstSeg.words.slice(0, 3).map((w, idx) => ({
          text: w.word,
          isCurrent: idx === 0,
        }));
      } else if (cadence === "4 Words") {
        previewWords = firstSeg.words.slice(0, 4).map((w, idx) => ({
          text: w.word,
          isCurrent: idx === 0,
        }));
      } else {
        previewWords = firstSeg.words.map((w, idx) => ({
          text: w.word,
          isCurrent: idx === 0,
        }));
      }

      return { words: previewWords };
    }

    // Active playback: find active segment matching currentTime
    const activeSegment = transcriptSegments.find(
      (s) => currentTime >= s.start && currentTime <= s.end
    );

    // If no segment is active at currentTime, clear caption completely (no orphaned words)
    if (!activeSegment || !activeSegment.words || activeSegment.words.length === 0) {
      return null;
    }

    const cadence = styleState.wordsInRow || "2 Words";
    const segWords = activeSegment.words;

    // 1 Word Cadence
    if (cadence === "1 Word") {
      const activeWord = segWords.find(
        (w) => currentTime >= w.start && currentTime <= w.end
      );
      if (!activeWord) return null; // Clean fade between spoken words
      return {
        words: [{ text: activeWord.word, isCurrent: true }],
      };
    }

    // 2 Words Cadence
    if (cadence === "2 Words") {
      for (let i = 0; i < segWords.length; i += 2) {
        const pair = segWords.slice(i, i + 2);
        const pairStart = pair[0].start;
        const pairEnd = pair[pair.length - 1].end;

        if (currentTime >= pairStart && currentTime <= pairEnd) {
          return {
            words: pair.map((w) => ({
              text: w.word,
              isCurrent: currentTime >= w.start && currentTime <= w.end,
            })),
          };
        }
      }
      return null; // Clean fade between pairs
    }

    // 3 Words Cadence
    if (cadence === "3 Words") {
      for (let i = 0; i < segWords.length; i += 3) {
        const triplet = segWords.slice(i, i + 3);
        const tripStart = triplet[0].start;
        const tripEnd = triplet[triplet.length - 1].end;

        if (currentTime >= tripStart && currentTime <= tripEnd) {
          return {
            words: triplet.map((w) => ({
              text: w.word,
              isCurrent: currentTime >= w.start && currentTime <= w.end,
            })),
          };
        }
      }
      return null;
    }

    // 4 Words Cadence
    if (cadence === "4 Words") {
      for (let i = 0; i < segWords.length; i += 4) {
        const quad = segWords.slice(i, i + 4);
        const quadStart = quad[0].start;
        const quadEnd = quad[quad.length - 1].end;

        if (currentTime >= quadStart && currentTime <= quadEnd) {
          return {
            words: quad.map((w) => ({
              text: w.word,
              isCurrent: currentTime >= w.start && currentTime <= w.end,
            })),
          };
        }
      }
      return null;
    }

    // Auto Cadence (Full segment)
    return {
      words: segWords.map((w) => ({
        text: w.word,
        isCurrent: currentTime >= w.start && currentTime <= w.end,
      })),
    };
  }, [transcriptSegments, currentTime, styleState.wordsInRow]);

  // Preset Selection Handler
  const handleApplyPreset = (preset) => {
    if (!preset?.style) return;

    const s = preset.style;
    const isBtp = Boolean(
      preset.behindPerson ||
      s.behindPerson ||
      preset.category === "Behind the Person" ||
      preset.id?.startsWith("btp-")
    );

    let parsedBg = s.bgColor || "#000000";
    let parsedOpacity = s.bgOpacity !== undefined ? s.bgOpacity : 85;

    if (typeof parsedBg === "string" && parsedBg.startsWith("rgba")) {
      const match = parsedBg.match(/[\d.]+/g);
      if (match && match.length >= 4) {
        const r = parseInt(match[0], 10).toString(16).padStart(2, "0");
        const g = parseInt(match[1], 10).toString(16).padStart(2, "0");
        const b = parseInt(match[2], 10).toString(16).padStart(2, "0");
        parsedBg = `#${r}${g}${b}`;
        parsedOpacity = Math.round(parseFloat(match[3]) * 100);
      }
    } else if (parsedBg === "transparent") {
      initialOpacity = 0;
      parsedBg = "#000000";
    }

    setStyleState((prev) => ({
      ...prev,
      fontFamily: s.fontFamily || "Montserrat",
      fontSize: isBtp ? Math.max(s.fontSize || 54, 52) : (s.fontSize || 28),
      fontWeight: "900",
      letterSpacing: s.letterSpacing !== undefined ? s.letterSpacing : 0,
      lineSpacing: s.lineSpacing || 1.2,
      letterCase:
        s.textTransform === "uppercase" || !s.textTransform
          ? "ALL CAPS"
          : s.textTransform === "capitalize"
          ? "Title Case"
          : "Normal Case",
      wordsInRow: s.wordsInRow || "2 Words",
      textColor: s.textColor || "#FFFFFF",
      highlightColor: s.highlightColor || "#22C55E",
      backgroundColor: parsedBg.startsWith("#") ? parsedBg : "#000000",
      bgOpacity: parsedOpacity,
      boxPadding: s.bgPadding !== undefined ? s.bgPadding : 10,
      neonGlow: s.shadowBlur || 0,
      strokeWidth: 0,
      strokeColor: s.strokeColor || "#000000",
      behindPerson: isBtp,
      posY: isBtp ? 42 : prev.posY,
    }));

    setActivePreset(preset.id);
    setActivePresetStyle({
      ...s,
      strokeWidth: 0,
      behindPerson: isBtp,
    });
    setActivePresetAssConfig(preset.assConfig);
    setIsPresetsGalleryOpen(false);
  };

  // Export Captioned Video Handler
  const handleExportCaptionedVideo = async () => {
    try {
      setIsExporting(true);

      const payload = {
        videoId: clip.videoId || clip.id,
        clipStart: clip.start || "00:00:00",
        clipEnd: clip.end || "00:00:30",
        captionStyle: {
          ...activePresetStyle,
          fontFamily: styleState.fontFamily,
          fontSize: styleState.fontSize,
          fontWeight: styleState.fontWeight,
          textColor: styleState.textColor,
          highlightColor: styleState.highlightColor,
          strokeWidth: styleState.strokeWidth,
          strokeColor: styleState.strokeColor,
          bgColor: styleState.backgroundColor,
          bgOpacity: styleState.bgOpacity,
          bgPadding: styleState.boxPadding,
          shadowBlur: styleState.neonGlow,
          wordAnimation: styleState.wordAnimation,
          wordsInRow: styleState.wordsInRow,
          letterSpacing: styleState.letterSpacing,
          lineSpacing: styleState.lineSpacing,
          textTransform: styleState.letterCase === "ALL CAPS" ? "uppercase" : "none",
          behindPerson: isBehindPerson,
          positionX: styleState.posX,
          positionY: styleState.posY,
          rotateAngle: styleState.rotateAngle,
        },
        assConfig: activePresetAssConfig,
      };

      if (onExport) {
        await onExport(payload);
      } else {
        const response = await fetch("/api/clips/export-captioned", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Export failed");
        if (data.downloadUrl) {
          window.location.href = data.downloadUrl;
        }
      }
    } catch (err) {
      console.error("Failed to export captioned video:", err);
      alert(err.message || "Failed to export captioned video.");
    } finally {
      setIsExporting(false);
    }
  };

  // Vertical placement adjustment for "Behind the Person"
  const computedPosY = isBehindPerson
    ? styleState.posY >= 35 && styleState.posY <= 50
      ? styleState.posY
      : 42
    : styleState.posY;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        backgroundColor: "#07080C",
        color: "#FFFFFF",
        fontFamily: "Inter, -apple-system, sans-serif",
      }}
    >
      {/* ── Topbar ── */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 28px",
          backgroundColor: "#0B0D13",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              padding: "8px 14px",
              backgroundColor: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "#E2E8F0",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            ← Back
          </button>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              style={{
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#00E5FF",
                fontWeight: "700",
              }}
            >
              Caption Studio
            </span>
            <h2
              style={{
                margin: 0,
                fontSize: "16px",
                fontWeight: "700",
                color: "#FFFFFF",
              }}
            >
              {clip.title || "Selected Clip"}
            </h2>
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setIsPresetsGalleryOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 16px",
              backgroundColor: "rgba(0, 229, 255, 0.1)",
              border: "1px solid rgba(0, 229, 255, 0.3)",
              color: "#00E5FF",
              borderRadius: "8px",
              fontWeight: "700",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: "15px" }}>⚡</span>
            <span>Browse 160+ Presets</span>
          </button>
          <button
            type="button"
            onClick={handleExportCaptionedVideo}
            disabled={isExporting}
            style={{
              padding: "8px 18px",
              backgroundColor: "#00E5FF",
              border: "none",
              color: "#000000",
              borderRadius: "8px",
              fontWeight: "800",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            {isExporting ? "Exporting..." : "Download Video"}
          </button>
        </div>
      </header>

      {/* ── Main Workspace: Aligned Grid Layout matching phone height to controls ── */}
      <main
        className="flex-1 w-full max-w-[1440px] mx-auto p-4 sm:p-6"
        style={{
          flex: 1,
          width: "100%",
          maxWidth: "1440px",
          margin: "0 auto",
          padding: "24px",
          boxSizing: "border-box",
        }}
      >
        <div
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
          style={{
            display: "grid",
            gap: "24px",
            alignItems: "stretch",
            minHeight: "820px",
          }}
        >
          {/* ── Left Column: Phone Mockup Frame (Fills full column height, flush with controls) ── */}
          <section
            className="lg:col-span-4 h-full flex flex-col items-center justify-center"
            style={{
              gridColumn: "span 4 / span 4",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              className="h-full w-full max-w-[360px] rounded-[44px] border-[10px] border-[#1C1F26] bg-black shadow-2xl relative overflow-hidden flex flex-col"
              style={{
                height: "100%",
                width: "100%",
                maxWidth: "360px",
                borderRadius: "44px",
                border: "10px solid #1C1F26",
                backgroundColor: "#000000",
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8)",
                position: "relative",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Dynamic Island Speaker Notch */}
              <div
                style={{
                  position: "absolute",
                  top: "14px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "96px",
                  height: "18px",
                  backgroundColor: "#1C1F26",
                  borderRadius: "9999px",
                  zIndex: 30,
                  pointerEvents: "none",
                }}
              />

              {/* Inner Screen Area */}
              <div
                className="relative w-full h-full overflow-hidden flex flex-col items-center justify-center bg-black flex-1"
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  flex: 1,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#000000",
                }}
              >
                {/* Behind Subject Badge */}
                {isBehindPerson && (
                  <div
                    style={{
                      position: "absolute",
                      top: "16px",
                      left: "16px",
                      zIndex: 25,
                      padding: "4px 8px",
                      backgroundColor: "rgba(34, 197, 94, 0.25)",
                      border: "1px solid rgba(34, 197, 94, 0.5)",
                      borderRadius: "6px",
                      color: "#4ADE80",
                      fontSize: "10px",
                      fontWeight: "800",
                      letterSpacing: "0.05em",
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      pointerEvents: "none",
                      backdropFilter: "blur(6px)",
                    }}
                  >
                    <span>👤</span>
                    <span>BEHIND SUBJECT</span>
                  </div>
                )}

                {/* Layer 1 (Bottom): Video Element or Fallback Placeholder */}
                {clip.videoUrl ? (
                  <video
                    ref={videoRef}
                    src={clip.videoUrl}
                    className="w-full h-full object-cover flex-1 absolute inset-0 z-[1]"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      flex: 1,
                      position: "absolute",
                      top: 0,
                      left: 0,
                      zIndex: 1,
                    }}
                    controls
                    playsInline
                    crossOrigin="anonymous"
                    onTimeUpdate={handleTimeUpdate}
                    onSeeked={handleTimeUpdate}
                    onPlay={handleTimeUpdate}
                    onPause={handleTimeUpdate}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#0F1118",
                      position: "absolute",
                      top: 0,
                      left: 0,
                      zIndex: 1,
                    }}
                  >
                    <span style={{ fontSize: "36px", opacity: 0.7 }}>🎬</span>
                    <span
                      style={{
                        fontSize: "12px",
                        color: "#64748B",
                        marginTop: "8px",
                        fontWeight: 600,
                      }}
                    >
                      Live Clip Preview
                    </span>
                  </div>
                )}

                {/* Layer 2 (Middle): Strictly ONE Subtitle Render Element */}
                {activeCaption && (
                  <div
                    className="caption-container"
                    style={{
                      position: "absolute",
                      left: `${styleState.posX}%`,
                      top: `${computedPosY}%`,
                      transform: `translate(-50%, -50%) rotate(${styleState.rotateAngle || 0}deg)`,
                      textAlign: "center",
                      maxWidth: "90%",
                      pointerEvents: "none",
                      userSelect: "none",
                      zIndex: 2,
                      transition: "transform 0.1s ease",
                    }}
                  >
                    <span
                      className="caption-pill"
                      style={{
                        fontFamily: styleState.fontFamily || "Montserrat",
                        fontSize: `${styleState.fontSize || 24}px`,
                        color: styleState.textColor || "#FFFFFF",
                        textTransform:
                          styleState.letterCase === "ALL CAPS" ? "uppercase" : "none",
                        letterSpacing: `${styleState.letterSpacing || 0}px`,
                        lineHeight: styleState.lineSpacing || 1.2,

                        // 1. Background Pill Styling:
                        backgroundColor:
                          styleState.bgOpacity > 0
                            ? hexToRgba(styleState.backgroundColor, styleState.bgOpacity)
                            : "transparent",
                        padding:
                          styleState.bgOpacity > 0
                            ? `${styleState.boxPadding || 8}px ${(styleState.boxPadding || 8) * 1.4}px`
                            : "0px",
                        borderRadius: "12px",
                        display: "inline-block",

                        // 2. Neon Glow (Multiple layered text-shadows for intense glow):
                        textShadow:
                          styleState.neonGlow > 0
                            ? `0 0 ${styleState.neonGlow * 0.5}px ${styleState.textColor}, 0 0 ${styleState.neonGlow}px ${styleState.textColor}, 0 0 ${styleState.neonGlow * 2}px ${styleState.textColor}`
                            : styleState.textShadow
                            ? `${styleState.shadowOffsetX || 0}px ${styleState.shadowOffsetY || 4}px ${styleState.shadowBlur || 12}px rgba(0,0,0,0.8)`
                            : "none",

                        // 3. Outline Stroke:
                        WebkitTextStroke:
                          styleState.strokeWidth > 0
                            ? `${styleState.strokeWidth}px ${styleState.strokeColor || "#000000"}`
                            : "none",

                        boxSizing: "border-box",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontWeight: styleState.fontWeight || "900",
                        transition:
                          "background-color 0.15s ease, padding 0.15s ease, text-shadow 0.15s ease",
                      }}
                    >
                      {activeCaption.words.map((w, idx) => (
                        <span
                          key={`${w.text}-${idx}`}
                          style={{
                            color:
                              w.isCurrent && styleState.highlightColor
                                ? styleState.highlightColor
                                : styleState.textColor || "#FFFFFF",
                            display: "inline-block",
                            margin: "0 4px",
                            transform:
                              w.isCurrent && styleState.wordAnimation === "pop"
                                ? "scale(1.08)"
                                : "scale(1)",
                            transition: "transform 0.1s ease, color 0.15s ease",
                          }}
                        >
                          {w.text}
                        </span>
                      ))}
                    </span>
                  </div>
                )}

                {/* Layer 3 (Top): Real-time MediaPipe Subject Segmentation Canvas */}
                <canvas
                  ref={segmentationCanvasRef}
                  className="w-full h-full object-cover flex-1 absolute inset-0 pointer-events-none z-[3]"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    flex: 1,
                    objectFit: "cover",
                    pointerEvents: "none",
                    zIndex: 3,
                    display: isBehindPerson ? "block" : "none",
                  }}
                />
              </div>
            </div>
          </section>

          {/* ── Right Column: 2-Row Controls Grid ── */}
          <section
            className="lg:col-span-8 h-full flex flex-col justify-between gap-5"
            style={{
              gridColumn: "span 8 / span 8",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            <div
              className="grid grid-cols-1 md:grid-cols-2 gap-5 h-full"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "20px",
                height: "100%",
              }}
            >
              {/* Card 1: Typography & Cadence */}
              <div style={csStyles.card}>
                <div style={csStyles.cardHeader}>
                  <span style={csStyles.cardIcon}>🔤</span>
                  <h4 style={csStyles.cardTitle}>Typography &amp; Cadence</h4>
                </div>

                <div style={csStyles.formRow}>
                  <div style={csStyles.formField}>
                    <label style={csStyles.label}>Font Family</label>
                    <select
                      value={styleState.fontFamily}
                      onChange={(e) =>
                        setStyleState((prev) => ({ ...prev, fontFamily: e.target.value }))
                      }
                      style={csStyles.selectInput}
                    >
                      <option value="Montserrat">Montserrat (Modern Viral)</option>
                      <option value="Inter">Inter (Ultra Clean)</option>
                      <option value="Archivo Black">Archivo Black (Chunky Impact)</option>
                      <option value="Bebas Neue">Bebas Neue (Tall Display)</option>
                      <option value="Playfair Display">Playfair Display (Luxury Serif)</option>
                      <option value="Cinzel">Cinzel (Classical Heritage)</option>
                      <option value="Syne">Syne (Geometric Kinetic)</option>
                      <option value="Poppins">Poppins (Geometric Rounded)</option>
                    </select>
                  </div>

                  <div style={csStyles.formField}>
                    <div style={csStyles.labelWithVal}>
                      <label style={csStyles.label}>Font Size</label>
                      <span style={csStyles.valBadge}>{styleState.fontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min="16"
                      max="64"
                      value={styleState.fontSize}
                      onChange={(e) =>
                        setStyleState((prev) => ({
                          ...prev,
                          fontSize: Number(e.target.value),
                        }))
                      }
                      style={csStyles.rangeInput}
                    />
                  </div>
                </div>

                <div style={csStyles.formRow}>
                  <div style={csStyles.formField}>
                    <div style={csStyles.labelWithVal}>
                      <label style={csStyles.label}>Letter Spacing</label>
                      <span style={csStyles.valBadge}>{styleState.letterSpacing}px</span>
                    </div>
                    <input
                      type="range"
                      min="-2"
                      max="10"
                      step="0.5"
                      value={styleState.letterSpacing}
                      onChange={(e) =>
                        setStyleState((prev) => ({
                          ...prev,
                          letterSpacing: Number(e.target.value),
                        }))
                      }
                      style={csStyles.rangeInput}
                    />
                  </div>

                  <div style={csStyles.formField}>
                    <div style={csStyles.labelWithVal}>
                      <label style={csStyles.label}>Line Spacing</label>
                      <span style={csStyles.valBadge}>{styleState.lineSpacing}x</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="2"
                      step="0.05"
                      value={styleState.lineSpacing}
                      onChange={(e) =>
                        setStyleState((prev) => ({
                          ...prev,
                          lineSpacing: Number(e.target.value),
                        }))
                      }
                      style={csStyles.rangeInput}
                    />
                  </div>
                </div>

                <div style={csStyles.formRow}>
                  <div style={csStyles.formField}>
                    <label style={csStyles.label}>Letter Case</label>
                    <select
                      value={styleState.letterCase}
                      onChange={(e) =>
                        setStyleState((prev) => ({ ...prev, letterCase: e.target.value }))
                      }
                      style={csStyles.selectInput}
                    >
                      <option value="ALL CAPS">ALL CAPS (Viral Punch)</option>
                      <option value="Title Case">Title Case (Editorial)</option>
                      <option value="Normal Case">Normal Case</option>
                      <option value="lower case">lower case</option>
                    </select>
                  </div>

                  <div style={csStyles.formField}>
                    <label style={csStyles.label}>Words in a Row</label>
                    <select
                      value={styleState.wordsInRow}
                      onChange={(e) =>
                        setStyleState((prev) => ({ ...prev, wordsInRow: e.target.value }))
                      }
                      style={csStyles.selectInput}
                    >
                      <option value="Auto">Auto Wrap</option>
                      <option value="1 Word">1 Word (Velocity Punch)</option>
                      <option value="2 Words">2 Words (Balanced)</option>
                      <option value="3 Words">3 Words (Paced Stack)</option>
                      <option value="4 Words">4 Words (Narrative)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Card 2: Colors, Background & Glow */}
              <div style={csStyles.card}>
                <div style={csStyles.cardHeader}>
                  <span style={csStyles.cardIcon}>🎨</span>
                  <h4 style={csStyles.cardTitle}>Colors &amp; Outlines</h4>
                </div>

                <div style={csStyles.formRow}>
                  <div style={csStyles.formField}>
                    <label style={csStyles.label}>Text Color</label>
                    <input
                      type="color"
                      value={styleState.textColor || "#FFFFFF"}
                      onChange={(e) =>
                        setStyleState((prev) => ({ ...prev, textColor: e.target.value }))
                      }
                      style={csStyles.colorPicker}
                    />
                  </div>

                  <div style={csStyles.formField}>
                    <label style={csStyles.label}>Highlight Color</label>
                    <input
                      type="color"
                      value={styleState.highlightColor || "#22C55E"}
                      onChange={(e) =>
                        setStyleState((prev) => ({
                          ...prev,
                          highlightColor: e.target.value,
                        }))
                      }
                      style={csStyles.colorPicker}
                    />
                  </div>

                  <div style={csStyles.formField}>
                    <label style={csStyles.label}>Background</label>
                    <input
                      type="color"
                      value={
                        styleState.backgroundColor?.startsWith("#")
                          ? styleState.backgroundColor
                          : "#000000"
                      }
                      onChange={(e) =>
                        setStyleState((prev) => ({
                          ...prev,
                          backgroundColor: e.target.value,
                        }))
                      }
                      style={csStyles.colorPicker}
                    />
                  </div>
                </div>

                <div style={csStyles.formRow}>
                  <div style={csStyles.formField}>
                    <div style={csStyles.labelWithVal}>
                      <label style={csStyles.label}>BG Opacity</label>
                      <span style={csStyles.valBadge}>{styleState.bgOpacity}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={styleState.bgOpacity}
                      onChange={(e) =>
                        setStyleState((prev) => ({
                          ...prev,
                          bgOpacity: Number(e.target.value),
                        }))
                      }
                      style={csStyles.rangeInput}
                    />
                  </div>

                  <div style={csStyles.formField}>
                    <div style={csStyles.labelWithVal}>
                      <label style={csStyles.label}>Box Padding</label>
                      <span style={csStyles.valBadge}>{styleState.boxPadding}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      value={styleState.boxPadding}
                      onChange={(e) =>
                        setStyleState((prev) => ({
                          ...prev,
                          boxPadding: Number(e.target.value),
                        }))
                      }
                      style={csStyles.rangeInput}
                    />
                  </div>
                </div>

                <div style={csStyles.formRow}>
                  <div style={csStyles.formField}>
                    <div style={csStyles.labelWithVal}>
                      <label style={csStyles.label}>Neon Glow</label>
                      <span style={csStyles.valBadge}>{styleState.neonGlow}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="60"
                      value={styleState.neonGlow}
                      onChange={(e) =>
                        setStyleState((prev) => ({
                          ...prev,
                          neonGlow: Number(e.target.value),
                        }))
                      }
                      style={csStyles.rangeInput}
                    />
                  </div>

                  <div style={csStyles.formField}>
                    <div style={csStyles.labelWithVal}>
                      <label style={csStyles.label}>Outline Stroke</label>
                      <span style={csStyles.valBadge}>{styleState.strokeWidth}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="0.5"
                      value={styleState.strokeWidth}
                      onChange={(e) =>
                        setStyleState((prev) => ({
                          ...prev,
                          strokeWidth: Number(e.target.value),
                        }))
                      }
                      style={csStyles.rangeInput}
                    />
                  </div>
                </div>
              </div>

              {/* Card 3: Position & Tilt */}
              <div style={csStyles.card}>
                <div style={csStyles.cardHeader}>
                  <span style={csStyles.cardIcon}>📍</span>
                  <h4 style={csStyles.cardTitle}>Position &amp; Tilt</h4>
                </div>

                <div style={csStyles.formRow}>
                  <div style={csStyles.formField}>
                    <div style={csStyles.labelWithVal}>
                      <label style={csStyles.label}>Vertical Position (Y)</label>
                      <span style={csStyles.valBadge}>{styleState.posY}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="90"
                      value={styleState.posY}
                      onChange={(e) =>
                        setStyleState((prev) => ({
                          ...prev,
                          posY: Number(e.target.value),
                        }))
                      }
                      style={csStyles.rangeInput}
                    />
                  </div>

                  <div style={csStyles.formField}>
                    <div style={csStyles.labelWithVal}>
                      <label style={csStyles.label}>Horizontal Position (X)</label>
                      <span style={csStyles.valBadge}>{styleState.posX}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="90"
                      value={styleState.posX}
                      onChange={(e) =>
                        setStyleState((prev) => ({
                          ...prev,
                          posX: Number(e.target.value),
                        }))
                      }
                      style={csStyles.rangeInput}
                    />
                  </div>
                </div>

                <div style={csStyles.formRow}>
                  <div style={csStyles.formField}>
                    <div style={csStyles.labelWithVal}>
                      <label style={csStyles.label}>Tilt Angle</label>
                      <span style={csStyles.valBadge}>{styleState.rotateAngle}°</span>
                    </div>
                    <input
                      type="range"
                      min="-15"
                      max="15"
                      value={styleState.rotateAngle}
                      onChange={(e) =>
                        setStyleState((prev) => ({
                          ...prev,
                          rotateAngle: Number(e.target.value),
                        }))
                      }
                      style={csStyles.rangeInput}
                    />
                  </div>

                  <div style={csStyles.formField}>
                    <label style={csStyles.label}>Behind Speaker Effect</label>
                    <button
                      type="button"
                      onClick={() =>
                        setStyleState((prev) => ({
                          ...prev,
                          behindPerson: !prev.behindPerson,
                        }))
                      }
                      style={{
                        padding: "8px 12px",
                        backgroundColor: isBehindPerson
                          ? "rgba(34, 197, 94, 0.2)"
                          : "rgba(255, 255, 255, 0.05)",
                        border: isBehindPerson
                          ? "1px solid rgba(34, 197, 94, 0.5)"
                          : "1px solid rgba(255, 255, 255, 0.12)",
                        color: isBehindPerson ? "#4ADE80" : "#94A3B8",
                        borderRadius: "8px",
                        fontSize: "12px",
                        fontWeight: "700",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                      }}
                    >
                      <span>👤</span>
                      <span>{isBehindPerson ? "Active (Behind Person)" : "Disabled (Over Subject)"}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Card 4: Presets & Export Actions */}
              <div style={{ ...csStyles.card, ...csStyles.presetsCard }}>
                <div style={csStyles.cardHeader}>
                  <span style={csStyles.cardIcon}>⚡</span>
                  <div>
                    <h4 style={csStyles.cardTitle}>Presets &amp; Export</h4>
                    <span style={{ fontSize: "11px", color: "#64748B" }}>
                      1-Click Styles modeled after Moonshot &amp; Submagic
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsPresetsGalleryOpen(true)}
                  style={csStyles.browsePresetsBtn}
                >
                  <span>✦</span>
                  <span>Browse Presets Library (160+ Styles)</span>
                  <span style={csStyles.valBadge}>160 STYLES</span>
                </button>

                <div style={{ marginTop: "16px" }}>
                  <button
                    type="button"
                    onClick={handleExportCaptionedVideo}
                    disabled={isExporting}
                    style={csStyles.exportHeroBtn}
                  >
                    <span>🚀</span>
                    <span>
                      {isExporting ? "Exporting Video..." : "Download Video With Captions"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* ── Presets Gallery Modal Drawer ── */}
      <PresetsGallery
        isOpen={isPresetsGalleryOpen}
        onClose={() => setIsPresetsGalleryOpen(false)}
        activePresetId={activePreset}
        onSelectPreset={handleApplyPreset}
      />
    </div>
  );
}

const csStyles = {
  card: {
    backgroundColor: "#0E1119",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "14px",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  presetsCard: {
    backgroundColor: "rgba(14, 17, 25, 0.95)",
    borderColor: "rgba(0, 229, 255, 0.2)",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "16px",
  },
  cardIcon: {
    fontSize: "18px",
  },
  cardTitle: {
    margin: 0,
    fontSize: "15px",
    fontWeight: "700",
    color: "#F1F5F9",
  },
  formRow: {
    display: "flex",
    gap: "16px",
    marginBottom: "14px",
  },
  formField: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#94A3B8",
  },
  labelWithVal: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  valBadge: {
    fontSize: "11px",
    fontWeight: "700",
    color: "#00E5FF",
    backgroundColor: "rgba(0, 229, 255, 0.1)",
    padding: "2px 6px",
    borderRadius: "4px",
  },
  selectInput: {
    padding: "8px 12px",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "8px",
    color: "#FFFFFF",
    fontSize: "13px",
    fontFamily: "Inter, sans-serif",
  },
  rangeInput: {
    width: "100%",
    accentColor: "#00E5FF",
    cursor: "pointer",
  },
  colorPicker: {
    width: "100%",
    height: "36px",
    backgroundColor: "transparent",
    border: "1px solid rgba(255, 255, 255, 0.15)",
    borderRadius: "8px",
    cursor: "pointer",
  },
  browsePresetsBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "13px 20px",
    backgroundColor: "rgba(0, 229, 255, 0.08)",
    border: "1.5px solid rgba(0, 229, 255, 0.4)",
    borderRadius: "10px",
    color: "#00E5FF",
    fontSize: "14px",
    fontWeight: "800",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  exportHeroBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    padding: "14px 20px",
    backgroundColor: "#00E5FF",
    border: "none",
    borderRadius: "10px",
    color: "#000000",
    fontSize: "15px",
    fontWeight: "800",
    cursor: "pointer",
    boxShadow: "0 4px 20px rgba(0, 229, 255, 0.3)",
    transition: "all 0.2s ease",
  },
};
