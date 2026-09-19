const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { CAPTION_PRESETS } = require('../public/captionPresets');
const { buildAssContent, burnSubtitles } = require('../server/services/ffmpegService');
const root = path.resolve(__dirname, '..');

// Model the relevant DOM contract, especially <select>.value becoming empty
// when a preset's quoted font/fallback differs from an existing option.
class Element {
  constructor() {
    this.style = { setProperty(k,v) { this[k]=v; }, removeProperty(k) { delete this[k]; } };
    this.classList = { remove() {}, toggle() {}, add() {} };
    this.dataset = {}; this.childNodes = []; this._value = ''; this.checked = false;
  }
  get children() { return this.childNodes.filter(n=>!n.isText); }
  appendChild(n) { this.childNodes.push(n); return n; }
  replaceChildren() { this.childNodes = []; }
  set value(v) { this._value = this.options && !this.options.some(o=>o.value===String(v)) ? '' : String(v); }
  get value() { return this._value; }
  add(option) { this.options.push(option); }
  querySelectorAll() { return []; }
}
function editor() {
  const html = fs.readFileSync(path.join(root,'public/captions.html'),'utf8');
  const controls = {};
  for (const match of html.matchAll(/<(input|select)\b[^>]*\bid="(cap[^"]+)"[^>]*>/g)) {
    const e = new Element();
    if (match[1]==='select') {
      const tail = html.slice(match.index + match[0].length).split('</select>')[0];
      e.options = [...tail.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)/g)].map(m=>({value:m[1],text:m[2]}));
    }
    controls[match[2]] = e;
  }
  const saved = new Map();
  const document = { readyState:'loading', addEventListener() {}, getElementById: id=>controls[id] || null,
    querySelectorAll:()=>[], querySelector:()=>null,
    createElement:()=>new Element(), createTextNode:text=>({isText:true,textContent:text}),
    fonts:{load:async()=>[{}]} };
  const context = vm.createContext({ window:{CAPTION_PRESETS,location:{search:"?index=0"}}, document, console, URLSearchParams,
    Option:function(text,value){this.text=text;this.value=value;}, setTimeout,clearTimeout,
    localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)} });
  vm.runInContext(fs.readFileSync(path.join(root,'public/captions.js'),'utf8'),context);
  vm.runInContext('cacheDom(); editorState.clip={title:"fixture"}; editorState.segments=[{id:"s",start:1,end:2,text:"hello world",words:[{word:"hello",start:1,end:1.2},{word:"world",start:1.7,end:2}]}];',context);
  return { context,controls,saved,run:s=>vm.runInContext(s,context) };
}

test('all presets survive control sync/save without changing transcript, timings, or position', async () => {
  const h=editor();
  const transcript=h.run('JSON.stringify(editorState.segments)');
  h.run('editorState.style.positionX=43; editorState.style.positionY=73;');
  for(const preset of CAPTION_PRESETS) {
    h.context.presetId=preset.id;
    h.run('applyPresetFromGallery(presetId)');
    assert.equal(h.run('captionFontName(capFontFamily.value)'),preset.style.fontFamily,preset.id);
    h.run('syncStyleFromControls()');
    const style=JSON.parse(h.saved.get('clipflow-caption-style'));
    assert.equal(h.context.captionFontName(style.fontFamily),preset.style.fontFamily,preset.id);
    assert.equal(style.fontWeight,preset.style.fontWeight,preset.id);
    assert.equal(style.textShadow,preset.style.textShadow,preset.id);
    assert.equal(style.fontSize,preset.style.fontSize,preset.id);
    assert.equal(style.positionX,43); assert.equal(style.positionY,73);
    assert.equal(h.run('JSON.stringify(editorState.segments)'),transcript);
    const exported=h.context.buildScaledStyleForExport(style);
    assert.equal(exported.curated,true);
    assert.equal(exported.fontFamily,style.fontFamily);
    await h.context.ensureCaptionFont(style);
  }
  assert.equal(CAPTION_PRESETS.length,28);
});

test('font selection tolerates quotes, serif fallbacks, and saved custom families', () => {
  const h=editor();
  h.context.selectCaptionFont("'Inter', sans-serif");
  assert.equal(h.controls.capFontFamily.value,'Inter, sans-serif');
  h.context.selectCaptionFont("'Playfair Display', sans-serif");
  assert.equal(h.controls.capFontFamily.value,"'Playfair Display', serif");
  h.context.selectCaptionFont("'Custom Saved Font', sans-serif");
  assert.equal(h.controls.capFontFamily.value,"'Custom Saved Font', sans-serif");
});

test('curated rendering preserves earlier word nodes, hides pauses, and updates repeated-word accents', () => {
  const h=editor(), container=new Element();
  const s={...CAPTION_PRESETS.find(p=>p.style.highlightMode==='word').style,animationStyle:'pop'};
  h.context.renderSmoothCaption(container,'go','seg',0,s);
  const first=container.children[0];
  h.context.renderSmoothCaption(container,'go go','seg',1,s);
  assert.equal(container.children[0],first);
  assert.equal(first.style.color,'inherit');
  assert.equal(container.children[1].style.color,s.highlightColor);
  h.context.renderSmoothCaption(container,'','seg',0,s);
  assert.equal(container.children.length,0);
  h.context.renderSmoothCaption(container,'go','seg',0,s);
  assert.notEqual(container.children[0],first);
});

test('paused animation changes preview immediately and frame updates preserve word nodes', () => {
  const h=editor(), container=new Element();
  for(const animationStyle of ['classic','pop','elevate','reveal','highlight','neon','cinematic','typewriter','oneword','twoword','wordcolor','wordappend','highlightimpact','none']) {
    const style={...CAPTION_PRESETS[0].style,animationStyle};
    h.context.renderSmoothCaption(container,'hello','s',0,style);
    const word=container.children[0];
    assert.equal(word.className,`caption-smooth-word caption-smooth-word--${animationStyle}`);
    h.context.renderSmoothCaption(container,'hello','s',0,style);
    assert.equal(container.children[0],word);
  }
});

test('grouped playback replays only the newly active word and not subsequent frames', () => {
  const h=editor(), container=new Element();
  const style={...CAPTION_PRESETS[0].style,animationStyle:'pop'};
  h.context.renderSmoothCaption(container,'hello world','s',0,style);
  const counters=[0,0];
  const animations=container.children.map((word,i)=>{
    const animation={currentTime:500,play(){counters[i]++;}};
    word.getAnimations=()=>[animation];
    return animation;
  });
  h.context.renderSmoothCaption(container,'hello world','s',1,style);
  assert.deepEqual(counters,[0,1]);
  assert.equal(animations[1].currentTime,0);
  h.context.renderSmoothCaption(container,'hello world','s',1,style);
  assert.deepEqual(counters,[0,1]);
  h.context.renderSmoothCaption(container,'hello world','s',0,style);
  assert.deepEqual(counters,[1,1]);
});

test('explicit preset preview opts in to motion and cache reset permits replay', () => {
  const h=editor(), container=new Element();
  h.context.container=container;
  h.run('captionOverlayText=container');
  h.context.renderSmoothCaption(container,'hello','s',0,{animationStyle:'pop'});
  assert.equal(container.children[0].dataset.motionPreview,'false');
  h.run('explicitMotionPreview=true; resetCaptionRenderCache()');
  const previous=container.children[0];
  h.context.renderSmoothCaption(container,'hello','s',0,{animationStyle:'pop'});
  assert.notEqual(container.children[0],previous);
  assert.equal(container.children[0].dataset.motionPreview,'true');
});

test('ordinary shadows do not become glow and label backgrounds honor preset padding', () => {
  const h=editor(), el=new Element();
  h.context.applyTextBoxVisuals(el,{...CAPTION_PRESETS[0].style,fontFamily:"'Barlow', sans-serif"});
  assert.ok(!el.style.filter || el.style.filter==='none');
  assert.match(el.style.textShadow,/3px/);
  h.context.applyTextBoxVisuals(el,{...CAPTION_PRESETS.find(p=>p.name==='White Label').style,paddingX:8,paddingY:6});
  assert.equal(el.style.padding,'6px 8px');
  assert.equal(el.style.backdropFilter,'none');
  assert.equal(el.style.textShadow,'none');
});

test('curated ASS honors font and stroke independently of animation, with no phrase fade-out', () => {
  const s={...CAPTION_PRESETS[4].style,animationStyle:'pop',strokeWidth:0};
  const ass=buildAssContent([{start:1,end:1.08,text:'hello world'}],s);
  const row=ass.split('\n').find(l=>l.startsWith('Style: Default,')).split(',');
  assert.equal(row[1],'Anton'); assert.equal(Number(row[16]),0);
  assert.ok(!ass.includes('\\fad('));
  assert.ok(!ass.includes('\\fscx65'));
  assert.match(ass,/HELLO \{\\fscx96/);
});

const ffmpegBin=process.env.FFMPEG_PATH || 'ffmpeg';
const hasFfmpeg=spawnSync(ffmpegBin,['-version'],{stdio:'ignore'}).status===0;
test('libass selects each bundled family instead of substituting a system font', {skip:!hasFfmpeg}, () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'caption-fonts-'));
  const expected={'Barlow':'Barlow-Bold','Barlow Condensed':'BarlowCondensed-Bold','Anton':'Anton-Regular','Bebas Neue':'BebasNeue-Regular','Libre Caslon Text':'LibreCaslonText-Regular','Space Mono':'SpaceMono-Regular'};
  try {
    for(const [name,postscript] of Object.entries(expected)) {
      const style=CAPTION_PRESETS.find(p=>p.style.fontFamily===name).style;
      const file=path.join(dir,'font.ass');
      fs.writeFileSync(file,buildAssContent([{start:0,end:.5,text:'Make it happen'}],{...style,exportVideoWidth:320,exportVideoHeight:568}));
      const result=spawnSync(ffmpegBin,['-hide_banner','-f','lavfi','-i','color=s=320x568:d=0.5','-vf',`ass='${file}':fontsdir='${root}/public/fonts'`,'-frames:v','1','-f','null','-'],{encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      assert.ok(result.stderr.includes(`-> ${postscript},`),result.stderr);
    }
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test('actual caption burn produces an MP4 using a curated preset', {skip:!hasFfmpeg}, async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'caption-burn-'));
  let output;
  try {
    const input=path.join(dir,'source.mp4');
    const result=spawnSync(ffmpegBin,['-y','-f','lavfi','-i','color=s=320x568:d=0.5','-c:v','libx264','-threads','1',input],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    output=await burnSubtitles({inputPath:input,segments:[{start:0,end:.4,text:'Good things ahead'}],style:{...CAPTION_PRESETS.find(p=>p.name==='Golden Hour').style,exportVideoWidth:320,exportVideoHeight:568}});
    assert.ok(fs.statSync(output.outputPath).size>1000);
  } finally {
    if(output) fs.rmSync(output.outputPath,{force:true});
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
