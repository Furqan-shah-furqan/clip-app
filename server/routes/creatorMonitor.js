const express = require("express");
const axios = require("axios");
const crypto = require("node:crypto");
const prisma = require("../lib/prisma");
const customerAuth = require("../middleware/customerAuth");
const { addGenerationJob } = require("../queue/generationQueue");

const HUB_URL = "https://pubsubhubbub.appspot.com/subscribe";
const HUB_LEASE_SECONDS = 432000;
const HUB_SECRET_RENEW_WINDOW_MS = 36 * 60 * 60 * 1000;
const SUBSCRIPTION_RETRY_MS = 20 * 60 * 60 * 1000;
const router = express.Router();
let renewalTimer;

router.use((req, res, next) => {
  if (!customerAuth.enabled()) return res.status(503).json({ error: "Enable ClipFlow customer accounts before monitoring creator channels." });
  if (!req.user?.id) return res.status(401).json({ error: "Sign in to use Creator Monitor." });
  next();
});

function routeError(status, message) {
  return Object.assign(new Error(message), { status });
}

function safeYouTubeHost(hostname) {
  return ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"].includes(hostname.toLowerCase());
}

function parseCreatorUrl(value) {
  let url;
  try { url = new URL(String(value || "").trim()); } catch { throw routeError(400, "Paste a valid YouTube channel or video link."); }
  if (!safeYouTubeHost(url.hostname) || !["https:", "http:"].includes(url.protocol)) {
    throw routeError(400, "Use a YouTube channel link or a public video link.");
  }
  if (url.username || url.password) throw routeError(400, "The YouTube link must not contain login credentials.");

  const parts = url.pathname.split("/").filter(Boolean);
  const videoId = url.hostname.toLowerCase().endsWith("youtu.be")
    ? parts[0]
    : (url.searchParams.get("v") || (["shorts", "live", "embed", "v"].includes(parts[0]) ? parts[1] : ""));
  if (videoId) return { kind: "video", value: videoId };
  if (parts[0]?.startsWith("@")) return { kind: "handle", value: parts[0] };
  if (parts[0] === "channel" && parts[1]) return { kind: "id", value: parts[1] };
  if (parts[0] === "user" && parts[1]) return { kind: "username", value: parts[1] };
  throw routeError(400, "Use a channel link with a YouTube handle, channel ID, or /user/ name. Custom /c/ links are not supported yet.");
}

async function youtubeApi(path, params) {
  const apiKey = (process.env.YOUTUBE_API_KEY || "").trim();
  if (!apiKey) throw routeError(503, "YouTube channel lookup is not configured. Add YOUTUBE_API_KEY to the ClipFlow backend environment.");
  try {
    const response = await axios.get(`https://www.googleapis.com/youtube/v3/${path}`, {
      params: { ...params, key: apiKey }, timeout: 12000,
    });
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    if (status === 403) throw routeError(502, "YouTube rejected the API request. Check that YouTube Data API v3 is enabled and the key has quota.");
    if (status === 400) throw routeError(400, "That YouTube link could not be resolved. Check the URL and try again.");
    throw routeError(502, "Could not reach YouTube to look up that channel. Try again shortly.");
  }
}

async function resolveChannel(input) {
  const parsed = parseCreatorUrl(input);
  let channelId = parsed.value;
  if (parsed.kind === "video") {
    if (!/^[\w-]{11}$/.test(channelId)) throw routeError(400, "That YouTube video link has an invalid video ID.");
    const videoData = await youtubeApi("videos", { part: "snippet", id: channelId });
    channelId = videoData.items?.[0]?.snippet?.channelId;
    if (!channelId) throw routeError(404, "Could not find a public YouTube channel for that video.");
  }

  if (parsed.kind === "id" && !/^UC[\w-]{22}$/.test(channelId)) {
    throw routeError(400, "That YouTube channel ID is not valid.");
  }
  const filter = parsed.kind === "handle" ? { forHandle: parsed.value }
    : parsed.kind === "username" ? { forUsername: parsed.value }
      : { id: channelId };
  const result = await youtubeApi("channels", { part: "snippet,contentDetails", ...filter, maxResults: 1 });
  const channel = result.items?.[0];
  if (!channel?.id) throw routeError(404, "YouTube did not find that channel. Check the link and try again.");
  return {
    channelId: channel.id,
    title: String(channel.snippet?.title || "YouTube channel").slice(0, 160),
    thumbnailUrl: channel.snippet?.thumbnails?.medium?.url || channel.snippet?.thumbnails?.default?.url || null,
    uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads || null,
    canonicalUrl: `https://www.youtube.com/channel/${channel.id}`,
  };
}

function publicOrigin() {
  const configured = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || "";
  if (!configured) throw routeError(503, "Set APP_URL to the public HTTPS address of the ClipFlow backend before enabling creator monitoring.");
  let url;
  try { url = new URL(/^https?:\/\//i.test(configured) ? configured : `https://${configured}`); }
  catch { throw routeError(503, "APP_URL is not a valid public ClipFlow address."); }
  if (url.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw routeError(503, "Creator monitoring needs APP_URL to point to the public HTTPS ClipFlow service.");
  }
  return url.origin;
}

function topicUrl(channelId) {
  return `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}

async function requestHub(channel, mode) {
  const requestedAt = new Date();
  const requestedStatus = mode === "subscribe" ? "PENDING" : "UNSUBSCRIBING";
  await prisma.creatorChannel.update({
    where: { id: channel.id }, data: { subscriptionStatus: requestedStatus, lastSubscriptionRequestAt: requestedAt, lastError: null },
  });

  try {
    const callback = `${publicOrigin()}/webhooks/youtube/${encodeURIComponent(channel.id)}`;
    const form = new URLSearchParams({
      "hub.callback": callback,
      "hub.mode": mode,
      "hub.topic": topicUrl(channel.channelId),
      "hub.verify": "async",
      "hub.verify_token": channel.hubSecret,
    });
    if (mode === "subscribe") {
      form.set("hub.secret", channel.hubSecret);
      form.set("hub.lease_seconds", String(HUB_LEASE_SECONDS));
    }
    await axios.post(HUB_URL, form.toString(), {
      headers: { "content-type": "application/x-www-form-urlencoded" }, timeout: 12000,
      validateStatus: status => status >= 200 && status < 300,
    });
    return true;
  } catch (error) {
    const message = error.status ? error.message : error.response?.status
      ? `YouTube notification hub returned HTTP ${error.response.status}.`
      : "Could not reach YouTube's notification hub. It will retry automatically.";
    await prisma.creatorChannel.update({
      where: { id: channel.id }, data: {
        subscriptionStatus: mode === "subscribe" ? "ERROR" : "INACTIVE",
        lastError: message.slice(0, 240),
      },
    }).catch(() => {});
    if (error.status) throw error;
    throw routeError(502, message);
  }
}

function decodeXml(value) {
  return String(value || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([\da-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(parseInt(number, 10)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();
}

function xmlValue(xml, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<(?:(?:[\\w.-]+):)?${escaped}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${escaped}\\s*>`, "i"));
  return decodeXml(match?.[1]);
}

function parseFeed(body) {
  const xml = Buffer.isBuffer(body) ? body.toString("utf8") : String(body || "");
  return [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map(([, entry]) => ({
    videoId: xmlValue(entry, "videoId"),
    channelId: xmlValue(entry, "channelId"),
    title: xmlValue(entry, "title").slice(0, 240) || "New YouTube upload",
    publishedAt: xmlValue(entry, "published"),
  })).filter(entry => /^[\w-]{11}$/.test(entry.videoId) && /^UC[\w-]{22}$/.test(entry.channelId));
}

async function enqueueUpload(channel, entry) {
  if (entry.channelId !== channel.channelId || !channel.active || channel.deletedAt) return;

  const existing = await prisma.creatorVideo.findUnique({
    where: { creatorChannelId_videoId: { creatorChannelId: channel.id, videoId: entry.videoId } },
    select: { id: true },
  });
  if (existing) return;

  const videoInfo = await youtubeApi("videos", { part: "snippet,liveStreamingDetails", id: entry.videoId });
  const sourceVideo = videoInfo.items?.[0];
  if (!sourceVideo || sourceVideo.snippet?.channelId !== channel.channelId) return;
  // Part 1 clips published videos. Leave upcoming and active broadcasts for the live-stream part.
  const liveDetails = sourceVideo.liveStreamingDetails;
  if (liveDetails && !liveDetails.actualEndTime) return;
  const publishedAt = sourceVideo.snippet.publishedAt ? new Date(sourceVideo.snippet.publishedAt) : (entry.publishedAt ? new Date(entry.publishedAt) : null);
  // WebSub also sends title/description edits. Ignore anything published before tracking started.
  if (!publishedAt || Number.isNaN(publishedAt.getTime()) || publishedAt.getTime() < channel.createdAt.getTime()) return;
  const title = String(sourceVideo.snippet.title || entry.title).slice(0, 240);

  let tracked;
  try {
    tracked = await prisma.creatorVideo.create({ data: {
      creatorChannelId: channel.id,
      videoId: entry.videoId,
      title,
      videoUrl: `https://www.youtube.com/watch?v=${entry.videoId}`,
      publishedAt,
      status: "QUEUEING",
    } });
  } catch (error) {
    if (error.code === "P2002") return;
    throw error;
  }

  let job;
  try {
    job = await customerAuth.createOwnedGenerationJob({ data: {
      userId: channel.userId,
      status: "QUEUED",
      progress: 0,
      stage: "New creator upload detected; waiting for generation worker...",
      sourceType: "youtube",
      sourceUrl: tracked.videoUrl,
      requestJson: {
        sourceType: "youtube", sourceUrl: tracked.videoUrl,
        maxClips: 3, minScore: 40, clipLengthSec: 45, minDurationSec: 25,
        maxDurationSec: 90, aspectRatio: "9:16", dualView: null,
        videoDurationSec: 0, metadata: { title: tracked.title, creatorChannelId: channel.id, creatorVideoId: tracked.id },
      },
    } });
    await prisma.creatorVideo.update({ where: { id: tracked.id }, data: { status: "QUEUED", generationJobId: job.id } });
    await addGenerationJob(job.id);
    console.info(`[CreatorMonitor] Queued upload ${entry.videoId} for channel ${channel.channelId}`);
  } catch (error) {
    const message = "Automatic clipping could not be queued. Retry it from Creator Monitor.";
    if (job) await prisma.generationJob.update({
      where: { id: job.id }, data: { status: "FAILED", stage: "Could not queue automatic clip generation", errorMessage: message, completedAt: new Date() },
    }).catch(() => {});
    await prisma.creatorVideo.update({ where: { id: tracked.id }, data: { status: "FAILED", errorMessage: message } }).catch(() => {});
    console.error(`[CreatorMonitor] Could not queue upload ${entry.videoId}:`, error.code || error.message);
  }
}

async function seedExistingUploads(channel) {
  if (!channel.uploadsPlaylistId) return;
  const result = await youtubeApi("playlistItems", {
    part: "snippet,contentDetails", playlistId: channel.uploadsPlaylistId, maxResults: 50,
  });
  const rows = (result.items || []).map(item => {
    const videoId = item.contentDetails?.videoId;
    if (!/^[\w-]{11}$/.test(videoId || "")) return null;
    const publishedAt = item.contentDetails?.videoPublishedAt ? new Date(item.contentDetails.videoPublishedAt) : null;
    // An upload that appeared after monitoring began is left for its WebSub event to queue.
    if (publishedAt && publishedAt.getTime() >= channel.createdAt.getTime()) return null;
    return {
      creatorChannelId: channel.id,
      videoId,
      title: String(item.snippet?.title || "Previously published video").slice(0, 240),
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      publishedAt,
      status: "EXISTING",
    };
  }).filter(Boolean);
  if (rows.length) await prisma.creatorVideo.createMany({ data: rows, skipDuplicates: true });
}

function apiHandler(fn) {
  return (req, res) => Promise.resolve(fn(req, res)).catch(error => {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error("[CreatorMonitor] Request failed:", error.code || error.message);
    return res.status(status).json({ error: status < 500 ? error.message : (error.status ? error.message : "Creator Monitor could not complete the request. Try again shortly.") });
  });
}

function requireOwner(req, res) {
  if (!req.user?.id) {
    res.status(401).json({ error: "Sign in to use Creator Monitor." });
    return false;
  }
  return true;
}

async function getOwnedChannel(userId, id) {
  const channel = await prisma.creatorChannel.findFirst({ where: { id, userId, deletedAt: null } });
  if (!channel) throw routeError(404, "That monitored channel was not found.");
  return channel;
}

async function listChannels(userId) {
  const channels = await prisma.creatorChannel.findMany({
    where: { userId, deletedAt: null }, orderBy: { createdAt: "desc" },
    include: { videos: { where: { status: { not: "EXISTING" } }, orderBy: { createdAt: "desc" }, take: 8 } },
  });
  const jobIds = channels.flatMap(channel => channel.videos.map(video => video.generationJobId).filter(Boolean));
  const jobs = jobIds.length ? await prisma.generationJob.findMany({
    where: { id: { in: jobIds }, userId }, select: { id: true, status: true, progress: true, stage: true, errorMessage: true, resultJson: true },
  }) : [];
  const jobMap = new Map(jobs.map(job => [job.id, job]));
  return channels.map(channel => ({
    id: channel.id, channelId: channel.channelId, title: channel.channelTitle,
    channelUrl: channel.channelUrl, thumbnailUrl: channel.thumbnailUrl,
    active: channel.active, subscriptionStatus: channel.subscriptionStatus,
    lastError: channel.lastError, createdAt: channel.createdAt,
    videos: channel.videos.map(video => {
      const job = jobMap.get(video.generationJobId) || null;
      const clips = Array.isArray(job?.resultJson?.clips) ? job.resultJson.clips.map(clip => ({
        title: String(clip.title || clip.hook || "Generated clip").slice(0, 160),
        downloadUrl: clip.downloadUrl || clip.previewUrl || clip.storageUrl || null,
        duration: Number(clip.duration) || 0,
        score: Number(clip.smartScore ?? clip.score) || 0,
      })).filter(clip => clip.downloadUrl) : [];
      return {
        ...video,
        generationJob: job ? {
          id: job.id, status: job.status, progress: job.progress,
          stage: job.stage, errorMessage: job.errorMessage, clips,
        } : null,
      };
    }),
  }));
}

function setupIssues() {
  const issues = [];
  if (!(process.env.YOUTUBE_API_KEY || "").trim()) issues.push("Add YOUTUBE_API_KEY to the backend environment to resolve YouTube channels.");
  try { publicOrigin(); } catch (error) { issues.push(error.message); }
  return issues;
}

router.get("/", apiHandler(async (req, res) => {
  if (!requireOwner(req, res)) return;
  res.set("Cache-Control", "no-store").json({ channels: await listChannels(req.user.id), setupIssues: setupIssues() });
}));

router.post("/", apiHandler(async (req, res) => {
  if (!requireOwner(req, res)) return;
  if (!customerAuth.enabled()) throw routeError(503, "Enable ClipFlow customer accounts before monitoring creator channels.");
  const resolved = await resolveChannel(req.body?.url);
  const count = await prisma.creatorChannel.count({ where: { userId: req.user.id, deletedAt: null } });
  if (count >= 20) throw routeError(400, "You can monitor up to 20 channels in one ClipFlow account.");
  const existing = await prisma.creatorChannel.findFirst({ where: { userId: req.user.id, channelId: resolved.channelId } });
  if (existing && !existing.deletedAt) throw routeError(409, "That creator is already in your monitor list.");
  const channelData = {
    channelTitle: resolved.title,
    channelUrl: resolved.canonicalUrl,
    thumbnailUrl: resolved.thumbnailUrl,
    uploadsPlaylistId: resolved.uploadsPlaylistId,
    active: true,
    subscriptionStatus: "PENDING",
    subscriptionExpiresAt: null,
    lastSubscriptionRequestAt: null,
    lastNotificationAt: null,
    lastError: null,
    deletedAt: null,
    createdAt: new Date(),
    hubSecret: crypto.randomBytes(32).toString("hex"),
  };
  const channel = existing
    ? await prisma.creatorChannel.update({ where: { id: existing.id }, data: channelData })
    : await prisma.creatorChannel.create({ data: { ...channelData, userId: req.user.id, channelId: resolved.channelId } });

  try {
    await seedExistingUploads(channel).catch(error => {
      console.warn(`[CreatorMonitor] Could not seed existing uploads for ${channel.channelId}:`, error.status || "YouTube API unavailable");
    });
    await requestHub(channel, "subscribe");
  } catch (error) {
    await prisma.creatorChannel.update({ where: { id: channel.id }, data: { subscriptionStatus: "ERROR", lastError: String(error.message || "Subscription setup failed").slice(0, 240) } }).catch(() => {});
    return res.status(error.status || 502).json({
      error: error.status ? error.message : "The creator was saved, but YouTube monitoring could not be started. Use Retry connection on the channel card.",
      channelId: channel.id,
    });
  }
  res.status(201).json({ channel: (await listChannels(req.user.id)).find(item => item.id === channel.id), message: "Creator added. ClipFlow is waiting for YouTube to confirm the upload notification." });
}));

router.post("/:id/retry-connection", apiHandler(async (req, res) => {
  if (!requireOwner(req, res)) return;
  const channel = await getOwnedChannel(req.user.id, req.params.id);
  await requestHub(channel, "subscribe");
  res.json({ success: true, message: "YouTube monitoring request sent again." });
}));

router.patch("/:id", apiHandler(async (req, res) => {
  if (!requireOwner(req, res)) return;
  const channel = await getOwnedChannel(req.user.id, req.params.id);
  if (typeof req.body?.active !== "boolean") throw routeError(400, "Choose whether this creator monitor should be active.");
  const active = req.body.active;
  const updated = await prisma.creatorChannel.update({
    where: { id: channel.id }, data: { active, subscriptionStatus: active ? "PENDING" : "INACTIVE", lastError: null },
  });
  try { await requestHub(updated, active ? "subscribe" : "unsubscribe"); }
  catch (error) { if (active) throw error; }
  res.json({ channel: (await listChannels(req.user.id)).find(item => item.id === channel.id) });
}));

router.delete("/:id", apiHandler(async (req, res) => {
  if (!requireOwner(req, res)) return;
  const channel = await getOwnedChannel(req.user.id, req.params.id);
  const deletedAt = new Date();
  const updated = await prisma.creatorChannel.update({ where: { id: channel.id }, data: {
    active: false, deletedAt, subscriptionStatus: "UNSUBSCRIBING",
  } });
  try { await requestHub(updated, "unsubscribe"); } catch { /* the subscription expires if the hub cannot be reached */ }
  res.json({ success: true });
}));

router.post("/:id/videos/:videoId/retry", apiHandler(async (req, res) => {
  if (!requireOwner(req, res)) return;
  const channel = await getOwnedChannel(req.user.id, req.params.id);
  const video = await prisma.creatorVideo.findFirst({ where: { creatorChannelId: channel.id, id: req.params.videoId } });
  if (!video) throw routeError(404, "That upload could not be found.");
  if (video.status !== "FAILED" && video.generationJobId) {
    const previousJob = await prisma.generationJob.findFirst({ where: { id: video.generationJobId, userId: channel.userId }, select: { status: true } });
    if (previousJob?.status !== "FAILED") throw routeError(409, "This upload does not have a failed generation job to retry.");
  } else if (video.status !== "FAILED") {
    throw routeError(409, "This upload does not have a failed generation job to retry.");
  }
  const job = await customerAuth.createOwnedGenerationJob({ data: {
    userId: channel.userId, status: "QUEUED", progress: 0,
    stage: "Retrying automatic clip generation...", sourceType: "youtube", sourceUrl: video.videoUrl,
    requestJson: {
      sourceType: "youtube", sourceUrl: video.videoUrl, maxClips: 3,
      minScore: 40, clipLengthSec: 45, minDurationSec: 25, maxDurationSec: 90,
      aspectRatio: "9:16", dualView: null, videoDurationSec: 0,
      metadata: { title: video.title, creatorChannelId: channel.id, creatorVideoId: video.id },
    },
  } });
  try {
    await addGenerationJob(job.id);
    await prisma.creatorVideo.update({ where: { id: video.id }, data: { generationJobId: job.id, status: "QUEUED", errorMessage: null } });
  } catch (error) {
    const message = "Automatic clipping could not be queued. Check the generation worker and retry.";
    await prisma.generationJob.update({ where: { id: job.id }, data: { status: "FAILED", stage: "Could not queue automatic clip generation", errorMessage: message, completedAt: new Date() } }).catch(() => {});
    throw routeError(503, message);
  }
  res.json({ success: true });
}));

async function verifyWebhook(req, res) {
  try {
    const channel = await prisma.creatorChannel.findUnique({ where: { id: req.params.channelId } });
    const mode = String(req.query["hub.mode"] || "");
    const topic = String(req.query["hub.topic"] || "");
    const token = String(req.query["hub.verify_token"] || "");
    const challenge = String(req.query["hub.challenge"] || "");
    if (!channel || !["subscribe", "unsubscribe"].includes(mode) || topic !== topicUrl(channel.channelId) || !challenge) return res.sendStatus(404);
    const expected = Buffer.from(channel.hubSecret);
    const provided = Buffer.from(token);
    if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) return res.sendStatus(403);
    const leaseSeconds = Math.min(Math.max(Number(req.query["hub.lease_seconds"]) || HUB_LEASE_SECONDS, 60), HUB_LEASE_SECONDS);
    await prisma.creatorChannel.update({ where: { id: channel.id }, data: {
      subscriptionStatus: mode === "subscribe" ? "ACTIVE" : (channel.deletedAt ? "REMOVED" : "INACTIVE"),
      subscriptionExpiresAt: mode === "subscribe" ? new Date(Date.now() + leaseSeconds * 1000) : null,
      lastError: null,
    } });
    res.type("text/plain").status(200).send(challenge);
  } catch (error) {
    console.error("[CreatorMonitor] Hub verification failed:", error.code || error.message);
    res.sendStatus(500);
  }
}

function hasValidSignature(body, signature, secret) {
  if (!Buffer.isBuffer(body) || !signature) return false;
  const expected = `sha1=${crypto.createHmac("sha1", secret).update(body).digest("hex")}`;
  const left = Buffer.from(expected);
  const right = Buffer.from(String(signature));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function receiveWebhook(req, res) {
  try {
    const channel = await prisma.creatorChannel.findUnique({ where: { id: req.params.channelId } });
    if (!channel) return res.sendStatus(404);
    if (!hasValidSignature(req.body, req.get("x-hub-signature"), channel.hubSecret)) return res.sendStatus(403);
    await prisma.creatorChannel.update({ where: { id: channel.id }, data: { lastNotificationAt: new Date() } });
    if (!channel.active || channel.deletedAt) return res.sendStatus(204);
    const entries = parseFeed(req.body);
    for (const entry of entries) await enqueueUpload(channel, entry);
    res.sendStatus(204);
  } catch (error) {
    console.error("[CreatorMonitor] YouTube notification failed:", error.code || error.message);
    res.sendStatus(500);
  }
}

async function renewSubscriptions() {
  const now = Date.now();
  const channels = await prisma.creatorChannel.findMany({
    where: { active: true, deletedAt: null }, take: 1000, orderBy: { createdAt: "asc" },
  });
  for (const channel of channels) {
    const due = !channel.subscriptionExpiresAt || channel.subscriptionExpiresAt.getTime() <= now + HUB_SECRET_RENEW_WINDOW_MS;
    const retryDue = !channel.lastSubscriptionRequestAt || channel.lastSubscriptionRequestAt.getTime() <= now - SUBSCRIPTION_RETRY_MS;
    if (due && retryDue) await requestHub(channel, "subscribe").catch(error => {
      console.warn(`[CreatorMonitor] Could not renew subscription ${channel.id}:`, error.status || "hub unavailable");
    });
  }
  await prisma.creatorChannel.deleteMany({ where: { deletedAt: { lt: new Date(now - 14 * 86400000) } } });
}

function startRenewalLoop() {
  if (renewalTimer) return;
  const run = () => renewSubscriptions().catch(error => console.error("[CreatorMonitor] Subscription renewal check failed:", error.code || error.message));
  const initial = setTimeout(run, 15000);
  initial.unref?.();
  renewalTimer = setInterval(run, 12 * 60 * 60 * 1000);
  renewalTimer.unref?.();
}

module.exports = { router, verifyWebhook, receiveWebhook, startRenewalLoop, parseFeed };
