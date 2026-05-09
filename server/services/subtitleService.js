const fs = require("fs");
const path = require("path");
const { subtitlesDir } = require("../utils/paths");

function createSampleSrt(text) {
  const cleanText = text && text.trim() ? text.trim() : "Sample subtitle text";
  return `1
00:00:00,000 --> 00:00:04,000
${cleanText}

2
00:00:04,200 --> 00:00:08,000
Customize fonts, colors, and styles here.
`;
}

function saveSubtitleFile(text) {
  const fileName = `subtitle_${Date.now()}.srt`;
  const filePath = path.join(subtitlesDir, fileName);
  fs.writeFileSync(filePath, createSampleSrt(text), "utf8");

  return {
    fileName,
    filePath
  };
}

module.exports = {
  saveSubtitleFile
};