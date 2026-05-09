const { google } = require("googleapis");
const prisma = require("../../lib/prisma");
const { encryptText } = require("../../utils/encrypt");
const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
} = require("../../config/env");

const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly"
];

function createOAuthClient() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

function getYouTubeAuthUrl() {
  const oauth2Client = createOAuthClient();

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: YOUTUBE_SCOPES
  });
}

async function exchangeCodeForTokens(code) {
  const oauth2Client = createOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  return { oauth2Client, tokens };
}

async function fetchYouTubeChannel(tokens) {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials(tokens);

  const youtube = google.youtube({
    version: "v3",
    auth: oauth2Client
  });

  const response = await youtube.channels.list({
    part: ["snippet"],
    mine: true
  });

  const item = response.data.items?.[0];
  if (!item) {
    throw new Error("No YouTube channel found for this Google account");
  }

  return {
    channelId: item.id,
    title: item.snippet?.title || "Untitled Channel",
    raw: item
  };
}

async function saveConnectedYouTubeAccount({ userId, tokens, channel }) {
  const expiresAt = tokens.expiry_date
    ? new Date(tokens.expiry_date)
    : null;

  const existing = await prisma.socialAccount.findFirst({
    where: {
      userId,
      platform: "YOUTUBE",
      platformUserId: channel.channelId
    }
  });

  if (existing) {
    return prisma.socialAccount.update({
      where: { id: existing.id },
      data: {
        platformUsername: channel.title,
        accessTokenEncrypted: encryptText(tokens.access_token || ""),
        refreshTokenEncrypted: tokens.refresh_token
          ? encryptText(tokens.refresh_token)
          : existing.refreshTokenEncrypted,
        tokenExpiresAt: expiresAt,
        metaJson: channel.raw
      }
    });
  }

  return prisma.socialAccount.create({
    data: {
      userId,
      platform: "YOUTUBE",
      platformUserId: channel.channelId,
      platformUsername: channel.title,
      accessTokenEncrypted: encryptText(tokens.access_token || ""),
      refreshTokenEncrypted: tokens.refresh_token
        ? encryptText(tokens.refresh_token)
        : null,
      tokenExpiresAt: expiresAt,
      metaJson: channel.raw
    }
  });
}

module.exports = {
  getYouTubeAuthUrl,
  exchangeCodeForTokens,
  fetchYouTubeChannel,
  saveConnectedYouTubeAccount,
  createOAuthClient
};