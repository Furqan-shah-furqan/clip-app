# Caption transcription recovery

Based on main commit `c0f68d466b29d85b77e242e6771de87726df533d`.

## Findings

- `public/captions.js` generated title/hook/demo text with artificial word times, persisted it, and used content heuristics to decide whether audio transcription was needed. Some fabricated text could pass as real; legitimate short transcripts could be rejected.
- The editor aborted transcription requests after 60 seconds and converted errors into empty arrays, then displayed “Ready”.
- The gallery sent concurrent requests for multiple clips. Every uncached request started its own FFmpeg/Python process, including duplicate requests for the same clip.
- Caption lookup only handled local files, although generated clips can play from Cloudinary. A restart/redeploy can therefore leave a playable clip that cannot be transcribed.
- The cache matched filename prefixes rather than exact file identity. Word highlighting matched text rather than word positions, breaking repeated and non-Latin words. Normalization also deleted genuine repeated speech.

These are code-confirmed defects. They do not prove which one caused the reported live failure; Render logs and a failing clip were not available.

## Changes

- Shared asynchronous caption client: start a job, poll short status requests, surface errors, and reuse pending requests. The old synchronous API remains compatible.
- One bounded transcription queue inside Express. Same-file requests reuse one job; failed jobs can retry. Completed jobs expire. No additional worker service or paid API is added.
- Recover missing clips by streaming videos from the configured Cloudinary account. Arbitrary hosts, redirects, and other Cloudinary accounts are rejected; downloads have size/time limits and partial-file cleanup.
- Remove fabricated caption generation from active gallery/editor flows; revalidate legacy editor sessions once. Versioned sessions preserve confirmed captions and word times.
- Prevent background transcription from overwriting changes made while it was running. “Sync Audio” always reaches the transcription service rather than trusting embedded metadata.
- Use timestamp positions for highlights and progressive text. Preserve repeated spoken phrases, adjacent repeated segments, and word-only transcript timing. Changing text clears its obsolete word alignment.
- Exact cache identity includes file path, size, modification time, model, and schema version. Subprocess timeouts terminate hung processes and retain actionable failure messages.
- Render configuration uses multilingual `tiny`, one CPU thread and beam size 1. Docker preloads `tiny` and fails the build if that preload fails. This reduces work at an accuracy tradeoff; it is not a production memory/performance guarantee.

## Apply and check

1. Review and merge this branch, then deploy the new Docker build on Render.
2. In an existing Render service, explicitly set `WHISPER_MODEL=tiny`, `WHISPER_CPU_THREADS=1`, and `WHISPER_BEAM_SIZE=1`. Existing dashboard settings may differ from `render.yaml`. Keep the existing Cloudinary settings.
3. Hard refresh the app. Open a 10–30 second clip with clear speech, click **Sync Audio**, and wait for “Audio transcribed” or “Audio synced”. A legacy session is revalidated automatically.
4. Play, pause, seek backward, change the word grouping, then reload. Check that words follow speech and survive reload.
5. If a clip no longer exists locally, its Cloudinary upload URL must still work and belong to `CLOUDINARY_CLOUD_NAME`. If neither copy exists, regenerate/re-upload it.
6. If transcription fails, copy the exact status message and the matching Render logs. A process killed with `SIGKILL` can indicate memory pressure; verify it in Render rather than assuming.

Run regression checks with `npm ci --ignore-scripts` and `npm run test:captions`. The integration test needs FFmpeg on PATH.

## Validation and limits

The tests cover queue serialization/deduplication, retry and bounds, polling and errors, timestamp preservation, repeated/Urdu words, backward seeking, progressive export timing, edit races, local-file fallback, cache isolation, missing jobs/files, subprocess timeout, and Cloudinary URL validation/stream cleanup.

The route integration test uses real FFmpeg with a generated audio fixture and a stub transcription process. Cloudinary downloads are mocked. Actual Whisper recognition, live Cloudinary access, a full Docker build, production browser rendering, and Render memory usage still need deployment verification.

This is transcription of a recorded clip followed by playback synchronization, not live microphone streaming ASR. The old WebSocket endpoint remains a compatibility path; the active editor uses video timestamps.

The queue is in memory and only serializes caption work in the Express process. Generation/export jobs can still compete for resources. A restart loses pending jobs; click Sync Audio to restart them. Local-only media and cache files are ephemeral. Cloudinary recovery uses the existing storage account and its quota; it does not add a new paid service. An open page polls while its job is active, but closing the page does not guarantee completion through platform sleep/restarts.

Render explicitly does not recommend free instances for production and documents loss of local files on sleep/restart/redeploy: https://render.com/docs/free
Faster Whisper documents CPU INT8 inference and word timestamps: https://github.com/SYSTRAN/faster-whisper

## Follow-up: speech pauses and overlapping synchronization

The screenshot's “Transcript ready, but captions changed while syncing” could be produced by automatic sync and a manual sync applying the same result twice. Both now share one editor-level operation, while actual text/timing edits remain protected. Unverified legacy text is hidden until transcription succeeds. Regenerate uses the same operation and no longer calls a removed demo fallback.

Timed words are only visible inside their speech intervals, including when paused or seeking. Grouped captions reveal each word at its timestamp instead of displaying the next word early. The same windows drive export for all styles. No arbitrary fixed delay is added, since a screenshot cannot establish the audio offset.

14 regression tests pass, including new tests for simultaneous sync, silence, first-word onset, progressive groups, and export timing. These verify rendering against supplied timestamps, not ASR accuracy. Whisper tiny can still have recognition/alignment errors; validating those needs the original clip audio and its generated word timestamps. No model or hosting configuration is changed in this follow-up.
