const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const http=require('node:http');
const prismaPath=require.resolve('../server/lib/prisma');
const users=new Map(),sessions=new Map(),resources=new Map(),recovery=new Map();
const accounts=[{id:'account-a',userId:'user-0',platform:'YOUTUBE'},{id:'account-b',userId:'user-1',platform:'INSTAGRAM'}];
const posts=[{id:'post-a',userId:'user-0'},{id:'post-b',userId:'user-1'}];
const prisma={
 socialAccount:{findMany:async({where})=>accounts.filter(x=>x.userId===where.userId),findFirst:async({where})=>accounts.find(x=>x.id===where.id&&x.userId===where.userId),delete:async({where})=>{const index=accounts.findIndex(x=>x.id===where.id);accounts.splice(index,1);}},
 scheduledPost:{updateMany:async()=>({count:0}),findFirst:async({where})=>posts.find(x=>x.id===where.id&&x.userId===where.userId)},
 user:{create:async({data})=>{if([...users.values()].some(u=>u.email===data.email))throw Object.assign(new Error('duplicate'),{code:'P2002'});const user={id:'user-'+users.size,...data};users.set(user.id,user);return user;},findUnique:async({where})=>[...users.values()].find(u=>where.id ? u.id===where.id : u.email===where.email),update:async({where,data})=>Object.assign(users.get(where.id),data)},
 customerSession:{create:async({data})=>{sessions.set(data.tokenHash,data);return data;},findUnique:async({where})=>{const s=sessions.get(where.tokenHash);return s?{...s,user:users.get(s.userId)}:null;},deleteMany:async({where})=>{let count=0;for(const [k,v] of sessions)if((where.tokenHash&&k===where.tokenHash)||(where.userId&&v.userId===where.userId)){sessions.delete(k);count++;}return {count};}},
 customerResource:{findFirst:async({where})=>[...resources.values()].find(r=>r.userId===where.userId&&(r.key===where.key||where.key?.in?.includes(r.key))),createMany:async({data})=>data.forEach(r=>{if(!resources.has(r.key))resources.set(r.key,r);})},
 recoveryToken:{create:async({data})=>{recovery.set(data.tokenHash,data);return data;},findUnique:async({where})=>recovery.get(where.tokenHash),deleteMany:async({where})=>{let count=0;for(const [k,v] of recovery)if((where.tokenHash&&k===where.tokenHash&&(!where.expiresAt||v.expiresAt>where.expiresAt.gt))||(where.userId&&v.userId===where.userId)){recovery.delete(k);count++;}return {count};}},
 $queryRaw:async(strings,userId)=>[users.get(userId)].filter(Boolean),
 $transaction:async fn=>fn(prisma),
 generationJob:{create:async options=>options,findMany:async()=>[],findFirst:async()=>null},
};
require.cache[prismaPath]={id:prismaPath,filename:prismaPath,loaded:true,exports:prisma};
const schedulePath=require.resolve('../server/services/scheduleDbService');
require.cache[schedulePath]={id:schedulePath,filename:schedulePath,loaded:true,exports:{listScheduledPosts:async userId=>posts.filter(x=>x.userId===userId),getScheduledPostById:async id=>posts.find(x=>x.id===id)}};
const publishingPath=require.resolve('../server/services/publishing/runScheduledPost');
require.cache[publishingPath]={id:publishingPath,filename:publishingPath,loaded:true,exports:{}};
const auth=require('../server/middleware/customerAuth');
const {router,passwordHash,verify}=require('../server/routes/customer');
const {guard,guardFile,mediaKeys}=require('../server/middleware/customerResources');
test('customer registration, session privacy, logout, CSRF and cross-customer resources',async()=>{
 process.env.CUSTOMER_AUTH_ENABLED='true';process.env.APP_URL='http://localhost:3000';delete process.env.RENDER_EXTERNAL_URL;
 const app=express();app.use(express.json());app.use(auth.loadSession);app.use(auth.sameOrigin);app.use('/api/customer',router);
 app.use('/api/accounts',require('../server/routes/accounts'));
 app.use('/api/schedules',require('../server/routes/schedules'));
 app.post('/api/private',auth.requireCustomer,guard,(req,res)=>res.json({owner:req.user.id}));
 app.get('/exports/:filename',guardFile,(req,res)=>res.json({success:true}));
 app.use((e,req,res,next)=>res.status(500).json({error:e.message}));
 const server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const request=(path,body,cookie,origin='http://localhost:3000')=>fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
 try{
  const a=await request('/api/customer/register',{email:'a@example.com',password:'a secure password',name:'A'});assert.equal(a.status,201);const ca=a.headers.get('set-cookie').split(';')[0];assert.match(a.headers.get('set-cookie'),/HttpOnly/);
  const b=await request('/api/customer/register',{email:'b@example.com',password:'another secure password',name:'B'});assert.equal(b.status,201);const cb=b.headers.get('set-cookie').split(';')[0];
  assert.equal((await(await request('/api/customer/me',null,ca)).json()).user.email,'a@example.com');
  assert.deepEqual((await(await request('/api/accounts',null,ca)).json()).accounts.map(x=>x.id),['account-a']);
  assert.deepEqual((await(await request('/api/accounts',null,cb)).json()).accounts.map(x=>x.id),['account-b']);
  assert.equal((await request('/api/schedules/post-a',null,cb)).status,404);
  assert.equal((await request('/api/schedules/post-b',null,ca)).status,404);
  assert.equal((await request('/api/schedules/post-a',null,ca)).status,200);
  const disconnect=(id,cookie)=>fetch(base+'/api/accounts/'+id,{method:'DELETE',headers:{Origin:'http://localhost:3000',Cookie:cookie}});
  assert.equal((await disconnect('account-a',cb)).status,404);
  assert.equal((await disconnect('account-a',ca)).status,200);
  assert.deepEqual((await(await request('/api/accounts',null,cb)).json()).accounts.map(x=>x.id),['account-b']);
  resources.set('private.mp4',{key:'private.mp4',userId:'user-0'});
  assert.equal((await request('/api/private',{videoPath:'/another-owner/private.mp4'},ca)).status,404);
  assert.equal((await request('/api/private',{videoPath:'private.mp4'},ca)).status,200);
  assert.equal((await request('/api/private',{videoPath:'private.mp4'},cb)).status,404);
  assert.equal((await request('/exports/private.mp4',null,cb)).status,404);
  assert.equal((await request('/api/private',{},ca,'https://evil.example')).status,403);
  assert.equal((await request('/api/private',{})).status,401);
  assert.equal((await request('/api/customer/login',{email:'a@example.com',password:'wrong password'})).status,401);
  const encoded=await passwordHash('a secure password');assert.ok(await verify('a secure password',encoded));assert.equal(await verify('different',encoded),false);
  assert.equal(mediaKeys({videoUrl:'https://example.com/a/private.mp4'}).includes('private.mp4'),false);
  process.env.RESEND_API_KEY='test-only';process.env.AUTH_EMAIL_FROM='test@example.com';
  const nativeFetch=global.fetch;let sent, deliveryOk=true;
  global.fetch=async(url,options)=>url==='https://api.resend.com/emails'?(sent=JSON.parse(options.body),{ok:deliveryOk,status:deliveryOk?200:403}):nativeFetch(url,options);
  try {
    assert.equal((await request('/api/customer/forgot',{email:'a@example.com'})).status,200);
    deliveryOk=false;
    assert.equal((await request('/api/customer/forgot',{email:'a@example.com'})).status,200);
    const failedToken=sent.text.match(/#reset=([^\s]+)/)[1];
    assert.equal(recovery.has(auth.hash(failedToken)),false);
    deliveryOk=true;
    assert.equal((await request('/api/customer/forgot',{email:'a@example.com'})).status,200);
    const token=sent.text.match(/#reset=([^\s]+)/)[1];
    const reset=await request('/api/customer/reset',{token,password:'new secure password'});assert.equal(reset.status,200);
    assert.equal((await request('/api/customer/reset',{token,password:'new secure password'})).status,400);
    assert.equal((await request('/api/private',{},ca)).status,401);
    assert.equal((await request('/api/customer/login',{email:'a@example.com',password:'new secure password'})).status,200);
    assert.equal((await request('/api/customer/login',{email:'a@example.com',password:'a secure password'})).status,401);
  } finally {global.fetch=nativeFetch;delete process.env.RESEND_API_KEY;delete process.env.AUTH_EMAIL_FROM;}
  await request('/api/customer/logout',{},ca);assert.equal((await request('/api/private',{},ca)).status,401);
 }finally{await new Promise(r=>server.close(r));delete process.env.CUSTOMER_AUTH_ENABLED;}
});
test('expired sessions do not authorize customer requests',async()=>{
 process.env.CUSTOMER_AUTH_ENABLED='true';
 const token='expired-token';sessions.set(auth.hash(token),{tokenHash:auth.hash(token),userId:'user-0',expiresAt:new Date(0)});
 const req={headers:{cookie:'clipflow_session='+token}};await new Promise((resolve,reject)=>auth.loadSession(req,{},e=>e?reject(e):resolve()));assert.equal(req.user,undefined);delete process.env.CUSTOMER_AUTH_ENABLED;
});

test('deletion lock rejects new generation without changing job options',async()=>{
 process.env.CUSTOMER_AUTH_ENABLED='true';
 const user=users.get('user-0');const options={data:{userId:user.id,requestJson:{maxClips:6}}};
 try{assert.equal(await auth.createOwnedGenerationJob(options),options);user.deletionRequestedAt=new Date();await assert.rejects(auth.createOwnedGenerationJob(options),/deletion is in progress/);}finally{delete user.deletionRequestedAt;delete process.env.CUSTOMER_AUTH_ENABLED;}
});
