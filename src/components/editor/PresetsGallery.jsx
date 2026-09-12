import React, { useState, useMemo, useEffect, useCallback } from "react";
import { CATEGORIES, CAPTION_PRESETS } from "../../constants/captionPresets";

/**
 * PresetsGallery Component
 * Ultra-fast, declarative Caption Presets Drawer/Modal for ClipFlow Studio.
 * Modeled after Moonshot, Submagic, and Captions.ai.
 * 
 * @param {boolean} isOpen - Drawer visibility state
 * @param {function} onClose - Callback when drawer is dismissed
 * @param {string} activePresetId - Currently active preset id
 * @param {function} onSelectPreset - Callback when a preset card is clicked
 */
export default function PresetsGallery({
  isOpen,
  onClose,
  activePresetId,
  onSelectPreset,
}) {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  // ESC key to dismiss drawer
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Filtered preset list based on active category & search query
  const filteredPresets = useMemo(() => {
    return CAPTION_PRESETS.filter((preset) => {
      const matchCategory =
        selectedCategory === "All" || preset.category === selectedCategory;
      const matchSearch =
        !searchQuery.trim() ||
        preset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        preset.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        preset.previewText.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [selectedCategory, searchQuery]);

  // Click card handler
  const handleCardClick = useCallback(
    (preset) => {
      if (onSelectPreset) {
        onSelectPreset(preset);
      }
    },
    [onSelectPreset]
  );

  if (!isOpen) return null;

  return (
    <div
      style={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Caption Style Presets Library"
    >
      <div style={styles.drawer}>
        {/* ── Topbar / Header ── */}
        <div style={styles.header}>
          <div style={styles.headerTitleWrap}>
            <div style={styles.headerKicker}>CAPTION STUDIO · STYLES ENGINE</div>
            <h2 style={styles.headerTitle}>Preset Styles Library</h2>
            <p style={styles.headerSubtitle}>
              Explore 150+ high-retention caption styles modeled after top creators &amp; viral platforms.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={styles.closeBtn}
            title="Close Presets Gallery (Esc)"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* ── Search Bar & Stats ── */}
        <div style={styles.toolbarRow}>
          <div style={styles.searchWrap}>
            <span style={styles.searchIcon}>🔍</span>
            <input
              type="text"
              placeholder="Search by preset name, vibe, or font..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={styles.clearSearchBtn}
              >
                ✕
              </button>
            )}
          </div>
          <div style={styles.countBadge}>
            {filteredPresets.length} {filteredPresets.length === 1 ? "Preset" : "Presets"} Available
          </div>
        </div>

        {/* ── Category Pills Strip ── */}
        <div style={styles.categoryStrip} className="caption-category-scroll">
          <button
            type="button"
            onClick={() => setSelectedCategory("All")}
            style={{
              ...styles.categoryPill,
              ...(selectedCategory === "All"
                ? styles.categoryPillActive
                : styles.categoryPillInactive),
            }}
          >
            All Styles
          </button>

          {CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                style={{
                  ...styles.categoryPill,
                  ...(isActive
                    ? styles.categoryPillActive
                    : styles.categoryPillInactive),
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* ── Presets Grid ── */}
        <div style={styles.gridContainer}>
          {filteredPresets.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>🎨</div>
              <h4 style={styles.emptyTitle}>No matching presets found</h4>
              <p style={styles.emptySub}>
                Try selecting a different category or clearing your search term.
              </p>
              <button
                type="button"
                style={styles.emptyResetBtn}
                onClick={() => {
                  setSelectedCategory("All");
                  setSearchQuery("");
                }}
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div style={styles.grid}>
              {filteredPresets.map((preset) => {
                const isSelected = activePresetId === preset.id;
                return (
                  <PresetCard
                    key={preset.id}
                    preset={preset}
                    isSelected={isSelected}
                    onClick={() => handleCardClick(preset)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Individual Preset Preview Card
 * Rendered using 100% pure inline CSS to guarantee 60fps scrolling with zero canvas loads.
 */
function PresetCard({ preset, isSelected, onClick }) {
  const [isHovered, setIsHovered] = useState(false);
  const { style, badge, name, category, previewText } = preset;

  // Split preview text to demonstrate active word highlight in multi-word presets
  const words = useMemo(() => {
    return (previewText || "SAMPLE").split(/\s+/);
  }, [previewText]);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        ...styles.card,
        ...(isSelected ? styles.cardSelected : {}),
        ...(isHovered && !isSelected ? styles.cardHover : {}),
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Badge Ribbon */}
      {badge === "TRENDING" && (
        <div style={{ ...styles.badgeRibbon, ...styles.badgeTrending }}>
          ★ TRENDING
        </div>
      )}
      {badge === "NEW" && (
        <div style={{ ...styles.badgeRibbon, ...styles.badgeNew }}>
          ✦ NEW
        </div>
      )}
      {preset.behindPerson && !badge && (
        <div style={{ ...styles.badgeRibbon, ...styles.badgeBehindPerson }}>
          👤 BEHIND
        </div>
      )}

      {/* Selected Indicator Checkmark */}
      {isSelected && (
        <div style={styles.selectedCheckmark} title="Active Preset">
          ✓
        </div>
      )}

      {/* Live Style Preview Mockup */}
      <div style={styles.cardPreviewStage}>
        <div
          style={{
            fontFamily: style.fontFamily,
            fontSize: "19px",
            fontWeight: style.fontWeight || "800",
            textTransform: style.textTransform || "uppercase",
            color: style.textColor || "#FFFFFF",
            backgroundColor: style.bgColor || "transparent",
            padding: `${Math.min(style.bgPadding || 0, 10)}px ${Math.min((style.bgPadding || 0) + 4, 14)}px`,
            borderRadius: `${style.borderRadius || 6}px`,
            letterSpacing: `${style.letterSpacing || 0}px`,
            lineHeight: style.lineSpacing || 1.3,
            WebkitFontSmoothing: "antialiased",
            MozOsxFontSmoothing: "grayscale",
            textRendering: "optimizeLegibility",
            paintOrder: "stroke fill markers",
            strokeLinejoin: "round",
            WebkitTextStroke: (style.strokeWidth && Number(style.strokeWidth) > 0)
              ? `${Math.min(style.strokeWidth, 2)}px ${style.strokeColor || "#000000"}`
              : "none",
            textShadow: style.textShadow || (style.shadowBlur
              ? `0 0 ${Math.min(style.shadowBlur, 12)}px ${style.shadowColor || "rgba(0,0,0,0.8)"}`
              : "none"),
            boxShadow: style.boxShadow || "none",
            backdropFilter: style.backdropFilter || "none",
            filter: style.filter || "none",
            textAlign: "center",
            maxWidth: "90%",
            wordBreak: "break-word",
            display: "inline-block",
            transition: "transform 0.15s ease",
            transform: isHovered ? "scale(1.04)" : "scale(1)",
          }}
        >
          {words.map((word, idx) => {
            const isHighlight = idx === 0 && style.highlightColor;
            return (
              <span
                key={idx}
                style={{
                  color: isHighlight ? style.highlightColor : style.textColor || "#FFFFFF",
                  marginRight: idx < words.length - 1 ? "4px" : "0",
                  transition: "color 0.15s ease",
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      </div>

      {/* Card Info Footer */}
      <div style={styles.cardFooter}>
        <div style={styles.cardName} title={name}>
          {name}
        </div>
        <div style={styles.cardMeta}>
          <span style={styles.cardCatPill}>{category}</span>
          <span style={styles.cardAnimPill}>{style.wordAnimation || "pop"}</span>
        </div>
      </div>
    </div>
  );
}

// ── Pure Declarative Styles ──────────────────────────────────────────────────
const styles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.78)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    zIndex: 9999,
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "stretch",
    animation: "fadeOverlay 0.2s ease",
  },
  drawer: {
    width: "100%",
    maxWidth: "840px",
    backgroundColor: "#0B0D13",
    borderLeft: "1px solid rgba(255, 255, 255, 0.1)",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    boxShadow: "-16px 0 48px rgba(0, 0, 0, 0.8)",
    overflow: "hidden",
  },
  header: {
    padding: "24px 28px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
  },
  headerTitleWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  headerKicker: {
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "1.5px",
    color: "#00E5FF",
    textTransform: "uppercase",
  },
  headerTitle: {
    margin: 0,
    fontSize: "24px",
    fontWeight: "800",
    color: "#FFFFFF",
    fontFamily: "Inter, Montserrat, sans-serif",
  },
  headerSubtitle: {
    margin: 0,
    fontSize: "13px",
    color: "#94A3B8",
    lineHeight: 1.4,
  },
  closeBtn: {
    background: "rgba(255, 255, 255, 0.06)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    color: "#E2E8F0",
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    fontSize: "14px",
    transition: "all 0.15s ease",
  },
  toolbarRow: {
    padding: "16px 28px 12px",
    display: "flex",
    alignItems: "center",
    gap: "14px",
    flexWrap: "wrap",
  },
  searchWrap: {
    flex: "1 1 240px",
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  searchIcon: {
    position: "absolute",
    left: "12px",
    fontSize: "13px",
    color: "#64748B",
    pointerEvents: "none",
  },
  searchInput: {
    width: "100%",
    padding: "9px 34px 9px 34px",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "10px",
    color: "#FFFFFF",
    fontSize: "13px",
    fontFamily: "Inter, sans-serif",
    outline: "none",
  },
  clearSearchBtn: {
    position: "absolute",
    right: "10px",
    background: "none",
    border: "none",
    color: "#94A3B8",
    cursor: "pointer",
    fontSize: "11px",
  },
  countBadge: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#64748B",
    padding: "6px 12px",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: "8px",
    border: "1px solid rgba(255, 255, 255, 0.06)",
  },
  categoryStrip: {
    padding: "6px 28px 16px",
    display: "flex",
    gap: "8px",
    overflowX: "auto",
    scrollSnapType: "x mandatory",
    scrollbarWidth: "none",
    msOverflowStyle: "none",
    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
  },
  categoryPill: {
    flexShrink: 0,
    scrollSnapAlign: "start",
    padding: "7px 16px",
    borderRadius: "9999px",
    fontSize: "12px",
    fontWeight: "700",
    fontFamily: "Inter, sans-serif",
    cursor: "pointer",
    border: "none",
    transition: "all 0.18s ease",
  },
  categoryPillActive: {
    backgroundColor: "#FFFFFF",
    color: "#000000",
    boxShadow: "0 2px 10px rgba(255, 255, 255, 0.25)",
  },
  categoryPillInactive: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    color: "#CBD5E1",
  },
  gridContainer: {
    flex: 1,
    overflowY: "auto",
    padding: "20px 28px 40px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
    gap: "14px",
  },
  card: {
    backgroundColor: "rgba(18, 21, 31, 0.75)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "12px",
    overflow: "hidden",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  cardHover: {
    transform: "translateY(-3px)",
    borderColor: "rgba(255, 255, 255, 0.25)",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
  },
  cardSelected: {
    borderColor: "#00E5FF",
    boxShadow: "0 0 0 2px #00E5FF, 0 8px 24px rgba(0, 229, 255, 0.25)",
    backgroundColor: "rgba(0, 229, 255, 0.04)",
  },
  badgeRibbon: {
    position: "absolute",
    top: "10px",
    left: "10px",
    zIndex: 2,
    fontSize: "9px",
    fontWeight: "800",
    letterSpacing: "0.8px",
    padding: "3px 7px",
    borderRadius: "4px",
    color: "#FFFFFF",
    textTransform: "uppercase",
  },
  badgeTrending: {
    background: "linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)",
    boxShadow: "0 2px 8px rgba(6, 182, 212, 0.4)",
  },
  badgeNew: {
    background: "linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)",
    boxShadow: "0 2px 8px rgba(245, 158, 11, 0.4)",
  },
  badgeBehindPerson: {
    background: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
    boxShadow: "0 2px 8px rgba(16, 185, 129, 0.4)",
  },
  selectedCheckmark: {
    position: "absolute",
    top: "10px",
    right: "10px",
    zIndex: 2,
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    backgroundColor: "#00E5FF",
    color: "#000000",
    fontWeight: "900",
    fontSize: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 8px rgba(0, 229, 255, 0.5)",
  },
  cardPreviewStage: {
    height: "120px",
    backgroundColor: "#07080B",
    backgroundImage: "radial-gradient(circle at center, #131622 0%, #060709 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px",
    overflow: "hidden",
    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
  },
  cardFooter: {
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    backgroundColor: "rgba(14, 16, 24, 0.8)",
  },
  cardName: {
    fontSize: "13px",
    fontWeight: "700",
    color: "#F1F5F9",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    fontFamily: "Inter, sans-serif",
  },
  cardMeta: {
    display: "flex",
    gap: "6px",
    alignItems: "center",
  },
  cardCatPill: {
    fontSize: "10px",
    fontWeight: "600",
    color: "#94A3B8",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    padding: "2px 6px",
    borderRadius: "4px",
  },
  cardAnimPill: {
    fontSize: "10px",
    fontWeight: "600",
    color: "#00E5FF",
    backgroundColor: "rgba(0, 229, 255, 0.08)",
    padding: "2px 6px",
    borderRadius: "4px",
    textTransform: "capitalize",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "60px 20px",
    color: "#64748B",
    textAlign: "center",
  },
  emptyIcon: {
    fontSize: "40px",
    marginBottom: "12px",
  },
  emptyTitle: {
    fontSize: "16px",
    fontWeight: "700",
    color: "#CBD5E1",
    margin: "0 0 6px 0",
  },
  emptySub: {
    fontSize: "13px",
    margin: "0 0 16px 0",
    maxWidth: "320px",
  },
  emptyResetBtn: {
    padding: "8px 16px",
    borderRadius: "8px",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    color: "#FFFFFF",
    fontSize: "12px",
    fontWeight: "600",
    border: "none",
    cursor: "pointer",
  },
};
