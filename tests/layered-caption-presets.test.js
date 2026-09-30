const test = require('node:test');
const assert = require('node:assert/strict');
const {CAPTION_PRESETS} = require('../public/captionPresets');
const {buildAssContent} = require('../server/services/ffmpegService');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('five new presets render real text with layered fonts and motion', () => {
  assert.deepEqual(CAPTION_PRESETS.map(p => p.id), ['editorial-gold', 'bold-cut', 'cyan-focus', 'ruby-script', 'kinetic-lime']);
  for (const preset of CAPTION_PRESETS) {
    const ass = buildAssContent([{start: 1, end: 1.5, text: 'One two three'}], {
      ...preset.style, animationStyle: preset.style.wordAnimation,
      editorBox: true, exportVideoWidth: 1080, exportVideoHeight: 1920,
    });
    const visible = ass.split("Dialogue: 0,")[1].replace(/\{[^}]*\}/g, "").replace(/\\N/g, " ");
    assert.match(visible, /One two three/i);
    assert.match(ass, new RegExp(preset.style.heroFontFamily));
    assert.match(ass, /\\fs\d+/);
    assert.match(ass, /Dialogue: 0,0:00:01\.00/);
    assert.equal(ass.match(/^Style: Default,(.*)$/m)[1].split(",")[14], "1");
  }
});

test('layered export keeps every word and selects bundled fonts in libass', {
  skip: spawnSync('ffmpeg', ['-version'], {stdio:'ignore'}).status !== 0,
}, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'layered-fonts-'));
  try {
    for (const preset of CAPTION_PRESETS) {
      const ass = buildAssContent([{start:0,end:.5,text:'One two three four five'}], {
        ...preset.style, exportVideoWidth:320, exportVideoHeight:568,
      });
      assert.match(ass.replace(/\{[^}]*\}/g, '').replace(/\\N/g, ' '), /One two three four five/i);
      const file = path.join(dir, 'caption.ass');
      fs.writeFileSync(file, ass);
      const result = spawnSync('ffmpeg', ['-hide_banner','-f','lavfi','-i','color=s=320x568:d=0.5',
        '-vf',`ass='${file}':fontsdir='${path.resolve(__dirname,'../public/fonts')}'`,
        '-frames:v','1','-f','null','-'], {encoding:'utf8'});
      assert.equal(result.status, 0, result.stderr);
      for (const family of [preset.style.fontFamily, preset.style.heroFontFamily]) {
        assert.match(result.stderr, new RegExp(`fontselect:.*${family} Variable.*-> ${family.replace(/ /g,'')}Variable-`), preset.id);
      }
    }
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
