const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const vm=require('node:vm');const {createRequire}=require('node:module');
test('account deletion rejects active jobs, purges only owned media, and preserves retry state on cloud failure',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'customer-delete-'));const uploads=path.join(root,'uploads');fs.mkdirSync(uploads);const own=path.join(uploads,'a.mp4'),other=path.join(uploads,'b.mp4');fs.writeFileSync(own,'A');fs.writeFileSync(other,'B');const projectsFile=path.join(root,'projects.json');fs.writeFileSync(projectsFile,JSON.stringify([{userId:'A'},{userId:'B'}]));
 let busy=true,deleted=false,locked=false,cloudFails=false;const removed=[];
 const url='https://res.cloudinary.com/test/video/authenticated/s--signature--/v123/clipflow/jobs/a/clips/clip-0.mp4';
 const prisma={user:{update:async({where})=>{assert.equal(where.id,'A');locked=true;},delete:async({where})=>{assert.equal(where.id,'A');deleted=true;}},generationJob:{findFirst:async()=>busy?{}:null,findMany:async()=>[{id:'a',resultJson:{storageUrl:url}}],deleteMany:async({where})=>assert.equal(where.userId,'A')},scheduledPost:{findFirst:async()=>null},customerResource:{findMany:async()=>[{key:own,userId:'A'},{key:url,userId:'A'}]},clip:{findMany:async()=>[]},$transaction:async fn=>fn(prisma)};
 const filename=path.resolve('server/services/customerDeletionService.js');const nativeRequire=createRequire(filename);const context=vm.createContext({module:{exports:{}},URL,process:{env:{CLOUDINARY_CLOUD_NAME:'test'}},require(name){if(name==='../lib/prisma')return prisma;if(name==='../middleware/customerAuth')return {lockCustomer:async()=>({id:'A'})};if(name==='../utils/paths')return {rootDir:root,projectsFile,scratchJobsDir:path.join(root,'jobs')};if(name==='cloudinary')return {v2:{config(){},uploader:{destroy:async(id,options)=>{removed.push(id);assert.equal(options.type,'authenticated');if(cloudFails)throw Error('cloud unavailable');return {result:'ok'};}}}};return nativeRequire(name);}});vm.runInContext(fs.readFileSync(filename,'utf8'),context);const {deleteCustomer,cloudAsset}=context.module.exports;
 try{
  assert.equal(cloudAsset(url),'clipflow/jobs/a/clips/clip-0');assert.equal(cloudAsset(url.replace('/test/','/other/')),null);assert.equal(cloudAsset(url.replace('/authenticated/','/upload/')),null);
  await assert.rejects(deleteCustomer('A'),/active generation/);assert.equal(locked,false);
  busy=false;cloudFails=true;await assert.rejects(deleteCustomer('A'),/cloud unavailable/);assert.equal(locked,true);assert.equal(deleted,false);assert.ok(fs.existsSync(own));
  cloudFails=false;await deleteCustomer('A');assert.equal(deleted,true);assert.equal(fs.existsSync(own),false);assert.ok(fs.existsSync(other));assert.deepEqual(JSON.parse(fs.readFileSync(projectsFile)),[{userId:'B'}]);assert.ok(removed.every(id=>id==='clipflow/jobs/a/clips/clip-0'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
