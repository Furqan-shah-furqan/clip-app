const IORedis = require("ioredis");
const { REDIS_URL } = require("../config/env");

const redis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null
});

module.exports = redis;