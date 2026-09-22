import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/**
 * Standardizes raw Whisper/ASS segments into word items.
 * Each word item has { word, start, end } in seconds.
 */
function extractWordList(segments = []) {
  const words = [];
  segments.forEach((seg, sIdx) => {
    if (Array.isArray(seg.words) && seg.words.length > 0) {
      seg.words.forEach((w, wIdx) => {
        const text = String(w.word || w.text || "").trim();
        if (text) {
          words.push({
            id: `s${sIdx}-w${wIdx}`,
            word: text,
            start: Number(w.start ?? seg.start ?? 0),
            end: Number(w.end ?? seg.end ?? 0),
          });
        }
      });
    } else {
      // Fallback: split segment text into estimated word chunks
      const tokens = String(seg.text || "")
        .split(/\s+/)
        .filter(Boolean);
      const start = Number(seg.start || 0);
      const end = Number(seg.end || 0);
      const dur = Math.max(0.1, end - start);
      tokens.forEach((t, i) => {
        const wStart = start + (i / tokens.length) * dur;
        const wEnd = start + ((i + 1) / tokens.length) * dur;
        words.push({
          id: `s${sIdx}-w${i}`,
          word: t,
          start: wStart,
          end: wEnd,
        });
      });
    }
  });
  return words;
}

/**
 * Animated individual word with Moonshot / CapCut spring scale & highlight pill
 */
const AnimatedWord = ({
  word,
  isActive,
  isSpoken,
  frame,
  fps,
  style = {},
}) => {
  const startFrame = Math.round(word.start * fps);
  const frameSinceStart = frame - startFrame;

  // Spring physics for active word bounce
  const springProgress = spring({
    frame: Math.max(0, frameSinceStart),
    fps,
    config: {
      damping: 12,
      mass: 0.5,
      stiffness: 180,
      overshootClamping: false,
    },
  });

  // Scale up active word dynamically (CapCut pop / bounce)
  const scale = isActive
    ? interpolate(springProgress, [0, 1], [0.85, 1.18])
    : 1;

  // Moonshot Pill Styles & Colors
  const activeBg = style.highlightBg || "#FFE600";
  const activeText = style.highlightColor || "#000000";
  const inactiveText = style.textColor || "#FFFFFF";
  const hasStroke = Number(style.strokeWidth) > 0;
  const strokeColor = style.strokeColor || "#000000";

  return (
    <span
      style={{
        display: "inline-block",
        position: "relative",
        margin: "0 10px 12px 10px",
        transform: `scale(${scale})`,
        transformOrigin: "center center",
        transition: "transform 0.1s ease-out",
        verticalAlign: "middle",
      }}
    >
      {/* Moonshot Pill Highlight Background */}
      {isActive && (
        <span
          style={{
            position: "absolute",
            inset: "-6px -14px -6px -14px",
            backgroundColor: activeBg,
            borderRadius: "14px",
            boxShadow: "0 10px 25px rgba(255, 230, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.3)",
            zIndex: 1,
            transform: `scale(${springProgress})`,
            transformOrigin: "center center",
          }}
        />
      )}

      {/* Spoken Word Text */}
      <span
        style={{
          position: "relative",
          zIndex: 2,
          color: isActive ? activeText : inactiveText,
          fontWeight: isActive ? 900 : style.fontWeight || 800,
          textShadow: isActive
            ? "none"
            : hasStroke
            ? `-2px -2px 0 ${strokeColor}, 2px -2px 0 ${strokeColor}, -2px 2px 0 ${strokeColor}, 2px 2px 0 ${strokeColor}, 0 6px 14px rgba(0,0,0,0.85)`
            : "0 6px 16px rgba(0,0,0,0.85)",
          WebkitTextStroke: !isActive && hasStroke ? `${style.strokeWidth || 2}px ${strokeColor}` : "none",
          letterSpacing: "0.02em",
        }}
      >
        {word.word}
      </span>
    </span>
  );
};

export const CaptionsComposition = ({
  videoUrl,
  segments = [],
  style = {},
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const currentTime = frame / fps;

  // Flatten segments into timed word array
  const allWords = React.useMemo(() => extractWordList(segments), [segments]);

  // Determine current active phrase (group words in chunks or active window)
  const wordsPerRow = Number(style.wordsInRow) || 3;
  const activeWordIndex = allWords.findIndex(
    (w) => currentTime >= w.start && currentTime <= w.end
  );

  // Derive visible window around active word
  let visibleWords = [];
  if (activeWordIndex !== -1) {
    const chunkStart = Math.floor(activeWordIndex / wordsPerRow) * wordsPerRow;
    visibleWords = allWords.slice(chunkStart, chunkStart + wordsPerRow);
  } else {
    // If between words, find closest upcoming or past active segment
    const currentSeg = segments.find(
      (s) => currentTime >= s.start && currentTime <= s.end
    );
    if (currentSeg) {
      visibleWords = extractWordList([currentSeg]).slice(0, wordsPerRow);
    }
  }

  // Positioning
  const posY = style.positionY != null ? Number(style.positionY) : 78;
  const topPercent = `${posY}%`;
  const fontFamily = style.fontFamily || "Montserrat, sans-serif";
  const fontSize = Number(style.fontSize) ? `${style.fontSize * 1.5}px` : "72px";

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#000000",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Background Video Layer */}
      {videoUrl ? (
        <OffthreadVideo
          src={videoUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : null}

      {/* Modern Viral Animated Captions Overlay */}
      {visibleWords.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: topPercent,
            left: "5%",
            width: "90%",
            transform: "translateY(-50%)",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            textAlign: "center",
            fontFamily,
            fontSize,
            lineHeight: 1.25,
            textTransform: style.textTransform || "uppercase",
            pointerEvents: "none",
          }}
        >
          {visibleWords.map((word) => {
            const isActive = currentTime >= word.start && currentTime <= word.end;
            const isSpoken = currentTime > word.end;

            return (
              <AnimatedWord
                key={word.id}
                word={word}
                isActive={isActive}
                isSpoken={isSpoken}
                frame={frame}
                fps={fps}
                style={style}
              />
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};

export default CaptionsComposition;
