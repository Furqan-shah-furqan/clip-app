const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {Writable}=require('node:stream');
const {createRequire}=require('node:module');
test('customer media is authenticated and signed; demo delivery stays unchanged',async()=>{
 const filename=path.resolve('server/services/storage/cloudinaryStorageService.js');
 const nativeRequire=createRequire(filename);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'customer-storage-'));
 const file=path.join(directory,'clip.mp4');fs.writeFileSync(file,'test video');
 const env={};let uploaded,signed;
 const cloudinary={config(){},url(id,options){signed={id,options};return 'https://res.cloudinary.com/test/video/authenticated/s--test--/clip.mp4';},uploader:{upload_stream(options,callback){uploaded=options;const stream=new Writable({write(chunk,encoding,done){done();}});stream.on('finish',()=>callback(null,{public_id:'folder/clip',format:'mp4',version:123,secure_url:'https://res.cloudinary.com/test/video/upload/clip.mp4'}));return stream;}}};
 const context=vm.createContext({module:{exports:{}},console:{log(){},error(){}},process:{env},setTimeout,clearTimeout,require(name){if(name==='cloudinary')return {v2:cloudinary};if(name==='../../config/env')return {CLOUDINARY_CLOUD_NAME:'test',CLOUDINARY_API_KEY:'test',CLOUDINARY_API_SECRET:'test'};return nativeRequire(name);}});
 vm.runInContext(fs.readFileSync(filename,'utf8'),context);
 try{
  env.CUSTOMER_AUTH_ENABLED='true';
  const privateResult=await context.module.exports.uploadVideoToCloudinary(file);
  assert.equal(uploaded.type,'authenticated');assert.equal(signed.options.sign_url,true);assert.equal(signed.options.type,'authenticated');assert.equal(signed.options.version,123);assert.match(privateResult.secureUrl,/authenticated\/s--test--/);
  delete env.CUSTOMER_AUTH_ENABLED;
  const demo=await context.module.exports.uploadVideoToCloudinary(file);
  assert.equal(uploaded.type,'upload');assert.match(demo.secureUrl,/video\/upload\//);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
