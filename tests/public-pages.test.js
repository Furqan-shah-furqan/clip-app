const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const root=path.resolve('.');
test('guest homepage is public while studio, editor and publishing still require a customer',()=>{
 const source=fs.readFileSync('server/server.js','utf8');const start=source.indexOf('app.get(["/index.html", "/captions.html", "/publish.html", "/"]');const end=source.indexOf('app.use("/api",',start);let handler;
 const context={app:{get(paths,fn){handler=fn;}},customerAuth:{enabled:()=>true},rootDir:root,path,fs};vm.runInNewContext(source.slice(start,end),context);
 const response=()=>({set(){return this;},redirect(url){this.redirected=url;},sendFile(file){this.file=file;},send(html){this.html=html;}});
 const guest=response();handler({path:'/'},guest,()=>{});assert.equal(guest.file,path.join(root,'public/welcome.html'));assert.equal(guest.redirected,undefined);
 for(const url of ['/index.html','/captions.html','/publish.html']){const res=response();handler({path:url},res,()=>{});assert.equal(res.redirected,'/account.html');}
 const signed=response();handler({path:'/',user:{id:'customer-a'}},signed,()=>{});assert.match(signed.html,/id="topTabGenerate"/);assert.match(signed.html,/clipflow-customer-id/);assert.doesNotMatch(signed.html,/Current access/);
});
test('public pages have complete accessible navigation and real operator details',()=>{
 for(const name of ['welcome','privacy','terms','support','data-deletion']){
  const html=fs.readFileSync('public/'+name+'.html','utf8');assert.equal((html.match(/<h1>/g)||[]).length,1);assert.match(html,/Furqan Shah/);assert.match(html,/furqanffff6@gmail.com/);assert.match(html,/id="main"/);
  for(const link of html.matchAll(/(?:href|src)="(\/[^"?#]+)(?:[?#][^"]*)?"/g)){if(link[1].startsWith('/api/'))continue;assert.ok(fs.existsSync(path.join(root,'public',link[1])),name+': missing '+link[1]);}
  for(const page of ['privacy','terms','support','data-deletion'])assert.ok(html.includes('/'+page+'.html'));
 }
});
test('public theme works without an account or API request',()=>{
 let dark=true;const button={setAttribute(name,value){this[name]=value;}};const storage=new Map();const context={document:{getElementById:()=>button,documentElement:{classList:{toggle(name,value){dark=value;},contains:()=>dark}}},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}};
 vm.runInNewContext(fs.readFileSync('public/public-site.js','utf8'),context);assert.equal(dark,true);button.onclick();assert.equal(dark,false);assert.equal(button['aria-checked'],'false');assert.equal(storage.get('clipflow-theme'),'light');button.onclick();assert.equal(dark,true);
});
