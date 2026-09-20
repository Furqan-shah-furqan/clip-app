// Run: node tests/create-results-layout-check.cjs /tmp/results-layout-check.html
// Open the generated file in a browser, then click Run checks. No API calls.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('public/app.js');
const renderer=app.slice(app.indexOf('function renderSingleClipCardHtml('),app.indexOf('let smartResultsCompleted'));
const icons=app.slice(app.indexOf('const SVG_PLAY ='),app.indexOf('function renderGeneratedClips()'));
const css=read('public/style.css')+'\n'+read('public/smartResults.css');
const panel=read('public/index.html').split('<div class="expected-output-card"')[1].split('<!-- Generated clips')[0];
const html=`<!doctype html><meta charset="utf-8"><title>Smart results layout checks</title>
<style>body{font:14px system-ui;background:#eee;margin:12px}iframe{display:block;border:0;margin:10px 0}pre{white-space:pre-wrap}</style>
<button id="run">Run checks</button><pre id="report">Checks have not run.</pre><div id="frames"></div>
<script>
${read('public/smartResults.js')}
const css=${JSON.stringify(css)},panel=${JSON.stringify('<div class="expected-output-card"'+panel)};
const state={uploadedProject:null};
const escapeHtml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const autoHookForClip=i=>'Clip '+i,formatShortDuration=s=>s+'s',timeToSeconds=()=>0;
${icons}
${renderer}
const widths=[360,390,768,1024,1440],counts=[0,1,2,7,15,16,30];
document.getElementById('run').onclick=async()=>{
 const report=document.getElementById('report');report.textContent='Running…';
 document.getElementById('frames').replaceChildren();const checks=[];
 const assert=(ok,message)=>{if(!ok)throw Error(message)};
 try{
 for(const width of widths){
  const frame=document.createElement('iframe');frame.style.width=width+'px';frame.style.height='600px';
  frame.srcdoc='<style>'+css+'</style><body class="home-page theme-dark"><section class="created-clips-strip"><h3>Smart clip results</h3>'+panel+'</section></body>';
  const loaded=new Promise(resolve=>frame.onload=resolve);document.getElementById('frames').append(frame);await loaded;
  const doc=frame.contentDocument,win=frame.contentWindow,p=doc.getElementById('expectedOutputCard'),grid=doc.getElementById('expectedOutputClipsGrid');
  const rects=()=>[p,...grid.querySelectorAll('.smart-result-slot')].map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(x=>Math.round(x*100)/100)});
  for(const count of counts){
   const clips=Array.from({length:count},(_,i)=>({hook:'Long title that must truncate '+('words '.repeat(30)),duration:30,smartScore:80,thumbnail:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="140"><rect width="100" height="140" fill="#4b568f"/></svg>')}));
   let before;
   for(const phase of ['estimated','loading','completed']){
    const v=SmartResults.model({estimate:count||null,clips:phase==='completed'?clips:phase==='loading'?clips.slice(0,Math.floor(count/2)):[],generating:phase==='loading',completed:phase==='completed'});
    grid.innerHTML=SmartResults.gridHtml(v,renderSingleClipCardHtml);
    doc.getElementById('expectedOutputCount').textContent=count+' clips';
    await new Promise(r=>win.requestAnimationFrame(()=>win.requestAnimationFrame(r)));
    const cs=win.getComputedStyle(p),actual=rects();
    assert(['paddingTop','paddingRight','paddingBottom','paddingLeft'].every(k=>cs[k]==='7px'),width+' padding');
    assert(doc.documentElement.scrollWidth<=width,width+' page overflow');
    assert(grid.scrollWidth<=grid.clientWidth+1,width+' grid overflow');
    assert(grid.querySelectorAll('.smart-result-slot').length===count,'slot count');
    if(count){
     if(phase==='estimated')before=actual;
     else assert(JSON.stringify(actual)===JSON.stringify(before),width+'/'+count+' unstable replacement');
     if(width===1440&&count===15)assert(new Set(actual.slice(1).map(r=>r[1])).size===3,'15 clips must form 3 rows');
    }
    checks.push(width+'px / '+count+' / '+phase+': PASS');
   }
  }
  frame.style.height=doc.documentElement.scrollHeight+'px';
 }
 report.textContent=checks.join('\\n')+'\\nAll '+checks.length+' checks passed.';
 }catch(error){report.textContent=checks.join('\\n')+'\\nFAIL: '+error.message;}
};
</script>`;
const output=process.argv[2];if(!output)throw Error('Provide an output HTML path');fs.writeFileSync(output,html);console.log(output);
