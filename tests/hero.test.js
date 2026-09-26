const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
test('hero follows real progress, clamps values, resets and never advances independently',()=>{
  const els={};
  for(const id of ['heroLoadingGauge','heroLoadingPercent','heroLoadingArc','heroLoadingStatus','heroMediaVideo','heroMediaPoster','heroMediaEmpty','ytThumb','progressPercent','progressLabel','videoInput','ytUrlInput','clearUrlBtn','heroMediaBadge']) {
    els[id]={textContent:'',style:{},dataset:{},events:{},attrs:{},getAttribute(k){return this.attrs[k];},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,f){this.events[k]=f;}};
  }
  const hero={dataset:{}};let callback,frame,clock=0;const events={};
  const ctx={document:{getElementById:id=>els[id],querySelector:()=>hero},matchMedia:()=>({matches:false}),performance:{now:()=>clock},
    requestAnimationFrame:fn=>{frame=fn;return 1;},cancelAnimationFrame:()=>frame=null,
    MutationObserver:class {constructor(fn){callback=fn;}observe(){}},addEventListener:(k,f)=>events[k]=f};
  vm.runInNewContext(fs.readFileSync(path.join(root,'public/hero.js'),'utf8'),ctx);
  function finish(){clock+=350;const fn=frame;frame=null;fn?.(clock);}
  finish();assert.equal(els.heroLoadingPercent.textContent,'0%');
  for(const value of [5,32,78,100,0,150,-5]) {
    els.progressPercent.textContent=value+'%';els.progressLabel.textContent='• Actual job stage';callback();finish();
    assert.equal(els.heroLoadingPercent.textContent,Math.max(0,Math.min(100,value))+'%');
    assert.equal(els.heroLoadingStatus.textContent,'Actual job stage');assert.equal(frame,null);
  }
  assert.equal(els.progressPercent.textContent,'-5%'); // adapter never writes upstream state
  assert.equal(hero.dataset.loading,'false');
});
test('hero keeps generation DOM hooks unique and includes the existing application scripts',()=>{
  const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
  for(const id of ['ytUrlInput','videoInput','smartClipBtn','cancelGenerationBtn','modernProgressCard','progressPercent','progressLabel','progressFill','ytThumb','progressRingCircle']) {
    assert.equal(html.split(`id="${id}"`).length-1,1,id);
  }
  assert.match(html,/src="app.js\?v=20260922"/);
  assert.match(html,/src="captionClient.js\?v=20260922"/);
});
