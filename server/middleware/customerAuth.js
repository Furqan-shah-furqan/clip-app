const crypto = require('node:crypto');
const prisma = require('../lib/prisma');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const enabled = () => process.env.CUSTOMER_AUTH_ENABLED === 'true';
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
function tokenCookie(req) {
  return (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('clipflow_session='))?.slice(17) || '';
}
const loadSession = asyncHandler(async (req, res, next) => {
  if (!enabled()) return next();
  const token = tokenCookie(req);
  if (token) {
    const session = await prisma.customerSession.findUnique({where: {tokenHash: hash(token)}, include: {user: true}});
    if (session && session.expiresAt > new Date()) {
      req.customerSession = session;
      req.user = {id: session.user.id, email: session.user.email, name: session.user.name};
    }
  }
  next();
});
function requireCustomer(req, res, next) {
  if (!enabled()) return next();
  if (!req.user) return res.status(401).json({error: 'Sign in to continue', code: 'LOGIN_REQUIRED'});
  next();
}
function sameOrigin(req, res, next) {
  if (!enabled() || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  const expected = new URL(process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || 'http://localhost:3000').origin;
  if (origin !== expected) return res.status(403).json({error: 'Request origin rejected'});
  next();
}
async function createSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await prisma.customerSession.create({data: {tokenHash: hash(token), userId, expiresAt: new Date(Date.now() + 7 * 86400000)}});
  res.cookie('clipflow_session', token, {httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 7 * 86400000, path: '/'});
}
module.exports = {enabled, hash, asyncHandler, loadSession, requireCustomer, sameOrigin, createSession, tokenCookie};
