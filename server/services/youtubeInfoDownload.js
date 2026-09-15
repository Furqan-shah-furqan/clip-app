const axios = require('axios');

const HOST = 'youtube-info-download-api.p.rapidapi.com';

function responseDetail(data, key) {
  // Never serialize the full payload: it can contain HTML, URLs and tokens.
  const clean = value => {
    let text = String(value);
    if (key) text = text.split(key).join('[redacted]');
    return text.replace(/https?:\/\/\S+/gi, '[url]')
      .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]')
      .replace(/[\r\n\t]/g, ' ').slice(0, 200);
  };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'non-object response';
  return ['success', 'progress', 'code', 'status', 'text', 'message', 'error']
    .filter(name => ['string', 'number', 'boolean'].includes(typeof data[name]))
    .map(name => `${name}=${clean(data[name])}`).join('; ').slice(0, 700) || 'no status fields';
}

function providerUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password ||
      (url.port && url.port !== '443') ||
      !(url.hostname === 'savenow.to' || url.hostname.endsWith('.savenow.to'))) {
    throw new Error('YouTube Info returned an unsupported download host');
  }
  return url.href;
}

// The download request starts a job. Only the progress response supplies the
// completed file; the response's base64 HTML is never rendered or executed.
async function fetchFromYouTubeInfo(videoId, key, {
  get = axios.get, wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now = Date.now, timeoutMs = 180000, intervalMs = 3000,
} = {}) {
  const deadline = now() + timeoutMs;
  async function request(url, stage, options = {}) {
    const remaining = deadline - now();
    if (remaining <= 0) throw new Error('YouTube Info preparation timed out');
    try {
      return (await get(url, { ...options, timeout: Math.min(30000, remaining), maxRedirects: 0 })).data;
    } catch (err) {
      // Do not expose Axios request headers (which include the API key).
      throw new Error(`YouTube Info ${stage} failed (HTTP ${err.response?.status || err.code || 'network error'}): ${responseDetail(err.response?.data, key)}`);
    }
  }
  let data = await request(`https://${HOST}/ajax/download.php`, 'start', {
    params: { url: `https://www.youtube.com/watch?v=${videoId}`, format: '720',
      no_merge: 'false', allow_extended_duration: 'false', add_info: '1' },
    headers: { 'x-rapidapi-host': HOST, 'x-rapidapi-key': key },
  });
  let progressUrl;
  for (let attempt = 0; attempt < 60; attempt++) {
    // Observed live: {success:0, progress:50, text:'Preparing streaming download'}.
    // On progress checks, zero also means not finished yet. Only accept that
    // combination for a known pending state of a job already accepted above.
    const progress = data?.progress;
    const validProgress = (typeof progress === 'number' ||
      (typeof progress === 'string' && progress.trim() !== '')) &&
      Number.isFinite(Number(progress)) && Number(progress) >= 0 && Number(progress) < 1000;
    const pendingText = /^(preparing(?: streaming)? download|downloading|processing|queued|converting|merging)(?:\b|$)/i
      .test(String(data?.text || '').trim());
    const explicitError = Boolean(data?.error && data.error !== '0') ||
      /\b(failed|failure|error|cancelled|canceled|unavailable|expired)\b/i
        .test(`${data?.status || ''} ${data?.text || ''}`);
    const stillPreparing = attempt > 0 && [0, '0', false].includes(data?.success) &&
      validProgress && pendingText && !explicitError;
    if (!data || explicitError || (![true, 1, '1'].includes(data.success) && !stillPreparing)) {
      const stage = attempt === 0 ? 'start' : 'progress';
      throw new Error(`YouTube Info ${stage} rejected response: ${responseDetail(data, key)}`);
    }
    const format = String(data.full_format || data.format || '');
    if (format && format !== '720' && !/^mp4\b/i.test(format)) {
      throw new Error('YouTube Info returned audio instead of MP4 video');
    }
    const file = data.download_url || data.url;
    if (file && (data.progress == null || Number(data.progress) === 1000)) {
      return providerUrl(file);
    }
    if (!progressUrl) {
      if (data.progress_url) progressUrl = providerUrl(data.progress_url);
      else if (typeof data.id === 'string' && /^[A-Za-z0-9_-]+$/.test(data.id)) {
        // The documented start response can provide only an ID.
        progressUrl = `https://p.savenow.to/ajax/progress.php?id=${encodeURIComponent(data.id)}`;
      } else throw new Error(`YouTube Info start missing job ID: ${responseDetail(data, key)}`);
    }
    if (deadline - now() <= intervalMs) throw new Error('YouTube Info preparation timed out');
    await wait(intervalMs);
    // Never forward RapidAPI credentials to the provider's progress/CDN hosts.
    data = await request(progressUrl, 'progress');
  }
  throw new Error('YouTube Info preparation timed out');
}

module.exports = { fetchFromYouTubeInfo, providerUrl };
