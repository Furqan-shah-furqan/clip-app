const crypto = require("node:crypto");
const {enabled, asyncHandler, requireCustomer} = require("../middleware/customerAuth");
const express = require("express");
const prisma = require("../lib/prisma");
const { createOAuthClient } = require("../services/auth/youtubeAuthService");

const {
  exchangeCodeForTokens,
  fetchYouTubeChannel,
  saveConnectedYouTubeAccount,
} = require("../services/auth/youtubeAuthService");

const {
  getInstagramAuthUrl,
  decodeInstagramState,
  exchangeInstagramCodeForLongLivedToken,
  fetchInstagramBusinessProfile,
  saveConnectedInstagramAccount,
} = require("../services/auth/instagramAuthService");

const router = express.Router();
router.use(requireCustomer);

const DEMO_USER_ID = "cmo9s5bws0000w01wv1qwpl2b";

// ponytail: this deployment has one demo owner; use session ownership when adding user login.
async function ensureDemoUser() {
  return prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    update: {},
    create: { id: DEMO_USER_ID, name: "ClipFlow Demo Owner" },
  });
}

async function issueNonce(req) {
  if (!enabled()) return undefined;
  const nonce = crypto.randomBytes(32).toString("hex");
  await prisma.customerSession.update({where:{tokenHash:req.customerSession.tokenHash},data:{oauthNonce:nonce,oauthExpiresAt:new Date(Date.now()+600000)}});
  return nonce;
}
async function consumeNonce(req, nonce) {
  if (!enabled()) return;
  if (typeof nonce !== "string" || !nonce) throw new Error("Connection session expired. Try connecting again.");
  const result = await prisma.customerSession.updateMany({where:{tokenHash:req.customerSession.tokenHash,userId:req.user.id,oauthNonce:nonce,oauthExpiresAt:{gt:new Date()}},data:{oauthNonce:null,oauthExpiresAt:null}});
  if (result.count !== 1) throw new Error("Connection session expired. Try connecting again.");
}

function encodeOAuthState(payload = {}) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeOAuthState(value = "") {
  if (!value) return {};

  try {
    return JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

function buildSafeReturnTo(value = "") {
  const fallback = "/publish.html?from=oauth";

  if (!value) return fallback;

  const clean = String(value).trim();

  if (!clean.startsWith("/")) return fallback;
  if (clean.startsWith("//")) return fallback;

  return clean;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
}

function sendConnectedHtml({
  title,
  message,
  returnTo = "/publish.html?from=oauth",
}) {
  const safeReturnTo = escapeHtml(buildSafeReturnTo(returnTo));
  title = escapeHtml(title);
  message = escapeHtml(message);

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="refresh" content="1.5; url=${safeReturnTo}" />
        <title>${title}</title>
      </head>
      <body style="font-family: Arial, sans-serif; padding: 24px;">
        <h2>${title}</h2>
        <p>${message}</p>
        <p>Returning to Publish Center...</p>
        <a href="${safeReturnTo}">Back to Publish Center</a>
      </body>
    </html>
  `;
}

async function startYouTubeOAuth(req, res) {
  try {
    const oauth2Client = createOAuthClient();

    const returnTo = buildSafeReturnTo(req.query.returnTo);

    const state = encodeOAuthState({
      returnTo,
      nonce: await issueNonce(req),
      source: "publish-center",
      platform: "youtube",
      createdAt: Date.now(),
    });

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtube.readonly",
      ],
      state,
    });

    return res.redirect(authUrl);
  } catch (error) {
    console.error("YouTube OAuth start error:", error);

    return res.status(500).send(`
      <h2>YouTube connection failed</h2>
      <p>${escapeHtml(error.message || error)}</p>
      <a href="/publish.html">Back to Publish Center</a>
    `);
  }
}

router.get("/youtube", startYouTubeOAuth);
router.get("/youtube/start", startYouTubeOAuth);

router.get("/youtube/callback", async (req, res) => {
  try {
    const { code, error, state } = req.query || {};

    if (error) {
      return res.status(400).send(`YouTube auth denied: ${error}`);
    }

    if (!code) {
      return res.status(400).send("Missing authorization code");
    }

    const decodedState = decodeOAuthState(state);
    const returnTo = buildSafeReturnTo(decodedState.returnTo);

    await consumeNonce(req, decodedState.nonce);
    const { tokens } = await exchangeCodeForTokens(code);
    const channel = await fetchYouTubeChannel(tokens);

    if (!enabled()) await ensureDemoUser();
    const socialAccount = await saveConnectedYouTubeAccount({
      userId: enabled() ? req.user.id : DEMO_USER_ID,
      tokens,
      channel,
    });

    return res.send(
      sendConnectedHtml({
        title: "YouTube connected successfully",
        message: `Channel connected: ${channel.title}. Account ID: ${socialAccount.id}`,
        returnTo,
      }),
    );
  } catch (error) {
    console.error("YouTube callback error:", error);

    return res.status(500).send(`
      <h2>YouTube auth failed</h2>
      <p>${escapeHtml(error.message || error)}</p>
      <a href="/publish.html">Back to Publish Center</a>
    `);
  }
});

async function startInstagramOAuth(req, res) {
  try {
    const returnTo = buildSafeReturnTo(req.query.returnTo);

    const authUrl = getInstagramAuthUrl({
      returnTo,
      nonce: await issueNonce(req),
    });

    return res.redirect(authUrl);
  } catch (error) {
    console.error("Instagram OAuth start error:", error);

    return res.status(500).send(`
      <h2>Instagram connection failed</h2>
      <p>${escapeHtml(error.message || error)}</p>
      <a href="/publish.html">Back to Publish Center</a>
    `);
  }
}

router.get("/instagram", startInstagramOAuth);
router.get("/instagram/start", startInstagramOAuth);

router.get("/instagram/callback", async (req, res) => {
  try {
    const { code, error, state } = req.query || {};

    if (error) {
      return res.status(400).send(`Instagram auth denied: ${error}`);
    }

    if (!code) {
      return res.status(400).send("Missing Instagram authorization code");
    }

    const decodedState = decodeInstagramState(state);
    const returnTo = buildSafeReturnTo(
      decodedState.returnTo || "/publish.html?from=instagram",
    );

    await consumeNonce(req, decodedState.nonce);
    const token = await exchangeInstagramCodeForLongLivedToken(code);

    const profile = await fetchInstagramBusinessProfile({
      instagramUserId: token.instagramUserId,
      accessToken: token.accessToken,
    });

    if (!enabled()) await ensureDemoUser();
    const socialAccount = await saveConnectedInstagramAccount({
      userId: enabled() ? req.user.id : DEMO_USER_ID,
      token,
      profile,
    });

    return res.send(
      sendConnectedHtml({
        title: "Instagram connected successfully",
        message: `Instagram account connected: @${profile.username}. Account ID: ${socialAccount.id}`,
        returnTo,
      }),
    );
  } catch (error) {
    console.error("Instagram callback error:", error);

    return res.status(500).send(`
      <h2>Instagram auth failed</h2>
      <p>${escapeHtml(error.message || error)}</p>
      <a href="/publish.html">Back to Publish Center</a>
    `);
  }
});


module.exports = router;