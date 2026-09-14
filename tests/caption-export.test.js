const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildAssContent } = require("../server/services/ffmpegService");

test("burn source resolution tries all local paths then trusted remote video", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../server/routes/captions.js"), "utf8");
  const start = source.indexOf("async function resolveBurnVideo(");
  const end = source.indexOf('\nrouter.post("/burn"', start);
  const helper = source.slice(start, end);
  const resolve = new Function("resolveInputVideo", "allowedCaptionSource", "restoreCaptionSource", helper + "return resolveBurnVideo;")(
    value => value === "/exists.mp4" ? value : null,
    value => value === "https://trusted/video.mp4" ? value : null,
    async () => "/restored.mp4"
  );
  assert.equal(await resolve({ filePath: "/stale", outputPath: "/exists.mp4" }), "/exists.mp4");
  assert.equal(await resolve({ filePath: "/stale", storageUrl: "https://trusted/video.mp4" }), "/restored.mp4");
  assert.equal(await resolve({ filePath: "/stale" }, "https://trusted/video.mp4"), "/restored.mp4");
  assert.equal(await resolve({ downloadUrl: "https://untrusted/video.mp4" }), null);
});

test("ASS export preserves short caption durations and carries rounded seconds", () => {
  const ass = buildAssContent([{"start":1.96,"end":1.999,"text":"short"},{"start":2.1,"end":2.14,"text":"next"},{"start":59.96,"end":59.999,"text":"minute"},{"start":3599.96,"end":3599.999,"text":"hour"}], { animationStyle: "none" });
  for (const expected of ["0:00:01.96,0:00:02.00", "0:00:02.10,0:00:02.14", "0:00:59.96,0:01:00.00", "0:59:59.96,1:00:00.00"]) {
    assert.ok(ass.includes(expected));
  }
});
