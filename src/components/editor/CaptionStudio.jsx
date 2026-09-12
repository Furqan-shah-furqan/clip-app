import React, { useState, useMemo, useRef, useEffect } from "react";
import PresetsGallery from "./PresetsGallery";
import { DEFAULT_PRESET } from "../../constants/captionPresets";
import { createSubjectSegmentation } from "../../services/subjectSegmentation";

/**
 * CaptionStudio Component
 * Full-featured Caption Studio matching ClipFlow Studio's layout.
 * Includes Phone Mockup Preview with 3-Layer "Behind the Person" Subject Segmentation,
 * Typography & Cadence Controls, Colors & Outline Sliders, and PresetsGallery integration.
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
        "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Bebas+Neue&family=Cinzel:wght@700;900&family=Inter:wght@400;600;700;800;900&family=Montserrat:wght@600;700;800;900&family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Poppins:wght@600;700;800;900&family=Syne:wght@700;800&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  // Top-level slider & style states (synced with preset engine)
  const [fontFamily, setFontFamily] = useState(DEFAULT_PRESET.style.fontFamily);
  const [fontSize, setFontSize] = useState(DEFAULT_PRESET.style.fontSize);
  const [fontWeight, setFontWeight] = useState(DEFAULT_PRESET.style.fontWeight || "900");
  const [textColor, setTextColor] = useState(DEFAULT_PRESET.style.textColor);
  const [highlightColor, setHighlightColor] = useState(DEFAULT_PRESET.style.highlightColor);
  const [outlineStroke, setOutlineStroke] = useState(DEFAULT_PRESET.style.strokeWidth || 0);
  const [outlineColor, setOutlineColor] = useState(DEFAULT_PRESET.style.strokeColor || "#000000");
  const [bgColor, setBgColor] = useState(DEFAULT_PRESET.style.bgColor);
  const [bgOpacity, setBgOpacity] = useState(DEFAULT_PRESET.style.bgOpacity);
  const [neonGlow, setNeonGlow] = useState(DEFAULT_PRESET.style.shadowBlur);
  const [wordAnimation, setWordAnimation] = useState(DEFAULT_PRESET.style.wordAnimation);
  const [wordsInRow, setWordsInRow] = useState(DEFAULT_PRESET.style.wordsInRow);
  const [letterSpacing, setLetterSpacing] = useState(DEFAULT_PRESET.style.letterSpacing || 0);
  const [lineSpacing, setLineSpacing] = useState(DEFAULT_PRESET.style.lineSpacing || 1.3);
  const [textTransform, setTextTransform] = useState(DEFAULT_PRESET.style.textTransform || "uppercase");

  // Presets Gallery Drawer State
  const [isPresetsGalleryOpen, setIsPresetsGalleryOpen] = useState(false);
  const [activePreset, setActivePreset] = useState(DEFAULT_PRESET.id);
  const [activePresetStyle, setActivePresetStyle] = useState(DEFAULT_PRESET.style);
  const [activePresetAssConfig, setActivePresetAssConfig] = useState(DEFAULT_PRESET.assConfig);

  // Export Loading State
  const [isExporting, setIsExporting] = useState(false);

  // Position & Tilt state
  const [posX, setPosX] = useState(50);
  const [posY, setPosY] = useState(82);
  const [rotateAngle, setRotateAngle] = useState(0);

  // Video & Subject Segmentation Layering Refs
  const videoRef = useRef(null);
  const segmentationCanvasRef = useRef(null);
  const segmentationPipelineRef = useRef(null);
  const [isSegmentationReady, setIsSegmentationReady] = useState(false);

  // Check if active preset is "Behind the Person"
  const isBehindPerson = useMemo(() => {
    return Boolean(
      activePresetStyle?.behindPerson ||
      activePreset?.startsWith("btp-") ||
      activePresetStyle?.category === "Behind the Person"
    );
  }, [activePresetStyle, activePreset]);

  // Initialize and synchronize Subject Segmentation when "Behind the Person" is active
  useEffect(() => {
    const video = videoRef.current;
    const canvas = segmentationCanvasRef.current;

    if (!isBehindPerson || !video || !canvas) {
      if (segmentationPipelineRef.current) {
        segmentationPipelineRef.current.stop();
      }
      return;
    }

    const pipeline = createSubjectSegmentation({
      video,
      canvas,
      onReady: (ready) => setIsSegmentationReady(ready),
      onError: (err) => console.warn("Subject segmentation fallback active:", err),
    });

    segmentationPipelineRef.current = pipeline;
    pipeline.start();

    const handlePlay = () => pipeline.start();
    const handlePause = () => pipeline.processSingleFrame();
    const handleSeeked = () => pipeline.processSingleFrame();

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("seeked", handleSeeked);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("seeked", handleSeeked);
      pipeline.destroy();
    };
  }, [isBehindPerson, clip.videoUrl]);

  // Preset Application Handler: Completely overrides active typography, layout, shadows & background
  const handleApplyPreset = (preset) => {
    if (!preset?.style) return;

    const s = preset.style;

    // Synchronize all individual control variables
    setFontFamily(s.fontFamily);
    setFontSize(s.fontSize);
    setFontWeight(s.fontWeight || "800");
    setTextColor(s.textColor || "#FFFFFF");
    setHighlightColor(s.highlightColor || "#22C55E");
    setOutlineStroke(s.strokeWidth || 0); // Always default stroke to 0px
    setOutlineColor(s.strokeColor || "#000000");
    setBgColor(s.bgColor || "transparent");
    setBgOpacity(s.bgOpacity !== undefined ? s.bgOpacity : 70);
    setNeonGlow(s.shadowBlur || 0);
    setWordAnimation(s.wordAnimation || "pop");
    setWordsInRow(s.wordsInRow || "Auto");
    setLetterSpacing(s.letterSpacing !== undefined ? s.letterSpacing : 0);
    setLineSpacing(s.lineSpacing || 1.3);
    setTextTransform(s.textTransform || "uppercase");

    // Override active preset state
    setActivePreset(preset.id);
    setActivePresetStyle({ ...s, behindPerson: Boolean(preset.behindPerson || s.behindPerson) });
    setActivePresetAssConfig(preset.assConfig);

    // Close drawer smoothly
    setIsPresetsGalleryOpen(false);
  };

  // Live computed caption style for zero-latency, anti-aliased phone mockup rendering
  const liveCaptionStyle = useMemo(() => {
    const s = activePresetStyle || {};

    const computedFontFamily = s.fontFamily || fontFamily || "'Montserrat', sans-serif";
    const computedFontWeight = s.fontWeight || fontWeight || "800";
    const computedTextTransform = s.textTransform || textTransform || "uppercase";
    const computedLetterSpacing = s.letterSpacing !== undefined ? s.letterSpacing : letterSpacing;
    const computedLineHeight = s.lineSpacing || lineSpacing || 1.3;

    // Stroke: strictly only applied if user has explicitly increased stroke > 0
    const hasStroke = outlineStroke > 0;
    const strokeCss = hasStroke ? `${outlineStroke}px ${outlineColor || "#000000"}` : "none";

    // Text Shadow & Glow
    const computedTextShadow = s.textShadow
      ? s.textShadow
      : neonGlow
      ? `0 0 ${neonGlow}px ${s.shadowColor || highlightColor}`
      : "none";

    // Background styling
    const computedBgColor = s.bgColor || bgColor || "transparent";
    const computedPadding = s.bgPadding
      ? `${Math.min(s.bgPadding, 16)}px ${Math.min(s.bgPadding + 6, 22)}px`
      : "0px";
    const computedBorderRadius = `${s.borderRadius || 0}px`;

    return {
      fontFamily: computedFontFamily,
      fontSize: `${fontSize}px`,
      fontWeight: computedFontWeight,
      textTransform: computedTextTransform,
      color: textColor || s.textColor || "#FFFFFF",
      backgroundColor: computedBgColor,
      padding: computedPadding,
      borderRadius: computedBorderRadius,
      letterSpacing: `${computedLetterSpacing}px`,
      lineHeight: computedLineHeight,
      WebkitFontSmoothing: "antialiased",
      MozOsxFontSmoothing: "grayscale",
      textRendering: "optimizeLegibility",
      paintOrder: "stroke fill markers",
      strokeLinejoin: "round",
      WebkitTextStroke: strokeCss,
      textShadow: computedTextShadow,
      boxShadow: s.boxShadow || "none",
      backdropFilter: s.backdropFilter || "none",
      filter: s.filter || "none",
      transform: `translate(-50%, -50%) rotate(${rotateAngle}deg)`,
      left: `${posX}%`,
      top: `${posY}%`,
      position: "absolute",
      textAlign: "center",
      userSelect: "none",
      pointerEvents: "none",
      maxWidth: "90%",
      wordBreak: "break-word",
      zIndex: isBehindPerson ? 2 : 10,
      transition: "font-size 0.1s ease, color 0.1s ease, background-color 0.1s ease, transform 0.1s ease",
    };
  }, [
    fontFamily,
    fontSize,
    fontWeight,
    textTransform,
    textColor,
    bgColor,
    outlineStroke,
    outlineColor,
    neonGlow,
    letterSpacing,
    lineSpacing,
    rotateAngle,
    posX,
    posY,
    activePresetStyle,
    highlightColor,
    isBehindPerson,
  ]);

  // Split preview text into words for authentic active-highlight rendering
  const renderedWords = useMemo(() => {
    const rawText = clip.previewText || "THIS IS HOW YOU GO VIRAL";
    const words = rawText.trim().split(/\s+/);
    if (words.length === 0) return [];

    const activeHlColor = highlightColor || activePresetStyle?.highlightColor || "#22C55E";
    const baseTextColor = textColor || activePresetStyle?.textColor || "#FFFFFF";

    return words.map((word, idx) => {
      // Highlight the first word (or primary punch word)
      const isHighlighted = idx === 0 && activeHlColor;
      return (
        <span
          key={`${word}-${idx}`}
          style={{
            color: isHighlighted ? activeHlColor : baseTextColor,
            display: "inline-block",
            margin: "0 3px",
            transition: "color 0.15s ease",
          }}
        >
          {word}
        </span>
      );
    });
  }, [clip.previewText, highlightColor, textColor, activePresetStyle]);

  // Headless Export Handler (Preserves Locked Backend Payload)
  const handleExportCaptionedVideo = async () => {
    try {
      setIsExporting(true);

      const payload = {
        videoId: clip.videoId || clip.id,
        clipStart: clip.start || "00:00:00",
        clipEnd: clip.end || "00:00:30",
        captionStyle: {
          ...activePresetStyle,
          fontFamily,
          fontSize,
          fontWeight,
          textColor,
          highlightColor,
          strokeWidth: outlineStroke,
          strokeColor: outlineColor,
          bgColor,
          bgOpacity,
          shadowBlur: neonGlow,
          wordAnimation,
          wordsInRow,
          letterSpacing,
          lineSpacing,
          textTransform,
          behindPerson: isBehindPerson,
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
    <div style={csStyles.container}>
      {/* ── Topbar ── */}
      <header style={csStyles.topbar}>
        <div style={csStyles.topbarLeft}>
          <button type="button" onClick={onBack} style={csStyles.backBtn}>
            ← Back
          </button>
          <div style={csStyles.titleBlock}>
            <span style={csStyles.kicker}>Caption Studio</span>
            <h2 style={csStyles.clipTitle}>{clip.title || "Selected Clip"}</h2>
          </div>
        </div>

        <div style={csStyles.topbarRight}>
          <button
            type="button"
            onClick={() => setIsPresetsGalleryOpen(true)}
            style={csStyles.openPresetsTopBtn}
          >
            <span style={{ fontSize: "15px" }}>⚡</span>
            <span>Browse 160+ Presets</span>
          </button>
          <button
            type="button"
            onClick={handleExportCaptionedVideo}
            disabled={isExporting}
            style={csStyles.exportTopBtn}
          >
            {isExporting ? "Exporting..." : "Download Video"}
          </button>
        </div>
      </header>

      {/* ── Main Work Area ── */}
      <main style={csStyles.workspace}>
        {/* LEFT: Phone Mockup Live Preview with 3-Layer Composition */}
        <section style={csStyles.previewPanel}>
          <div style={csStyles.phoneFrame}>
            <div style={csStyles.phoneScreen}>
              {/* Badge indicator when Behind the Person layer is active */}
              {isBehindPerson && (
                <div style={csStyles.behindPersonBadge}>
                  <span>👤</span>
                  <span>BEHIND SUBJECT</span>
                </div>
              )}

              {/* Layer 1 (Bottom): Base Video Element */}
              {clip.videoUrl ? (
                <video
                  ref={videoRef}
                  src={clip.videoUrl}
                  style={csStyles.videoElement}
                  controls
                  playsInline
                  crossOrigin="anonymous"
                />
              ) : (
                <div style={csStyles.videoPlaceholder}>
                  <span style={{ fontSize: "32px", opacity: 0.6 }}>🎬</span>
                  <span style={{ fontSize: "12px", color: "#64748B", marginTop: "8px" }}>
                    Live Clip Preview
                  </span>
                </div>
              )}

              {/* Layer 2 (Middle): Caption Overlay */}
              <div style={liveCaptionStyle}>
                {renderedWords}
              </div>

              {/* Layer 3 (Top): Real-time MediaPipe Subject Segmentation Canvas */}
              <canvas
                ref={segmentationCanvasRef}
                style={{
                  ...csStyles.subjectCanvas,
                  display: isBehindPerson ? "block" : "none",
                }}
              />
            </div>
          </div>
        </section>

        {/* RIGHT: Controls Grid */}
        <section style={csStyles.controlsPanel}>
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
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
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
                  <span style={csStyles.valBadge}>{fontSize}px</span>
                </div>
                <input
                  type="range"
                  min="16"
                  max="64"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  style={csStyles.rangeInput}
                />
              </div>
            </div>

            <div style={csStyles.formRow}>
              <div style={csStyles.formField}>
                <div style={csStyles.labelWithVal}>
                  <label style={csStyles.label}>Letter Spacing</label>
                  <span style={csStyles.valBadge}>{letterSpacing}px</span>
                </div>
                <input
                  type="range"
                  min="-2"
                  max="10"
                  step="0.5"
                  value={letterSpacing}
                  onChange={(e) => setLetterSpacing(Number(e.target.value))}
                  style={csStyles.rangeInput}
                />
              </div>

              <div style={csStyles.formField}>
                <div style={csStyles.labelWithVal}>
                  <label style={csStyles.label}>Line Spacing</label>
                  <span style={csStyles.valBadge}>{lineSpacing}x</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="2"
                  step="0.05"
                  value={lineSpacing}
                  onChange={(e) => setLineSpacing(Number(e.target.value))}
                  style={csStyles.rangeInput}
                />
              </div>
            </div>

            <div style={csStyles.formRow}>
              <div style={csStyles.formField}>
                <label style={csStyles.label}>Letter Case</label>
                <select
                  value={textTransform}
                  onChange={(e) => setTextTransform(e.target.value)}
                  style={csStyles.selectInput}
                >
                  <option value="uppercase">ALL CAPS (Viral Punch)</option>
                  <option value="capitalize">Title Case (Editorial)</option>
                  <option value="none">Normal Case</option>
                  <option value="lowercase">lower case</option>
                </select>
              </div>

              <div style={csStyles.formField}>
                <label style={csStyles.label}>Words in a Row</label>
                <select
                  value={wordsInRow}
                  onChange={(e) => setWordsInRow(e.target.value)}
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

          {/* Card 2: Colors & Outlines */}
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
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  style={csStyles.colorPicker}
                />
              </div>

              <div style={csStyles.formField}>
                <label style={csStyles.label}>Active Highlight Color</label>
                <input
                  type="color"
                  value={highlightColor}
                  onChange={(e) => setHighlightColor(e.target.value)}
                  style={csStyles.colorPicker}
                />
              </div>

              <div style={csStyles.formField}>
                <label style={csStyles.label}>Background Color</label>
                <input
                  type="color"
                  value={bgColor.startsWith("#") ? bgColor : "#000000"}
                  onChange={(e) => setBgColor(e.target.value)}
                  style={csStyles.colorPicker}
                />
              </div>
            </div>

            <div style={csStyles.formRow}>
              <div style={csStyles.formField}>
                <div style={csStyles.labelWithVal}>
                  <label style={csStyles.label}>Outline Stroke (0 = Off)</label>
                  <span style={csStyles.valBadge}>{outlineStroke}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="6"
                  step="0.5"
                  value={outlineStroke}
                  onChange={(e) => setOutlineStroke(Number(e.target.value))}
                  style={csStyles.rangeInput}
                />
              </div>

              <div style={csStyles.formField}>
                <div style={csStyles.labelWithVal}>
                  <label style={csStyles.label}>Outer Glow / Shadow</label>
                  <span style={csStyles.valBadge}>{neonGlow}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={neonGlow}
                  onChange={(e) => setNeonGlow(Number(e.target.value))}
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
                  <span style={csStyles.valBadge}>{posY}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="90"
                  value={posY}
                  onChange={(e) => setPosY(Number(e.target.value))}
                  style={csStyles.rangeInput}
                />
              </div>

              <div style={csStyles.formField}>
                <div style={csStyles.labelWithVal}>
                  <label style={csStyles.label}>Tilt Angle</label>
                  <span style={csStyles.valBadge}>{rotateAngle}°</span>
                </div>
                <input
                  type="range"
                  min="-15"
                  max="15"
                  value={rotateAngle}
                  onChange={(e) => setRotateAngle(Number(e.target.value))}
                  style={csStyles.rangeInput}
                />
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
                <span>{isExporting ? "Exporting Video..." : "Download Video With Captions"}</span>
              </button>
            </div>
          </div>
        </section>
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
  container: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
    backgroundColor: "#07080C",
    color: "#FFFFFF",
    fontFamily: "Inter, -apple-system, sans-serif",
  },
  topbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 28px",
    backgroundColor: "#0B0D13",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
  },
  topbarLeft: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  backBtn: {
    padding: "8px 14px",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    color: "#E2E8F0",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  titleBlock: {
    display: "flex",
    flexDirection: "column",
  },
  kicker: {
    fontSize: "10px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#00E5FF",
    fontWeight: "700",
  },
  clipTitle: {
    margin: 0,
    fontSize: "16px",
    fontWeight: "700",
    color: "#FFFFFF",
  },
  topbarRight: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
  },
  openPresetsTopBtn: {
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
  },
  exportTopBtn: {
    padding: "8px 18px",
    backgroundColor: "#00E5FF",
    border: "none",
    color: "#000000",
    borderRadius: "8px",
    fontWeight: "800",
    fontSize: "13px",
    cursor: "pointer",
  },
  workspace: {
    flex: 1,
    display: "flex",
    padding: "24px",
    gap: "28px",
    maxWidth: "1400px",
    margin: "0 auto",
    width: "100%",
    boxSizing: "border-box",
  },
  previewPanel: {
    flex: "0 0 340px",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
  },
  phoneFrame: {
    width: "280px",
    height: "560px",
    backgroundColor: "#000000",
    borderRadius: "36px",
    border: "4px solid rgba(255, 255, 255, 0.15)",
    boxShadow: "0 24px 64px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.08)",
    position: "relative",
    overflow: "hidden",
  },
  phoneScreen: {
    width: "100%",
    height: "100%",
    position: "relative",
    backgroundColor: "#0B0D13",
    overflow: "hidden",
  },
  videoElement: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    zIndex: 1,
    position: "absolute",
    top: 0,
    left: 0,
  },
  subjectCanvas: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    pointerEvents: "none",
    zIndex: 3,
  },
  behindPersonBadge: {
    position: "absolute",
    top: "14px",
    left: "14px",
    zIndex: 20,
    padding: "3px 8px",
    backgroundColor: "rgba(34, 197, 94, 0.2)",
    border: "1px solid rgba(34, 197, 94, 0.4)",
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
  },
  videoPlaceholder: {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#11141E",
    zIndex: 1,
    position: "absolute",
    top: 0,
    left: 0,
  },
  controlsPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  card: {
    backgroundColor: "#0E1119",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "14px",
    padding: "20px",
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
