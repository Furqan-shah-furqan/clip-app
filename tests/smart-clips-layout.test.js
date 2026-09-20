const test = require("node:test");
const assert = require("node:assert");

function getAutoSmartClipCountForDuration(durationSeconds) {
  const minutes = Math.floor(durationSeconds / 60);
  if (minutes <= 0) return 3;
  if (minutes <= 3) return 1;
  if (minutes < 8) return 2;
  if (minutes < 15) return 3;          // ~10m: 3 clips
  if (minutes < 35) return 4;          // ~30m: 4 clips
  if (minutes < 75) return 7;          // ~60m (1hr): 7 clips
  if (minutes < 105) return 10;
  if (minutes < 140) return 13;         // ~120m (2hr): 13 clips
  return Math.min(30, Math.max(13, Math.round(minutes * (13 / 120))));
}

test("getAutoSmartClipCountForDuration produces expected clip counts based on video length", () => {
  assert.strictEqual(getAutoSmartClipCountForDuration(120), 1, "2 min video -> 1 clip");
  assert.strictEqual(getAutoSmartClipCountForDuration(600), 3, "10 min video -> 3 clips");
  assert.strictEqual(getAutoSmartClipCountForDuration(1800), 4, "30 min video -> 4 clips");
  assert.strictEqual(getAutoSmartClipCountForDuration(3600), 7, "60 min (1hr) video -> 7 clips");
  assert.strictEqual(getAutoSmartClipCountForDuration(7200), 13, "120 min (2hr) video -> 13 clips");
});
