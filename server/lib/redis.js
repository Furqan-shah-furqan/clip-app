const IORedis = require("ioredis");
const { REDIS_URL } = require("../config/env");
const { buildRedisOptions } = require("./redisOptions");

/**
 * Creates an IORedis client configured specifically for BullMQ compatibility.
 * BullMQ requires maxRetriesPerRequest: null.
 * Also configures TLS if the URL scheme is rediss:// (e.g. Render Redis, Upstash, AWS ElastiCache).
 */
function createRedisClient(label = "redis", role = "producer") {
  const options = buildRedisOptions(REDIS_URL, role);

  const client = new IORedis(REDIS_URL, options);

  client.on("connect", () => {
    // Intentionally safe log without exposing credentials
    console.log(`[Redis][${label}] Connected to Redis`);
  });

  client.on("ready", () => {
    console.log(`[Redis][${label}] Connection ready`);
  });

  client.on("error", (err) => {
    console.error(`[Redis][${label}] Connection error: ${err.message}`);
  });

  client.on("reconnecting", (delay) => {
    console.warn(`[Redis][${label}] Reconnecting in ${delay}ms...`);
  });

  return client;
}

// Shared default client for lightweight key-value checks (e.g. worker heartbeat)
const defaultRedis = createRedisClient("default", "producer");

module.exports = defaultRedis;
module.exports.createRedisClient = createRedisClient;
module.exports.default = defaultRedis;
