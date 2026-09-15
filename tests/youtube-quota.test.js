const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const { createYouTubeClipSession } = require('../server/services/youtubeClipSession');
const root = path.resolve(__dirname, '..');
const sourceUrl = 'https://www.youtube.com/watch?v=CUXbgqvVOrU';
const limit = () => Object.assign(new Error('HTTP 429'), { code: 'FAST_DOWNLOAD_LIMIT' });

function loadService(name, extra = {}) {
  const filename = path.join(root, 'server/services', name + '.js');
  const context = vm.createContext({ require: createRequire(filename), module: {exports:{}},
    __dirname: path.dirname(filename), console: {log(){},warn(){},error(){}},
    process: { platform: process.platform, env: { RAPIDAPI_KEY:'test-only-key' } },
    setTimeout, clearTimeout, URL, Buffer, ...extra });
  vm.runInContext(fs.readFileSync(filename,'utf8'),context);
  return context;
}

test('actual trim downloader stops on its first 429 and returns a typed error', async () => {
  const filename = path.join(root,'server/services/smartClipService.js');
  const realRequire = createRequire(filename);
  let calls = 0, waits = 0;
  const h = loadService('smartClipService', {
    require: name => name === 'axios' ? { get: async () => {
      calls++; throw Object.assign(new Error('HTTP 429'), {response:{status:429}});
    } } : realRequire(name),
    setTimeout: () => { waits++; throw new Error('unexpected retry'); },
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'quota-trim-'));
  try {
    await assert.rejects(h.module.exports.downloadTrimmedClipViaRapidApi({
      sourceUrl, startTime:'00:01:31', endTime:'00:02:00', destinationDir:dir,
    }), e => e.code === 'FAST_DOWNLOAD_LIMIT');
    assert.equal(calls,1); assert.equal(waits,0);
    assert.deepEqual(fs.readdirSync(dir),[]);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test('four moments reuse one fallback source and retain original timestamps', async () => {
  let attempts = 0, downloads = 0, fallbackMessages = 0;
  const rendered = [], cleaned = [];
  const session = createYouTubeClipSession({ sourceUrl, sourceDir:'/tmp/quota-job',
    onFallback:()=>fallbackMessages++, cleanup:p=>cleaned.push(p),
    download:async options=>{
      downloads++; assert.equal(options.skipFast,true); return options.targetPath;
    },
    generate:async options=>{
      if (options.inputPath === sourceUrl) { attempts++; throw limit(); }
      rendered.push(options); return {fileName:'clip.mp4'};
    },
  });
  for(const start of [91,108,49,74]) {
    await session.generate({sourceUrl,inputPath:sourceUrl,startTime:start,endTime:start+30});
  }
  session.dispose();
  assert.equal(attempts,1); assert.equal(downloads,1); assert.equal(fallbackMessages,1);
  assert.deepEqual(rendered.map(x=>x.startTime),[91,108,49,74]);
  assert.ok(rendered.every(x=>x.endTime-x.startTime===30));
  assert.deepEqual(cleaned,['/tmp/quota-job/quota_fallback_source.mp4']);
});

test('successful trim and rendering errors do not trigger a full download', async () => {
  let downloads=0;
  const options={sourceUrl,sourceDir:'/tmp/quota-job',download:async()=>{downloads++;}};
  const success=createYouTubeClipSession({...options,generate:async()=>({fileName:'ok.mp4'})});
  assert.equal((await success.generate({})).fileName,'ok.mp4'); success.dispose();
  const failure=createYouTubeClipSession({...options,generate:async()=>{throw new Error('FFmpeg failed');}});
  await assert.rejects(failure.generate({}),/FFmpeg failed/); failure.dispose();
  assert.equal(downloads,0);
});

test('failed fallback is not retried for every moment and partial source is cleaned', async () => {
  let downloads=0, attempts=0, cleaned=0;
  const session=createYouTubeClipSession({sourceUrl,sourceDir:'/tmp/quota-job',
    generate:async()=>{attempts++;throw limit();},
    download:async()=>{downloads++;throw new Error('alternate unavailable');}, cleanup:()=>cleaned++,
  });
  for(let i=0;i<4;i++) await assert.rejects(session.generate({}),/alternate unavailable/);
  session.dispose();
  assert.equal(attempts,1); assert.equal(downloads,1); assert.equal(cleaned,1);
});

test('cancellation during source download prevents rendering and allows cleanup', async () => {
  let cancelled=false, renders=0, cleaned=0;
  const session=createYouTubeClipSession({sourceUrl,sourceDir:'/tmp/quota-job',
    isCancelled:()=>cancelled,
    generate:async()=>{renders++;throw limit();},
    download:async o=>{cancelled=true;return o.targetPath;},cleanup:()=>cleaned++,
  });
  await assert.rejects(session.generate({}),/Job cancelled by user/);
  session.dispose(); assert.equal(renders,1); assert.equal(cleaned,1);
});

test('source downloader skips FAST even if YTStream fails, and honors job destination', async () => {
  const realRequire=createRequire(path.join(root,'server/services/youtubeDownloader.js'));
  const h=loadService('youtubeDownloader', {require:name => name === './youtubeInfoDownload'
    ? {fetchFromYouTubeInfo:async()=>{throw Error('unavailable');}} : realRequire(name)});
  vm.runInContext(`
    var calls=[];
    fetchFromFastDownloader=async()=>{calls.push('FAST');throw Error('must not call FAST');};
    fetchFromYtStream=async()=>{calls.push('YTStream');throw Error('unavailable');};
    downloadViaYtDlp=async o=>{calls.push('yt-dlp');return o.targetPath;};
  `,h);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'quota-source-'));
  try {
    const targetPath=path.join(dir,'source.mp4');
    const result=await h.module.exports.downloadYouTubeSource({sourceUrl,targetPath,skipFast:true});
    assert.equal(result,targetPath);
    assert.deepEqual(Array.from(h.calls),['YTStream','yt-dlp']);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('full-source fallback produces a real clip at the original source offset', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'quota-render-'));
  const oldDisable=process.env.DISABLE_OPENCV_REFRAME;
  process.env.DISABLE_OPENCV_REFRAME='true';
  const {smartGenerateClip}=require('../server/services/smartClipService');
  let session;
  try {
    const source=path.join(dir,'fixture.mp4');
    const made=spawnSync('ffmpeg',['-y','-f','lavfi','-i','color=c=red:s=160x160:d=2:r=10',
      '-f','lavfi','-i','color=c=blue:s=160x160:d=2:r=10',
      '-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]',
      '-c:v','libx264','-threads','1',source],{encoding:'utf8'});
    assert.equal(made.status,0,made.stderr);
    session=createYouTubeClipSession({sourceUrl,sourceDir:dir,
      download:async o=>{fs.copyFileSync(source,o.targetPath);return o.targetPath;},
      generate:async o=>{if(o.inputPath===sourceUrl)throw limit();return smartGenerateClip(o);},
    });
    const result=await session.generate({sourceUrl,inputPath:sourceUrl,
      startTime:'00:00:02',endTime:'00:00:03',aspectRatio:'1:1',outputDir:dir});
    const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration',
      '-of','default=nw=1:nk=1',result.outputPath],{encoding:'utf8'});
    assert.equal(probe.status,0,probe.stderr);
    assert.ok(Math.abs(Number(probe.stdout)-1)<.15,probe.stdout);
    const pixel=spawnSync('ffmpeg',['-v','error','-i',result.outputPath,'-vf','scale=1:1',
      '-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-']);
    assert.equal(pixel.status,0,String(pixel.stderr));
    assert.ok(pixel.stdout[2]>200 && pixel.stdout[0]<30,'clip must show blue at 2s, not red at 0s');
  } finally {
    session?.dispose();
    if(oldDisable===undefined)delete process.env.DISABLE_OPENCV_REFRAME;
    else process.env.DISABLE_OPENCV_REFRAME=oldDisable;
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

test('generation orchestrator keeps successful clips and cleans fallback source', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'quota-job-'));
  const realRequire=createRequire(path.join(root,'server/services/smartGenerationService.js'));
  const workspace={sourceDir:path.join(dir,'source'),clipsDir:path.join(dir,'clips'),tempDir:path.join(dir,'tmp')};
  fs.mkdirSync(workspace.sourceDir,{recursive:true});
  let downloads=0, trims=0, renders=0;
  const generate=async o=>{
    if(o.inputPath===sourceUrl){trims++;throw limit();}
    renders++;
    if(renders===2)throw new Error('one render failed');
    const fileName=`clip-${renders}.mp4`,outputPath=path.join(o.outputDir,fileName);
    fs.writeFileSync(outputPath,'fixture');return {fileName,outputPath};
  };
  const h=loadService('smartGenerationService',{
    setTimeout:callback=>setTimeout(callback,0),
    require:name=>{
      if(name==='../utils/paths')return {...realRequire(name),exportsDir:path.join(dir,'exports'),getJobWorkspace:()=>workspace};
      if(name==='./youtubeClipSession')return {createYouTubeClipSession:options=>createYouTubeClipSession({
        ...options,generate,download:async o=>{
          downloads++;fs.writeFileSync(o.targetPath,'source');return o.targetPath;
        },
      })};
      return realRequire(name);
    },
  });
  try {
    const result=await h.module.exports.runSmartGeneration({generationJobId:'test',payload:{
      sourceType:'youtube',sourceUrl,isContinuation:true,
      segments:[91,108,49,74].map(startSec=>({startSec,endSec:startSec+30,score:80})),
    }});
    assert.equal(result.success,true);assert.equal(result.clips.length,3);
    assert.equal(downloads,1);assert.equal(trims,1);assert.equal(renders,4);
    assert.deepEqual(Array.from(result.clips,c=>c.startSec),[91,49,74]);
    assert.equal(fs.existsSync(path.join(workspace.sourceDir,'quota_fallback_source.mp4')),false);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('new provider source is probed for video and audio before use', async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'info-source-'));
  const filename=path.join(root,'server/services/youtubeDownloader.js');
  const realRequire=createRequire(filename);
  try {
    const fixture=path.join(dir,'av.mp4');
    const made=spawnSync('ffmpeg',['-y','-f','lavfi','-i','color=c=blue:s=160x160:d=1',
      '-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libx264','-threads','1','-c:a','aac',fixture],{encoding:'utf8'});
    assert.equal(made.status,0,made.stderr);
    const h=loadService('youtubeDownloader',{require:name=>name==='./youtubeInfoDownload'
      ? {fetchFromYouTubeInfo:async()=> 'https://nora82.savenow.to/api/v2/download/test'} : realRequire(name)});
    h.fixture=fixture;
    vm.runInContext(`
      streamRemoteVideoToFile=async(url,dest)=>{fs.copyFileSync(fixture,dest);};
      fetchFromYtStream=async()=>{throw Error('unexpected fallback');};
      downloadViaYtDlp=async()=>{throw Error('unexpected local fallback');};
    `,h);
    const targetPath=path.join(dir,'source.mp4');
    assert.equal(await h.module.exports.downloadYouTubeSource({sourceUrl,targetPath,skipFast:true}),targetPath);
    assert.ok(fs.existsSync(targetPath));
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
