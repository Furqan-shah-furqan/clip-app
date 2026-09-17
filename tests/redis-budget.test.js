const { test } = require('node:test');
const assert = require('node:assert/strict');
const { queueFailure } = require('../server/queue/redisBudget');
test('exhausted allowance produces a non-retry-loop 503 with actionable instructions', () => {
  const result = queueFailure(new Error('ERR max requests limit exceeded. Limit: 500000, Usage: 500001.'));
  assert.equal(result.status, 503);
  assert.equal(result.code, 'REDIS_QUOTA_EXCEEDED');
  assert.match(result.message, /Upstash/);
  assert.match(result.message, /Retrying now will not fix/);
  assert.doesNotMatch(result.message, /Usage:|500001/);
});
test('other failures remain queue failures and never expose raw connection details', () => {
  for (const error of [new Error('connect ECONNREFUSED rediss://secret:password@example:6379'), null]) {
    const result = queueFailure(error);
    assert.equal(result.status, 503);
    assert.equal(result.code, 'GENERATION_QUEUE_UNAVAILABLE');
    assert.doesNotMatch(result.message, /secret|password|exhausted/);
  }
});
