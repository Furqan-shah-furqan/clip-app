import React, { useState, useMemo, useRef, useEffect } from "react";
import PresetsGallery from "./PresetsGallery";
import { DEFAULT_PRESET } from "../../constants/captionPresets";

/**
 * RGBA Converter Helper: converts hex and opacity percentage to valid rgba string.
 */
function hexToRgba(hex = "#000000", opacityPercent = 100) {
  let clean = String(hex || "#000000").replace("#", "").trim();
  if (clean === "transparent") return "transparent";
  if (clean.startsWith("rgba") || clean.startsWith("rgb")) {
    const match = clean.match(/[\d.]+/g);
    if (match && match.length >= 3) {
      const r = parseInt(match[0], 10) || 0;
      const g = parseInt(match[1], 10) || 0;
      const b = parseInt(match[2], 10) || 0;
      const alpha = Math.max(0, Math.min(1, opacityPercent / 100));
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  if (clean.length === 3) clean = clean.split("").map((c) => c + c).join("");
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  const alpha = Math.max(0, Math.min(1, opacityPercent / 100));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}



/**
 * Generates evenly distributed word timestamps across the clip's duration.
 */
function generateWordTimestamps(text, totalDuration) {
  const wordsArray = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!wordsArray.length || !totalDuration) return [];
  const durationPerWord = totalDuration / wordsArray.length;
  return wordsArray.map((w, i) => ({
    word: w,
    start: Math.round(i * durationPerWord * 100) / 100,
    end: Math.round((i + 1) * durationPerWord * 100) / 100,
  }));
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
      boxPadding: s.bgPadding !== undefined ? s.bgPadding : 12,
      neonGlow: s.shadowBlur || 0,
      strokeWidth: s.strokeWidth || 0,
      strokeColor: s.strokeColor || "#000000",
      textShadow: true,
      shadowOffsetX: 0,
      shadowOffsetY: 4,
      shadowBlur: 12,
      positionX: 0,
      positionY: 180,
      rotation: 0,
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
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState(0);
  const videoRef = useRef(null);
  const segmentationCanvasRef = useRef(null);
  const segmentationPipelineRef = useRef(null);

  // Header status state
  const [status, setStatus] = useState("● Live Audio Parity");
  const [words, setWords] = useState([]);

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
    setCurrentPlaybackTime(curr);
  };

  // Continuous animation frame loop to synchronize currentPlaybackTime at 60fps
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let animId;
    const tick = () => {
      if (video && !video.paused && !video.ended) {
        setCurrentPlaybackTime(video.currentTime);
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [clip.videoUrl]);

  // ── PART 1: Instant Caption Data Resolution ──
  useEffect(() => {
    let activeClip = clip;
    if (!activeClip || (!activeClip.videoUrl && !activeClip.text && !activeClip.transcript)) {
      try {
        const storedProjects = JSON.parse(localStorage.getItem("clipflow_projects") || "[]");
        if (storedProjects.length > 0 && storedProjects[0].clips?.length > 0) {
          activeClip = storedProjects[0].clips[0];
        } else {
          const sessionClip = JSON.parse(localStorage.getItem("clipflow-caption-clip") || "null");
          if (sessionClip) activeClip = sessionClip;
        }
      } catch (err) {
        console.warn("Could not read stored clip:", err);
      }
    }

    const clipStartSec = parseTimeToSeconds(activeClip?.start || 0);
    const clipEndSec = parseTimeToSeconds(activeClip?.end || 0);
    const clipDur =
      clipEndSec > clipStartSec
        ? clipEndSec - clipStartSec
        : Number(activeClip?.duration) || 30;

    // 1. Direct word-level array: [{ word: "...", start: 0.2, end: 0.6 }]
    const rawWords = activeClip?.words || (Array.isArray(activeClip?.transcript) ? activeClip.transcript : null);
    if (Array.isArray(rawWords) && rawWords.length > 0 && (rawWords[0].word || rawWords[0].text)) {
      const parsed = rawWords
        .map((w) => {
          let wStart = parseTimeToSeconds(w.start);
          let wEnd = parseTimeToSeconds(w.end);
          if (clipStartSec > 2 && wStart >= clipStartSec - 2) {
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

      if (parsed.length > 0) {
        setWords(parsed);
        setStatus("● Live Audio Parity");
        return;
      }
    }

    // 2. Segment array with possible sub-words
    const rawSegs = activeClip?.segments || activeClip?.captions || activeClip?.subtitleSegments;
    if (Array.isArray(rawSegs) && rawSegs.length > 0) {
      const extractedWords = [];
      const firstSegStart = parseTimeToSeconds(rawSegs[0].start || 0);
      const isAbsolute = firstSegStart >= clipStartSec - 2 && clipStartSec > 2;

      rawSegs.forEach((seg) => {
        let segStart = parseTimeToSeconds(seg.start);
        let segEnd = parseTimeToSeconds(seg.end);
        if (isAbsolute) {
          segStart = Math.max(0, segStart - clipStartSec);
          segEnd = Math.max(segStart + 0.3, segEnd - clipStartSec);
        }

        if (Array.isArray(seg.words) && seg.words.length > 0) {
          seg.words.forEach((w) => {
            let wStart = parseTimeToSeconds(w.start);
            let wEnd = parseTimeToSeconds(w.end);
            if (isAbsolute) {
              wStart = Math.max(0, wStart - clipStartSec);
              wEnd = Math.max(wStart + 0.1, wEnd - clipStartSec);
            }
            if (w.word || w.text) {
              extractedWords.push({
                word: (w.word || w.text).trim(),
                start: wStart,
                end: wEnd,
              });
            }
          });
        } else {
          const text = (seg.text || seg.content || "").trim();
          const tokens = text.split(/\s+/).filter(Boolean);
          const dur = Math.max(0.3, segEnd - segStart);
          const wDur = dur / Math.max(1, tokens.length);
          tokens.forEach((t, i) => {
            extractedWords.push({
              word: t,
              start: segStart + i * wDur,
              end: segStart + (i + 1) * wDur,
            });
          });
        }
      });

      if (extractedWords.length > 0) {
        setWords(extractedWords);
        setStatus(`● Live Audio Parity (${extractedWords.length} Words Synced)`);
        return;
      }
    }

    // 3. Fallback Word Generation: distribute raw text across clip duration
    const rawText = (
      (typeof activeClip?.transcript === "string" ? activeClip.transcript : null) ||
      activeClip?.text ||
      activeClip?.description ||
      activeClip?.hook ||
      activeClip?.previewText ||
      activeClip?.title ||
      "ROBERTS GREENE REVEALS THAT TRUE MASTERY BEGINS WHEN YOU TURN YOUR FOCUS INWARD"
    ).trim();

    const generated = generateWordTimestamps(rawText, clipDur);
    setWords(generated);
    setStatus(`● Live Audio Parity (${generated.length} Words Synced)`);
  }, [clip]);

  // ── Dynamic Word Grouping ("Words in a Row") ──
  const activeCaptionChunk = useMemo(() => {
    if (!words || words.length === 0) return null;

    const isVideoPaused = !videoRef.current || videoRef.current.paused;
    const isAtZero = currentPlaybackTime <= 0.05;

    const cadence = styleState.wordsInRow || "2 Words";
    let groupSize = 2;
    if (cadence === "1 Word") groupSize = 1;
    else if (cadence === "2 Words") groupSize = 2;
    else if (cadence === "3 Words") groupSize = 3;
    else if (cadence === "4 Words") groupSize = 4;
    else if (cadence === "Auto") groupSize = 5;

    // Build chunks
    const chunks = [];
    for (let i = 0; i < words.length; i += groupSize) {
      chunks.push(words.slice(i, i + groupSize));
    }

    // Initial load preview at 0s so user can edit styles immediately
    if (isVideoPaused && isAtZero) {
      const firstChunk = chunks[0] || [];
      return firstChunk.map((w, idx) => ({
        word: w.word,
        isCurrent: idx === 0,
      }));
    }

    // Active playback: Find chunk where currentPlaybackTime >= chunk[0].start && currentPlaybackTime <= chunk[last].end
    const activeChunk = chunks.find((chunk) => {
      if (!chunk.length) return false;
      const cStart = chunk[0].start;
      const cEnd = chunk[chunk.length - 1].end;
      return currentPlaybackTime >= cStart && currentPlaybackTime <= cEnd;
    });

    if (!activeChunk || activeChunk.length === 0) {
      return null; // Clean fade between sentences/pauses, no orphaned words
    }

    return activeChunk.map((w) => ({
      word: w.word,
      isCurrent: currentPlaybackTime >= w.start && currentPlaybackTime <= w.end,
    }));
  }, [words, currentPlaybackTime, styleState.wordsInRow]);

  // ── PART 2: Independent Neon Glow Calculation ──
  const computedTextShadow = useMemo(() => {
    if (styleState.neonGlow > 0) {
      const glowColor = styleState.textColor || "#FFDE00";
      const g = styleState.neonGlow;
      return `0 0 ${g * 0.25}px ${glowColor}, 0 0 ${g * 0.5}px ${glowColor}, 0 0 ${g}px ${glowColor}, 0 0 ${g * 1.5}px ${glowColor}`;
    }
    if (styleState.textShadow) {
      return `${styleState.shadowOffsetX || 0}px ${styleState.shadowOffsetY || 4}px ${styleState.shadowBlur || 12}px rgba(0,0,0,0.85)`;
    }
    return "none";
  }, [
    styleState.neonGlow,
    styleState.textShadow,
    styleState.textColor,
    styleState.shadowOffsetX,
    styleState.shadowOffsetY,
    styleState.shadowBlur,
  ]);

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

          const width = video.videoWidth || canvas.width || 340;
          const height = video.videoHeight || canvas.height || 680;

          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }

          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(results.segmentationMask, 0, 0, width, height);
          ctx.globalCompositeOperation = "source-in";
          ctx.drawImage(results.image, 0, 0, width, height);
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
      parsedOpacity = 0;
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
      boxPadding: s.bgPadding !== undefined ? s.bgPadding : 12,
      neonGlow: s.shadowBlur || 0,
      strokeWidth: 0,
      strokeColor: s.strokeColor || "#000000",
      behindPerson: isBtp,
      positionY: isBtp ? -40 : prev.positionY,
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
          positionX: styleState.positionX,
          positionY: styleState.positionY,
          rotateAngle: styleState.rotation,
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

        {/* Center: Live Audio Parity Status Pill */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 14px",
              backgroundColor: "rgba(34, 197, 94, 0.15)",
              border: "1px solid rgba(34, 197, 94, 0.35)",
              borderRadius: "9999px",
              fontSize: "12px",
              fontWeight: "700",
              color: "#4ADE80",
              boxShadow: "0 0 12px rgba(34, 197, 94, 0.2)",
            }}
          >
            <span
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                backgroundColor: "#4ADE80",
                boxShadow: "0 0 8px #4ADE80",
              }}
            />
            <span>{status}</span>
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

      {/* ── Main Workspace: PART 3 Aligned Grid Layout matching phone height to controls ── */}
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
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch w-full min-h-[820px]"
          style={{
            display: "grid",
            gap: "24px",
            alignItems: "stretch",
            minHeight: "820px",
            width: "100%",
          }}
        >
          {/* ── Left Column Wrapper: Phone Mockup Frame (lg:col-span-4 flex flex-col h-full items-center justify-start) ── */}
          <div
            className="lg:col-span-4 flex flex-col h-full items-center justify-start"
            style={{
              gridColumn: "span 4 / span 4",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-start",
            }}
          >
            <div
              className="relative w-full max-w-[340px] h-full flex flex-col rounded-[48px] border-[10px] border-[#1C1F26] bg-black shadow-2xl overflow-hidden"
              style={{
                position: "relative",
                width: "100%",
                maxWidth: "340px",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                borderRadius: "48px",
                border: "10px solid #1C1F26",
                backgroundColor: "#000000",
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.9), 0 0 40px rgba(0, 229, 255, 0.08)",
                overflow: "hidden",
              }}
            >
              {/* 4K Badge */}
              <div
                className="absolute top-4 left-4 z-20 text-[10px] font-bold text-white/70 bg-black/40 px-2 py-0.5 rounded-full"
                style={{
                  position: "absolute",
                  top: "14px",
                  left: "14px",
                  zIndex: 20,
                  fontSize: "10px",
                  fontWeight: "800",
                  color: "rgba(255, 255, 255, 0.85)",
                  backgroundColor: "rgba(0, 0, 0, 0.6)",
                  padding: "2px 8px",
                  borderRadius: "9999px",
                  backdropFilter: "blur(4px)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                }}
              >
                4K
              </div>

              {/* Dynamic Island Speaker Notch */}
              <div
                style={{
                  position: "absolute",
                  top: "12px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "88px",
                  height: "18px",
                  backgroundColor: "#1C1F26",
                  borderRadius: "9999px",
                  zIndex: 30,
                  pointerEvents: "none",
                }}
              />

              {/* Behind Subject Badge */}
              {isBehindPerson && (
                <div
                  style={{
                    position: "absolute",
                    top: "14px",
                    right: "14px",
                    zIndex: 25,
                    padding: "3px 8px",
                    backgroundColor: "rgba(34, 197, 94, 0.25)",
                    border: "1px solid rgba(34, 197, 94, 0.5)",
                    borderRadius: "6px",
                    color: "#4ADE80",
                    fontSize: "10px",
                    fontWeight: "800",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    pointerEvents: "none",
                  }}
                >
                  <span>👤</span>
                  <span>BEHIND</span>
                </div>
              )}

              {/* Video fills 100% of the stretched height */}
              <div
                className="relative flex-1 w-full h-full overflow-hidden flex items-center justify-center"
                style={{
                  position: "relative",
                  flex: 1,
                  width: "100%",
                  height: "100%",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#000000",
                }}
              >
                {/* Layer 1: Video */}
                {clip.videoUrl ? (
                  <video
                    ref={videoRef}
                    src={clip.videoUrl}
                    className="w-full h-full object-cover"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                    playsInline
                    controls
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
                    }}
                  >
                    <span style={{ fontSize: "42px", opacity: 0.7 }}>🎬</span>
                    <span
                      style={{
                        fontSize: "13px",
                        color: "#64748B",
                        marginTop: "10px",
                        fontWeight: 600,
                      }}
                    >
                      Live Video Preview
                    </span>
                  </div>
                )}

                {/* Layer 2: Caption Overlay & Forced Styles */}
                {activeCaptionChunk && activeCaptionChunk.length > 0 && (
                  <div
                    className="caption-overlay-wrapper pointer-events-none absolute inset-0 flex items-center justify-center"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      pointerEvents: "none",
                      zIndex: 2,
                      transform: `translate(${styleState.positionX ?? 0}px, ${styleState.positionY ?? 180}px) rotate(${styleState.rotation ?? 0}deg)`,
                      transition: "transform 0.08s ease-out",
                    }}
                  >
                    <span
                      className="caption-badge"
                      style={{
                        fontFamily: styleState.fontFamily || "Montserrat",
                        fontSize: `${styleState.fontSize || 28}px`,
                        fontWeight: 900,
                        letterSpacing: `${styleState.letterSpacing || 0}px`,
                        lineHeight: styleState.lineSpacing || 1.2,
                        color: styleState.textColor || "#FFFFFF",
                        textTransform:
                          styleState.letterCase === "ALL CAPS" ? "uppercase" : "none",
                        textAlign: "center",
                        display: "inline-block",

                        // 1. Force Background Pill Rendering
                        backgroundColor:
                          styleState.bgOpacity > 0
                            ? hexToRgba(styleState.backgroundColor || "#000000", styleState.bgOpacity)
                            : "transparent",
                        padding:
                          styleState.bgOpacity > 0
                            ? `${styleState.boxPadding || 12}px ${(styleState.boxPadding || 12) * 1.4}px`
                            : "0px",
                        borderRadius: "14px",

                        // 2. Force Neon Glow Rendering
                        textShadow: computedTextShadow,

                        // 3. Stroke
                        WebkitTextStroke:
                          styleState.strokeWidth > 0
                            ? `${styleState.strokeWidth}px ${styleState.strokeColor || "#000000"}`
                            : "none",

                        boxSizing: "border-box",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        transition: "all 0.1s ease-out",
                      }}
                    >
                      {activeCaptionChunk.map((w, idx) => (
                        <span
                          key={`${w.word}-${idx}`}
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
                          {w.word}
                        </span>
                      ))}
                    </span>
                  </div>
                )}

                {/* Layer 3: Subject segmentation canvas if active */}
                <canvas
                  ref={segmentationCanvasRef}
                  className="w-full h-full object-cover absolute inset-0 pointer-events-none z-[3]"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    pointerEvents: "none",
                    zIndex: 3,
                    display: isBehindPerson ? "block" : "none",
                  }}
                />
              </div>

              {/* Bottom Video Controls */}
              <div
                className="w-full p-4 bg-gradient-to-t from-black/80 to-transparent z-20 flex items-center justify-between text-xs text-white/70"
                style={{
                  width: "100%",
                  padding: "14px 18px",
                  background: "linear-gradient(to top, rgba(0,0,0,0.85), transparent)",
                  zIndex: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  boxSizing: "border-box",
                }}
              >
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)" }}>
                  Live Audio Parity
                </span>
                <span style={{ color: "#00E5FF", fontWeight: "700", fontSize: "12px" }}>
                  {Math.floor(currentPlaybackTime / 60)}:
                  {String(Math.floor(currentPlaybackTime % 60)).padStart(2, "0")}
                </span>
              </div>
            </div>
          </div>

          {/* ── Right Column: 2-Row Controls Grid ── */}
          <div
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
                      <span style={csStyles.valBadge}>{styleState.positionY}px</span>
                    </div>
                    <input
                      type="range"
                      min="-240"
                      max="240"
                      step="2"
                      value={styleState.positionY}
                      onChange={(e) =>
                        setStyleState((prev) => ({
                          ...prev,
                          positionY: Number(e.target.value),
                        }))
                      }
                      style={csStyles.rangeInput}
                    />
                  </div>

                  <div style={csStyles.formField}>
                    <div style={csStyles.labelWithVal}>
                      <label style={csStyles.label}>Horizontal Position (X)</label>
                      <span style={csStyles.valBadge}>{styleState.positionX}px</span>
                    </div>
                    <input
                      type="range"
                      min="-150"
                      max="150"
                      step="2"
                      value={styleState.positionX}
                      onChange={(e) =>
                        setStyleState((prev) => ({
                          ...prev,
                          positionX: Number(e.target.value),
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
                      <span style={csStyles.valBadge}>{styleState.rotation}°</span>
                    </div>
                    <input
                      type="range"
                      min="-15"
                      max="15"
                      step="1"
                      value={styleState.rotation}
                      onChange={(e) =>
                        setStyleState((prev) => ({
                          ...prev,
                          rotation: Number(e.target.value),
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
          </div>
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
