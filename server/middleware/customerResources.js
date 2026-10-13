const path = require('node:path');
const prisma = require('../lib/prisma');
const {enabled,asyncHandler} = require('./customerAuth');
const mediaFields = new Set(['filePath','inputPath','localPath','outputPath','sourcePath','clipPath','relativePath','storagePath','inputPaths','videoPath','videoUrl','previewUrl','downloadUrl','storageUrl','renderedVideoUrl','trackUrl','vttPath','url','fileName','filename']);
function mediaKeys(value, field = '', output = new Set()) {
  if (Array.isArray(value)) value.forEach(v => mediaKeys(v,field,output));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([k,v]) => mediaKeys(v,k,output));
  else if (typeof value === 'string' && mediaFields.has(field) && /\.(mp4|mov|webm|mkv|wav|mp3|srt|vtt|ass)(?:[?#]|$)/i.test(value)) {
    output.add(value);
    if (!/^https?:\/\//i.test(value)) {
      try {output.add(path.basename(new URL(value,'https://local.invalid').pathname));} catch {}
      output.add(path.basename(value));
    }
  }
  return [...output].filter(Boolean);
}
async function ownMedia(userId, value) {
  let key = String(value || "");
  if (!/^https?:\/\//i.test(key) && key.startsWith("/") && !key.startsWith("/api/") && !/^\/(uploads|exports|captions|clips|renders|public)\//.test(key)) key = path.normalize(key);
  const keys = [key];
  if (!keys.length) return false;
  const resource = await prisma.customerResource.findFirst({where:{userId,key:{in:keys}}});
  if (resource) return true;
  // Worker result records retain their existing structure; ownership lives on GenerationJob.
  const jobs = await prisma.generationJob.findMany({where:{userId,status:'COMPLETED'},select:{resultJson:true}});
  return jobs.some(job => mediaKeys(job.resultJson).some(k=>keys.includes(k)));
}
const guard = asyncHandler(async (req,res,next) => {
  if (!enabled() || ["/health","/version"].includes(req.path)) return next();
  res.set('Cache-Control','private, no-store');
  if (!req.user) return res.status(401).json({error:'Sign in to continue'});
  if (/\/(diag|debug|upload-cookies|cookies-status)(\/|$)/.test(req.path)) return res.status(404).end();
  for (const value of mediaKeys(req.body)) {
    if (!await ownMedia(req.user.id,value)) return res.status(404).json({error:'Video not found in your account'});
  }
  const jobMatch = req.path.match(/\/(?:status|generation-jobs)\/([^/]+)/);
  if (jobMatch) {
    const job = await prisma.generationJob.findFirst({where:{id:jobMatch[1],userId:req.user.id}});
    if (!job) return res.status(404).json({error:'Job not found'});
  }
  const captionMatch = req.path.match(/\/(?:jobs|burn-jobs)\/([^/]+)/);
  if (captionMatch && !await prisma.customerResource.findFirst({where:{key:`job:${captionMatch[1]}`,userId:req.user.id}})) return res.status(404).json({error:'Job not found'});
  const send = res.json.bind(res);
  res.json = data => {
    data = JSON.parse(JSON.stringify(data, (key,value)=> /^(accessTokenEncrypted|refreshTokenEncrypted|passwordHash|tokenHash|oauthNonce)$/.test(key) ? undefined : value));
    const keys = mediaKeys(data);
    if (data?.jobId) keys.push(`job:${data.jobId}`);
    if (!keys.length || res.statusCode >= 400) return send(data);
    prisma.customerResource.createMany({data:keys.map(key=>({key,userId:req.user.id})),skipDuplicates:true}).then(()=>send(data)).catch(next);
    return res;
  };
  next();
});
const guardFile = asyncHandler(async (req,res,next) => {
  if (!enabled()) return next();
  res.set('Cache-Control','private, no-store');
  if (!req.user || !await ownMedia(req.user.id,req.params.filename || req.params.fileName || req.originalUrl.split("?")[0])) return res.status(404).end();
  next();
});
module.exports = {guard,guardFile,mediaKeys,ownMedia};
