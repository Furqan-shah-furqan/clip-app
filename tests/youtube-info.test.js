const {test} = require('node:test');
const assert = require('node:assert/strict');
const {fetchFromYouTubeInfo, providerUrl} = require('../server/services/youtubeInfoDownload');
const pending = {success:true, format:'720', url:null, progress_url:'https://p.savenow.to/api/progress?id=test'};
const ready = {success:1, progress:1000, format:'mp4 [720p]', download_url:'https://nora82.savenow.to/api/v2/download/test'};
test('accepted job polls to completion; credentials only go to RapidAPI', async()=>{
  const calls=[], responses=[pending,{success:1,progress:400},ready];
  const url=await fetchFromYouTubeInfo('CUXbgqvVOrU','test-key',{
    wait:async()=>{}, get:async(url,options)=>{calls.push({url,options});return {data:responses.shift()};},
  });
  assert.equal(url,ready.download_url); assert.equal(calls.length,3);
  assert.equal(calls[0].options.params.format,'720');
  assert.equal(calls[0].options.params.no_merge,'false');
  assert.equal(calls[0].options.params.add_info,'1');
  assert.equal(calls[0].options.headers['x-rapidapi-key'],'test-key');
  assert.ok(calls.slice(1).every(c=>!c.options.headers && c.options.maxRedirects===0));
});
test('completed cached response returns without polling', async()=>{
  assert.equal(await fetchFromYouTubeInfo('CUXbgqvVOrU','key',{get:async()=>({data:ready}),wait:async()=>assert.fail()}),ready.download_url);
});
test('audio-only and provider-declared failures are rejected',async()=>{
  for(const data of [{...ready,format:'mp3'}, {success:false}]) await assert.rejects(fetchFromYouTubeInfo('CUXbgqvVOrU','key',{get:async()=>({data})}));
});
test('polling has a bounded timeout even when success never completes',async()=>{
  let clock=0,calls=0;
  await assert.rejects(fetchFromYouTubeInfo('CUXbgqvVOrU','key',{
    now:()=>clock,timeoutMs:10000,intervalMs:3000,wait:async ms=>{clock+=ms;},
    get:async()=>{calls++;return {data:pending};},
  }),/timed out/);
  assert.equal(calls,4);
});
test('HTTP 429 is not retried and errors never include the key',async()=>{
  let calls=0;
  await assert.rejects(fetchFromYouTubeInfo('CUXbgqvVOrU','private-key',{
    get:async()=>{calls++;throw Object.assign(Error('private-key'),{response:{status:429}});},
  }), e=>/429/.test(e.message)&&!e.message.includes('private-key'));
  assert.equal(calls,1);
});
test('untrusted progress URLs are rejected before they are requested',async()=>{
  let calls=0;
  await assert.rejects(fetchFromYouTubeInfo('CUXbgqvVOrU','key',{
    get:async()=>{calls++;return {data:{...pending,progress_url:'https://127.0.0.1/progress'}};},
  }),/unsupported/);
  assert.equal(calls,1);
  for(const url of ['http://p.savenow.to/a','https://savenow.to.evil.test/a','https://x@p.savenow.to/a']) assert.throws(()=>providerUrl(url));
});
