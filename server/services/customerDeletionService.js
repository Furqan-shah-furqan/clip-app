const fs=require('node:fs');
const path=require('node:path');
const prisma=require('../lib/prisma');
const {rootDir,projectsFile,scratchJobsDir}=require('../utils/paths');
function values(object,output=[]){if(typeof object==='string')output.push(object);else if(Array.isArray(object))object.forEach(value=>values(value,output));else if(object&&typeof object==='object')Object.values(object).forEach(value=>values(value,output));return output;}
function cloudAsset(value){try{const url=new URL(value);const prefix=`/${process.env.CLOUDINARY_CLOUD_NAME}/video/authenticated/`;if(url.protocol!=='https:'||url.hostname!=='res.cloudinary.com'||!url.pathname.startsWith(prefix))return null;const match=url.pathname.slice(prefix.length).match(/^(?:s--[\w-]+--\/)?(?:v\d+\/)?(clipflow\/.+)\.(mp4|mov|webm|mkv)$/i);return match?decodeURIComponent(match[1]):null;}catch{return null;}}
async function deleteCustomer(userId){
 await prisma.$transaction(async tx=>{
  await require('../middleware/customerAuth').lockCustomer(tx,userId);
  const busy=await tx.generationJob.findFirst({where:{userId,status:{notIn:['COMPLETED','FAILED','CANCELLED']}}});
  const publishing=await tx.scheduledPost.findFirst({where:{userId,status:'PROCESSING'}});
  if(busy||publishing)throw Object.assign(Error('Wait for active generation and publishing to finish before deleting your account.'),{status:409});
  // Lock new requests before cleanup. Failed cleanup leaves this marker for a safe retry.
  await tx.user.update({where:{id:userId},data:{deletionRequestedAt:new Date()}});
 });
 const [resources,jobs,clips]=await Promise.all([prisma.customerResource.findMany({where:{userId}}),prisma.generationJob.findMany({where:{userId}}),prisma.clip.findMany({where:{userId}})]);
 const owned=values([resources,jobs,clips]);
 const assets=new Set(owned.map(cloudAsset).filter(Boolean));
 if(assets.size){const {v2:cloudinary}=require('cloudinary');cloudinary.config({cloud_name:process.env.CLOUDINARY_CLOUD_NAME,api_key:process.env.CLOUDINARY_API_KEY,api_secret:process.env.CLOUDINARY_API_SECRET});for(const id of assets){const result=await cloudinary.uploader.destroy(id,{resource_type:'video',type:'authenticated',invalidate:true,timeout:15000});if(!['ok','not found'].includes(result.result))throw Error('Video cleanup failed. Retry account deletion.');}}
 for(const value of new Set(owned)){if(!path.isAbsolute(value))continue;const file=path.resolve(value);const allowed=['uploads','exports','captions','subtitles','renders','public/renders'].some(dir=>file.startsWith(path.resolve(rootDir,dir)+path.sep));if(allowed&&fs.existsSync(file)&&fs.lstatSync(file).isFile())fs.unlinkSync(file);}
 for(const job of jobs){if(!/^[a-zA-Z0-9_-]+$/.test(job.id))continue;fs.rmSync(path.join(scratchJobsDir,job.id),{recursive:true,force:true});}
 if(fs.existsSync(projectsFile)){const projects=JSON.parse(fs.readFileSync(projectsFile,'utf8'));if(!Array.isArray(projects))throw Error('Project cleanup failed. Retry account deletion.');fs.writeFileSync(projectsFile,JSON.stringify(projects.filter(project=>project.userId!==userId),null,2));}
 await prisma.$transaction(async tx=>{await tx.generationJob.deleteMany({where:{userId}});await tx.user.delete({where:{id:userId}});});
}
module.exports={deleteCustomer,cloudAsset};
