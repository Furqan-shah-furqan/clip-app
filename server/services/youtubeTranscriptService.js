const { YoutubeTranscript } = require("youtube-transcript");

async function fetchYouTubeTranscript(videoId) {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: "en" });
    if (!transcript || !transcript.length) throw new Error("No transcript found");

    return transcript.map((item) => ({
      start: item.offset / 1000,
      end: (item.offset + item.duration) / 1000,
      text: item.text.replace(/\n/g, " ").trim(),
    }));
  } catch (err) {
    throw new Error(`Transcript fetch failed: ${err.message}`);
  }
}

module.exports = { fetchYouTubeTranscript };