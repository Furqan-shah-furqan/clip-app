// BullMQ wakes blocking reads immediately when a job arrives. A longer empty
// queue timeout reduces idle commands without delaying new jobs.
const workerOptions = Object.freeze({
  drainDelay: 60,
  stalledInterval: 60000,
  runRetryDelay: 60000,
});
const QUOTA_MESSAGE = "Clip generation is temporarily unavailable because the background queue's monthly Redis allowance is exhausted. The app owner must restore the Upstash allowance or update REDIS_URL to a working Redis database, then restart the service. Retrying now will not fix this. Existing clips and captions are unaffected.";
function isRedisQuotaError(error) {
  return /max requests limit exceeded/i.test(error?.message || '');
}
function queueFailure(error) {
  return isRedisQuotaError(error)
    ? { status: 503, code: 'REDIS_QUOTA_EXCEEDED', message: QUOTA_MESSAGE }
    : { status: 503, code: 'GENERATION_QUEUE_UNAVAILABLE', message: 'The background generation queue is unavailable. Please try again later.' };
}
module.exports = { workerOptions, isRedisQuotaError, queueFailure };
