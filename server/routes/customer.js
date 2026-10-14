const express = require('express');
const {randomBytes, scrypt: scryptCallback, timingSafeEqual} = require('node:crypto');
const {promisify} = require('node:util');
const prisma = require('../lib/prisma');
const {enabled, hash, asyncHandler, createSession, tokenCookie} = require('../middleware/customerAuth');
const scrypt = promisify(scryptCallback);
const router = express.Router();
const attempts = new Map();
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!enabled()) return res.status(503).json({error: 'Customer accounts are not enabled yet'});
  if (req.method !== 'GET') {
    // ponytail: per-process limit; use a shared limiter when deploying multiple web instances.
    const key = req.ip;
    const entry = attempts.get(key);
    const now = Date.now();
    if (!entry || entry.until < now) attempts.set(key, {count: 1, until: now + 600000});
    else if (++entry.count > 20) return res.status(429).json({error: 'Too many attempts. Try again in ten minutes.'});
    if (attempts.size > 10000) for (const [k,v] of attempts) if (v.until < now) attempts.delete(k);
  }
  next();
});
function credentials(body = {}) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 12 || password.length > 128) throw Object.assign(new Error('Use a valid email and a password of 12–128 characters.'), {status: 400});
  return {email, password};
}
async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}
async function verify(password, encoded) {
  const [salt, digest] = (encoded || '0000000000000000:' + '0'.repeat(128)).split(':');
  const actual = await scrypt(password, salt, 64);
  const expected = Buffer.from(digest, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
router.get('/me', (req,res) => res.json({user: req.user || null, recoveryAvailable: Boolean(process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM)}));
router.use((req,res,next)=>{if(req.user?.deleting && !['/me','/logout','/delete-account'].includes(req.path))return res.status(423).json({error:'Account deletion is in progress.'});next();});
router.post('/register', asyncHandler(async (req,res) => {
  const {email,password} = credentials(req.body);
  const user = await prisma.user.create({data: {email, passwordHash: await passwordHash(password), name: String(req.body.name || '').trim().slice(0,80)}});
  await createSession(req,res,user.id);
  res.status(201).json({user: {id:user.id,email:user.email,name:user.name}});
}));
router.post('/login', asyncHandler(async (req,res) => {
  const {email,password} = credentials(req.body);
  const user = await prisma.user.findUnique({where:{email}});
  const valid = await verify(password,user?.passwordHash);
  if (!valid || !user?.passwordHash) return res.status(401).json({error:'Email or password is incorrect'});
  await createSession(req,res,user.id);
  res.json({user:{id:user.id,email:user.email,name:user.name}});
}));
router.post('/logout', asyncHandler(async (req,res) => {
  await prisma.customerSession.deleteMany({where:{tokenHash:hash(tokenCookie(req))}});
  res.clearCookie('clipflow_session',{path:'/'}).json({success:true});
}));
router.post('/forgot', asyncHandler(async (req,res) => {
  if (!process.env.RESEND_API_KEY || !process.env.AUTH_EMAIL_FROM) return res.status(503).json({error:'Password recovery email is not configured. Contact support.'});
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = await prisma.user.findUnique({where:{email}});
  if (user?.passwordHash) {
    const token = randomBytes(32).toString('base64url');
    await prisma.recoveryToken.create({data:{tokenHash:hash(token),userId:user.id,expiresAt:new Date(Date.now()+1800000)}});
    const origin = new URL(process.env.RENDER_EXTERNAL_URL || process.env.APP_URL).origin;
    try {
    const response = await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.AUTH_EMAIL_FROM,to:[email],subject:'Reset your ClipFlow password',text:`Reset your password within 30 minutes: ${origin}/account.html#reset=${token}\nIgnore this email if you did not request it.`}),signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw Object.assign(new Error('Email provider rejected recovery request'), {providerStatus:response.status});
    } catch (error) {
      await prisma.recoveryToken.deleteMany({where:{tokenHash:hash(token)}});
      console.error('Recovery email delivery failed:', error.providerStatus || 'connection error');
    }
  }
  res.json({message:'If this email has an account, a recovery link will be sent.'});
}));
router.post('/reset', asyncHandler(async (req,res) => {
  const password = String(req.body.password || '');
  if (password.length < 12 || password.length > 128) return res.status(400).json({error:'Use a password of 12–128 characters.'});
  const tokenHash = hash(String(req.body.token || ''));
  const encoded = await passwordHash(password);
  await prisma.$transaction(async tx => {
    const token = await tx.recoveryToken.findUnique({where:{tokenHash}});
    if (!token || token.expiresAt < new Date()) throw Object.assign(new Error('Recovery link is invalid or expired'),{status:400});
    const removed = await tx.recoveryToken.deleteMany({where:{tokenHash,expiresAt:{gt:new Date()}}});
    if (removed.count !== 1) throw Object.assign(new Error('Recovery link already used'),{status:400});
    await tx.user.update({where:{id:token.userId},data:{passwordHash:encoded}});
    await tx.customerSession.deleteMany({where:{userId:token.userId}});
    await tx.recoveryToken.deleteMany({where:{userId:token.userId}});
  });
  res.json({message:'Password updated. Sign in again.'});
}));
router.post('/delete-account', asyncHandler(async(req,res)=>{
  if (!req.user) return res.status(401).json({error:'Sign in to delete your account'});
  if (req.body.confirmation !== 'DELETE') return res.status(400).json({error:'Confirm account deletion'});
  if (typeof req.body.password !== 'string' || req.body.password.length > 128) return res.status(400).json({error:'Enter your password'});
  const user=await prisma.user.findUnique({where:{id:req.user.id}});
  if (!user?.passwordHash || !await verify(String(req.body.password||''),user.passwordHash)) return res.status(401).json({error:'Password is incorrect'});
  await require('../services/customerDeletionService').deleteCustomer(req.user.id);
  res.clearCookie('clipflow_session',{path:'/'}).json({success:true});
}));
router.use((error,req,res,next)=>{console.error('Customer auth error:',error.code || error.message);res.status(error.status || (error.code === 'P2002' ? 409 : 500)).json({error:error.status ? error.message : error.code === 'P2002' ? 'Unable to create account. Try signing in or recovering your password.' : 'Account request failed. Please try again.'});});
module.exports = {router,passwordHash,verify,credentials};
