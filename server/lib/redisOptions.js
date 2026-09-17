function buildRedisOptions(redisUrl, role = "producer") {
  const options = {
    maxRetriesPerRequest: role === "worker" ? null : 1,
    enableReadyCheck: false,
    enableOfflineQueue: role === "worker",
    connectTimeout: 10000,
    retryStrategy(times) {
      if (role !== "worker" && times >= 2) return null;
      return Math.min(times * 500, 10000);
    },
  };
  if (redisUrl && redisUrl.startsWith("rediss://")) {
    options.tls = { rejectUnauthorized: false };
  }
  return options;
}

module.exports = { buildRedisOptions };
