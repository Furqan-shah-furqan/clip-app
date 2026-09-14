const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createCaptionJobQueue } = require('../server/services/captionJobService');
const root = path.resolve(__dirname, '..');
const tick = () => new Promise(resolve => setImmediate(resolve));

function editorFunctions(names, extra = {}) {
  const source = fs.readFileSync(path.join(root, 'public/captions.js'), 'utf8');
  const context = vm.createContext({ uniqueId: () => 'id', clamp: (v, a, b) => Math.max(a, Math.min(v, b)), ...extra });
  for (const name of names) {
    const match = new RegExp(`^(?:async )?function ${name}\\(`, 'm').exec(source);
    assert.ok(match, name);
    const rest = source.slice(match.index);
    const end = rest.indexOf('\n}\n') + 2;
    vm.runInContext(rest.slice(0, end), context);
  }
  return context;
}

const helpers = ['normalizeCaptionText', 'normalizeCaptionCompareText', 'dedupeCaptionSegments', 'normalizeSegments', 'buildSegmentsFromWords', 'getWordGroupText', 'getWordAppendText', 'getActiveDisplayWordIndex', 'expandSegmentsForExport', 'isPlaceholderOrMockCaptions'];

test('single queue deduplicates callers and never runs two transcriptions together', async () => {
  let active = 0, maximum = 0, calls = 0;
  const queue = createCaptionJobQueue({ getKey: x => x, run: async x => {
    calls++; maximum = Math.max(maximum, ++active); await tick(); active--; return x;
  }});
  const first = queue.start('a');
  assert.equal(queue.start('a'), first);
  const second = queue.start('b');
  await Promise.all([first.promise, second.promise]);
  assert.equal(maximum, 1); assert.equal(calls, 2);
  assert.equal(first.status, 'completed');
  assert.equal(queue.start('a'), first);
});

test('failed jobs can retry and do not poison the queue', async () => {
  let calls = 0;
  const queue = createCaptionJobQueue({ getKey: x => x, run: async () => {
    if (++calls === 1) throw new Error('model missing'); return [];
  }});
  const failed = queue.start('a'); await failed.promise;
  assert.equal(failed.status, 'failed'); assert.equal(failed.error, 'model missing');
  const retry = queue.start('a'); await retry.promise;
  assert.notEqual(retry.id, failed.id); assert.equal(retry.status, 'completed');
});

test('queue bounds pending jobs and expires terminal jobs', async () => {
  let finish;
  const queue = createCaptionJobQueue({ getKey: x => x, maxJobs: 1, ttlMs: -1,
    run: () => new Promise(resolve => { finish = resolve; }) });
  const job = queue.start('a'); await tick();
  assert.throws(() => queue.start('b'), /queue is full/);
  finish('ok'); await job.promise;
  assert.equal(queue.get(job.id), undefined);
});

test('repeated speech and word timestamps survive normalization and word-only payloads', () => {
  const h = editorFunctions(helpers);
  const words = [{word:'go', start:0, end:0.3}, {word:'now',start:0.3,end:0.6}, {word:'go',start:1,end:1.3}, {word:'now',start:1.3,end:1.6}];
  const seg = {start:0,end:2,text:'go now go now',words};
  assert.equal(h.normalizeSegments([seg])[0].text, seg.text);
  assert.equal(h.buildSegmentsFromWords(words)[0].words.length, 4);
  assert.equal(h.normalizeSegments([{start:0,end:1,text:'yes'}, {start:1,end:2,text:'yes'}]).length, 2);
});

test('highlighting follows timestamps for repeated and Urdu words, including backward seeks', () => {
  const h = editorFunctions(helpers);
  for (const texts of [['go','now','go','now'], ['اب','چلو','اب','چلو']]) {
    const seg = {start:0,end:5,text:texts.join(' '),words:texts.map((word,i)=>({word,start:i,end:i+0.7}))};
    assert.equal(h.getActiveDisplayWordIndex(seg, 3.2, {wordsPerRow:2}), 1);
    assert.equal(h.getActiveDisplayWordIndex(seg, 2.2, {}), 2);
    assert.equal(h.getActiveDisplayWordIndex(seg, 0.2, {}), 0);
    assert.equal(h.getWordGroupText(seg,2.2,2), texts.slice(2).join(' '));
  }
});

test('append preview and export respect pauses in speech', () => {
  const h = editorFunctions(helpers);
  const seg = {start:0,end:5,text:'first second', words:[{word:'first',start:0,end:1},{word:'second',start:4,end:5}]};
  assert.equal(h.getWordAppendText(seg,3), 'first');
  const events = h.expandSegmentsForExport([seg], 'wordappend');
  assert.equal(events[1].start,4); assert.equal(events[1].text,'first second');
});

test('short real transcripts are accepted; legacy metadata fallbacks are detected', () => {
  const h = editorFunctions(helpers);
  assert.equal(h.isPlaceholderOrMockCaptions([{text:'سلام دنیا',start:0,end:1}],{}),false);
  assert.equal(h.isPlaceholderOrMockCaptions([{text:'A made up title'}],{title:'A made up title'}),true);
});

test('background transcript cannot overwrite edits made while waiting', async () => {
  let resolve;
  const editorState = {clip:{},segments:[]};
  const h = editorFunctions(['syncAudioTranscript'], {editorState, fetchServerCaptions: () => new Promise(r => {resolve=r;})});
  const pending = h.syncAudioTranscript();
  editorState.segments.push({text:'my edit',start:0,end:1});
  resolve([{text:'server',start:0,end:1}]);
  await assert.rejects(pending,/captions changed/);
  assert.equal(editorState.segments[0].text,'my edit');
});

test('client polls processing jobs, deduplicates calls, and exposes failures', async () => {
  const source = fs.readFileSync(path.join(root,'public/captionClient.js'),'utf8');
  let calls = 0;
  const responses = [{status:'processing',jobId:'abc'},{status:'completed',segments:[{text:'hello'}]}];
  const context = vm.createContext({AbortController, setTimeout: (fn,ms) => ms===2000 ? setTimeout(fn,0) : setTimeout(fn,ms), clearTimeout,
    fetch:async () => ({ok:true,json:async()=>{calls++;return responses.shift();}})});
  vm.runInContext(source,context);
  const a = context.ClipCaptionClient.generate({inputPath:'a'});
  assert.equal(context.ClipCaptionClient.generate({inputPath:'a'}),a);
  assert.equal((await a).segments[0].text,'hello'); assert.equal(calls,2);
  responses.push({status:'failed',error:'No speech detected'});
  await assert.rejects(context.ClipCaptionClient.generate({inputPath:'a'}), /No speech detected/);
});

test('caption routes: real FFmpeg extraction, stub ASR, polling, cache isolation, missing files, and process timeout', async t => {
  // The ASR fixture verifies orchestration only; it is not a speech-recognition quality test.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'clip-caption-test-'));
  const fakePython = path.join(dir,'python-fixture');
  const countPath = path.join(dir,'count');
  fs.writeFileSync(fakePython, `#!/usr/bin/env node\nconst fs=require('fs');\nconst wav=process.argv[3];\nif (!fs.readFileSync(wav).subarray(0,4).equals(Buffer.from('RIFF'))) process.exit(1);\nfs.appendFileSync(${JSON.stringify(countPath)},'1');\nsetTimeout(()=>console.log(JSON.stringify({segments:[{start:0,end:0.8,text:'hello',words:[{word:'hello',start:0,end:0.8}]}]})),100);\n`,{mode:0o755});
  const previousPython = process.env.PYTHON_PATH;
  process.env.PYTHON_PATH = fakePython;
  const filename = path.join(root,'server/routes/captions.js');
  const context = vm.createContext({require:createRequire(filename),module:{exports:{}},process,console,URL,setTimeout,clearTimeout});
  vm.runInContext(fs.readFileSync(filename,'utf8')+'\nmodule.exports.testHelpers={getFileStamp,getArtifactPaths,runCommand,safeBaseName};', context);
  const {router,testHelpers:h} = context.module.exports;
  const express = require('express');
  const app = express(); app.use(express.json()); app.use('/api/captions',router);
  const server = await new Promise(resolve => {const srv=app.listen(0,'127.0.0.1',()=>resolve(srv));});
  const origin = `http://127.0.0.1:${server.address().port}`;
  const video = path.join(dir,'clip.mp4');
  const {execFileSync} = require('node:child_process');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','aac',video]);
  t.after(async()=>{
    await new Promise(resolve=>server.close(resolve));
    if(previousPython===undefined) delete process.env.PYTHON_PATH; else process.env.PYTHON_PATH=previousPython;
    for(const p of Object.values(h.getArtifactPaths(video))) fs.rmSync(p,{force:true});
    fs.rmSync(dir,{recursive:true,force:true});
  });
  const post = body => fetch(origin+'/api/captions/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const response = await post({inputPath:'/stale/clip.mp4',inputPaths:[video],async:true});
  assert.equal(response.status,202);
  let job = await response.json();
  const duplicate = await (await post({inputPath:video,async:true})).json();
  assert.equal(duplicate.jobId,job.jobId);
  for(let i=0;i<100 && job.status!=='completed';i++) {
    await new Promise(r=>setTimeout(r,20));
    job=await(await fetch(origin+'/api/captions/jobs/'+job.jobId)).json();
    assert.notEqual(job.status,'failed',job.error);
  }
  assert.equal(job.status,'completed'); assert.equal(job.segments[0].words[0].start,0);
  assert.equal(fs.readFileSync(countPath,'utf8'),'1');
  assert.equal((await post({inputPath:video})).status,200);
  assert.equal((await post({inputPath:'/missing.mp4',async:true})).status,404);
  assert.equal((await fetch(origin+'/api/captions/jobs/expired')).status,404);
  assert.equal(h.safeBaseName('https://host/exports/clip%20one.mp4?download=1'),'clip one.mp4');
  const stamp = h.getFileStamp(video); fs.utimesSync(video,new Date(),new Date(Date.now()+1000));
  assert.notEqual(h.getFileStamp(video),stamp);
  // Clean artifacts from the original stamp before the changed mtime cleanup.
  const captionsDir=path.join(root,'captions');
  for(const f of fs.readdirSync(captionsDir)) if(f.startsWith('clip-'+stamp)) fs.rmSync(path.join(captionsDir,f));
  const oldTimeout=process.env.CAPTION_PROCESS_TIMEOUT_MS;
  process.env.CAPTION_PROCESS_TIMEOUT_MS='20';
  try { await assert.rejects(h.runCommand(process.execPath,['-e','setInterval(()=>{},1000)']),/timed out/); }
  finally { if(oldTimeout===undefined) delete process.env.CAPTION_PROCESS_TIMEOUT_MS; else process.env.CAPTION_PROCESS_TIMEOUT_MS=oldTimeout; }
});

test('Cloudinary recovery validates the account, streams to disk, and removes partial downloads on failure', async () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'caption-source-test-'));
  const filename=path.join(root,'server/services/captionSourceService.js');
  const realRequire=createRequire(filename);
  let calls=0, fail=false;
  const {Readable}=require('node:stream');
  const context=vm.createContext({module:{exports:{}},URL,AbortController,setTimeout,clearTimeout,
    process:{env:{CLOUDINARY_CLOUD_NAME:'test-cloud'}},
    require(name) {
      if(name==='../utils/paths') return {captionsDir:directory};
      if(name==='axios') return {get:async(url,options)=>{
        calls++; assert.equal(options.maxRedirects,0);
        return {data:fail ? Readable.from((async function*(){yield Buffer.from('partial');throw new Error('download failed');})()) : Readable.from([Buffer.from('video fixture')])};
      }};
      return realRequire(name);
    }});
  vm.runInContext(fs.readFileSync(filename,'utf8'),context);
  const {allowedCaptionSource,restoreCaptionSource}=context.module.exports;
  const url='https://res.cloudinary.com/test-cloud/video/upload/v1/clip.mp4';
  assert.equal(allowedCaptionSource(url),url);
  for(const bad of ['http://res.cloudinary.com/test-cloud/video/upload/x','https://res.cloudinary.com/other/video/upload/x','https://127.0.0.1/test-cloud/video/upload/x','https://res.cloudinary.com.evil.test/test-cloud/video/upload/x','https://res.cloudinary.com/test-cloud/video/upload/../../other/x']) assert.equal(allowedCaptionSource(bad),null);
  try {
    const local=await restoreCaptionSource(url);
    assert.equal(fs.readFileSync(local,'utf8'),'video fixture');
    assert.equal(await restoreCaptionSource(url),local);assert.equal(calls,1);
    fail=true;
    await assert.rejects(restoreCaptionSource(url.replace('clip.mp4','other.mp4')),/download failed/);
    assert.equal(fs.readdirSync(directory).some(name=>name.endsWith('.part')),false);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
