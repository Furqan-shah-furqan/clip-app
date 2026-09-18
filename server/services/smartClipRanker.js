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
  let clean = normalizeText(text)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/www\.\S+/gi, "")
    .replace(/@\w+/g, "")
    .replace(/[^\w\s.,!?'"-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

  // Filter out URLs, promotional links, social media handles, sponsor intros
  const hasLinksOrPromos = /https?:\/\/|www\.|\.com\/|\.co\/|@\w+|\b(instagram|discord|youtube|twitter|subscribe|follow me|click here|tickets|apply\/|merch)\b/i.test(text);
  if (hasLinksOrPromos) {
    score -= 45; // Strongly disqualify promo / link dump segments
  }

  // Penalize the first 45 seconds of a video (usually channel intro, sponsor splash, disclaimers)
  if (window.startSec < 45) {
    score -= 25;
  }

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

function getDynamicClipQuota(durationInSeconds) {
  const minutes = Math.floor(Number(durationInSeconds || 0) / 60);
  if (minutes <= 0) return 3;
  if (minutes < 5) return 1;
  if (minutes < 15) return 2;
  if (minutes < 30) return 4;
  if (minutes < 50) return 6;
  return Math.min(30, Math.max(1, Math.round(minutes * (7.5 / 60))));
}

function findSmartClipMoments(segments = [], options = {}) {
  const normalized = normalizeSegments(segments);
  if (!normalized.length) return [];

  // Robust duration fallback from options metadata, videoDurationSec, or last transcript segment
  const transcriptDuration = Math.ceil(
    normalized[normalized.length - 1].end || normalized[normalized.length - 1].start || 0
  );
  const effectiveDuration =
    Number(options.metadata?.duration || options.videoDurationSec) ||
    transcriptDuration ||
    0;

  const quota =
    options.quota ||
    (effectiveDuration > 0 ? getDynamicClipQuota(effectiveDuration) : null) ||
    Math.round(clampNumber(options.maxClips, 1, 30, 8));

  const preferredDurationSec = clampNumber(
    options.preferredDurationSec,
    25,
    90,
    45,
  );
  const minDurationSec = clampNumber(
    options.minDurationSec,
    20,
    60,
    35,
  );
  const maxDurationSec = clampNumber(
    options.maxDurationSec,
    35,
    90,
    65,
  );

  const candidates = [];
  const totalDuration = Math.max(effectiveDuration, transcriptDuration);

  // 1. Dense candidate generation: slide candidate windows (lengths 35s to 65s) every 20 seconds across full transcript
  const stepSec = 20;
  const maxStartSec = Math.max(0, totalDuration - minDurationSec);

  for (let windowStart = 0; windowStart <= maxStartSec; windowStart += stepSec) {
    const textParts = [];
    let startActual = null;
    let endActual = null;

    for (let i = 0; i < normalized.length; i++) {
      const seg = normalized[i];
      if (seg.end < windowStart) continue;
      if (startActual === null) {
        startActual = seg.start;
      }
      if (seg.start > windowStart + maxDurationSec) break;

      textParts.push(seg.text);
      endActual = seg.end;
      const currentDur = endActual - startActual;

      if (currentDur >= minDurationSec && currentDur <= maxDurationSec) {
        const text = normalizeText(textParts.join(" "));
        if (text.length > 20) {
          const scored = scoreWindow({ text, startSec: startActual, endSec: endActual });
          const durationPenalty = Math.abs(currentDur - preferredDurationSec) * 0.15;
          const finalScore = Math.round(
            clampNumber(scored.score - durationPenalty, 1, 100, scored.score),
          );
          candidates.push({
            startSec: Math.max(0, startActual),
            endSec: endActual,
            start: secondsToTime(startActual),
            end: secondsToTime(endActual),
            durationSec: Math.round(currentDur),
            score: finalScore,
            title: getTitleFromText(text),
            reason: scored.signals.slice(0, 3).join(" + "),
            signals: scored.signals,
            previewText: text.slice(0, 260),
            text,
          });
        }
      }
    }
  }

  // 2. Also check natural segment-by-segment windowing for fine-grained speaker boundaries
  for (let i = 0; i < normalized.length; i += 1) {
    const startSeg = normalized[i];
    const textParts = [];
    let endSec = startSeg.end;
    for (let j = i; j < normalized.length; j += 1) {
      const seg = normalized[j];
      if (j > i && seg.start - endSec > 3.0) break;
      textParts.push(seg.text);
      endSec = Math.max(endSec, seg.end);
      const duration = endSec - startSeg.start;
      if (duration >= minDurationSec && duration <= maxDurationSec) {
        const text = normalizeText(textParts.join(" "));
        if (text.length > 20) {
          const scored = scoreWindow({ text, startSeg: startSeg.start, startSec: startSeg.start, endSec });
          const durationPenalty = Math.abs(duration - preferredDurationSec) * 0.15;
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
      }
      if (duration > maxDurationSec) break;
    }
  }

  // 3. Sort all candidate moments by score descending (no hard score filters)
  const sorted = candidates.sort(
    (a, b) => b.score - a.score || a.startSec - b.startSec,
  );

  // 4. Deduplicate overlapping moments only if overlap > 60% (0.60)
  const selected = [];
  for (const candidate of sorted) {
    if (selected.some((existing) => windowsOverlap(existing, candidate) > 0.60)) {
      continue;
    }
    selected.push(candidate);
    if (selected.length >= quota) break;
  }

  // 5. Always fulfill quota: if deduplication reduced candidate count below quota, pick next best non-identical
  if (selected.length < quota) {
    for (const candidate of sorted) {
      if (selected.some((existing) => windowsOverlap(existing, candidate) > 0.85)) {
        continue;
      }
      if (!selected.includes(candidate)) {
        selected.push(candidate);
        if (selected.length >= quota) break;
      }
    }
  }

  // 6. If still below quota, include any remaining unique candidate
  if (selected.length < quota) {
    for (const candidate of sorted) {
      if (!selected.includes(candidate)) {
        selected.push(candidate);
        if (selected.length >= quota) break;
      }
    }
  }

  // 7. Return top candidates sliced to target quota
  const rankedMoments = selected.sort((a, b) => b.score - a.score);
  return rankedMoments.slice(0, quota);
}

module.exports = { findSmartClipMoments, normalizeSegments, getDynamicClipQuota };
