# Redis request allowance

Upstash's `ERR max requests limit exceeded` means the monthly database request allowance is exhausted. Code deployment does not reset this allowance. Generation and scheduled publishing need a working Redis database.

This mitigation changes empty-queue blocking timeouts from 5 to 60 seconds, stalled-job checks from 30 to 60 seconds, worker error retries from 15 to 60 seconds, and generation heartbeats from 20 to 60 seconds (TTL 180 seconds). Blocking reads wake when jobs arrive; these are not intentional one-minute job delays. Stalled-job recovery may take longer. Active job lock renewal remains unchanged. These changes reduce idle traffic but do not guarantee any plan's monthly allowance.

Generation enqueue failures return HTTP 503 with a stable code and an actionable message. Queue error listeners prevent unhandled queue error events. The health endpoint exposes the Render commit revision to verify deployment; it is web-process liveness, not Redis readiness.

To restore generation now, the owner must restore allowance through the Upstash console (a paid upgrade requires consent), wait for the allowance reset, or configure a suitable working Redis database via REDIS_URL and restart the service. Do not delete the existing database or discard pending publishing jobs. Any database migration needs its own queue migration review.

No provider billing settings, Redis credentials, existing queue data, caption timing, transcription, or clip processing algorithms were changed. Validation: two error classification/sanitization tests passed. A live generation was not attempted because it would consume quota and cannot succeed while the allowance is exhausted.
