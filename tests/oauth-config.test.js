const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
test('OAuth callbacks use the live Render service and preserve explicit custom-domain callbacks',()=>{
  const source='console.log(JSON.stringify(require("./server/config/env")))';
  const run=(overrides)=>{
    const r=spawnSync(process.execPath,['-e',source],{cwd:path.join(__dirname,'..'),encoding:'utf8',env:{...process.env,DATABASE_URL:'test',REDIS_URL:'test',APP_URL:'https://old.onrender.com',RENDER_EXTERNAL_URL:'https://clip-clipflow-studio.onrender.com',GOOGLE_REDIRECT_URI:'https://old.onrender.com/api/auth/youtube/callback',INSTAGRAM_REDIRECT_URI:'',...overrides}});
    assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout.trim().split('\n').pop());
  };
  const env=run({});
  assert.equal(env.GOOGLE_REDIRECT_URI,'https://clip-clipflow-studio.onrender.com/api/auth/youtube/callback');
  assert.equal(env.INSTAGRAM_REDIRECT_URI,'https://clip-clipflow-studio.onrender.com/api/auth/instagram/callback');
  assert.equal(run({GOOGLE_REDIRECT_URI:'https://custom.example/api/auth/youtube/callback'}).GOOGLE_REDIRECT_URI,'https://custom.example/api/auth/youtube/callback');
});
test('OAuth status pages escape provider text and return links',()=>{
  const fs=require('node:fs');
  const source=fs.readFileSync(path.join(__dirname,'../server/routes/auth.js'),'utf8');
  const start=source.indexOf('function buildSafeReturnTo('),end=source.indexOf('async function startYouTubeOAuth(',start);
  const render=new Function(source.slice(start,end)+'; return sendConnectedHtml;')();
  const html=render({title:'<script>bad</script>',message:'<img src=x onerror=alert(1)>',returnTo:'/publish.html?x=" onload="alert(1)'});
  assert.equal(html.includes('<script>bad'),false);
  assert.equal(html.includes('<img src='),false);
  assert.equal(html.includes('x=" onload='),false);
});
test('both OAuth callbacks ensure the demo owner before saving accounts, without overwriting it', async () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const source = fs.readFileSync(path.join(__dirname, '../server/routes/auth.js'), 'utf8');
  const callbacks = {};
  const users = new Map();
  const prisma = {user: {upsert: async ({where, update, create}) => {
    assert.deepEqual(Object.keys(update), []);
    if (!users.has(where.id)) users.set(where.id, {...create});
    return users.get(where.id);
  }}};
  let saves = 0;
  const save = async ({userId}) => {
    assert.ok(users.has(userId), 'foreign key owner must exist before account save');
    saves++;
    return {id: 'account'};
  };
  const services = {
    createOAuthClient: () => ({}),
    exchangeCodeForTokens: async () => ({tokens: {}}),
    fetchYouTubeChannel: async () => ({title: 'channel'}),
    saveConnectedYouTubeAccount: save,
    getInstagramAuthUrl: () => '', decodeInstagramState: () => ({}),
    exchangeInstagramCodeForLongLivedToken: async () => ({}),
    fetchInstagramBusinessProfile: async () => ({username: 'owner'}),
    saveConnectedInstagramAccount: save,
  };
  vm.runInNewContext(source, {Buffer, console, module: {exports: {}}, require: name => {
    if (name === 'node:crypto') return require('node:crypto');
    if (name === '../middleware/customerAuth') return {enabled:()=>false,requireCustomer:(req,res,next)=>next(),asyncHandler:fn=>fn};
    if (name === 'express') return {Router: () => ({use:()=>{},get: (route, handler) => {callbacks[route] = handler;}})};
    if (name === '../lib/prisma') return prisma;
    return services;
  }});
  const res = {send: () => {}, status: code => {throw new Error(`Unexpected HTTP ${code}`);}};
  for (const route of ['/instagram/callback', '/youtube/callback']) {
    await callbacks[route]({query: {code: 'test'}}, res);
  }
  const owner = users.values().next().value;
  owner.name = 'Existing owner';
  await callbacks['/instagram/callback']({query: {code: 'test'}}, res);
  assert.equal(users.size, 1);
  assert.equal(owner.name, 'Existing owner');
  assert.equal(saves, 3);
});
test('customer OAuth is session-bound, expires, consumes once and never saves to demo owner',async()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const routes={};let session={tokenHash:'session',oauthNonce:null,oauthExpiresAt:null},saved=0;
 const prisma={customerSession:{update:async({data})=>Object.assign(session,data),updateMany:async({where,data})=>{if(where.tokenHash!==session.tokenHash||where.oauthNonce!==session.oauthNonce||session.oauthExpiresAt<=new Date())return {count:0};Object.assign(session,data);return {count:1};}}};
 let state;
 const services={createOAuthClient:()=>({generateAuthUrl:args=>{state=args.state;return 'https://accounts.google.com/auth';}}),exchangeCodeForTokens:async()=>({tokens:{}}),fetchYouTubeChannel:async()=>({title:'channel'}),saveConnectedYouTubeAccount:async({userId})=>{assert.equal(userId,'customer-a');saved++;return {id:'account'};}};
 const source=fs.readFileSync(require('node:path').join(__dirname,'../server/routes/auth.js'),'utf8');
 vm.runInNewContext(source,{Buffer,console,module:{exports:{}},require:name=>name==='node:crypto'?require(name):name==='express'?{Router:()=>({use:()=>{},get:(route,fn)=>{routes[route]=fn;}})}:name==='../lib/prisma'?prisma:name==='../middleware/customerAuth'?{enabled:()=>true,requireCustomer:()=>{},asyncHandler:fn=>fn}:services});
 const req={query:{},user:{id:'customer-a'},customerSession:session};
 await routes['/youtube'](req,{redirect:()=>{},status:()=>{throw new Error('start failed');}});
 assert.ok(JSON.parse(Buffer.from(state,'base64url')).nonce);
 const res={send:()=>{},status:()=>({send:()=>{}})};
 req.query={code:'code',state};await routes['/youtube/callback'](req,res);assert.equal(saved,1);
 await routes['/youtube/callback'](req,res);assert.equal(saved,1);
 await routes['/youtube']({...req,query:{}},{redirect:()=>{}});session.oauthExpiresAt=new Date(0);
 await routes['/youtube/callback']({...req,query:{code:'code',state}},res);assert.equal(saved,1);
});
