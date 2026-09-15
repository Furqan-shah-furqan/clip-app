# YouTube Info & Download fallback

Adds the provider tested in RapidAPI to full-source downloads. Requests 720p MP4, polls the supplied progress URL, downloads the completed file, and uses ffprobe to require video and audio tracks. Existing per-job caching reuses one source for every moment after FAST quota exhaustion; original clip timestamps are preserved. Captions, styles, scheduling and publishing files are unchanged.

## Deployment

Merge this patch and deploy the resulting main commit on Render. The existing RAPIDAPI_KEY must belong to the RapidAPI application with an active YouTube Info & Download API subscription. If you rotated your key, update that existing Render variable. Do not create a duplicate variable. Keep RAPIDAPI_HOST unchanged: the new provider has its own fixed host and does not use FAST endpoints.

Generate clips from a fresh YouTube request. Successful logs include `[RapidAPI][YouTubeInfo] Source downloaded and audio/video verified.` If the provider fails, its HTTP status is logged and the existing fallbacks continue. No extra paid worker or API subscription is added by this code; requests consume the provider subscription's quota.

## Validation

15 tests pass: asynchronous job polling, cached completion, MP3 rejection, bounded timeout, HTTP 429 handling, credential isolation, existing per-job reuse and cancellation, real FFmpeg original-offset clipping, and real ffprobe audio/video verification with a local fixture. The user's completed CDN URL returned HTTP 200 and Content-Type video/mp4. Full remote file transfer and clip generation on Render have not yet been verified. No live API key was used in these tests.
