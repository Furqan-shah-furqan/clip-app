const fs = require("fs");
const path = require("path");
const axios = require("axios");

const { rootDir } = require("../../utils/paths");
const { decryptText } = require("../../utils/encrypt");
const { INSTAGRAM_GRAPH_BASE_URL } = require("../../config/env");
const { uploadVideoToCloudinary } = require("../storage/cloudinaryStorageService");

const INSTAGRAM_CONTAINER_POLL_ATTEMPTS = 30;
const INSTAGRAM_CONTAINER_POLL_DELAY_MS = 10000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanCaption(caption = "", hashtags = "") {
  return [caption, hashtags]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 2200);
}

function isPublicHttpsUrl(value = "") {
  const url = String(value || "").trim();

  return (
    /^https:\/\//i.test(url) &&
    !url.includes("localhost") &&
    !url.includes("127.0.0.1")
  );
}

function getExistingPublicVideoUrl(clip = {}) {
  const candidates = [
    clip.storageUrl,
    clip.publicUrl,
    clip.cloudinaryUrl,
    clip.videoUrl,
    clip.downloadUrl,
    clip.previewUrl,
    clip.url,
    clip.directUrl,
    clip.assetUrl,
  ];

  return candidates.find((candidate) => isPublicHttpsUrl(candidate)) || "";
}

function resolveLocalClipPath(clip = {}) {
  const candidates = [
    clip.localPath,
    clip.filePath,
    clip.inputPath,
    clip.sourcePath,
  ].filter(Boolean);

  for (const rawPath of candidates) {
    const value = String(rawPath || "").trim();

    if (!value || /^https?:\/\//i.test(value)) {
      continue;
    }

    const absolutePath = path.isAbsolute(value)
      ? value
      : path.join(rootDir, value);

    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }
  }

  throw new Error("Instagram publish failed: local clip file path is missing.");
}

function getInstagramAccessToken(account = {}) {
  const encrypted = account.accessTokenEncrypted || "";

  if (!encrypted) {
    throw new Error("Instagram access token is missing. Reconnect Instagram.");
  }

  return decryptText(encrypted);
}

function getInstagramUserId(account = {}) {
  const id = account.platformUserId || account.metaJson?.profile?.id || "";

  if (!id) {
    throw new Error("Instagram user ID is missing. Reconnect Instagram.");
  }

  return String(id);
}

function getInstagramErrorMessage(error) {
  return (
    error?.response?.data?.error?.error_user_msg ||
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    "Instagram publishing failed."
  );
}

function getInstagramErrorPayload(error) {
  return (
    error?.response?.data ||
    error?.error ||
    {
      message: getInstagramErrorMessage(error),
    }
  );
}

async function getVideoUrlForInstagram(scheduledPost) {
  const existingUrl = getExistingPublicVideoUrl(scheduledPost.clip);

  if (existingUrl) {
    return {
      videoUrl: existingUrl,
      cloudinaryUpload: null,
      source: "existing_public_url",
    };
  }

  const localPath = resolveLocalClipPath(scheduledPost.clip);

  const cloudinaryUpload = await uploadVideoToCloudinary(localPath, {
    folder: "clipflow/instagram",
    publicId: `instagram-${scheduledPost.id || Date.now()}`,
  });

  if (!isPublicHttpsUrl(cloudinaryUpload.secureUrl)) {
    throw new Error(
      `Cloudinary did not return a valid public HTTPS video URL: ${cloudinaryUpload.secureUrl}`
    );
  }

  console.log("INSTAGRAM CLOUDINARY VIDEO URL:", cloudinaryUpload.secureUrl);

  return {
    videoUrl: cloudinaryUpload.secureUrl,
    cloudinaryUpload,
    source: "cloudinary_upload",
  };
}

async function createInstagramReelContainer({
  instagramUserId,
  accessToken,
  videoUrl,
  caption,
}) {
  const requestPayload = {
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    share_to_feed: true,
    access_token: accessToken,
  };

  try {
    const response = await axios.post(
      `${INSTAGRAM_GRAPH_BASE_URL}/${instagramUserId}/media`,
      null,
      {
        params: requestPayload,
        timeout: 60000,
      }
    );

    const creationId = response.data?.id;

    if (!creationId) {
      throw new Error("Instagram did not return a media container ID.");
    }

    return {
      data: response.data,
      requestPayload: {
        media_type: requestPayload.media_type,
        video_url: requestPayload.video_url,
        caption: requestPayload.caption,
        share_to_feed: requestPayload.share_to_feed,
      },
    };
  } catch (error) {
    const message = getInstagramErrorMessage(error);
    const payload = getInstagramErrorPayload(error);

    const wrapped = new Error(message);
    wrapped.responsePayload = payload;
    wrapped.requestPayload = {
      media_type: requestPayload.media_type,
      video_url: requestPayload.video_url,
      caption: requestPayload.caption,
      share_to_feed: requestPayload.share_to_feed,
    };

    throw wrapped;
  }
}

async function getInstagramContainerStatus({ creationId, accessToken }) {
  try {
    const response = await axios.get(
      `${INSTAGRAM_GRAPH_BASE_URL}/${creationId}`,
      {
        params: {
          fields: "id,status_code,status",
          access_token: accessToken,
        },
        timeout: 30000,
      }
    );

    return response.data || {};
  } catch (error) {
    throw new Error(getInstagramErrorMessage(error));
  }
}

async function waitForInstagramContainerReady({ creationId, accessToken }) {
  let latestStatus = null;

  for (
    let attempt = 1;
    attempt <= INSTAGRAM_CONTAINER_POLL_ATTEMPTS;
    attempt += 1
  ) {
    latestStatus = await getInstagramContainerStatus({
      creationId,
      accessToken,
    });

    const statusCode = String(latestStatus.status_code || "").toUpperCase();
    const statusText = String(latestStatus.status || "");

    console.log("INSTAGRAM CONTAINER STATUS:", {
      attempt,
      creationId,
      statusCode,
      statusText,
    });

    if (statusCode === "FINISHED") {
      return {
        ready: true,
        attempts: attempt,
        status: latestStatus,
      };
    }

    if (statusCode === "ERROR" || statusCode === "EXPIRED") {
      throw new Error(
        `Instagram media container failed. status_code=${statusCode}, status=${statusText}`
      );
    }

    await wait(INSTAGRAM_CONTAINER_POLL_DELAY_MS);
  }

  throw new Error(
    `Instagram media container was not ready after ${INSTAGRAM_CONTAINER_POLL_ATTEMPTS} checks.`
  );
}

async function publishInstagramContainer({
  instagramUserId,
  creationId,
  accessToken,
}) {
  try {
    const response = await axios.post(
      `${INSTAGRAM_GRAPH_BASE_URL}/${instagramUserId}/media_publish`,
      null,
      {
        params: {
          creation_id: creationId,
          access_token: accessToken,
        },
        timeout: 60000,
      }
    );

    const mediaId = response.data?.id;

    if (!mediaId) {
      throw new Error("Instagram publish completed but no media ID was returned.");
    }

    return response.data;
  } catch (error) {
    throw new Error(getInstagramErrorMessage(error));
  }
}

async function publishInstagramPost(scheduledPost) {
  if (!scheduledPost?.socialAccount) {
    throw new Error("Missing connected Instagram account");
  }

  if (scheduledPost.socialAccount.platform !== "INSTAGRAM") {
    throw new Error("Scheduled post is not linked to an Instagram account");
  }

  if (!scheduledPost?.clip) {
    throw new Error("Missing clip record");
  }

  const accessToken = getInstagramAccessToken(scheduledPost.socialAccount);
  const instagramUserId = getInstagramUserId(scheduledPost.socialAccount);

  const caption = cleanCaption(
    scheduledPost.caption || scheduledPost.title || "",
    scheduledPost.hashtags || ""
  );

  const videoSource = await getVideoUrlForInstagram(scheduledPost);

  const containerResult = await createInstagramReelContainer({
    instagramUserId,
    accessToken,
    videoUrl: videoSource.videoUrl,
    caption,
  });

  const container = containerResult.data;
  const creationId = container.id;

  const readyCheck = await waitForInstagramContainerReady({
    creationId,
    accessToken,
  });

  const publishedMedia = await publishInstagramContainer({
    instagramUserId,
    creationId,
    accessToken,
  });

  return {
    platform: "INSTAGRAM",
    platformPostId: publishedMedia.id,
    mediaId: publishedMedia.id,
    url: "https://www.instagram.com/",
    requestPayload: {
      instagramUserId,
      media_type: "REELS",
      video_url: videoSource.videoUrl,
      caption,
      creation_id: creationId,
      cloudinaryPublicId: videoSource.cloudinaryUpload?.publicId || null,
      videoSource: videoSource.source,
    },
    responsePayload: {
      container,
      readyCheck,
      publishedMedia,
      cloudinaryUpload: videoSource.cloudinaryUpload,
      videoSource: videoSource.source,
    },
  };
}

module.exports = {
  publishInstagramPost,
};