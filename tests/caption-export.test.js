const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildAssContent } = require("../server/services/ffmpegService");

test("burn source resolution tries all local paths then trusted remote video", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../server/routes/captions.js"), "utf8");
  const start = source.indexOf("async function resolveBurnVideo(");
  const end = source.indexOf("\nasync function renderCaptionedClip", start);
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

test('caption export polling survives a dropped connection and returns only the completed file', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/captions.js'), 'utf8');
  const start = source.indexOf('async function waitForCaptionExport(');
  const end = source.indexOf('\nasync function exportCaptionedVideo', start);
  let calls = 0;
  const wait = new Function('fetch', 'setTimeout', 'API_BASE', source.slice(start, end) + '; return waitForCaptionExport;')(
    async () => {
      if (++calls === 1) throw new Error('connection reset');
      return { ok: true, json: async () => calls === 2 ? { status: 'processing' } : { status: 'completed', result: { downloadUrl: '/exports/ready.mp4' } } };
    }, resolve => resolve(), '/api'
  );
  assert.deepEqual(await wait({ jobId: 'fixture' }), { downloadUrl: '/exports/ready.mp4' });
  assert.equal(calls, 3);
});

test('layered export keeps left/right box anchors, real font names and independent shadows', () => {
  const style = { editorBox:true, layered:true, fontFamily:'Satoshi', heroFontFamily:'Telma', fontSize:40, fontWeight:700, exportVideoWidth:1000, exportVideoHeight:1000, positionX:30, positionY:60, boxWidth:40, paddingX:10, textAlign:'left', textShadow:true, shadowColor:'#123456', shadowOpacity:40, shadowOffsetX:3, shadowOffsetY:5, shadowBlur:7, textColor:'#ffffff', highlightMode:'none', animationStyle:'none' };
  const ass = buildAssContent([{ start:0, end:2, text:'hello world again' }], style);
  assert.match(ass, /Style: Default,Satoshi Variable/);
  assert.match(ass, /\\fnTelma Variable/);
  assert.match(ass, /\\an4\\pos\(110,600\)/);
  assert.match(ass, /\\pos\(113,605\)/);
  assert.match(ass, /\\1a&H99&/);
  assert.match(ass, /\\bord0\\shad0/);
  assert.equal(ass.includes('\\N'), false, 'do not invent extra lines');
  const right = buildAssContent([{ start:0, end:2, text:'hello world' }], {...style,textAlign:'right'});
  assert.match(right, /\\an6\\pos\(490,600\)/);
  const manual = buildAssContent([{start:0,end:1,text:'manual'}],{...style,layered:false});
  assert.match(manual,/Style: Default,Satoshi Variable/);
});
