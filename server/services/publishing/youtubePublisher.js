const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const prisma = require("../../lib/prisma");
const { rootDir } = require("../../utils/paths");
const { decryptText, encryptText } = require("../../utils/encrypt");
const { createOAuthClient } = require("../auth/youtubeAuthService");

const YOUTUBE_READY_POLL_ATTEMPTS = 20;
const YOUTUBE_READY_POLL_DELAY_MS = 15000;

const YOUTUBE_UPLOAD_MAX_RETRIES = 3;
const YOUTUBE_UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientYouTubeUploadError(error) {
  const raw = String(
    error?.message ||
      error?.response?.data?.error?.message ||
      error?.response?.data?.error?.errors?.[0]?.message ||
      error?.errors?.[0]?.message ||
      error ||
      ""
  ).toLowerCase();

  return (
    raw.includes("socket hang up") ||
    raw.includes("econnreset") ||
    raw.includes("etimedout") ||
    raw.includes("timeout") ||
    raw.includes("network") ||
    raw.includes("temporarily unavailable") ||
    raw.includes("backend error") ||
    raw.includes("internal error") ||
    raw.includes("rate limit") ||
    raw.includes("quota")
  );
}

function getYouTubeUploadErrorMessage(error) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.error?.errors?.[0]?.message ||
    error?.errors?.[0]?.message ||
    error?.message ||
    "YouTube upload failed."
  );
}

async function uploadYouTubeVideoWithRetry({ youtube, requestBody, videoPath }) {
  let lastError = null;

  for (let attempt = 1; attempt <= YOUTUBE_UPLOAD_MAX_RETRIES; attempt += 1) {
    try {
      const response = await youtube.videos.insert(
        {
          part: ["snippet", "status"],
          requestBody,
          media: {
            body: fs.createReadStream(videoPath),
          },
        },
        {
          timeout: YOUTUBE_UPLOAD_TIMEOUT_MS,
          retry: false,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        },
      );

      return response;
    } catch (error) {
      lastError = error;

      const cleanMessage = getYouTubeUploadErrorMessage(error);
      const canRetry = isTransientYouTubeUploadError(error);

      console.warn(
        `[YouTubeUpload] Attempt ${attempt}/${YOUTUBE_UPLOAD_MAX_RETRIES} failed: ${cleanMessage}`,
      );

      if (!canRetry || attempt >= YOUTUBE_UPLOAD_MAX_RETRIES) {
        throw new Error(cleanMessage);
      }

      await wait(5000 * attempt);
    }
  }

  throw new Error(getYouTubeUploadErrorMessage(lastError));
}

function cleanYouTubeTitle(value = "") {
  const title = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  return (title || "Untitled Clip").slice(0, 100);
}

function cleanYouTubeDescription(caption = "", hashtags = "") {
  return [caption, hashtags]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 5000);
}

function cleanYouTubeVisibility(value = "private") {
  const visibility = String(value || "private").toLowerCase();

  if (["public", "private", "unlisted"].includes(visibility)) {
    return visibility;
  }

  return "private";
}

function cleanYouTubeTags(hashtags = "") {
  return String(hashtags || "")
    .split(/\s+/)
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter(Boolean)
    .slice(0, 25);
}

function resolveClipPath(clip) {
  const rawPath =
    clip?.localPath ||
    clip?.storageUrl ||
    clip?.filePath ||
    clip?.inputPath ||
    clip?.sourcePath;

  if (!rawPath) {
    throw new Error("Clip path is missing");
  }

  return path.isAbsolute(rawPath) ? rawPath : path.join(rootDir, rawPath);
}

async function waitForYouTubeVideoReady(
  youtube,
  videoId,
  expectedPrivacyStatus = "public",
) {
  let latestVideo = null;

  for (let attempt = 1; attempt <= YOUTUBE_READY_POLL_ATTEMPTS; attempt += 1) {
    const response = await youtube.videos.list({
      part: ["snippet", "status", "processingDetails"],
      id: [videoId],
    });

    latestVideo = response.data?.items?.[0] || null;

    const uploadStatus = latestVideo?.status?.uploadStatus || "";
    const privacyStatus = latestVideo?.status?.privacyStatus || "";
    const processingStatus =
      latestVideo?.processingDetails?.processingStatus || "";

    const isFailed =
      uploadStatus === "rejected" ||
      uploadStatus === "failed" ||
      processingStatus === "failed";

    if (isFailed) {
      throw new Error(
        `YouTube failed this upload. uploadStatus=${uploadStatus}, processingStatus=${processingStatus}`,
      );
    }

    const uploadReady =
      uploadStatus === "uploaded" ||
      uploadStatus === "processed" ||
      processingStatus === "succeeded" ||
      processingStatus === "";

    const privacyReady =
      !expectedPrivacyStatus || privacyStatus === expectedPrivacyStatus;

    if (latestVideo && uploadReady && privacyReady) {
      return {
        ready: true,
        attempts: attempt,
        video: latestVideo,
        uploadStatus,
        privacyStatus,
        processingStatus,
      };
    }

    await wait(YOUTUBE_READY_POLL_DELAY_MS);
  }

  return {
    ready: false,
    attempts: YOUTUBE_READY_POLL_ATTEMPTS,
    video: latestVideo,
    uploadStatus: latestVideo?.status?.uploadStatus || "",
    privacyStatus: latestVideo?.status?.privacyStatus || "",
    processingStatus: latestVideo?.processingDetails?.processingStatus || "",
  };
}

async function getFreshYouTubeOAuthClient(account) {
  const oauth2Client = createOAuthClient();

  const accessToken = account.accessTokenEncrypted
    ? decryptText(account.accessTokenEncrypted)
    : "";

  const refreshToken = account.refreshTokenEncrypted
    ? decryptText(account.refreshTokenEncrypted)
    : "";

  oauth2Client.setCredentials({
    access_token: accessToken || undefined,
    refresh_token: refreshToken || undefined,
    expiry_date: account.tokenExpiresAt
      ? new Date(account.tokenExpiresAt).getTime()
      : undefined,
  });

  const expiresSoon =
    !account.tokenExpiresAt ||
    new Date(account.tokenExpiresAt).getTime() <= Date.now() + 60 * 1000;

  if (expiresSoon) {
    if (!refreshToken) {
      throw new Error("Missing YouTube refresh token");
    }

    const { credentials } = await oauth2Client.refreshAccessToken();

    oauth2Client.setCredentials({
      ...oauth2Client.credentials,
      ...credentials,
    });

    await prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        accessTokenEncrypted: encryptText(
          credentials.access_token || accessToken,
        ),
        refreshTokenEncrypted: credentials.refresh_token
          ? encryptText(credentials.refresh_token)
          : account.refreshTokenEncrypted,
        tokenExpiresAt: credentials.expiry_date
          ? new Date(credentials.expiry_date)
          : account.tokenExpiresAt,
      },
    });
  }

  return oauth2Client;
}

async function publishYouTubePost(scheduledPost) {
  if (!scheduledPost?.socialAccount) {
    throw new Error("Missing connected YouTube account");
  }

  if (scheduledPost.socialAccount.platform !== "YOUTUBE") {
    throw new Error("Scheduled post is not linked to a YouTube account");
  }

  if (!scheduledPost?.clip) {
    throw new Error("Missing clip record");
  }

  const videoPath = resolveClipPath(scheduledPost.clip);

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Clip file not found: ${videoPath}`);
  }

  const auth = await getFreshYouTubeOAuthClient(scheduledPost.socialAccount);

  const youtube = google.youtube({
    version: "v3",
    auth,
  });

  const youtubeTitle = cleanYouTubeTitle(
    scheduledPost.title ||
      scheduledPost.clip.title ||
      scheduledPost.clip.fileName ||
      "Untitled Clip",
  );

  const youtubeDescription = cleanYouTubeDescription(
    scheduledPost.caption || "",
    scheduledPost.hashtags || "",
  );

  const youtubeVisibility = cleanYouTubeVisibility(
    scheduledPost.visibility || "public",
  );

  const youtubeTags = cleanYouTubeTags(scheduledPost.hashtags || "");

  const requestPayload = {
    snippet: {
      title: youtubeTitle,
      description: youtubeDescription,
      tags: youtubeTags,
      categoryId: "22",
    },
    status: {
      privacyStatus: youtubeVisibility,
      selfDeclaredMadeForKids: false,
    },
  };

  const response = await uploadYouTubeVideoWithRetry({
    youtube,
    requestBody: requestPayload,
    videoPath,
  });

  const uploadedVideo = response.data;
  const videoId = uploadedVideo.id;

  if (!videoId) {
    throw new Error("YouTube upload completed but no video ID was returned.");
  }

  const readyCheck = await waitForYouTubeVideoReady(
    youtube,
    videoId,
    youtubeVisibility,
  );

  const verifiedVideo = {
    ...uploadedVideo,
    readyCheck,
    status: {
      ...(uploadedVideo.status || {}),
      uploadStatus:
        readyCheck.uploadStatus ||
        uploadedVideo.status?.uploadStatus ||
        "uploaded",
      privacyStatus:
        readyCheck.privacyStatus ||
        uploadedVideo.status?.privacyStatus ||
        youtubeVisibility,
    },
    snippet: {
      ...(uploadedVideo.snippet || {}),
      ...(readyCheck.video?.snippet || {}),
    },
  };

  return {
    platform: "YOUTUBE",
    platformPostId: verifiedVideo.id,
    videoId: verifiedVideo.id,
    url: `https://www.youtube.com/watch?v=${verifiedVideo.id}`,
    studioUrl: `https://studio.youtube.com/video/${verifiedVideo.id}/edit`,
    requestPayload,
    responsePayload: verifiedVideo,
  };
}

module.exports = {
  publishYouTubePost,
};