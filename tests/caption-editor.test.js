const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { CAPTION_PRESETS } = require('../public/captionPresets');
const { buildAssContent } = require('../server/services/ffmpegService');
const root = path.resolve(__dirname, '..');

// Event-capable DOM double: exercise the actual editor handlers without calling
// transcription, downloading a source, or relying on a user's saved project.
class Element {
  constructor() {
    this.style = {setProperty(k,v){this[k]=v;},removeProperty(k){delete this[k];}};
    const classes = new Set();
    this.classList = {add:(...a)=>a.forEach(x=>classes.add(x)),remove:(...a)=>a.forEach(x=>classes.delete(x)),contains:x=>classes.has(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)};
    this.events={}; this.dataset={}; this.childNodes=[]; this.value=''; this.textContent='';
    this.offsetWidth=264; this.offsetHeight=80; this.clientWidth=300; this.clientHeight=540;
  }
  get children(){return this.childNodes.filter(x=>!x.isText);}
  addEventListener(type,fn){(this.events[type] ||= []).push(fn);}
  emit(type,detail={}){for(const fn of this.events[type] || [])fn({target:this,button:0,preventDefault(){},stopPropagation(){},...detail});}
  appendChild(el){this.childNodes.push(el);return el;}
  replaceChildren(){this.childNodes=[];}
  querySelectorAll(){return [];}
  querySelector(){return this.children.find(x=>x.contentEditable) || null;}
  setAttribute(k,v){this[k]=v;}
  focus(){}
  blur(){this.emit('blur');}
  pause(){this.paused=true;}
  add(option){this.options.push(option);}
  closest(){return null;}
  getBoundingClientRect(){return {left:0,top:0,width:300,height:540};}
  contains(el){return el===this || this.children.includes(el);}
}
function harness(){
  const html=fs.readFileSync(path.join(root,'public/captions.html'),'utf8'), controls={};
  for(const m of html.matchAll(/<(\w+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const el=controls[m[2]]=new Element();
    if(m[1]==='select') {
      const tail=html.slice(m.index+m[0].length).split('</select>')[0];
      el.options=[...tail.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)/g)].map(x=>({value:x[1],text:x[2]}));
    }
  }
  controls.captionVideo.currentTime=1.1;controls.captionVideo.duration=4;controls.captionVideo.paused=true;
  controls.captionVideo.videoWidth=1080;controls.captionVideo.videoHeight=1920;
  const aligns=['left','center','right'].map(textAlign=>{const el=new Element();el.dataset.textAlign=textAlign;return el;});
  const saved=new Map();
  const document={readyState:'loading',addEventListener(){},getElementById:id=>controls[id]||null,
    querySelectorAll:selector=>selector==='[data-text-align]'?aligns:[],querySelector:()=>null,
    createElement:tag=>{const el=new Element();if(tag==='canvas')el.getContext=()=>({measureText:text=>({width:text.length*14})});return el;},
    createTextNode:text=>({isText:true,textContent:text}),fonts:{load:async()=>[{}]}};
  const context=vm.createContext({window:{CAPTION_PRESETS,location:{search:'?index=0'},addEventListener(){}},document,console,URLSearchParams,setTimeout,clearTimeout,
    Option:function(text,value){this.text=text;this.value=value;},localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)}});
  vm.runInContext(fs.readFileSync(path.join(root,'public/captions.js'),'utf8'),context);
  const run=code=>vm.runInContext(code,context);
  run('cacheDom(); editorState.clip={title:"fixture",duration:4}; editorState.captionSchemaVersion=2; editorState.style=normalizeStyle({...DEFAULT_STYLE,curated:true}); editorState.segments=[{id:"s",start:1,end:3,text:"hello world",words:[{word:"hello",start:1,end:1.3},{word:"world",start:2,end:3}]}]; initCaptionDragging();');
  return {context,run,controls,aligns,saved};
}

test('word correction commits and Escape restores wording without changing a single timestamp',()=>{
  const h=harness(); const before=h.run('JSON.stringify(editorState.segments.map(s=>[s.start,s.end,s.words.map(w=>[w.start,w.end])]))');
  h.context.beginCaptionEdit();
  const word=h.controls.captionOverlayText.children[0];
  word.textContent='Hello';word.emit('blur');h.context.finishCaptionEdit();
  assert.equal(h.run('editorState.segments[0].words[0].word'),'Hello');
  assert.equal(h.run('editorState.segments[0].text'),'Hello world');
  assert.equal(h.run('JSON.stringify(editorState.segments.map(s=>[s.start,s.end,s.words.map(w=>[w.start,w.end])]))'),before);
  h.context.beginCaptionEdit();const second=h.controls.captionOverlayText.children[1];
  second.textContent='everyone';second.emit('blur');second.emit('keydown',{key:'Escape'});
  assert.equal(h.run('editorState.segments[0].text'),'Hello world');
  assert.equal(JSON.parse(h.saved.get('clipflow-caption-clip')).captions[0].words[1].word,'world');
});

test('empty/multiple-word edits are rejected and sync cannot overwrite the active edit',()=>{
  const h=harness();h.context.beginCaptionEdit();const word=h.controls.captionOverlayText.children[0];
  word.textContent='two words';word.emit('blur');assert.equal(word.textContent,'hello');
  h.context.syncCaptionOverlay();assert.equal(h.controls.captionOverlayText.children[0],word);
  word.textContent='';word.emit('blur');assert.equal(word.textContent,'hello');
});

test('horizontal/vertical and rotated handles resize geometry; corners scale font, and captions stay unchanged',()=>{
  const h=harness(), box=h.controls.captionOverlay;
  const original=h.run('JSON.stringify(editorState.segments)');
  const drag=(handle,x,y)=>{
    box.emit('pointerdown',{clientX:100,clientY:100,pointerId:1,target:{closest:()=>({dataset:{handle}})}});
    box.emit('pointermove',{clientX:100+x,clientY:100+y,pointerId:1});box.emit('pointerup',{pointerId:1});
  };
  drag('mr',-25,0);assert.ok(h.run('editorState.style.boxWidth')<88);assert.equal(h.run('editorState.style.paddingX'),14);
  drag('mb',0,10);assert.ok(h.run('editorState.style.boxHeight')>0);assert.ok(h.run('editorState.style.fontSize')>28);
  h.run('editorState.style.rotateAngle=90;editorState.style.boxWidth=88;');drag('mr',0,-25);
  assert.ok(h.run('editorState.style.boxWidth')<88);
  h.run('editorState.style.rotateAngle=0;editorState.style.fontSize=28;');drag('br',20,20);
  assert.ok(h.run('editorState.style.fontSize')>28);
  assert.equal(h.run('JSON.stringify(editorState.segments)'),original);
});

test('alignment/full rotation/box size survive preset selection, control changes and export scaling',()=>{
  const h=harness();h.aligns[2].emit('click');
  h.run('editorState.style.rotateAngle=300;editorState.style.boxWidth=62;editorState.style.boxHeight=20;');
  h.context.applyPresetFromGallery(CAPTION_PRESETS[0].id);h.context.populateStyleControls();h.context.syncStyleFromControls();
  const style=JSON.parse(h.saved.get('clipflow-caption-style'));
  assert.equal(style.textAlign,'right');assert.equal(style.rotateAngle,300);assert.equal(style.boxWidth,62);assert.equal(style.boxHeight,20);
  assert.match(h.controls.captionOverlay.style.transform,/rotate\(300deg\)/);
  assert.equal(h.controls.captionOverlayText.style.transform,'none');
  const exported=h.context.buildScaledStyleForExport(style);
  assert.equal(exported.boxWidth,62);assert.equal(exported.textAlign,'right');assert.equal(exported.rotateAngle,300);
});

test('every gallery preset applies and persists without changing caption text or timing',()=>{
  const h=harness();
  const before=h.run('JSON.stringify(editorState.segments)');
  for(const preset of CAPTION_PRESETS){
    h.context.applyPresetFromGallery(preset.id);
    assert.equal(h.run('editorState.style.activePresetId'),preset.id);
    assert.equal(h.run('editorState.style.strokeWidth'),preset.style.strokeWidth || 0);
    assert.equal(JSON.parse(h.saved.get('clipflow-caption-style')).activePresetId,preset.id);
    assert.equal(h.run('JSON.stringify(editorState.segments)'),before);
  }
});

test('preset clicks on nested content survive re-rendering both preset lists',()=>{
  const h=harness();
  h.context.renderPresetsUI();h.context.renderPresetsGalleryGrid();
  for(const container of [h.controls.presetsGrid,h.controls.presetsModalGrid]){
    for(const preset of CAPTION_PRESETS){
      container.onclick({target:{closest:()=>({dataset:{presetId:preset.id}})},preventDefault(){}});
      assert.equal(h.run('editorState.style.activePresetId'),preset.id);
      assert.equal(JSON.parse(h.saved.get('clipflow-caption-style')).activePresetId,preset.id);
    }
  }
});

test('export wraps to box using measured text without modifying words or event times',()=>{
  const h=harness(), segments=[{start:1,end:1.25,text:'hello world again',words:[{word:'again',start:1,end:1.25}]}];
  const wrapped=h.context.wrapExportToBox(segments,{fontFamily:'Barlow',fontSize:28,fontWeight:700,boxWidth:40});
  assert.match(wrapped[0].text,/\n/);assert.equal(wrapped[0].start,1);assert.equal(wrapped[0].end,1.25);
  assert.equal(wrapped[0].words,segments[0].words);assert.equal(segments[0].text,'hello world again');
});

test('ASS respects box edges, multiline spacing, rotation origin and independent shadow layer',()=>{
  const ass=buildAssContent([{start:1,end:1.25,text:'Hello\nworld'}],{editorBox:true,boxWidth:60,textAlign:'left',positionX:50,positionY:50,rotateAngle:270,fontSize:40,lineSpacing:1.5,exportVideoWidth:1000,exportVideoHeight:1000,textShadow:true,shadowOffsetX:5,shadowOffsetY:7,shadowBlur:8});
  assert.match(ass,/\\an4\\pos\(200,470\)\\org\(500,500\)\\frz-270/);
  assert.match(ass,/\\pos\(200,530\)/);assert.match(ass,/Dialogue: -1/);assert.match(ass,/\\pos\(205,477\)/);
  assert.ok(!ass.includes('\\frz('));assert.ok(ass.includes('0:00:01.25'));
});

const hasFfmpeg=spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status===0;
test('all 15 selectable font families resolve from bundled files in a real libass render',{skip:!hasFfmpeg},()=>{
  const html=fs.readFileSync(path.join(root,'public/captions.html'),'utf8');
  const select=html.split('id="capFontFamily"')[1].split('</select>')[0];
  const families=[...select.matchAll(/<option value="([^"]+)"/g)].map(m=>m[1].split(',')[0].replace(/'/g,''));
  assert.equal(families.length,15);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'editor-fonts-'));
  try {
    for(const font of families){
      const file=path.join(dir,'caption.ass');
      fs.writeFileSync(file,buildAssContent([{start:0,end:.5,text:'Clear\ncaptions'}],{fontFamily:font,fontSize:32,fontWeight:700,editorBox:true,textAlign:'right',boxWidth:80,rotateAngle:15,textShadow:true,shadowOffsetY:3,exportVideoWidth:320,exportVideoHeight:568}));
      const escapedAss = file.replace(/\\/g, '/').replace(/:/g, '\\:');
      const escapedFonts = `${root}/public/fonts`.replace(/\\/g, '/').replace(/:/g, '\\:');
      const r=spawnSync('ffmpeg',['-hide_banner','-f','lavfi','-i','color=s=320x568:d=0.5','-vf',`ass='${escapedAss}':fontsdir='${escapedFonts}'`,'-frames:v','1','-f','null','-'],{encoding:'utf8'});
      assert.equal(r.status,0,r.stderr);
      const line=r.stderr.split('\n').find(l=>l.includes('fontselect:')) || '';
      assert.ok(line.includes(font),line);assert.ok(!/DejaVu|Liberation|Noto/.test(line),line);
    }
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('narrow boxes break long words for export without altering their timing',()=>{
  const h=harness();const result=h.context.wrapExportToBox([{start:2,end:2.2,text:'synchronization'}],{fontFamily:'Barlow',fontSize:28,boxWidth:15});
  assert.ok(result[0].text.split('\n').every(line=>line.length<=3));
  assert.equal(result[0].text.replace(/\n/g,''),'synchronization');assert.equal(result[0].start,2);assert.equal(result[0].end,2.2);
});
