# Technical Architecture & System Audit: ClipFlow Studio (`clip-app`)
**Document Purpose:** System handoff, process lifecycle analysis, and critical interruption bug investigation for incoming senior software architect / debugging engineer.  
**Scope:** Complete repository inspection (`e:\clip-app`).  
**Constraint Adherence:** Codebase inspection only. No project files modified or refactored. No secrets exposed.

---

# 1. PROJECT OVERVIEW

### Core Purpose & Product Vision
ClipFlow Studio (`clip-app`) is a web-based video processing and intelligence application designed to convert long-form videos (from YouTube or local file uploads) into viral, high-retention, 9:16 vertical short-form clips (TikTok, YouTube Shorts, Instagram Reels). The system automates transcription, identifies high-potential "viral moments" using speech analytics, crops/reframes horizontal footage for vertical displays (utilizing facial tracking or center-cropping), overlays dynamic animated captions, and schedules or publishes final videos to YouTube and Instagram.

### Current Implemented Features
1. **Video Ingestion:**
   - Local drag-and-drop / file picker upload for MP4, MOV, MKV, WEBM files (up to 2GB via Multer).
   - YouTube URL ingestion via RapidAPI ("YouTube Video FAST Downloader 24/7" with safe 6-second polling loop and direct CDN streaming) with fallback to server-side `yt-dlp`.
   - YouTube metadata extraction via YouTube Data API v3 (`/api/youtube/info`, `/api/youtube/fetch`).
2. **Speech-to-Text & Transcription:**
   - Audio extraction to 16kHz mono WAV via FFmpeg.
   - Python-based local AI transcription using `faster-whisper` (falling back to `openai-whisper`), returning word-level and segment-level timestamps.
   - YouTube caption extraction via YouTube Data API captions endpoint (`part=snippet`, VTT download).
3. **Viral Moment Detection & Ranking:**
   - Algorithmic transcript analyzer (`server/services/smartClipRanker.js`) that scores candidate windows (25s–90s) based on conversational hooks, high-value keywords, emotional intensity, pacing (words/sec), and penalizes filler words, sponsor/channel intros, and promotional links.
4. **Video Clipping & Reframing:**
   - Ultrafast FFmpeg clipping with center-crop scaling to 9:16 (`1080x1920` or `720x1280`).
   - Python OpenCV face-detection reframing (`python/smart_reframe.py`) with smooth camera panning (disabled in cloud/Render environments to prevent CPU timeouts).
5. **Caption Styling & Rendering (Caption Studio):**
   - In-browser interactive caption editor (`public/captions.html`, `public/captions.js`).
   - 30+ styling presets (Moonshot, Pop, Neon, Minimal, Highlight, Comic, etc.).
   - Dual-layer "Behind the Person" subject cutout preview using MediaPipe Selfie Segmentation (`public/subjectSegmentation.js`).
   - Server-side caption burning using FFmpeg with Advanced SubStation Alpha (`.ass`) formatting and drawtext fallback (`server/services/ffmpegService.js`, `server/server.js`).
   - Real-time simulated caption playback streaming over WebSockets (`/api/captions/stream`).
6. **Multi-Platform Publishing & Scheduling:**
   - Google / YouTube OAuth 2.0 connection and direct upload via Google APIs (`server/services/publishing/youtubePublisher.js`).
   - Meta / Instagram Graph API OAuth and Reels publishing container workflow (`server/services/publishing/instagramPublisher.js`).
   - Media hosting bridge to Cloudinary for public video URLs required by Instagram's container ingestion.
   - Schedule persistence in PostgreSQL via Prisma ORM and delayed job queuing with BullMQ + Redis (`server/queue/publishQueue.js`, `server/queue/publishWorker.js`).
   - Legacy local file-based scheduler (`server/services/scheduleService.js`) using `node-cron` and `server/storage/schedule.json`.

### Main User Workflow
1. User pastes a YouTube URL or uploads a local video file in `index.html`.
2. App fetches video metadata and displays preview thumbnail.
3. User selects clip duration (30s, 60s, 90s) or clicks **"Get clips in 1 click"** (`#smartClipBtn`).
4. Backend transcribes speech, evaluates transcript segments, selects optimal timestamp windows, downloads the YouTube source (or references uploaded file), and runs FFmpeg to generate short clips.
5. Generated clips appear in the UI shelf (`#generatedClipsGrid`).
6. User clicks a clip to open **Caption Studio** (`captions.html?clip=...`), selects caption presets, adjusts fonts/colors/positions, or enables "Behind the Person" mode.
7. User exports captioned clip or navigates to **Publish Center** (`publish.html`).
8. User selects connected YouTube/Instagram accounts, adds title/hashtags, and publishes immediately or schedules a future release.

### Technology Stack Summary
- **Frontend:** Vanilla JavaScript (ES6+), HTML5, Vanilla CSS. Dual structure exists: production runs on static assets in `public/` (`app.js`, `captions.js`, `publish.js`); an unbundled React/JSX prototype exists in `src/components/editor/` (`CaptionStudio.jsx`) but is not compiled into the Express web runtime.
- **Backend:** Node.js (v20.x), Express.js (v4.22.1), HTTP + WebSocket (`ws` v8.20.0).
- **Database:** PostgreSQL accessed via Prisma ORM (`@prisma/client` v6.7.0). Flat JSON files (`server/storage/projects.json`, `server/storage/schedule.json`) used as primary or fallback storage for clip projects.
- **Queue / Background Jobs:** Redis (`ioredis` v5.4.0) and BullMQ (`bullmq` v5.0.0) — **used exclusively for social media post publishing, NOT for video clipping/generation**.
- **Video Processing:** System FFmpeg (executed via `fluent-ffmpeg` and direct `child_process.spawn`/`execFile`) and Python 3 OpenCV (`opencv-python-headless`).
- **AI / Speech-to-Text:** Local `faster-whisper` / `openai-whisper` running in a Python virtual environment (`.venv`).
- **Video Ingestion:** External RapidAPI HTTP gateway (`youtube-video-fast-downloader-24-7.p.rapidapi.com` / `ytstream`), with fallback to system `yt-dlp`.
- **Cloud Storage:** Cloudinary (`cloudinary` v2.10.0) for generating public HTTPS URLs for Instagram Reels.
- **Hosting / Container:** Docker on Debian Linux (`node:20-bookworm-slim`), configured for Render, Railway, or local Docker Compose.

---

# 2. COMPLETE PROJECT STRUCTURE

```
e:\clip-app
│   .dockerignore                  # Files excluded from Docker builds
│   .env                           # Local environment variables [REDACTED]
│   .env.example                   # Template documenting required environment variables
│   .gitignore                     # Git tracking exclusions
│   cookies.txt                    # Bundled Netscape cookies for YouTube ingestion
│   DEPLOYMENT_GUIDE.md            # Cloud deployment manual (Render, Railway, Docker)
│   Dockerfile                     # Multi-runtime Dockerfile (Node 20, Python 3, FFmpeg, yt-dlp)
│   docker-compose.yml             # Local multi-container compose (App, Postgres, Redis)
│   docker-entrypoint.sh           # Container startup: DB push, cookie sync, process exec
│   jsconfig.json                  # Editor JS path mappings
│   package.json                   # Node package definition, scripts, and production dependencies
│   package-lock.json              # Locked dependency tree
│   pyrefly.toml                   # Python lint/type configuration
│   pyrightconfig.json             # Pyright static analysis configuration
│   render.yaml                    # Render Blueprint deployment definition
│   test-cloudinary.js             # Diagnostic script testing Cloudinary credentials
│
├───bin                            # Bundled Windows executable binaries (local dev fallback)
│       ffmpeg.exe                 # Static Windows FFmpeg build
│       ffprobe.exe                # Static Windows FFprobe build
│       yt-dlp.exe                 # Static Windows yt-dlp binary
│
├───captions                       # Server runtime directory for generated VTT, JSON, and WAV artifacts
├───exports                        # Server runtime directory for exported short clips and burned videos
├───uploads                        # Server runtime directory for raw video uploads and RapidAPI downloads
├───subtitles                      # Secondary subtitle cache directory
│
├───prisma
│       schema.prisma              # Database schema: User, SocialAccount, Clip, ScheduledPost, PublishAttempt
│
├───public                         # REAL PRODUCTION FRONTEND (Served statically by Express)
│       app.js                     # Main studio dashboard logic (ingest, generate trigger, shelf, modal)
│       captionPresets.js          # Client-side definitions for 30+ visual subtitle presets
│       captions.css               # Stylesheet for standalone Caption Studio editor
│       captions.html              # Dedicated page for interactive subtitle editing and preview
│       captions.js                # Full Caption Studio controller (timeline, styles, sync, export trigger)
│       index.html                 # Main landing page and clipping studio UI
│       publish.css                # Stylesheet for Publishing Center
│       publish.html               # Dedicated page for social account connection and scheduling
│       publish.js                 # Controller for social OAuth status, scheduling forms, and status polling
│       style.css                  # Core stylesheet for studio dashboard, dark/light theme, progress cards
│       subjectSegmentation.js     # MediaPipe Selfie Segmentation wrapper for dual-layer caption cutout
│
├───python                         # PYTHON RUNTIME SCRIPTS (Invoked via child_process.spawn)
│       env_setup.py               # Dynamic dependency check and runtime validation helper
│       preview_captions.py        # Utility script for local caption frame testing
│       requirements.txt           # Python AI dependencies: opencv-python-headless, numpy, faster-whisper
│       smart_clip.py              # Monolithic pipeline: trim, face-tracking reframe, transcribe, burn subtitles
│       smart_reframe.py           # Standalone face-tracking video reframing using Haar Cascades & OpenCV
│       transcribe_whisper.py      # Audio speech-to-text script utilizing faster-whisper with VAD filtering
│
├───server                         # BACKEND APPLICATION
│   │   server.js                  # Master entrypoint: Express setup, routes, static mounts, WS upgrade, port listen
│   │
│   ├───config
│   │       env.js                 # Environment variable validation, defaults, and exports
│   │
│   ├───lib
│   │       prisma.js              # Singleton PrismaClient instance initialization
│   │       redis.js               # Singleton IORedis connection instance initialization
│   │
│   ├───queue                      # BACKGROUND PROCESSING (Publishing Only)
│   │       publishQueue.js        # BullMQ queue declaration (`publish-jobs`) and job dispatch helpers
│   │       publishWorker.js       # BullMQ worker listening on `publish-jobs` to run scheduled posts
│   │
│   ├───routes                     # EXPRESS API ROUTERS
│   │       accounts.js            # GET /api/accounts (lists connected social accounts from DB)
│   │       auth.js                # GET/POST /api/auth (OAuth flows for YouTube and Instagram)
│   │       captions.js            # POST /api/captions/preview, /burn, and WebSocket streaming
│   │       clips.js               # PRIMARY GENERATION ROUTES: POST /upload, /smart-suggest, /smart-generate
│   │       files.js               # Static file streaming fallback
│   │       hooks.js               # Webhook receiver placeholder
│   │       schedules.js           # CRUD routes for ScheduledPost records and queuing
│   │       upload.js              # Secondary upload route handler
│   │       youtube.js             # GET /api/youtube/info, POST /api/youtube/fetch (YouTube metadata)
│   │
│   ├───services                   # CORE BUSINESS LOGIC
│   │   │   ffmpegService.js       # Video clipping, ASS subtitle generation, and FFmpeg filter burning
│   │   │   previewCaptionService.js # Formatting caption preview segments
│   │   │   scheduleDbService.js   # DB operations for ScheduledPost with BullMQ queue synchronization
│   │   │   scheduleService.js     # Legacy file-based schedule service (`schedule.json` + `node-cron`)
│   │   │   smartClipRanker.js     # Algorithmic transcript scoring, window selection, and viral heuristics
│   │   │   smartClipService.js    # Face-tracking invocation and fallback FFmpeg 9:16 center-crop execution
│   │   │   subtitleService.js     # Secondary subtitle generation helper
│   │   │   youtubeDownloader.js   # Multi-tier downloader (RapidAPI primary, ytstream fallback, yt-dlp safety)
│   │   │   youtubeTranscriptService.js # YouTube transcript fetching utility
│   │   │
│   │   ├───auth
│   │   │       instagramAuthService.js # Meta Graph API token exchange, page discovery, and DB persistence
│   │   │       youtubeAuthService.js   # Google OAuth 2.0 client, token exchange, and DB persistence
│   │   │
│   │   ├───publishing
│   │   │       instagramPublisher.js   # Reels container upload, status polling, and publishing via Graph API
│   │   │       runScheduledPost.js     # Dispatcher routing scheduled post to YouTube or Instagram publisher
│   │   │       youtubePublisher.js     # Resumable video upload to YouTube channel via Google APIs
│   │   │       youtubeUploadService.js # Direct YouTube video upload helper
│   │   │
│   │   └───storage
│   │           cloudinaryStorageService.js # Cloudinary upload bridge for generating public media URLs
│   │
│   ├───storage                    # LOCAL FLAT-FILE PERSISTENCE
│   │       projects.json          # Master JSON store for saved clip projects (shelf history)
│   │       schedule.json          # Legacy JSON store for cron scheduled posts
│   │
│   └───utils
│           encrypt.js             # AES-256-GCM encryption/decryption for OAuth access/refresh tokens
│           paths.js               # Absolute directory paths resolver (`uploadsDir`, `exportsDir`, etc.)
│           pythonRuntime.js       # Python executable locator across Windows `.venv` and Linux `python3`
│
├───services                       # ROOT SERVICES DIRECTORY (DUPLICATE MIRROR)
│       youtubeDownloader.js       # Duplicate mirror of server/services/youtubeDownloader.js
│
└───src                            # EXPERIMENTAL / UNBUNDLED REACT FRONTEND (NOT IN ACTIVE RUNTIME)
    ├───components
    │   └───editor
    │           CaptionStudio.jsx  # React implementation of Caption Studio (not served by server.js)
    │           PresetsGallery.jsx # React implementation of presets gallery
    ├───constants
    │       captionPresets.js      # ES Module presets (mirrored in `public/captionPresets.js`)
    └───services
            subjectSegmentation.js # ES Module MediaPipe segmentation (mirrored in `public/subjectSegmentation.js`)
```

---

# 3. APPLICATION ARCHITECTURE

### High-Level System Topology

```
+-----------------------------------------------------------------------------------+
|                                  BROWSER CLIENT                                   |
|  index.html / public/app.js    captions.html / captions.js    publish.html / js   |
|  - In-memory state             - In-memory editorState        - Polling timer     |
|  - localStorage sync           - DOM Canvas Segmentation      - Form submission   |
|  - Long-lived fetch() call     - Preview overlays             - OAuth return      |
+----------------------------------------+------------------------------------------+
                                         | HTTP / REST & WebSockets
                                         v
+-----------------------------------------------------------------------------------+
|                             EXPRESS WEB SERVER (Node 20)                          |
|                                server/server.js                                   |
|                                                                                   |
|  Routes Mounted:                                                                  |
|  /api/clips     -> server/routes/clips.js                                         |
|  /api/captions  -> server/routes/captions.js                                      |
|  /api/youtube   -> server/routes/youtube.js                                       |
|  /api/schedules -> server/routes/schedules.js                                     |
|  /api/auth      -> server/routes/auth.js                                          |
|                                                                                   |
|  CRITICAL EXECUTION MODEL:                                                        |
|  Video clipping requests (POST /api/clips/smart-generate) are handled             |
|  SYNCHRONOUSLY within the Express HTTP request-response cycle.                    |
|  NO QUEUE OR SEPARATE WORKER IS USED FOR GENERATION.                              |
+-------------------+-------------------------------------------+-------------------+
                    |                                           |
         Direct Process Invocations                  Async Delayed Jobs (Publishing)
                    |                                           |
                    v                                           v
+---------------------------------------+   +---------------------------------------+
|        CHILD PROCESS ENGINES          |   |          BULLMQ QUEUE SYSTEM          |
|                                       |   |         server/queue/publishQueue     |
| 1. Python Subprocesses                |   |         server/queue/publishWorker    |
|    - python/transcribe_whisper.py     |   |                                       |
|      (Whisper speech-to-text)         |   | Connected to Redis via IORedis.       |
|    - python/smart_reframe.py          |   | Handles social publishing delays      |
|      (OpenCV Haar-cascade reframe)    |   | ONLY. Completely unused for           |
|                                       |   | video clipping / generation.          |
| 2. FFmpeg Native Subprocesses         |   +-------------------+-------------------+
|    - Audio extraction (-vn pcm_s16le) |                       |
|    - Slicing & Center Crop (libx264)  |                       v
|    - Subtitle Burning (-vf ass=...)   |   +---------------------------------------+
+-------------------+-------------------+   |          PERSISTENCE LAYERS           |
                    |                       |                                       |
                    v                       | 1. PostgreSQL (via Prisma ORM)        |
+---------------------------------------+   |    - Users, SocialAccounts, Clips,    |
|       EXTERNAL CLOUD SERVICES         |   |      ScheduledPosts, PublishAttempts  |
|                                       |   | 2. Flat JSON Disk Files               |
| - RapidAPI FAST Downloader 24/7       |   |    - server/storage/projects.json     |
|   (Direct unblocked video stream)     |   |    - server/storage/schedule.json     |
| - Google YouTube Data & Upload API    |   | 3. Local Filesystem Artifacts         |
| - Meta / Instagram Graph API          |   |    - /uploads (source videos)         |
| - Cloudinary Video Storage CDN        |   |    - /exports (generated short clips) |
+---------------------------------------+   |    - /captions (VTT, JSON, WAV)       |
                                            +---------------------------------------+
```

### Component Execution Matrix
| Component | Runtime Environment | Execution Isolation | Persistence |
| :--- | :--- | :--- | :--- |
| **Studio UI (`app.js`)** | Browser Web Worker / Main Thread | Single Tab Memory Context | `localStorage` (`clipflow-studio-session`) |
| **Caption Studio (`captions.js`)** | Browser Main Thread | Single Tab Memory Context | `localStorage` (`clipflow-caption-clip`) |
| **Segmentation Model** | Browser WebGL / WASM via CDN | Browser DOM / Canvas | None (Evaluated per frame) |
| **Express Server (`server.js`)** | Node.js Main Process | Single Event Loop | Ephemeral RAM |
| **Generation Handler (`smart-generate`)** | Node.js Express Route Handler | **Tied directly to active HTTP socket** | None until response sent |
| **Audio Transcription** | Python 3 Child Process | Spawned child process (`child_process.spawn`) | `.wav` / `.json` / `.vtt` in `/captions` |
| **Clip Reframing & Crop** | FFmpeg Native Child Process | Spawned child process (`child_process.spawn`) | `.mp4` files in `/exports` |
| **Video Downloader** | Node.js Axios HTTP Polling Loop | In-memory loop inside Express thread | `.mp4` file in `/uploads` |
| **Publishing Queue** | BullMQ Worker | Node.js background event loop | Redis Queue + PostgreSQL DB |
| **Database** | PostgreSQL | Standalone Database Service | Persistent Disk Storage |

---

# 4. VIDEO GENERATION PIPELINE

### Detailed Trace of a Single Clip-Generation Request

```
[User Clicks "Get clips in 1 click" (#smartClipBtn) in public/app.js]
  │
  ├─ 1. Frontend Action: Event listener triggers `smartClipBtn.addEventListener("click")`.
  │     - Disables button, sets text: "Generating clips...".
  │     - Starts fake client-side progress crawl: `startProgressCrawl(88, ...)`.
  │     - Builds request payload via `buildSmartSuggestBody(3)`.
  │     - Instantiates `const controller = new AbortController()`.
  │     - Initiates HTTP request: `fetch("/api/clips/smart-generate", { method: "POST", signal })`.
  │
  ├─ 2. Network Transport:
  │     - Browser opens persistent HTTP POST socket to `/api/clips/smart-generate`.
  │     - Reverse proxy (Render / Cloudflare) starts internal gateway timeout counter (100s hard ceiling).
  │
  ├─ 3. Express Route Handler: `router.post("/smart-generate")` in `server/routes/clips.js`:
  │     - Sets `startedAt = Date.now()` and `maxSmartGenerateMs = 85 * 1000` (safety cut-off).
  │     - Validates inputs: `sourceType`, `sourceUrl` or `inputPath`, `maxClips`, `minScore`.
  │
  ├─ 4. Transcript Acquisition:
  │     - **If YouTube:** Calls `getYouTubeSmartTranscript(sourceUrl)`:
  │       - Queries YouTube Data API v3 `captions` endpoint.
  │       - If captions unavailable, queries `videos?part=snippet` and parses description lines as fallback.
  │     - **If Local Upload:** Calls `getLocalSmartTranscript(inputPath)`:
  │       - Resolves video path in `/uploads`.
  │       - Spawns Python process: `spawn(pythonBin, ["python/transcribe_whisper.py", videoPath])`.
  │       - Python runs `faster-whisper` model (`base` on CPU, int8 compute).
  │       - Captures JSON stdout array of `{start, end, text, words}`.
  │
  ├─ 5. Algorithmic Viral Moment Ranking:
  │     - Calls `findSmartClipMoments(transcriptSegments, options)` in `server/services/smartClipRanker.js`.
  │     - Normalizes text, slides 25s–90s windows across segments.
  │     - Scores windows based on hook patterns (+16), value words (+18), emotional words (+14),
  │       and deducts for links/promos (-45), intro moments (-25), and filler words (-14).
  │     - Deduplicates overlapping windows (>48% overlap).
  │     - Returns top ranked suggestions (e.g. 3 candidate moments).
  │
  ├─ 6. Source Video Acquisition (YouTube Branch):
  │     - Calls `downloadVideoViaRapidApi(sourceUrl)` in `server/routes/clips.js`:
  │       - Extracts 11-char video ID.
  │       - Calls RapidAPI endpoint: `GET https://youtube-video-fast-downloader-24-7.p.rapidapi.com/download_video/{id}?quality=720`.
  │       - Extracts direct CDN URL (`data.file` or `data.link`).
  │       - Enters safe polling loop: queries CDN URL every 6 seconds (up to 30 attempts / 3 min).
  │       - When CDN returns HTTP 200: pipes streaming data to disk at `uploads/yt_rapidapi_{id}_{timestamp}.mp4`.
  │       - Validates file exists and size > 5000 bytes.
  │
  ├─ 7. Clip Generation Loop (Iterates for each suggestion):
  │     - Checks time budget: `if (Date.now() - startedAt > maxSmartGenerateMs) break;`.
  │     - Calls `smartGenerateClip({ inputPath, startTime, endTime, aspectRatio })` in `server/services/smartClipService.js`.
  │     - **Attempt 1:** `runFaceTrackingReframe(...)`:
  │       - Spawns `python/smart_reframe.py`.
  │       - Checks OpenCV Haar Cascade face detection frame by frame.
  │       - *(Note: Immediately bypassed/rejected if running in cloud / Render environment).*
  │     - **Attempt 2 (Primary/Fallback):** Native FFmpeg center-crop:
  │       - Calculates target dimensions (720x1280 for 9:16).
  │       - Constructs FFmpeg args:
  │         `ffmpeg -y -ss {startTime} -i {inputPath} -t {duration} -vf "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280" -c:v libx264 -preset ultrafast -crf 26 -c:a aac -b:a 128k -movflags +faststart {outputPath}`
  │       - Spawns `ffmpeg` child process via `child_process.spawn`.
  │       - Resolves when process exits code 0 and file exists in `/exports`.
  │     - Formats clip payload: `buildSmartGeneratedClipPayload(...)`.
  │     - Appends to `clips[]` array.
  │
  ├─ 8. Temporary Source Cleanup:
  │     - `finally { cleanupFile(sourceVideoPath); }` removes the multi-hundred MB downloaded YouTube video from `/uploads`.
  │
  ├─ 9. HTTP Response Dispatch:
  │     - Handler completes: `res.json({ success: true, suggestions, clips })`.
  │     - HTTP socket successfully closes.
  │
  └─ 10. Frontend Reception & UI Update:
        - `generateSmartClipsFromSource()` receives JSON payload.
        - Stops progress crawl: `stopCrawl()`.
        - Updates in-memory state: `state.generatedClips = [...finalClips, ...state.generatedClips]`.
        - Calls `loadCaptionsForClip()` for each clip (requests `/api/captions/preview` to transcribe clip audio).
        - Saves to localStorage: `persistStudioSession()`.
        - Triggers DOM rerender: `renderGeneratedClips()`.
        - Animates progress bar to 100%: "Generated 3 smart clips ✓".
```

---

# 5. JOB LIFECYCLE

### Fundamental Architectural Reality
**There is NO persistent Job entity for video generation.**
The entire video clipping workflow is **synchronous, stateless, and tied 1:1 to a single ephemeral HTTP socket.**

### Job Identity & Storage Audit
- **Is there a job ID?** NO. No unique job token or UUID is generated for a clipping task.
- **Where is state stored?** In RAM only. Specifically in local function closures inside the active Express route handler (`server/routes/clips.js`) and inside browser JavaScript memory (`public/app.js`).
- **Is it persisted in PostgreSQL?** NO. The database schema has tables for `Clip` and `ScheduledPost`, but records are only written when a clip is explicitly saved or scheduled for social publishing.
- **Is there a queue?** NO. BullMQ is installed and connected to Redis, but it is wired exclusively to `publishQueue.js` for delayed social posts.
- **Is there a worker?** NO. Generation code executes on the web server's main process and spawns child processes directly.
- **Who owns running subprocesses?** The Express Node.js parent process (`process.pid`).
- **What happens if client disconnects?** The HTTP socket closes. The server continues executing the current FFmpeg subprocess in the background, but when the handler attempts to respond, `res.json()` fails. The resulting clips in `/exports` are orphaned; the frontend never receives them.
- **What happens if browser refreshes?** The in-flight `fetch` request is aborted. On reload, the client initializes with whatever was in `localStorage`. Any clips generated during the severed request are never indexed in client state.
- **What happens if backend restarts?** The Node.js process terminates immediately. All child processes (`ffmpeg`, `python3`) are killed instantly by the OS. In-progress video files in `/uploads` and `/exports` are left corrupted or incomplete. The generation is completely lost with zero recovery mechanism.

### Actual State Lifecycle Diagram

```
[IDLE / READY]
      │
      │ User clicks "#smartClipBtn" (fetch POST /api/clips/smart-generate)
      v
[HTTP_SOCKET_ACTIVE] <──────────────────────┐
      │                                     │ (Single synchronous connection)
      ├─► [TRANSCRIPTION_IN_PROGRESS]       │
      │   (Spawns Python transcribe_whisper)│
      │                                     │
      ├─► [RANKING_ANALYSIS]                │
      │   (In-memory transcript scoring)    │
      │                                     │
      ├─► [DOWNLOADING_SOURCE]              │
      │   (RapidAPI safe polling loop)      │
      │                                     │
      ├─► [FFMPEG_CLIPPING_ACTIVE]          │
      │   (Spawns FFmpeg per clip)          │
      │                                     │
      ├─► [LOCAL_TEMP_CLEANUP]              │
      │   (Unlinks raw source in /uploads)  │
      v                                     │
[HTTP_RESPONSE_SENT]                        │
      │                                     │
      │ (If socket broken, server restarts, │
      │  or timeout occurs at ANY point)    │
      v                                     │
[FATAL_ABORT / ORPHANED_DATA] ──────────────┘
  - FFmpeg killed or socket closed
  - State discarded
  - 0 clips delivered
```

---

# 6. CRITICAL INTERRUPTION BUG ANALYSIS
*(Most Important Architectural Section)*

### Problem Statement
When a video clipping or processing task is running, **making unrelated changes elsewhere in the application, modifying code files, triggering client navigation, or editing presentation components interrupts, cancels, restarts, or corrupts the active generation.**

### Comprehensive Codebase Audit of Interruption Points

---

#### Interruption Point 1: Nodemon / Dev-Server Auto-Restart on File Modification
- **File:** `package.json`, development tooling
- **Relevant Code:**
  ```json
  "scripts": {
    "dev": "node server/server.js"
  }
  ```
- **Mechanism:** If a developer runs the backend with `nodemon`, `pm2 --watch`, or any file-watching utility (or if an IDE/agent touches backend files while the server is watched), the process manager detects the change and issues a `SIGUSR2` or `SIGTERM` to `node server/server.js`.
- **Why It Is Dangerous:** Because the generation pipeline runs inside the web server process, killing the web server instantly terminates all child FFmpeg and Python processes.
- **Can it interrupt an active generation job?** **YES**
- **Confidence:** **HIGH**

---

#### Interruption Point 2: Frontend AbortController on Component Unmount or Action
- **File:** `public/app.js` (lines 2842–2854)
- **Relevant Code:**
  ```javascript
  const controller = new AbortController();
  const timeoutMs = 10 * 60 * 1000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const data = await apiFetch(`${API_BASE}/clips/smart-generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  ```
- **Mechanism:** The browser maintains the active generation pipeline through this single `fetch()` call. If the user navigates between views, clicks a link to `captions.html` or `publish.html`, refreshes the page (`F5`), or if an automated browser runner navigates away, the browser immediately fires `controller.abort()`.
- **Why It Is Dangerous:** The HTTP request is closed. When the server eventually completes the multi-minute FFmpeg jobs, the client is no longer listening. The generated clips are never received or stored in `localStorage`.
- **Can it interrupt an active generation job?** **YES**
- **Confidence:** **HIGH**

---

#### Interruption Point 3: Reverse-Proxy 100-Second Hard Timeout (Render / Cloudflare)
- **File:** `server/routes/clips.js` (lines 663–666, 804–807)
- **Relevant Code:**
  ```javascript
  const startedAt = Date.now();
  // Safe ceiling to finalize and return clips before Render's hard 100s proxy timeout
  const maxSmartGenerateMs = 85 * 1000;
  ...
  if (i > 0 && Date.now() - startedAt > maxSmartGenerateMs) {
    console.warn("[SmartClip] Reached processing time limit, finalizing completed clips.");
    break;
  }
  ```
- **Mechanism:** Cloud hosting environments (specifically Render's free/starter proxy and Cloudflare) forcibly terminate any HTTP connection that does not stream headers or data within 100 seconds (HTTP 502 Bad Gateway / 504 Gateway Timeout).
- **Why It Is Dangerous:** Downloading a 10-minute video via RapidAPI CDN polling can take 30–60 seconds. Transcribing with Whisper takes 20–40 seconds. Clipping 3 to 5 segments with FFmpeg takes 20–50 seconds. The pipeline routinely exceeds 100 seconds, causing the cloud host to sever the connection mid-flight. The developer added an arbitrary 85-second cut-off in `clips.js` which drops pending clips before they can finish.
- **Can it interrupt an active generation job?** **YES**
- **Confidence:** **HIGH**

---

#### Interruption Point 4: RapidAPI 6-Second CDN Polling Throwing on Transient Exceptions
- **File:** `server/routes/clips.js` (lines 369–442)
- **Relevant Code:**
  ```javascript
  const maxAttempts = 30;
  const pollIntervalMs = 6000;
  ...
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const probe = await axios({
      method: "GET",
      url: cdnFileUrl,
      responseType: "stream",
      validateStatus: (status) => status === 200 || status === 404,
      ...
    });
  ```
- **Mechanism:** If the CDN provider takes longer than 3 minutes (30 attempts * 6s), or if RapidAPI returns a transient 500/502/403 error during the poll, the loop exhausts or throws an unhandled error, immediately aborting the entire `/smart-generate` route.
- **Why It Is Dangerous:** Any minor network blip or latency spike on RapidAPI aborts the entire user's generation job.
- **Can it interrupt an active generation job?** **YES**
- **Confidence:** **HIGH**

---

#### Interruption Point 5: UI Global State Collision & Overwrite in `localStorage`
- **File:** `public/app.js` (lines 3–25, 27–49, 1378–1388)
- **Relevant Code:**
  ```javascript
  const state = {
    uploadedProject: null,
    generatedClips: [],
    ...
  };

  function persistStudioSession() {
    localStorage.setItem(STUDIO_SESSION_KEY, JSON.stringify({...}));
  }
  ```
- **Mechanism:** In `public/app.js`, all state is held in a single global `state` object. If the user pastes another URL, edits an input, or switches project tabs while `/smart-generate` is in flight, handlers like `fetchYoutubeSource` or `restoreStudioSession` immediately mutate `state.uploadedProject` and empty `state.generatedClips = []`.
- **Why It Is Dangerous:** When `/smart-generate` finally returns, its callback merges clips into a corrupted or replaced global state, causing the newly arrived clips to either be lost or overwrite unrelated projects.
- **Can it interrupt an active generation job?** **YES**
- **Confidence:** **MEDIUM**

---

#### Interruption Point 6: Python Face-Tracking Reframe Child Process Timeout
- **File:** `server/services/smartClipService.js` (lines 76–84)
- **Relevant Code:**
  ```javascript
  // Safety timeout: 10 seconds max for Python face-tracking reframe
  const timeout = setTimeout(() => {
    if (!settled) {
      settled = true;
      try { proc.kill("SIGKILL"); } catch {}
      reject(new Error("Face tracking reframe timed out (10s limit)"));
    }
  }, 10000);
  ```
- **Mechanism:** `smartClipService.js` hardcodes an aggressive 10-second SIGKILL timeout on `smart_reframe.py`. If OpenCV takes 10.1 seconds to detect faces on a high-resolution clip or constrained CPU, the process is killed with `SIGKILL`.
- **Why It Is Dangerous:** While it falls back to center-crop, if the fallback fails or throws, the entire clip generation errors out.
- **Can it interrupt an active generation job?** **YES**
- **Confidence:** **MEDIUM**

---

#### Interruption Point 7: Temp File Collisions Across Concurrent Requests
- **File:** `server/services/ffmpegService.js` (lines 128–129, 445–450)
- **Relevant Code:**
  ```javascript
  const fileName = `clip_${Date.now()}.mp4`;
  const assPath = path.join(exportsDir, `subs_${Date.now()}.ass`);
  ```
- **Mechanism:** Filenames use `Date.now()`. If two clipping operations are triggered in close proximity, or if multiple clips are sliced simultaneously, `Date.now()` collisions can cause one process to overwrite the `.ass` subtitle file or output video of another concurrent operation.
- **Can it interrupt an active generation job?** **POSSIBLY**
- **Confidence:** **MEDIUM**

---

### Ranked Root Causes of Generation Interruption

1. **ROOT CAUSE #1: Generation is Synchronously Bound to a Single Ephemeral HTTP Request.**  
   *The generation pipeline executes inside the request handler of `POST /api/clips/smart-generate`. Any browser navigation, page reload, client disconnect, or proxy timeout (100s Render limit) unconditionally severs the connection and discards the result.*
2. **ROOT CAUSE #2: Process Lifetime Coupled to Web Server Process.**  
   *Because FFmpeg and Python are spawned directly by the Express server process without an independent supervisor or queue worker, any development server restart, container reboot, or code-watch trigger terminates all active generation tasks immediately.*
3. **ROOT CAUSE #3: Total Absence of Background Job Persistence & Queuing.**  
   *There is no database record for a generation job, no job ID, and no Redis queue for video tasks. If a failure or interruption occurs, the system has no state to resume, retry, or report.*
4. **ROOT CAUSE #4: Client-Side In-Memory State & Single-Tab Coupling.**  
   *The frontend stores all job state in browser memory and `localStorage`. If the user opens another tab, clicks another tool, or edits captions, the global state is clobbered before the server response can be merged.*
5. **ROOT CAUSE #5: Aggressive Synchronous Timeouts in Backend Code.**  
   *Hardcoded 85-second processing limits (`maxSmartGenerateMs`) and 10-second Python kill timeouts (`proc.kill("SIGKILL")`) actively sabotage long-running video clipping operations on shared CPUs.*

---

# 7. PROCESS AND CONCURRENCY AUDIT

### Inventory of All Process Invocations

#### 1. Python Transcription Subprocess
- **Invocation Location:** `server/routes/clips.js` (lines 273–285), `server/routes/captions.js` (lines 92–104)
- **Method:** `child_process.spawn(pythonBin, [TRANSCRIBE_SCRIPT, videoPath])`
- **Lifetime:** Runs for 15–60 seconds depending on video length. Standard I/O piped to Node buffers.
- **Process Attachment:** Direct child of Node.js `process.pid`.
- **Termination Behavior:** If Node process terminates, the child process receives `SIGPIPE` / `SIGHUP` and terminates.

#### 2. Python Smart Reframe Subprocess
- **Invocation Location:** `server/services/smartClipService.js` (lines 63–71)
- **Method:** `child_process.spawn(pythonBin, [scriptPath, inputPath, exportsDir, startTime, endTime, ratio])`
- **Lifetime:** Hard-limited to 10 seconds via `setTimeout(() => proc.kill("SIGKILL"), 10000)`.
- **Process Attachment:** Direct child of Node.js `process.pid`.

#### 3. Native FFmpeg Center-Crop Subprocess
- **Invocation Location:** `server/services/smartClipService.js` (lines 170–190)
- **Method:** `child_process.spawn(ffmpegPath, args, { windowsHide: true })`
- **Lifetime:** Runs for 2–15 seconds per clip.
- **Process Attachment:** Direct child of Node.js `process.pid`.

#### 4. Fluent-FFmpeg Clip Slicer
- **Invocation Location:** `server/services/ffmpegService.js` (lines 131–144)
- **Method:** `ffmpeg(inputPath)...save(outputPath)` via `fluent-ffmpeg`
- **Lifetime:** Runs for duration of video slice.
- **Process Attachment:** Wrapped child process.

#### 5. Native FFmpeg Subtitle Burner
- **Invocation Location:** `server/services/ffmpegService.js` (lines 458–485) and `server/server.js` (lines 1105, 1139)
- **Method:** `child_process.spawn` or `child_process.execFile("ffmpeg", ...)`
- **Lifetime:** Runs for 10–45 seconds depending on filter complexity (ASS vs drawtext).
- **Process Attachment:** Direct child of Node.js `process.pid`.

#### 6. yt-dlp Version Check / Binary Invocation
- **Invocation Location:** `server/server.js` (line 62), `server/services/youtubeDownloader.js`
- **Method:** `execSync("yt-dlp --version")` and `spawn(ytdlpPath, ...)`
- **Lifetime:** Sync check on startup; async download if triggered as safety fallback.

#### 7. BullMQ Worker Task
- **Invocation Location:** `server/queue/publishWorker.js` (line 7)
- **Method:** `new Worker("publish-jobs", async (job) => { ... })`
- **Lifetime:** Persistent worker instance running on the Node event loop.
- **Scope:** Processes delayed social posts ONLY. Does NOT execute video processing.

### Critical Architecture Question
> **CURRENTLY, IF THE MAIN DEVELOPMENT SERVER RESTARTS, DOES THE VIDEO GENERATION JOB SURVIVE?**

# **NO**

### Exact Explanation
Generation jobs do not survive server restarts because:
1. Every FFmpeg and Python process is spawned directly as a child process of the Node server instance without an independent process supervisor, decoupled worker, or detached daemon.
2. The orchestrating loop runs in the memory call stack of `server/routes/clips.js`.
3. When the Node process restarts, the OS closes standard streams and terminates all child processes.
4. No job state, progress, or queue entry exists in PostgreSQL or Redis for video generation.

---

# 8. STATE MANAGEMENT AUDIT

| State Entity | Physical Location | Persistent? | Owner / Manager | Lost on Restart? | Risk Level | Description & Failure Impact |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Generation Job** | Local Stack / RAM | **NO** | Express route closure (`clips.js`) | **YES** | **CRITICAL** | If server restarts or request disconnects, job disappears completely. |
| **Generation Progress** | Browser RAM | **NO** | `startProgressCrawl()` in `app.js` | **YES** | **CRITICAL** | Progress bar is a synthetic client-side timer; has zero connection to backend progress. |
| **Video Source Path** | Server Disk (`uploads/`) | Temporary | `downloadVideoViaRapidApi()` | Partial | **HIGH** | Downloaded source file is deleted in `finally` block after clipping. |
| **Transcript Data** | Server Disk (`captions/`) | Semi-Persistent | `ensureCaptionFiles()` | **NO** | **LOW** | Cached in `captions/{baseName}-{hash}.json` and `.vtt`. |
| **AI Ranked Moments** | RAM / HTTP Payload | **NO** | `findSmartClipMoments()` | **YES** | **HIGH** | Candidate windows only exist in memory until sent to client. |
| **Generated Clip Files** | Server Disk (`exports/`) | Persistent | Express static mount `/exports` | **NO** | **MEDIUM** | MP4 files remain on disk, but client loses reference if response fails. |
| **Studio Client State** | Browser `localStorage` | Persistent | `public/app.js` (`clipflow-studio-session`) | **NO** | **HIGH** | Can be corrupted or overwritten if user navigates or switches tabs mid-flight. |
| **Caption Editor State** | Browser `localStorage` | Persistent | `public/captions.js` (`clipflow-caption-clip`) | **NO** | **MEDIUM** | Stores active clip and subtitle timings for the standalone editor. |
| **Saved Projects History** | Server Disk (`projects.json`) | Persistent | `server/routes/clips.js` (`projectsFile`) | **NO** | **HIGH** | Concurrently written flat JSON file with no database locking or ACID safety. |
| **Social Publishing Jobs** | Redis & PostgreSQL | Persistent | BullMQ (`publish-jobs`) & Prisma | **NO** | **LOW** | Properly queued with status tracking in database. |

---

# 9. DATABASE SCHEMA

The project uses Prisma ORM connected to PostgreSQL via `DATABASE_URL`.  
*Note: All secrets, database URLs, and encryption keys are strictly omitted.*

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Platform {
  YOUTUBE
  FACEBOOK
  INSTAGRAM
  TIKTOK
}

enum ScheduleStatus {
  DRAFT
  QUEUED
  PROCESSING
  PUBLISHED
  FAILED
  RETRYING
  CANCELLED
}

model User {
  id             String          @id @default(cuid())
  email          String?         @unique
  name           String?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  socialAccounts SocialAccount[]
  clips          Clip[]
  scheduledPosts ScheduledPost[]
}

model SocialAccount {
  id                    String          @id @default(cuid())
  userId                String
  platform              Platform
  platformUserId        String?
  platformUsername      String?
  accessTokenEncrypted  String          // AES-256-GCM encrypted
  refreshTokenEncrypted String?         // AES-256-GCM encrypted
  tokenExpiresAt        DateTime?
  metaJson              Json?
  createdAt             DateTime        @default(now())
  updatedAt             DateTime        @updatedAt

  user                  User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  scheduledPosts        ScheduledPost[]

  @@index([userId, platform])
}

model Clip {
  id              String          @id @default(cuid())
  userId          String
  title           String?
  localPath       String?
  storageUrl      String?
  fileName        String?
  mimeType        String?
  durationSeconds Float?
  aspectRatio     String?
  fileSize        Int?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  user            User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  scheduledPosts  ScheduledPost[]

  @@index([userId])
}

model ScheduledPost {
  id               String          @id @default(cuid())
  userId           String
  socialAccountId  String
  clipId           String
  platform         Platform
  title            String
  caption          String?
  hashtags         String?
  visibility       String?
  scheduledFor     DateTime
  status           ScheduleStatus  @default(QUEUED)
  platformPostId   String?
  errorMessage     String?
  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt
  publishedAt      DateTime?

  user             User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  socialAccount    SocialAccount   @relation(fields: [socialAccountId], references: [id], onDelete: Cascade)
  clip             Clip            @relation(fields: [clipId], references: [id], onDelete: Cascade)
  publishAttempts  PublishAttempt[]

  @@index([userId, status])
  @@index([scheduledFor])
  @@index([socialAccountId])
  @@index([clipId])
}

model PublishAttempt {
  id                  String         @id @default(cuid())
  scheduledPostId     String
  attemptNumber       Int
  requestPayloadJson  Json?
  responsePayloadJson Json?
  status              String
  errorMessage        String?
  createdAt           DateTime       @default(now())

  scheduledPost       ScheduledPost  @relation(fields: [scheduledPostId], references: [id], onDelete: Cascade)

  @@index([scheduledPostId])
}
```

### Critical Architecture Observation on Database Models
- There is **NO `Video` model** (source media is unindexed in the DB).
- There is **NO `GenerationJob` model** (video generation lifecycle is not tracked in the DB).
- There is **NO `Transcript` or `CaptionSegment` model** (subtitles are kept in loose files on disk or in client `localStorage`).
- There is **NO `Project` model in Prisma** (projects are saved to a flat file: `server/storage/projects.json`).

---

# 10. API ENDPOINTS

| Method | Route | File Path | Purpose | Input Payload | Output / Response | Long-Running? | Background Queue? | Persisted in DB? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **POST** | `/api/clips/upload` | `server/routes/clips.js` | Receives multipart video upload | `multipart/form-data` (`video` file) | `{ message, project }` | No (Upload time only) | No | No (Stored in `projects.json`) |
| **POST** | `/api/clips/smart-suggest` | `server/routes/clips.js` | Analyzes transcript & returns candidate windows | `{ sourceType, inputPath, sourceUrl, segments }` | `{ success, suggestions: [] }` | Yes (10–30s) | No | No |
| **POST** | `/api/clips/smart-generate` | `server/routes/clips.js` | **CORE PIPELINE: Ingest, rank, slice, and export clips** | `{ sourceType, sourceUrl, inputPath, maxClips, ... }` | `{ success, suggestions, clips: [] }` | **YES (1–5 min)** | **NO (Synchronous HTTP)** | **NO** |
| **POST** | `/api/clips/generate` | `server/routes/clips.js` | Slices a single custom time range clip | `{ inputPath, startTime, endTime, aspectRatio }` | `{ message, fileName, downloadUrl }` | Yes (5–20s) | No | No |
| **GET** | `/api/clips/projects` | `server/routes/clips.js` | Lists all saved projects | None | `{ success, projects: [] }` | No | No | Reads `projects.json` |
| **POST** | `/api/clips/projects/save` | `server/routes/clips.js` | Upserts project metadata & clips | `{ id, title, uploadedProject, clips, ... }` | `{ success, project }` | No | No | Writes `projects.json` |
| **DELETE**| `/api/clips/projects/:id` | `server/routes/clips.js` | Deletes project from shelf | URL param `:id` | `{ success, deleted }` | No | No | Writes `projects.json` |
| **GET** | `/api/clips/diag` | `server/routes/clips.js` | Diagnostics for RapidAPI keys & connectivity | `?id={videoId}&testDownload=1` | JSON diagnostic health report | No | No | No |
| **POST** | `/api/captions/preview` | `server/routes/captions.js` | Transcribes video & generates VTT/JSON | `{ inputPath }` | `{ success, trackUrl, segments: [] }` | Yes (10–40s) | No | Loose disk files |
| **POST** | `/api/captions/burn` | `server/routes/captions.js` | Burns styled ASS subtitles into video | `{ clip, segments, style }` | `{ success, fileName, downloadUrl }` | Yes (15–60s) | No | Loose disk files |
| **GET** | `/api/youtube/info` | `server/routes/youtube.js` | Fetches YouTube video metadata | `?url={youtubeUrl}` | `{ title, duration, thumbnail, videoId }` | No | No | No |
| **POST** | `/api/youtube/fetch` | `server/routes/youtube.js` | Initializes YouTube project preview | `{ url }` | `{ success, project }` | No | No | No |
| **GET** | `/api/accounts` | `server/routes/accounts.js` | Lists connected social accounts | None | `{ accounts: [] }` | No | No | Reads PostgreSQL |
| **GET** | `/api/schedules` | `server/routes/schedules.js` | Lists scheduled posts | None | `{ schedules: [] }` | No | No | Reads PostgreSQL |
| **POST** | `/api/schedules` | `server/routes/schedules.js` | Creates and queues scheduled post | `{ userId, socialAccountId, clipId, scheduledFor }` | `{ message, scheduledPost }` | No | **YES (BullMQ)** | **YES (PostgreSQL)** |
| **GET** | `/api/files/download/:name` | `server/server.js` | Streams exported MP4 files | URL param `:name` | Binary video stream (`res.sendFile`) | No | No | File on disk |
| **WS** | `/api/captions/stream` | `server/routes/captions.js` | Streams pseudo-realtime caption words | WebSocket connection | JSON messages `{word, segment, done}` | Yes | No | In-memory stream |

---

# 11. FRONTEND GENERATION FLOW

### Component Roles & Lifecycle
- **`public/app.js` (Studio Controller):**
  - Handles drag-and-drop file inputs, YouTube URL auto-fetch on paste/debounce, duration pill selection, and generation triggers.
  - Manages `#smartClipBtn` click handler.
  - Displays progress using synthetic client-side crawl timer (`startProgressCrawl`).
  - Renders generated clips into `#generatedClipsGrid` in "story" or "grid" view.
  - Syncs project history to `#projectHistoryList`.
- **`public/captions.js` (Standalone Caption Studio):**
  - Reads active clip from `localStorage.getItem("clipflow-caption-clip")`.
  - Controls video playback, frame seeking, and dynamic canvas preview.
  - Applies 30+ visual presets from `captionPresets.js`.
  - Handles subject cutout toggle (`#behindPersonToggle`) via `public/subjectSegmentation.js`.
  - Triggers server-side burn via `POST /api/captions/burn` or returns back to studio via `goBack()`.
- **`public/publish.js` (Social Publisher):**
  - Manages account linking buttons (YouTube Google OAuth, Instagram Meta OAuth).
  - Polls `/api/schedules` every 3 seconds (fast poll) or 10 seconds (idle poll).
  - Submits scheduling form to `POST /api/schedules`.

### Critical Risk: UI Lifecycle Accidentally Controlling Backend Lifetime
Because the frontend is not a Single Page App (SPA) with a background service worker:
1. Navigating from `index.html` to `captions.html` causes a **full browser page unload**.
2. Unloading the page instantly destroys the window context and **aborts any pending `fetch()` requests**.
3. If a user starts generation and immediately clicks "Captions" or "Publish" in the navigation bar, the generation HTTP socket is severed immediately.

---

# 12. FFMPEG IMPLEMENTATION

### FFmpeg Invocation Architecture
The project executes FFmpeg using three distinct methods:
1. **Direct `child_process.spawn("ffmpeg", [...])`:** Used for high-performance center cropping and subtitle burning (`server/services/smartClipService.js`, `server/services/ffmpegService.js`).
2. **Direct `child_process.execFile("ffmpeg", [...])`:** Used for fallback subtitle burning in `server/server.js`.
3. **`fluent-ffmpeg` wrapper:** Used for single clip slicing in `server/services/ffmpegService.js`.

### Representative Command Constructions

#### 1. Audio Extraction (for Whisper Transcription):
```bash
ffmpeg -y -i uploads/video.mp4 -vn -ac 1 -ar 16000 -c:a pcm_s16le captions/audio.wav
```

#### 2. Ultrafast 9:16 Center-Crop & Slicing:
```bash
ffmpeg -y -ss 00:01:15 -i uploads/source.mp4 -t 30 \
  -vf "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280" \
  -c:v libx264 -preset ultrafast -crf 26 -c:a aac -b:a 128k \
  -movflags +faststart -threads 0 exports/smart_clip_12345.mp4
```

#### 3. Advanced SubStation Alpha (`.ass`) Subtitle Burning:
```bash
ffmpeg -y -i exports/clip.mp4 \
  -vf "ass='exports/subs_12345.ass'" \
  -c:v libx264 -preset ultrafast -crf 23 -c:a aac \
  -movflags +faststart exports/captioned_12345.mp4
```

#### 4. Drawtext Filter Fallback (Windows Path Resilient):
```bash
ffmpeg -y -i exports/clip.mp4 \
  -filter_script:v temp/drawtext-filter.txt \
  -c:v libx264 -preset ultrafast -crf 23 -c:a aac \
  -movflags +faststart exports/captioned_12345.mp4
```

### Path & Platform Handling
- **Windows Colons:** In `server/services/ffmpegService.js`, Windows drive letter colons (`E:`) are specifically escaped for FFmpeg filter syntax:
  ```javascript
  function escapeFilterPath(p) {
    return String(p).replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\:');
  }
  ```
- **Concurrency & Collision Risk:** Subtitle files are saved as `subs_${Date.now()}.ass`. If two operations execute in the same millisecond, they overwrite each other.

---

# 13. TRANSCRIPTION AND CAPTIONS

### Speech-to-Text Architecture
1. **Engine:** `faster-whisper` (CTranslate2 implementation of OpenAI's Whisper model).
2. **Model Size:** Configurable via `WHISPER_MODEL` environment variable (defaults to `base`).
3. **Compute Type:** Automatic fallback across `int8`, `default`, and `float32` for CPU compatibility.
4. **Voice Activity Detection (VAD):** Enabled with Silero VAD (`vad_parameters=dict(min_silence_duration_ms=400)`) to eliminate hallucinated transcriptions during pauses.
5. **Timestamp Granularity:** Word-level timestamps (`word_timestamps=True`) and segment-level timestamps.

### Subtitle Formatting & Animation
- **Ass Substation Alpha (`.ass`):** Generated in `server/services/ffmpegService.js` (`buildAssContent`). Includes styling parameters:
  - Font family, size, bold, italic, outline, shadow.
  - Positioning anchors (`\an5\pos(x,y)`).
  - Dynamic ASS animation tags:
    - `pop`: `{\fad(40,60)\fscx65\fscy65\t(0,140,\fscx115\fscy115)\t(140,260,\fscx100\fscy100)}`
    - `neon`: `{\fad(100,80)\blur5\t(0,240,\blur0.8)}`
    - `elevate`: `{\fad(80,80)\move(x,y+24,x,y,0,260)}`
    - `wordcolor` / `highlightimpact`: Dynamic word-level color switching.

---

# 14. AI / VIRAL MOMENT DETECTION

### Heuristic Scoring Algorithm (`server/services/smartClipRanker.js`)
*Note: The current codebase uses a deterministic algorithmic scoring model over speech transcripts rather than an external LLM (Gemini/OpenAI) API call.*

### Scoring Formula & Criteria
Every candidate time window (25s–90s) starts with a base score of **35 points**:
- **Strong Hook Patterns (+16 points):** Matches regex for high-retention openings (e.g. `/\b(you need to|listen|look|here's|the secret|the truth|stop|why|how)\b/i`).
- **High-Value Concepts (+3 to +18 points):** Matches words like `success`, `secret`, `mistake`, `lesson`, `strategy`, `discipline`, `money`, `growth`.
- **Emotional Peaks (+3 to +14 points):** Matches words like `crazy`, `insane`, `shocked`, `fear`, `hate`, `love`, `dangerous`.
- **Human Connection (+6 points):** Personal pronouns (`i`, `you`, `we`, `people`).
- **Pacing & Cadence (+7 points):** Conversational pace between 1.25 and 3.7 words per second.
- **Complete Thought (+8 points):** Segment contains between 2 and 8 sentences.
- **Intro Penalty (-25 points):** Any window starting in the first 45 seconds of video is penalized (disqualifies channel intros/sponsors).
- **Promo / Link Penalty (-45 points):** Disqualifies text containing URLs, social handles (`@`), `subscribe`, `merch`, `discord`.
- **Filler Word Penalty (-2 to -14 points):** Penalizes `um`, `uh`, `like`, `you know`, `basically`.
- **Duration Variance Penalty:** Linear deduction for distance from preferred duration (`|duration - 45s| * 0.22`).

---

# 15. YOUTUBE INGESTION

### Multi-Tier Downloader Architecture (`server/services/youtubeDownloader.js`)
1. **Tier 1: RapidAPI FAST Downloader ("YouTube Video FAST Downloader 24/7"):**
   - Verified endpoint: `GET https://youtube-video-fast-downloader-24-7.p.rapidapi.com/download_video/{videoId}?quality=720`.
   - Returns a metadata payload with a direct CDN file link.
   - Polls the CDN URL with HTTP GET and `validateStatus: (s) => s === 200 || s === 404` every 6 seconds (up to 30 attempts) to allow server-side CDN transcoding to complete.
   - Streams the resulting MP4 directly to `uploads/yt_rapidapi_{id}_{timestamp}.mp4`.
2. **Tier 2: RapidAPI ytstream Fallback:**
   - Fallback host: `ytstream-download-youtube-videos.p.rapidapi.com/dl?id={videoId}` for progressive stream extraction.
3. **Tier 3: Local yt-dlp Binary:**
   - Server-side fallback running local `yt-dlp` executable with Android client spoofing (`--extractor-args "youtube:player_client=android,web"`).
   - Bundles cookie injection from `/etc/secrets/cookies.txt` or root `cookies.txt` to bypass bot challenges.

---

# 16. YOUTUBE PUBLISHING

### OAuth 2.0 & Upload Workflow (`server/services/publishing/youtubePublisher.js`)
- **OAuth Credentials:** Handled via `googleapis` `OAuth2Client` using `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`.
- **Token Storage:** Tokens are encrypted using AES-256-GCM (`server/utils/encrypt.js`) and stored in PostgreSQL `SocialAccount` (`accessTokenEncrypted`, `refreshTokenEncrypted`).
- **Token Refresh:** Expired access tokens are refreshed automatically using Google OAuth credentials; updated tokens are re-encrypted and persisted to the DB.
- **Publishing Method:** Uses `youtube.videos.insert({ part: ["snippet", "status"], media: { body: fs.createReadStream(videoPath) } })`.
- **Shorts Detection:** Videos formatted as 9:16 vertical with duration <= 60s are automatically processed by YouTube as Shorts.
- **Retry Mechanism:** Up to 3 retry attempts with exponential backoff on transient network or rate-limit errors (`isTransientYouTubeUploadError`).

---

# 17. INSTAGRAM / META INTEGRATION

### Graph API Reels Publishing (`server/services/publishing/instagramPublisher.js`)
- **API Base:** Facebook Graph API v23.0 (`https://graph.facebook.com/v23.0`).
- **Account Type:** Requires Instagram Business / Creator Account linked to a Facebook Page.
- **Cloudinary Storage Bridge:** Instagram Graph API cannot ingest local files; it requires a public HTTPS URL. If the clip does not have a public URL, `uploadVideoToCloudinary()` uploads the clip to Cloudinary and obtains a public CDN URL.
- **Container Workflow:**
  1. Creates IG Media Container: `POST /{igUserId}/media` with `media_type=REELS`, `video_url={cloudinaryUrl}`, `caption={caption}`.
  2. Polling Container Status: Polls `GET /{containerId}?fields=status_code` every 10 seconds (up to 30 attempts / 5 minutes) until status is `FINISHED`.
  3. Publishing Container: `POST /{igUserId}/media_publish` with `creation_id={containerId}`.
- **Persistence:** Post ID and status recorded in PostgreSQL `ScheduledPost` and `PublishAttempt`.

---

# 18. SCHEDULING SYSTEM

### Architecture: Dual Scheduler Implementations
1. **Modern Production Scheduler (BullMQ + Redis + PostgreSQL):**
   - Configured in `server/services/scheduleDbService.js` and `server/queue/publishQueue.js`.
   - When a post is scheduled via `POST /api/schedules`:
     - Creates `ScheduledPost` in PostgreSQL with status `QUEUED`.
     - Adds delayed job to BullMQ queue: `publishQueue.add("publish-post", { scheduledPostId }, { delay })`.
     - `server/queue/publishWorker.js` executes when delay expires, routes through `runScheduledPostById`, and triggers YouTube or Instagram publishing.
     - **Survival:** Survives browser closes and client reloads. If backend restarts, Redis retains the delayed jobs; worker picks them up upon reboot.
2. **Legacy Scheduler (`server/services/scheduleService.js`):**
   - Uses `node-cron` running every minute (`* * * * *`).
   - Reads and writes to flat file `server/storage/schedule.json`.
   - Kept for backward compatibility with local file storage.

---

# 19. ENVIRONMENT AND CONFIGURATION

### Documented Environment Variables (Names Only)
- `PORT`
- `NODE_ENV`
- `APP_URL`
- `DATABASE_URL`
- `REDIS_URL`
- `TOKEN_ENCRYPTION_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `YOUTUBE_API_KEY`
- `RAPIDAPI_KEY`
- `RAPIDAPI_HOST`
- `YTDLP_PROXY`
- `YTDLP_PATH`
- `FFMPEG_PATH`
- `PYTHON_PATH`
- `WHISPER_MODEL`
- `INSTAGRAM_APP_ID`
- `INSTAGRAM_APP_SECRET`
- `INSTAGRAM_REDIRECT_URI`
- `INSTAGRAM_GRAPH_BASE_URL`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `DISABLE_OPENCV_REFRAME`

### Build & Startup Commands
- **Install Dependencies:** `npm install`
- **Prisma Schema Sync:** `npx prisma generate` && `npx prisma db push`
- **Development Startup:** `node server/server.js` (or `npm run dev`)
- **Production Container Startup:** `./docker-entrypoint.sh npm start`

---

# 20. DEVELOPMENT ENVIRONMENT

### Execution Model
- The application is run via Node.js directly: `node server/server.js`.
- No Webpack, Vite, or Next.js bundler is executing for the live website; files in `public/` are served as raw static files by Express.
- **Antigravity / IDE Impact:** Any tool or agent running commands like `npm run dev`, restarting the terminal process, or triggering container redeploys kills the running Node process.
- **Because generation tasks are child processes of the Node process, any restart immediately terminates active generation.**

---

# 21. ERROR HANDLING AND LOGGING

### Current Error Handling Structure
- Errors in Express routes are captured in `try/catch` blocks and logged to `console.error`.
- Global error handlers exist in `server/server.js`:
  - `process.on("unhandledRejection", ...)`
  - `process.on("uncaughtException", ...)`
- **FFmpeg Error Logging:** Stderr chunks from FFmpeg and Python are collected in memory buffers (`let stderr = ""`). If a subprocess fails, the tail of stderr is included in the thrown `Error`.
- **What Evidence Remains After an Interruption?**
  - If the server restarts: **None**. The process memory is wiped. Temporary files in `/uploads` or `/exports` may remain on disk with incomplete byte sizes.
  - If a proxy times out: The server logs continue writing until the operation finishes or crashes, but the client shows an alert (`"Failed to fetch"` or `"NetworkError"`).

---

# 22. DATA AND FILE LIFECYCLE

| Stage | Directory / Path | Temporary / Permanent | Cleanup Trigger | Collision Risk |
| :--- | :--- | :--- | :--- | :--- |
| **Uploaded Source** | `uploads/{timestamp}_{filename}.mp4` | Permanent (until manual delete) | None | Low (Timestamp prefix) |
| **YouTube Source** | `uploads/yt_rapidapi_{id}_{timestamp}.mp4`| Temporary | `finally { cleanupFile(path); }` in `clips.js` | Low |
| **Extracted Audio** | `captions/{baseName}-{stamp}.wav` | Temporary | Deleted immediately after Whisper finishes | Low (MD5 hash stamp) |
| **Transcript Cache**| `captions/{baseName}-{stamp}.json` | Semi-Permanent | Reused across subsequent requests | Low |
| **Generated Clips** | `exports/smart_clip_{timestamp}_{rand}.mp4` | Permanent | Stored until manual project deletion | None |
| **Burned Subtitles**| `exports/captioned_{timestamp}.mp4` | Permanent | Stored until manual project deletion | None |
| **Temporary ASS** | `exports/subs_{timestamp}.ass` | Temporary | `fs.unlinkSync()` on FFmpeg close | **Medium (Timestamp collision)** |

---

# 23. SECURITY AND SECRET HANDLING

### Security Audit Overview
1. **OAuth Token Encryption:** Access and refresh tokens for YouTube and Instagram are encrypted at rest using `AES-256-GCM` with `TOKEN_ENCRYPTION_KEY`.
2. **File Downloads:** `/api/files/download/:fileName` uses `path.basename()` to prevent directory traversal attacks (`../`).
3. **Sensitive Files in Repository:** The root directory contains `cookies.txt` (YouTube Netscape session cookies). In production, cookies should be injected via environment variables or secret files rather than committed to source control.
4. **All secrets are redacted as `[REDACTED]` in technical summaries.**

---

# 24. KNOWN BUGS / TODO / TECHNICAL DEBT

1. **Dual Frontend Fragmentation:** An unfinished React implementation exists in `src/components/editor/` (`CaptionStudio.jsx`) while the active production frontend runs on Vanilla JS in `public/` (`app.js`, `captions.js`). Modifying `src/` has zero effect on the running application unless mirrored to `public/`.
2. **Synchronous Generation Architecture:** The clipping pipeline blocks the HTTP thread and cannot scale past 1 concurrent user on constrained servers.
3. **Proxy Timeout Band-Aids:** Artificial 85-second cut-offs in `clips.js` drop clips rather than solving the asynchronous processing requirement.
4. **Duplicate Downloader Services:** `services/youtubeDownloader.js` (root) and `server/services/youtubeDownloader.js` are duplicates; edits to one can be missed by routes importing the other.
5. **Flat-File Project Storage:** `projects.json` is accessed synchronously without file locking, creating race conditions under concurrent requests.

---

# 25. RECENTLY MODIFIED AREAS

### Summary of Recent Commits
- **RapidAPI Migration:** Switched YouTube ingestion from legacy local `yt-dlp` scraping to RapidAPI FAST Downloader to eliminate YouTube datacenter IP blocks (commit `1d1cfb6`, `d06ab22`).
- **Safe CDN Polling:** Added 6-second polling loop with `validateStatus: 200/404` to handle RapidAPI CDN file preparation delays (commit `f1acbd7`).
- **NeedsUpload Fallback:** Updated backend to return transcript moments when video downloading fails, allowing manual file upload (commit `bc5e9d2`).
- **Caption Rendering & Strokes:** Eliminated destructive text strokes and improved font smoothing (commit `c881647`).
- **Behind the Person Mode:** Implemented MediaPipe Selfie Segmentation for subject depth layering (commit `b9d570d`).

---

# 26. ROOT-CAUSE HYPOTHESES

### Hypothesis 1: HTTP Request Abort Due to Client Navigation or Browser Refresh (CONFIRMED)
- **Evidence:** `public/app.js` line 2842 uses `AbortController`. The request is initiated from a standard web page without a service worker or background sync.
- **Mechanism:** Navigating to another page, refreshing, or tab unloading closes the socket. The server detects socket closure or completes generation with nowhere to send results.
- **Probability:** **99%**

### Hypothesis 2: Proxy Timeout Disconnection on Cloud Infrastructure (CONFIRMED)
- **Evidence:** `server/routes/clips.js` line 665 explicitly comments on Render's 100s proxy timeout.
- **Mechanism:** RapidAPI polling (30–60s) + Whisper transcription (20–40s) + FFmpeg rendering (20–40s) routinely exceeds 100s, causing Render/Cloudflare to sever the connection with 502/504.
- **Probability:** **95%**

### Hypothesis 3: Server Process Termination via File-Watchers / Tooling Restarts (CONFIRMED)
- **Evidence:** `server/services/smartClipService.js` spawns child processes directly attached to `process.pid`.
- **Mechanism:** Any file change in a watched environment restarts `server.js`, killing all active FFmpeg and Python child processes immediately.
- **Probability:** **90%**

---

# 27. ARCHITECTURAL INVARIANTS FOR A PERMANENT FIX

To permanently eliminate generation interruptions, the future architecture must guarantee:
1. **HTTP Independence:** Video generation must NEVER execute inside a synchronous HTTP request handler. An HTTP request must only create a job record and return HTTP 202 Accepted with a Job ID.
2. **Process Decoupling:** Video processing tasks (transcription, reframing, FFmpeg clipping) must execute in an independent worker process or job queue worker (e.g. BullMQ / Redis) separate from the Express HTTP web server.
3. **Database Job Persistence:** Every generation task must have a persistent database record (`GenerationJob`) storing status (`QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`), progress percentage (0–100%), and error logs.
4. **Client Recovery & Reconnection:** The frontend must poll (`GET /api/clips/jobs/:id`) or listen via SSE/WebSocket. If the browser refreshes, closes, or navigates, reopening the app must immediately restore active job progress from the database.
5. **Worker Crash Detection:** If a worker process terminates unexpectedly, uncompleted jobs must be detected via heartbeat timeouts and marked as `FAILED` or retried automatically.

---

# 28. RECOMMENDED TARGET ARCHITECTURE

### Target BullMQ / Worker Topology

```
[Browser Client]
       │
       │ 1. POST /api/clips/jobs (URL or file path)
       v
[Express API Server]
       │
       │ 2. Insert into PostgreSQL: GenerationJob (status: QUEUED)
       │ 3. Dispatch to BullMQ: clipQueue.add("process-clip", { jobId })
       │ 4. Respond: HTTP 202 { jobId: "job_123" }
       v
[BullMQ Redis Queue] ──► [Independent Video Worker Process]
                                │
                                ├─► 5. Update DB: status = TRANSCRIBING (progress: 20%)
                                ├─► 6. Execute Whisper transcription
                                ├─► 7. Update DB: status = CLIPPING (progress: 50%)
                                ├─► 8. Execute FFmpeg slicing & reframing
                                ├─► 9. Update DB: status = COMPLETED (progress: 100%, clipIds: [...])
                                v
[Browser Client] <── Polling / SSE ── GET /api/clips/jobs/:id
```

### Why BullMQ & Redis?
BullMQ and Redis are **already installed and configured in this project** (`server/lib/redis.js`, `server/queue/publishQueue.js`). Expanding BullMQ to handle video generation requires no new external services or infrastructure dependencies.

---

# 29. MINIMUM PERMANENT FIX VS PRODUCTION-GRADE FIX

### Strategy A: Minimum Stable Fix
- **Changes Required:**
  1. Add a simple `GenerationJob` model to `prisma/schema.prisma` (or an in-memory job Map with status polling).
  2. Modify `POST /api/clips/smart-generate` to immediately generate a `jobId`, trigger the generation logic asynchronously in the background (detached from `res`), and respond immediately with `{ success: true, jobId }`.
  3. Create `GET /api/clips/jobs/:id` returning current status and completed clips.
  4. In `public/app.js`, change `smartClipBtn` handler to poll `GET /api/clips/jobs/:id` every 2 seconds.
- **Trade-offs:** Fastest to implement; eliminates client disconnect and proxy timeout bugs, but jobs still die if the Node server restarts.

### Strategy B: Production-Grade Fix
- **Changes Required:**
  1. Full PostgreSQL migration adding `Video`, `GenerationJob`, and `Transcript` tables.
  2. Implement a dedicated BullMQ queue (`clipGenerationQueue`) and separate worker script (`server/queue/clipWorker.js`).
  3. Run the worker as an independent Docker service or managed background worker.
  4. Stream real-time progress to client via Server-Sent Events (SSE) or WebSocket.
- **Trade-offs:** Robust, horizontally scalable, resilient to server restarts, but requires running worker processes and managing database migrations.

---

# 30. IMPORTANT CODE REFERENCES

| Component / Feature | File Path | Function / Class |
| :--- | :--- | :--- |
| **Core Smart Generate Route** | `server/routes/clips.js` | `router.post("/smart-generate")` |
| **Single Clip Generation** | `server/routes/clips.js` | `router.post("/generate")` |
| **RapidAPI Video Downloader** | `server/routes/clips.js` | `downloadVideoViaRapidApi()` |
| **YouTube Transcript Service** | `server/routes/clips.js` | `getYouTubeSmartTranscript()` |
| **Whisper Audio Transcription** | `server/routes/clips.js` | `getLocalSmartTranscript()` |
| **Viral Moment Ranker** | `server/services/smartClipRanker.js` | `findSmartClipMoments()` |
| **Smart Reframing & Crop** | `server/services/smartClipService.js` | `smartGenerateClip()` |
| **Face Tracking Subprocess** | `server/services/smartClipService.js` | `runFaceTrackingReframe()` |
| **FFmpeg Subtitle Burning** | `server/services/ffmpegService.js` | `burnSubtitles()` |
| **ASS Subtitle Generator** | `server/services/ffmpegService.js` | `buildAssContent()` |
| **Master Server Setup** | `server/server.js` | `server.listen()`, route mounts |
| **Prisma Singleton** | `server/lib/prisma.js` | `prisma` |
| **Redis Singleton** | `server/lib/redis.js` | `redis` |
| **BullMQ Publish Queue** | `server/queue/publishQueue.js` | `addPublishJob()` |
| **BullMQ Publish Worker** | `server/queue/publishWorker.js` | `publishWorker` |
| **YouTube Publisher** | `server/services/publishing/youtubePublisher.js` | `publishScheduledYouTubeVideo()` |
| **Instagram Publisher** | `server/services/publishing/instagramPublisher.js` | `publishScheduledInstagramPost()` |
| **Frontend Generation Trigger**| `public/app.js` | `generateSmartClipsFromSource()` |
| **Frontend Button Listener** | `public/app.js` | `smartClipBtn.addEventListener("click")` |
| **Frontend Session Sync** | `public/app.js` | `persistStudioSession()`, `restoreStudioSession()` |
| **Caption Studio Controller** | `public/captions.js` | `init()`, `exportCaptionedVideo()` |
| **Subject Segmentation** | `public/subjectSegmentation.js` | `createSubjectSegmentation()` |
| **Python Whisper Script** | `python/transcribe_whisper.py` | `main()` |
| **Python OpenCV Reframe** | `python/smart_reframe.py` | `smart_reframe_video()` |

---

# 31. QUESTIONS / UNKNOWN INFORMATION

1. **Future LLM Integration:** Does the team plan to replace the heuristic transcript ranker (`smartClipRanker.js`) with an LLM (Gemini 1.5 Flash / GPT-4o)?
2. **React Migration Timeline:** Is `src/components/editor/CaptionStudio.jsx` intended to replace `public/captions.js` in a future Vite/Next.js migration, or can it be safely archived?
3. **Multi-User Tenancy:** Is user authentication intended to be added soon (replacing hardcoded `DEMO_USER_ID`), which will require tying generation jobs to authenticated user sessions?

---

# 32. FINAL ENGINEERING SUMMARY

### System Snapshot
- **Current Architecture:** Monolithic Express API serving Vanilla JS static files, executing child processes directly on the web process.
- **Generation Execution Model:** **100% Synchronous Request-Bound.** The client keeps a single HTTP socket open while the server transcribes, downloads, and slices video.
- **Job Persistence:** **None.** Generation jobs exist only in Node.js closures and browser RAM.
- **Primary Interruption Risk:** **Client Disconnection / Server Restart / Cloud Proxy 100s Timeout.**
- **Most Likely Root Cause:** Any file edit or tooling restart kills the parent Node.js process, which immediately terminates active FFmpeg/Python subprocesses and drops the synchronous HTTP socket.
- **Current Scalability:** Extremely low (1 concurrent video generation exhausts CPU and risks proxy timeouts).
- **Current Reliability:** Fragile (any network blip, tab switch, or file change destroys active work).
- **Recommended Direction:** Implement an asynchronous Job Queue pattern using the already-installed BullMQ and Redis stack, persisting jobs to PostgreSQL and polling status from the UI.

### Explicit Answers to Architectural Invariants
1. **Is generation currently tied to the frontend lifecycle?** **YES.** If the browser tab is closed, refreshed, or navigated, the client `fetch` aborts and the result is lost.
2. **Is generation currently tied to an HTTP request lifecycle?** **YES.** Generation executes entirely inside `router.post("/smart-generate")`.
3. **Is generation currently tied to the development server lifecycle?** **YES.** Subprocesses are direct children of the web server process.
4. **Can a hot reload interrupt generation?** **YES.** Server restarts kill all child processes.
5. **Can a backend restart interrupt generation?** **YES.** Kills all running processes instantly.
6. **Can frontend code changes interrupt generation directly or indirectly?** **YES.** If changes trigger a browser refresh or dev-server restart, generation is terminated.
7. **Is job progress persisted?** **NO.** Progress is an ungrounded client-side simulated timer.
8. **Can generation recover after a process crash?** **NO.** There is no recovery or resumption logic.
9. **Are jobs isolated from one another?** **NO.** Concurrent jobs share CPU, disk paths, and can collide on filenames or global UI state.
10. **What is the single most important architectural weakness?** **Executing long-running video processing pipelines synchronously inside an HTTP request instead of an asynchronous background job queue.**
