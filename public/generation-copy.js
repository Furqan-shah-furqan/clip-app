/* Presentation copy only: errors remain visible; no invented processing stages. */
(function (root) {
  function generationCopy(value) {
    const text = String(value || '').replace(/^•\s*/, '').trim();
    if (/failed|unable|cannot|cancelled|canceled|upload.*required/i.test(text)) return text;
    if (/alternate|downloader|FAST download limit|retry/i.test(text)) return 'Preparing your video · trying another source';
    const clip = text.match(/(?:moment|clip)\s+(\d+)\s+of\s+(\d+)/i);
    if (clip) return `Preparing clip ${clip[1]} of ${clip[2]}`;
    if (/upload/i.test(text)) return 'Uploading your video';
    if (/download|fetch|source/i.test(text)) return 'Preparing your video';
    if (/transcri|audio|speech/i.test(text)) return 'Analyzing speech and audio';
    if (/analy|viral|moment|select/i.test(text)) return 'Finding standout moments';
    if (/facecam|gameplay/i.test(text)) return 'Framing facecam and gameplay';
    if (/caption|subtitle/i.test(text)) return 'Preparing captions';
    if (/render|clipping|encoding/i.test(text)) return 'Rendering your clips';
    if (/final|saving|finish/i.test(text)) return 'Finishing your clips';
    if (/complete|ready/i.test(text)) return 'Your clips are ready';
    if (/queue|waiting/i.test(text)) return 'Waiting to start';
    return 'Analyzing your video';
  }
  if (typeof module !== 'undefined') module.exports = generationCopy;
  else root.clipflowGenerationCopy = generationCopy;
})(globalThis);
