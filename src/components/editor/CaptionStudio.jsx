import React, { useState, useMemo, useRef } from "react";
import PresetsGallery from "./PresetsGallery";
import { DEFAULT_PRESET } from "../../constants/captionPresets";

/**
 * CaptionStudio Component
 * Full-featured Caption Studio matching ClipFlow Studio's layout.
 * Includes Phone Mockup Preview, Typography & Cadence Controls,
 * Colors & Outline Sliders, and Presets & Export Card with PresetsGallery integration.
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
  // Top-level slider & style states (synced with preset engine)
  const [fontFamily, setFontFamily] = useState(DEFAULT_PRESET.style.fontFamily);
  const [fontSize, setFontSize] = useState(DEFAULT_PRESET.style.fontSize);
  const [textColor, setTextColor] = useState(DEFAULT_PRESET.style.textColor);
  const [highlightColor, setHighlightColor] = useState(DEFAULT_PRESET.style.highlightColor);
  const [outlineStroke, setOutlineStroke] = useState(DEFAULT_PRESET.style.strokeWidth);
  const [outlineColor, setOutlineColor] = useState(DEFAULT_PRESET.style.strokeColor);
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

  // Preset Application Handler
  const handleApplyPreset = (preset) => {
    if (!preset?.style) return;

    // Synchronize top-level control variables so all sliders instantly update
    setFontFamily(preset.style.fontFamily);
    setFontSize(preset.style.fontSize);
    setTextColor(preset.style.textColor);
    setHighlightColor(preset.style.highlightColor);
    setOutlineStroke(preset.style.strokeWidth);
    setOutlineColor(preset.style.strokeColor);
    setBgColor(preset.style.bgColor);
    setBgOpacity(preset.style.bgOpacity);
    setNeonGlow(preset.style.shadowBlur);
    setWordAnimation(preset.style.wordAnimation);
    setWordsInRow(preset.style.wordsInRow);
    setLetterSpacing(preset.style.letterSpacing || 0);
    setLineSpacing(preset.style.lineSpacing || 1.3);
    setTextTransform(preset.style.textTransform || "uppercase");

    // Update active preset tracking
    setActivePreset(preset.id);
    setActivePresetStyle(preset.style);
    setActivePresetAssConfig(preset.assConfig);

    // Close drawer smoothly
    setIsPresetsGalleryOpen(false);
  };

  // Live computed caption style for zero-latency phone mockup rendering
  const liveCaptionStyle = useMemo(() => {
    return {
      fontFamily,
      fontSize: `${fontSize}px`,
      fontWeight: "900",
      textTransform,
      color: textColor,
      backgroundColor: bgColor,
      padding: `${Math.min(activePresetStyle?.bgPadding || 10, 16)}px`,
      borderRadius: `${activePresetStyle?.borderRadius || 8}px`,
      letterSpacing: `${letterSpacing}px`,
      lineHeight: lineSpacing,
      WebkitTextStroke: `${outlineStroke}px ${outlineColor}`,
      paintOrder: "stroke fill",
      textShadow: neonGlow ? `0 0 ${neonGlow}px ${activePresetStyle?.shadowColor || highlightColor}` : "none",
      transform: `translate(-50%, -50%) rotate(${rotateAngle}deg)`,
      left: `${posX}%`,
      top: `${posY}%`,
      position: "absolute",
      textAlign: "center",
      userSelect: "none",
      pointerEvents: "none",
      maxWidth: "88%",
      wordBreak: "break-word",
      transition: "font-size 0.1s ease, color 0.1s ease, background-color 0.1s ease",
    };
  }, [
    fontFamily,
    fontSize,
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
  ]);

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
            <span>Browse 150+ Presets</span>
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
        {/* LEFT: Phone Mockup Live Preview */}
        <section style={csStyles.previewPanel}>
          <div style={csStyles.phoneFrame}>
            <div style={csStyles.phoneScreen}>
              {clip.videoUrl ? (
                <video
                  src={clip.videoUrl}
                  style={csStyles.videoElement}
                  controls
                  playsInline
                />
              ) : (
                <div style={csStyles.videoPlaceholder}>
                  <span style={{ fontSize: "32px", opacity: 0.6 }}>🎬</span>
                  <span style={{ fontSize: "12px", color: "#64748B", marginTop: "8px" }}>
                    Live Clip Preview
                  </span>
                </div>
              )}

              {/* Dynamic Overlay Caption Layer */}
              <div style={liveCaptionStyle}>
                <span>{clip.previewText || "SAMPLE CAPTION TEXT"}</span>
              </div>
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
                  <option value="Inter, sans-serif">Inter</option>
                  <option value="'Montserrat', sans-serif">Montserrat</option>
                  <option value="'Poppins', sans-serif">Poppins</option>
                  <option value="'Oswald', sans-serif">Oswald</option>
                  <option value="Impact, sans-serif">Impact</option>
                  <option value="'Playfair Display', serif">Playfair Display</option>
                  <option value="'Bebas Neue', sans-serif">Bebas Neue</option>
                  <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
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
                  max="54"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  style={csStyles.rangeInput}
                />
              </div>
            </div>

            <div style={csStyles.formRow}>
              <div style={csStyles.formField}>
                <label style={csStyles.label}>Words in Row</label>
                <select
                  value={wordsInRow}
                  onChange={(e) => setWordsInRow(e.target.value)}
                  style={csStyles.selectInput}
                >
                  <option value="Auto">Auto</option>
                  <option value="1 Word">1 Word</option>
                  <option value="2 Words">2 Words</option>
                  <option value="3 Words">3 Words</option>
                </select>
              </div>

              <div style={csStyles.formField}>
                <label style={csStyles.label}>Word Animation</label>
                <select
                  value={wordAnimation}
                  onChange={(e) => setWordAnimation(e.target.value)}
                  style={csStyles.selectInput}
                >
                  <option value="pop">Pop (Bounce in)</option>
                  <option value="bounce">Bounce</option>
                  <option value="fade">Smooth Fade</option>
                  <option value="none">Static (None)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Card 2: Colors & Outline */}
          <div style={csStyles.card}>
            <div style={csStyles.cardHeader}>
              <span style={csStyles.cardIcon}>🎨</span>
              <h4 style={csStyles.cardTitle}>Colors &amp; Outline</h4>
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
                <label style={csStyles.label}>Highlight Color</label>
                <input
                  type="color"
                  value={highlightColor}
                  onChange={(e) => setHighlightColor(e.target.value)}
                  style={csStyles.colorPicker}
                />
              </div>
            </div>

            <div style={csStyles.formRow}>
              <div style={csStyles.formField}>
                <div style={csStyles.labelWithVal}>
                  <label style={csStyles.label}>Outline Stroke</label>
                  <span style={csStyles.valBadge}>{outlineStroke}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="8"
                  value={outlineStroke}
                  onChange={(e) => setOutlineStroke(Number(e.target.value))}
                  style={csStyles.rangeInput}
                />
              </div>

              <div style={csStyles.formField}>
                <div style={csStyles.labelWithVal}>
                  <label style={csStyles.label}>Neon Glow</label>
                  <span style={csStyles.valBadge}>{neonGlow}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="28"
                  value={neonGlow}
                  onChange={(e) => setNeonGlow(Number(e.target.value))}
                  style={csStyles.rangeInput}
                />
              </div>
            </div>
          </div>

          {/* Card 3: Presets & Export Actions */}
          <div style={{ ...csStyles.card, ...csStyles.presetsCard }}>
            <div style={csStyles.cardHeader}>
              <span style={csStyles.cardIcon}>⚡</span>
              <h4 style={csStyles.cardTitle}>Presets &amp; Export</h4>
            </div>

            {/* Prominent Browse Presets Button with Layout Template Icon */}
            <button
              type="button"
              id="browsePresetsBtn"
              onClick={() => setIsPresetsGalleryOpen(true)}
              style={csStyles.browsePresetsBtn}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="3" y1="9" x2="21" y2="9"></line>
                <line x1="9" y1="21" x2="9" y2="9"></line>
              </svg>
              <span>Browse Presets Library (150+ Styles)</span>
            </button>

            {/* Final Render Action */}
            <div style={{ marginTop: "16px" }}>
              <button
                type="button"
                id="exportCaptionedVideoBtn"
                onClick={handleExportCaptionedVideo}
                disabled={isExporting}
                style={csStyles.exportHeroBtn}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>{isExporting ? "Processing Export..." : "Download Video With Captions"}</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* ── Presets Gallery Modal / Side-Drawer ── */}
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
    minHeight: "100vh",
    backgroundColor: "#07080B",
    color: "#FFFFFF",
    fontFamily: "Inter, sans-serif",
    display: "flex",
    flexDirection: "column",
  },
  topbar: {
    padding: "16px 24px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
    backgroundColor: "rgba(11, 13, 19, 0.9)",
  },
  topbarLeft: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  backBtn: {
    padding: "6px 14px",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    color: "#CBD5E1",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "600",
  },
  titleBlock: {
    display: "flex",
    flexDirection: "column",
  },
  kicker: {
    fontSize: "11px",
    fontWeight: "700",
    color: "#00E5FF",
    textTransform: "uppercase",
  },
  clipTitle: {
    margin: 0,
    fontSize: "18px",
    fontWeight: "800",
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
  },
  videoPlaceholder: {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#11141E",
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
    justifyContent: "center",
    gap: "10px",
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
