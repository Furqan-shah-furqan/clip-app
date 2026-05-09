function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function secondsToTime(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hrs = String(Math.floor(s / 3600)).padStart(2, "0");
  const mins = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const secs = String(s % 60).padStart(2, "0");
  return `${hrs}:${mins}:${secs}`;
}

function normalizeText(text = "") {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSegments(segments = []) {
  return segments
    .map((segment) => ({
      start: Number(segment.start),
      end: Number(segment.end),
      text: normalizeText(segment.text),
    }))
    .filter(
      (segment) =>
        Number.isFinite(segment.start) &&
        Number.isFinite(segment.end) &&
        segment.end > segment.start &&
        segment.text,
    )
    .sort((a, b) => a.start - b.start);
}

const HOOK_PATTERNS = [
  /\b(you need to|you have to|listen|look|remember|here'?s|this is|the truth|the secret|the problem|the reason|what people|most people|nobody|everyone|never|always|stop|why|how)\b/i,
  /\?$/,
];
const VALUE_WORDS = [
  "because",
  "reason",
  "lesson",
  "mistake",
  "problem",
  "solution",
  "truth",
  "secret",
  "success",
  "money",
  "business",
  "growth",
  "learn",
  "advice",
  "important",
  "dangerous",
  "pressure",
  "stress",
  "discipline",
  "focus",
  "mindset",
  "strategy",
  "work",
  "change",
  "understand",
  "realize",
];
const EMOTION_WORDS = [
  "crazy",
  "insane",
  "amazing",
  "terrible",
  "fear",
  "angry",
  "love",
  "hate",
  "shocked",
  "beautiful",
  "hard",
  "easy",
  "pain",
  "happy",
  "sad",
  "excited",
  "dangerous",
  "perfect",
  "wrong",
  "right",
  "bad",
  "good",
];
const FILLER_WORDS = [
  "um",
  "uh",
  "like",
  "you know",
  "kind of",
  "sort of",
  "basically",
];

function countMatches(text, words) {
  const lower = text.toLowerCase();
  return words.reduce((count, word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = lower.match(new RegExp(`\\b${escaped}\\b`, "g"));
    return count + (matches ? matches.length : 0);
  }, 0);
}

function getSentenceCount(text) {
  return normalizeText(text)
    .split(/[.!?]+/)
    .filter((part) => part.trim().length > 8).length;
}

function getTitleFromText(text = "") {
  const clean = normalizeText(text);
  const sentence =
    clean.split(/[.!?]/).find((part) => part.trim().length > 18) || clean;
  return sentence.trim().slice(0, 78) || "Smart viral moment";
}

function scoreWindow(window) {
  const text = normalizeText(window.text);
  const lower = text.toLowerCase();
  const duration = Math.max(1, window.endSec - window.startSec);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const wordsPerSecond = wordCount / duration;
  let score = 35;
  const signals = [];
  if (HOOK_PATTERNS.some((pattern) => pattern.test(text.slice(0, 180)))) {
    score += 16;
    signals.push("strong hook");
  }
  const valueHits = countMatches(text, VALUE_WORDS);
  if (valueHits >= 2) {
    score += Math.min(18, valueHits * 3);
    signals.push("useful idea");
  }
  const emotionHits = countMatches(text, EMOTION_WORDS);
  if (emotionHits >= 2) {
    score += Math.min(14, emotionHits * 3);
    signals.push("emotion");
  }
  if (/\b(i|you|we|they|people|most people)\b/i.test(text)) {
    score += 6;
    signals.push("human angle");
  }
  if (/[?]/.test(text)) {
    score += 5;
    signals.push("question tension");
  }
  const sentenceCount = getSentenceCount(text);
  if (sentenceCount >= 2 && sentenceCount <= 8) {
    score += 8;
    signals.push("complete thought");
  }
  if (wordsPerSecond >= 1.25 && wordsPerSecond <= 3.7) {
    score += 7;
    signals.push("good pace");
  }
  const fillerHits = countMatches(lower, FILLER_WORDS);
  score -= Math.min(14, fillerHits * 2);
  if (duration < 25) score -= 12;
  if (duration > 95) score -= 10;
  if (/[.!?]["']?$/.test(text.trim())) score += 5;
  return {
    score: Math.round(clampNumber(score, 1, 100, 40)),
    signals: signals.length ? signals : ["clear speaking moment"],
  };
}

function windowsOverlap(a, b) {
  const start = Math.max(a.startSec, b.startSec);
  const end = Math.min(a.endSec, b.endSec);
  const overlap = Math.max(0, end - start);
  const shortest = Math.min(a.endSec - a.startSec, b.endSec - b.startSec);
  return shortest > 0 ? overlap / shortest : 0;
}

function findSmartClipMoments(segments = [], options = {}) {
  const normalized = normalizeSegments(segments);
  const maxClips = Math.round(clampNumber(options.maxClips, 1, 10, 5));
  const preferredDurationSec = clampNumber(
    options.preferredDurationSec,
    25,
    90,
    45,
  );
  const minDurationSec = clampNumber(
    options.minDurationSec,
    20,
    70,
    Math.max(25, preferredDurationSec - 12),
  );
  const maxDurationSec = clampNumber(
    options.maxDurationSec,
    35,
    100,
    Math.min(90, preferredDurationSec + 25),
  );
  if (!normalized.length) return [];
  const candidates = [];
  for (let i = 0; i < normalized.length; i += 1) {
    const startSeg = normalized[i];
    const textParts = [];
    let endSec = startSeg.end;
    for (let j = i; j < normalized.length; j += 1) {
      const seg = normalized[j];
      if (j > i && seg.start - endSec > 2.75) break;
      textParts.push(seg.text);
      endSec = Math.max(endSec, seg.end);
      const duration = endSec - startSeg.start;
      if (duration >= minDurationSec) {
        const text = normalizeText(textParts.join(" "));
        const scored = scoreWindow({ text, startSec: startSeg.start, endSec });
        const durationPenalty =
          Math.abs(duration - preferredDurationSec) * 0.22;
        const finalScore = Math.round(
          clampNumber(scored.score - durationPenalty, 1, 100, scored.score),
        );
        candidates.push({
          startSec: Math.max(0, startSeg.start),
          endSec,
          start: secondsToTime(startSeg.start),
          end: secondsToTime(endSec),
          durationSec: Math.round(duration),
          score: finalScore,
          title: getTitleFromText(text),
          reason: scored.signals.slice(0, 3).join(" + "),
          signals: scored.signals,
          previewText: text.slice(0, 260),
          text,
        });
      }
      if (duration >= maxDurationSec) break;
    }
  }
  const sorted = candidates.sort(
    (a, b) => b.score - a.score || a.startSec - b.startSec,
  );
  const selected = [];
  for (const candidate of sorted) {
    if (selected.some((existing) => windowsOverlap(existing, candidate) > 0.48))
      continue;
    selected.push(candidate);
    if (selected.length >= maxClips) break;
  }
  return selected.sort((a, b) => b.score - a.score);
}

module.exports = { findSmartClipMoments, normalizeSegments };
