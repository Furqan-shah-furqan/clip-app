const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {model,gridHtml}=require('../public/smartResults');
const source=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
const renderSource=source.slice(source.indexOf('function renderSingleClipCardHtml('),source.indexOf('let smartResultsCompleted'));
const context=vm.createContext({state:{uploadedProject:null},escapeHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),autoHookForClip:i=>'Clip '+i,formatShortDuration:s=>s+'s',timeToSeconds:()=>0,SVG_PLAY:'play',SVG_EDIT:'edit',SVG_DELETE:'delete',SVG_DOWNLOAD:'download'});
vm.runInContext(renderSource,context);
const render=context.renderSingleClipCardHtml;
const clips=n=>Array.from({length:n},(_,i)=>({hook:'A long title '.repeat(15),duration:30,thumbnail:'/fixture.svg',downloadUrl:'/clip'+i+'.mp4',smartScore:82}));
for(const n of [0,1,2,3,5,7,15,16,30,100]) {
  test(`${n} results use real counts and exactly one slot per clip`,()=>{
    const v=model({clips:clips(n),estimate:15,completed:true});
    assert.equal(v.total,n);assert.equal(v.phase,'completed');
    const html=gridHtml(v,render);
    assert.equal((html.match(/data-card-index=/g)||[]).length,n);
    assert.equal((html.match(/smart-result-slot/g)||[]).length,n);
    assert.equal((html.match(/data-action="download"/g)||[]).length,n);
    assert.equal((html.match(/data-action="edit"/g)||[]).length,n);
    if(!n)assert.match(html,/No clips were generated/);
  });
  if(n) test(`${n} estimated slots remain identical in count through loading/completion`,()=>{
    for(const ready of [0,Math.floor(n/2),n]) {
      const v=model({estimate:n,clips:clips(ready),generating:true});
      const html=gridHtml(v,render);
      assert.equal(v.total,n);assert.equal(v.active,Math.min(ready,n-1));
      assert.equal((html.match(/smart-result-slot/g)||[]).length,n);
      assert.equal((html.match(/is-current/g)||[]).length,1);
    }
  });
}
test('unknown estimate remains neutral; loading never invents cards',()=>{
  for(const estimate of [null,undefined,0,NaN]) {
    const v=model({estimate});assert.equal(v.total,0);assert.equal(v.phase,'neutral');
    assert.equal(model({estimate,generating:true}).total,0);
  }
});
test('completion shrinks or grows only to the actual result count',()=>{
  assert.equal(model({estimate:15,clips:clips(7),generating:true}).total,15);
  assert.equal(model({estimate:15,clips:clips(7),completed:true}).total,7);
  assert.equal(model({estimate:15,clips:clips(30),completed:true}).total,30);
});
test('missing media has a real fallback, titles are escaped, all actions retained',()=>{
  const html=render({hook:'<bad> "title"',duration:30},0);
  assert.match(html,/Preview unavailable/);assert.ok(!html.includes('<video'));
  assert.ok(!html.includes('<bad>'));for(const action of ['edit','preview','download','delete'])assert.ok(html.includes(`data-action="${action}"`));
});

test('app integration keeps one grid through estimates, progress, completion and empty results',()=>{
  const element=()=>({style:{},dataset:{},textContent:'',innerHTML:''});
  const panel=element(),grid=element(),duration=element(),count=element();
  const ids=Object.fromEntries(['expectedOutputKickerText','expectedOutputProgressBar','expectedOutputEtaText'].map(id=>[id,element()]));
  const state={videoDurationSeconds:1560,generatedClips:[],isGenerating:false,uploadedProject:null};
  let binds=0;
  const ctx=vm.createContext({SmartResults:{model,gridHtml},state,expectedOutputCard:panel,generatedClipsGrid:grid,expectedOutputDuration:duration,expectedOutputCount:count,ytUrlInput:{value:'fixture'},document:{getElementById:id=>ids[id]},getAutoSmartClipCount:()=>15,renderSingleClipCardHtml:render,bindResultCards:()=>binds++});
  vm.runInContext(source.slice(source.indexOf('let smartResultsCompleted'),source.indexOf('function updateClipPlanner')),ctx);
  ctx.updateExpectedOutputCard();assert.equal(count.textContent,'~15 clips');assert.equal(panel.dataset.phase,'estimated');
  ctx.updateExpectedOutputCard(undefined,undefined,10);assert.equal(panel.dataset.phase,'loading');
  state.generatedClips=clips(1);ctx.updateExpectedOutputCard(undefined,undefined,20);
  assert.equal((grid.innerHTML.match(/smart-result-slot/g)||[]).length,15);
  const savedBinds=binds;ctx.updateExpectedOutputCard(undefined,undefined,21);assert.equal(binds,savedBinds);
  state.generatedClips=clips(7);ctx.updateExpectedOutputCard(undefined,undefined,100);
  assert.equal(count.textContent,'7 clips');assert.equal((grid.innerHTML.match(/smart-result-slot/g)||[]).length,7);
  state.generatedClips=[];ctx.updateExpectedOutputCard();assert.equal(count.textContent,'0 clips');assert.match(grid.innerHTML,/No clips were generated/);
});
