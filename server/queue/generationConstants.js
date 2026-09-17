/**
 * Generation Queue & Worker Shared Constants
 * Single source of truth for queue names, Redis keys, and heartbeat configuration.
 */

const GENERATION_QUEUE_NAME = "clip-generation-jobs";
const WORKER_HEARTBEAT_KEY = "clipflow:generation-worker:heartbeat";
const WORKER_HEARTBEAT_TTL_SEC = 180;
const WORKER_HEARTBEAT_INTERVAL_MS = 60000;

module.exports = {
  GENERATION_QUEUE_NAME,
  WORKER_HEARTBEAT_KEY,
  WORKER_HEARTBEAT_TTL_SEC,
  WORKER_HEARTBEAT_INTERVAL_MS,
};
