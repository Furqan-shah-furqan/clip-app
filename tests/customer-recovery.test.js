const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const http=require('node:http');
const tokens=new Map();
const prismaPath=require.resolve('../server/lib/prisma');
require.cache[prismaPath]={id:prismaPath,filename:prismaPath,loaded:true,exports:{
 user:{findUnique:async({where})=>where.email==='customer@example.com'?{id:'customer',passwordHash:'existing-hash'}:null},
 recoveryToken:{create:async({data})=>tokens.set(data.tokenHash,data),deleteMany:async({where})=>tokens.delete(where.tokenHash)}
}};
const {router}=require('../server/routes/customer');
const {hash}=require('../server/middleware/customerAuth');
test('Brevo recovery uses verified sender, private single-recipient payload and cleans up rejected/failed sends',async()=>{
 const keys=['CUSTOMER_AUTH_ENABLED','APP_URL','RENDER_EXTERNAL_URL','BREVO_API_KEY','BREVO_SENDER_EMAIL','BREVO_SENDER_NAME','RESEND_API_KEY','AUTH_EMAIL_FROM'];
 const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 Object.assign(process.env,{CUSTOMER_AUTH_ENABLED:'true',APP_URL:'https://clipflow.example',BREVO_API_KEY:'test-brevo-key',BREVO_SENDER_EMAIL:'sender@example.com',BREVO_SENDER_NAME:'ClipFlow Studio',RESEND_API_KEY:'test-resend-key',AUTH_EMAIL_FROM:'old@example.com'});
 delete process.env.RENDER_EXTERNAL_URL;
 const nativeFetch=global.fetch;
 let sent,headers,signal,delivery='accepted',sendCount=0;
 global.fetch=async(url,options)=>{
  if(url==='https://api.resend.com/emails')throw Error('Unexpected provider fallback');
  if(url!=='https://api.brevo.com/v3/smtp/email')return nativeFetch(url,options);
  sendCount++;sent=JSON.parse(options.body);headers=options.headers;signal=options.signal;
  if(delivery==='network')throw Error('Connection interrupted');
  return {ok:delivery==='accepted',status:delivery==='accepted'?201:403};
 };
 const app=express();app.use(express.json());app.use('/api/customer',router);
 const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const forgot=email=>nativeFetch(base+'/api/customer/forgot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
 try{
  assert.equal((await(await nativeFetch(base+'/api/customer/me')).json()).recoveryAvailable,true);
  const success=await forgot('customer@example.com');assert.equal(success.status,200);const generic=await success.json();
  assert.deepEqual(sent.sender,{email:'sender@example.com',name:'ClipFlow Studio'});assert.deepEqual(sent.to,[{email:'customer@example.com'}]);
  assert.equal(headers['api-key'],'test-brevo-key');assert.equal(headers.Authorization,undefined);assert.equal(signal.aborted,false);
  const link=sent.textContent.match(/https:\/\/[^\s]+/)[0];assert.match(sent.htmlContent,/href="https:\/\/clipflow.example\/account.html#reset=/);
  const token=link.split('#reset=')[1];assert.equal(token.length,43);assert.equal(tokens.has(token),false);assert.equal(tokens.has(hash(token)),true);
  assert.ok(tokens.get(hash(token)).expiresAt>Date.now());
  const before=sendCount;assert.deepEqual(await(await forgot('unknown@example.com')).json(),generic);assert.equal(sendCount,before);
  for(const failure of ['rejected','network']){
   delivery=failure;assert.deepEqual(await(await forgot('customer@example.com')).json(),generic);
   const failed=sent.textContent.split('#reset=')[1].split('\n')[0];assert.equal(tokens.has(hash(failed)),false);
  }
  // A partial Brevo setup disables recovery instead of leaking reset links to the old provider.
  delete process.env.BREVO_SENDER_EMAIL;
  assert.equal((await(await nativeFetch(base+'/api/customer/me')).json()).recoveryAvailable,false);
  assert.equal((await forgot('customer@example.com')).status,503);
 }finally{
  global.fetch=nativeFetch;await new Promise(resolve=>server.close(resolve));
  for(const key of keys)if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];
 }
});
