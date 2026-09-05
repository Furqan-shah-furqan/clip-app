const axios = require("axios");
const prisma = require("../../lib/prisma");
const { encryptText } = require("../../utils/encrypt");

const {
  INSTAGRAM_APP_ID,
  INSTAGRAM_APP_SECRET,
  INSTAGRAM_REDIRECT_URI,
  INSTAGRAM_GRAPH_BASE_URL,
} = require("../../config/env");

const INSTAGRAM_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_content_publish",
];

function assertInstagramEnvReady() {
  const missing = [];

  if (!INSTAGRAM_APP_ID) missing.push("INSTAGRAM_APP_ID");
  if (!INSTAGRAM_APP_SECRET) missing.push("INSTAGRAM_APP_SECRET");
  if (!INSTAGRAM_REDIRECT_URI) missing.push("INSTAGRAM_REDIRECT_URI");

  if (missing.length) {
    throw new Error(`Missing Instagram env values: ${missing.join(", ")}`);
  }
}

function encodeInstagramState(payload = {}) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeInstagramState(value = "") {
  if (!value) return {};

  try {
    return JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

function getInstagramAuthUrl({ returnTo = "/publish.html?from=instagram" } = {}) {
  assertInstagramEnvReady();

  const state = encodeInstagramState({
    returnTo,
    source: "publish-center",
    platform: "instagram",
    createdAt: Date.now(),
  });

  const params = new URLSearchParams({
    client_id: INSTAGRAM_APP_ID,
    redirect_uri: INSTAGRAM_REDIRECT_URI,
    response_type: "code",
    scope: INSTAGRAM_SCOPES.join(","),
    state,
  });

  return `https://www.facebook.com/v23.0/dialog/oauth?${params.toString()}`;
}

async function exchangeFacebookCodeForLongLivedToken(code) {
  assertInstagramEnvReady();

  const shortTokenResponse = await axios.get(
    `${INSTAGRAM_GRAPH_BASE_URL}/oauth/access_token`,
    {
      params: {
        client_id: INSTAGRAM_APP_ID,
        client_secret: INSTAGRAM_APP_SECRET,
        redirect_uri: INSTAGRAM_REDIRECT_URI,
        code,
      },
      timeout: 30000,
    },
  );

  const shortToken = shortTokenResponse.data?.access_token;

  if (!shortToken) {
    throw new Error("Meta did not return a short-lived access token.");
  }

  const longTokenResponse = await axios.get(
    `${INSTAGRAM_GRAPH_BASE_URL}/oauth/access_token`,
    {
      params: {
        grant_type: "fb_exchange_token",
        client_id: INSTAGRAM_APP_ID,
        client_secret: INSTAGRAM_APP_SECRET,
        fb_exchange_token: shortToken,
      },
      timeout: 30000,
    },
  );

  const longToken = longTokenResponse.data?.access_token;
  const expiresIn = Number(longTokenResponse.data?.expires_in || 0);

  if (!longToken) {
    throw new Error("Meta did not return a long-lived access token.");
  }

  return {
    accessToken: longToken,
    expiresIn,
  };
}

async function fetchInstagramBusinessProfile({ accessToken }) {
  const graphVersion = "v25.0";

  // 1. Check granted permissions
  const permissionsUrl =
    `https://graph.facebook.com/${graphVersion}/me/permissions` +
    `?access_token=${encodeURIComponent(accessToken)}`;

  const permissionsResponse = await fetch(permissionsUrl);
  const permissionsData = await permissionsResponse.json();

  console.log("INSTAGRAM DEBUG - /me/permissions:");
  console.log(JSON.stringify(permissionsData, null, 2));

  // 2. Try normal /me/accounts first
  const pagesUrl =
    `https://graph.facebook.com/${graphVersion}/me/accounts` +
    `?fields=id,name,access_token,tasks,instagram_business_account{id,username,profile_picture_url}` +
    `&access_token=${encodeURIComponent(accessToken)}`;

  const pagesResponse = await fetch(pagesUrl);
  const pagesData = await pagesResponse.json();

  console.log("INSTAGRAM DEBUG - /me/accounts:");
  console.log(JSON.stringify(pagesData, null, 2));

  if (!pagesResponse.ok) {
    throw new Error(
      pagesData?.error?.message || "Failed to fetch Facebook Pages"
    );
  }

  let pages = Array.isArray(pagesData.data) ? pagesData.data : [];

  let pageWithInstagram = pages.find(
    (page) => page.instagram_business_account?.id
  );

  // 3. Fallback: use direct Page ID from .env
  if (!pageWithInstagram && process.env.INSTAGRAM_PAGE_ID) {
    const directPageUrl =
      `https://graph.facebook.com/${graphVersion}/${process.env.INSTAGRAM_PAGE_ID}` +
      `?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url}` +
      `&access_token=${encodeURIComponent(accessToken)}`;

    const directPageResponse = await fetch(directPageUrl);
    const directPageData = await directPageResponse.json();

    console.log("INSTAGRAM DEBUG - direct page fallback:");
    console.log(JSON.stringify(directPageData, null, 2));

    if (!directPageResponse.ok) {
      throw new Error(
        directPageData?.error?.message || "Failed to fetch direct Facebook Page"
      );
    }

    if (directPageData.instagram_business_account?.id) {
      pageWithInstagram = directPageData;
    }
  }

  if (!pageWithInstagram) {
    throw new Error(
      "No Instagram business account found. /me/accounts returned empty and direct Page fallback did not find Instagram."
    );
  }

  const ig = pageWithInstagram.instagram_business_account;

  return {
    id: ig.id,
    username: ig.username || "",
    profilePictureUrl: ig.profile_picture_url || "",
    pageId: pageWithInstagram.id,
    pageName: pageWithInstagram.name,
    pageAccessToken: pageWithInstagram.access_token,
  };
}
async function exchangeInstagramCodeForLongLivedToken(code) {
  return exchangeFacebookCodeForLongLivedToken(code);
}

async function saveConnectedInstagramAccount({ userId, token, profile }) {
  const expiresAt = token.expiresIn
    ? new Date(Date.now() + token.expiresIn * 1000)
    : null;

  const pageAccessToken = profile.facebookPage?.accessToken || token.accessToken;

  const existing = await prisma.socialAccount.findFirst({
    where: {
      userId,
      platform: "INSTAGRAM",
      platformUserId: profile.id,
    },
  });

  const metaJson = {
    profile: {
      id: profile.id,
      username: profile.username,
      name: profile.name,
      profilePictureUrl: profile.profilePictureUrl,
    },
    facebookPage: {
      id: profile.facebookPage?.id || "",
      name: profile.facebookPage?.name || "",
    },
    loginType: "FACEBOOK_LOGIN_FOR_BUSINESS",
    connectedAt: new Date().toISOString(),
  };

  if (existing) {
    return prisma.socialAccount.update({
      where: { id: existing.id },
      data: {
        platformUsername: profile.username,
        accessTokenEncrypted: encryptText(pageAccessToken),
        refreshTokenEncrypted: null,
        tokenExpiresAt: expiresAt,
        metaJson,
      },
    });
  }

  return prisma.socialAccount.create({
    data: {
      userId,
      platform: "INSTAGRAM",
      platformUserId: profile.id,
      platformUsername: profile.username,
      accessTokenEncrypted: encryptText(pageAccessToken),
      refreshTokenEncrypted: null,
      tokenExpiresAt: expiresAt,
      metaJson,
    },
  });
}

module.exports = {
  getInstagramAuthUrl,
  decodeInstagramState,
  exchangeInstagramCodeForLongLivedToken,
  fetchInstagramBusinessProfile,
  saveConnectedInstagramAccount,
};