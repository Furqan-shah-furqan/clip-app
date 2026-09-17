const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildRedisOptions } = require('../server/lib/redisOptions');

test('HTTP queue producers fail quickly instead of leaving Generate on Starting', () => {
  const options = buildRedisOptions('rediss://default:test@example.invalid:6379', 'producer');
  assert.equal(options.maxRetriesPerRequest, 1);
  assert.equal(options.enableOfflineQueue, false);
  assert.equal(options.retryStrategy(2), null);
  assert.equal(options.connectTimeout, 10000);
});

test('blocking workers retain reconnect behavior', () => {
  const options = buildRedisOptions('rediss://default:test@example.invalid:6379', 'worker');
  assert.equal(options.maxRetriesPerRequest, null);
  assert.equal(options.enableOfflineQueue, true);
  assert.equal(options.retryStrategy(2), 1000);
  assert.equal(options.tls.rejectUnauthorized, false);
});
