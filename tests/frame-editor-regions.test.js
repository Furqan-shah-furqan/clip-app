const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {normalizeRegions,compositionFilter} = require('../server/services/frameEditorRegions');

const source = {x:0,y:0,w:.5,h:1};
const placement = {x:.1,y:.1,w:.3,h:.2};
test('live previews correct drift and follow source play, pause and seeking', () => {
  const code = fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
  const start = code.indexOf('function synchronizeEditorVideos(');
  const end = code.indexOf('\nfor (const event of',start);
  const source = {currentTime:4,paused:false,ended:false,playbackRate:1};
  const preview = {parentElement:{hidden:false},readyState:2,currentTime:0,paused:true,
    play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;}};
  const context = vm.createContext({clipEditorDialog:{open:true},editorSourceLoaded:()=>true,
    heroMediaVideo:source,document:{querySelectorAll:()=>[preview]}});
  vm.runInContext(code.slice(start,end),context);
  context.synchronizeEditorVideos();
  assert.equal(preview.currentTime,4);
  assert.equal(preview.paused,false);
  source.currentTime=4.1;
  context.synchronizeEditorVideos();
  assert.equal(preview.currentTime,4,'small drift must not trigger repeated seeks');
  source.currentTime=10;source.paused=true;
  context.synchronizeEditorVideos(true);
  assert.equal(preview.currentTime,10);
  assert.equal(preview.paused,true);
});
test('source and placement survive independently, with legacy payload compatibility', () => {
  const normalized = normalizeRegions({gameplay:{source},facecam1:{source:{...source,x:.5},placement}},true);
  assert.deepEqual(normalized.inset.placement,placement);
  assert.equal(normalized.inset.x,.5);
  assert.equal(normalized.main.width,.5);
  assert.equal(normalizeRegions({gameplay:source,facecam1:source},false).inset,null);
  assert.throws(() => normalizeRegions({gameplay:{source},facecam1:{source,placement:{...placement,x:.9}}},true),/inside/);
  assert.throws(() => normalizeRegions({gameplay:{source},facecam1:{source,placement:{...placement,w:.1}}},true),/20%/);
});

test('real 1080x1920 clip uses the selected source pixels and output placement', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'clipflow-regions-'));
  const output = path.join(directory,'composition.mp4');
  const normalized = normalizeRegions({gameplay:{source},facecam1:{source:{...source,x:.5},placement}},true);
  const run = args => {
    const result = spawnSync('ffmpeg',args,{maxBuffer:16*1024*1024});
    assert.equal(result.status,0,result.stderr.toString());
    return result.stdout;
  };
  try {
    run(['-v','error','-y','-f','lavfi','-i','color=red:size=640x360:rate=1,drawbox=x=320:y=0:w=320:h=360:color=blue:t=fill',
      '-filter_complex',compositionFilter(normalized),'-map','[v]','-t','1','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',output]);
    const frame = run(['-v','error','-i',output,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-']);
    assert.equal(frame.length,1080*1920*3);
    const rgb = (x,y) => [...frame.subarray((y*1080+x)*3,(y*1080+x)*3+3)];
    const background = rgb(20,20);
    const facecam = rgb(270,384);
    assert(background[0]>200 && background[2]<40,`Gameplay must be red: ${background}`);
    assert(facecam[2]>200 && facecam[0]<40,`Placed facecam must be blue: ${facecam}`);
  } finally {
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
