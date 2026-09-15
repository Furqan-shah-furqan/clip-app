const axios = require('axios');

const HOST = 'youtube-info-download-api.p.rapidapi.com';

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
  async function request(url, options = {}) {
    const remaining = deadline - now();
    if (remaining <= 0) throw new Error('YouTube Info preparation timed out');
    try {
      return (await get(url, { ...options, timeout: Math.min(30000, remaining), maxRedirects: 0 })).data;
    } catch (err) {
      // Do not expose Axios request headers (which include the API key).
      throw new Error(`YouTube Info request failed (HTTP ${err.response?.status || err.code || 'network error'})`);
    }
  }
  let data = await request(`https://${HOST}/ajax/download.php`, {
    params: { url: `https://www.youtube.com/watch?v=${videoId}`, format: '720',
      no_merge: 'false', allow_extended_duration: 'false', add_info: '1' },
    headers: { 'x-rapidapi-host': HOST, 'x-rapidapi-key': key },
  });
  let progressUrl;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (!data || ![true, 1, '1'].includes(data.success)) {
      throw new Error('YouTube Info reported an unsuccessful download job');
    }
    const format = String(data.full_format || data.format || '');
    if (format && format !== '720' && !/^mp4\b/i.test(format)) {
      throw new Error('YouTube Info returned audio instead of MP4 video');
    }
    const file = data.download_url || data.url;
    if (file && (data.progress == null || Number(data.progress) === 1000)) {
      return providerUrl(file);
    }
    if (!progressUrl) progressUrl = providerUrl(data.progress_url);
    if (deadline - now() <= intervalMs) throw new Error('YouTube Info preparation timed out');
    await wait(intervalMs);
    // Never forward RapidAPI credentials to the provider's progress/CDN hosts.
    data = await request(progressUrl);
  }
  throw new Error('YouTube Info preparation timed out');
}

module.exports = { fetchFromYouTubeInfo, providerUrl };
