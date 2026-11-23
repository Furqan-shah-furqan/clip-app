# Automatic creator clipping — Part 1

Part 1 monitors a YouTube channel for published video uploads. A YouTube push notification creates a ClipFlow generation job for that user's account; the existing generation worker then makes up to three vertical clips. The monitor skips the channel's existing uploads, filters YouTube title/description update events by upload date and video ID, and leaves upcoming or active broadcasts for Part 2. It does not publish to social accounts; that belongs to Part 3.

## Setup

The backend needs:

- `CUSTOMER_AUTH_ENABLED=true` so monitored channels and generated jobs are tied to a signed-in ClipFlow account.
- `YOUTUBE_API_KEY` with YouTube Data API v3 enabled. ClipFlow already uses this variable for YouTube video information; Creator Monitor also uses it to resolve channel links and seed the current upload list.
- `APP_URL` set to the public HTTPS URL of this service if `RENDER_EXTERNAL_URL` is not present. The public YouTube webhook callback must be reachable at `/webhooks/youtube/:channelId`.
- The existing PostgreSQL, Redis, and generation worker configuration.

The Render Docker entrypoint runs `prisma db push` at startup, so it creates the two Part 1 tables on the next deploy. The service requests five-day YouTube feed subscriptions and renews them before they expire.

## Use

Sign in, open the left workspace menu, and select **Creator monitor** (or visit `/creators.html`). Paste a YouTube channel link, `@handle`, legacy `/user/` link, or public video link. ClipFlow resolves the channel, marks its current uploads as existing, and asks Google's PubSubHubbub hub to send future Atom feed notifications. The channel card shows the subscription state, detected uploads, and generation status; failed queue attempts can be retried there.

The YouTube push feed reports uploads and title/description edits. ClipFlow records each channel/video pair once and only queues items published after monitoring began. The notification endpoint also validates the hub's HMAC signature before processing a feed.
