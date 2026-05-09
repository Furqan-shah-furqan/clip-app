const YOUTUBE_READY_POLL_ATTEMPTS = 20;
const YOUTUBE_READY_POLL_DELAY_MS = 15000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForYouTubeVideoReady(youtube, videoId, expectedPrivacyStatus = "public") {
  let latestVideo = null;

  for (let attempt = 1; attempt <= YOUTUBE_READY_POLL_ATTEMPTS; attempt += 1) {
    const response = await youtube.videos.list({
      part: ["snippet", "status", "processingDetails"],
      id: [videoId],
    });

    latestVideo = response.data?.items?.[0] || null;

    const uploadStatus = latestVideo?.status?.uploadStatus || "";
    const privacyStatus = latestVideo?.status?.privacyStatus || "";
    const processingStatus = latestVideo?.processingDetails?.processingStatus || "";

    const isRejected =
      uploadStatus === "rejected" ||
      uploadStatus === "failed" ||
      processingStatus === "failed";

    if (isRejected) {
      throw new Error(
        `YouTube rejected or failed processing this video. uploadStatus=${uploadStatus}, processingStatus=${processingStatus}`,
      );
    }

    const uploadReady =
      uploadStatus === "uploaded" ||
      uploadStatus === "processed" ||
      processingStatus === "succeeded" ||
      processingStatus === "";

    const privacyReady =
      !expectedPrivacyStatus ||
      privacyStatus === expectedPrivacyStatus;

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