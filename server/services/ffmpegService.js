const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');
const { exportsDir } = require('../utils/paths');

const localBinFfmpeg = path.resolve(__dirname, '../../bin/ffmpeg.exe');
const localBinFfprobe = path.resolve(__dirname, '../../bin/ffprobe.exe');
if (fs.existsSync(localBinFfmpeg)) {
  ffmpeg.setFfmpegPath(localBinFfmpeg);
}
if (fs.existsSync(localBinFfprobe)) {
  ffmpeg.setFfprobePath(localBinFfprobe);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function clamp(num, min, max) {
  return Math.min(max, Math.max(min, num));
}

function parseTimeToSeconds(time) {
  if (time == null || time === '') return 0;
  if (typeof time === 'number' && Number.isFinite(time)) return time;
  const parts = String(time).split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return Number(time) || 0;
}

function toAssTime(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const cs = Math.round((s % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function hexToABGR(hex = '#000000', opacityPercent = 100) {
  const clean = String(hex || '#000000').replace('#', '').padEnd(6, '0').slice(0, 6);
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  const alpha = Math.round((1 - clamp(Number(opacityPercent) || 0, 0, 100) / 100) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
  return `&H${alpha}${b}${g}${r}`.toUpperCase();
}

function hexToFFmpegColor(hex = '#ffffff', alpha = 1) {
  const clean = String(hex || '#ffffff').replace('#', '').padEnd(6, '0').slice(0, 6);
  const a = clamp(alpha, 0, 1).toFixed(2);
  return `0x${clean}@${a}`;
}

function escapeAssText(text = '') {
  return String(text)
    .replace(/\r?\n/g, '\\N')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}');
}

function escapeDrawtextText(text = '') {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/%/g, '\\%')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// KEY FIX: escape backslashes → forward slashes, then escape colon in drive letter (Windows)
function escapeFilterPath(p) {
  return String(p)
    .replace(/\\/g, '/')
    .replace(/^([A-Za-z]):/, '$1\\:');
}

function wrapText(text, maxChars) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) { current = word; continue; }
    if (current.length + 1 + word.length <= maxChars) current += ` ${word}`;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.join('\\N');
}

function normalizeText(text, textTransform = 'none') {
  let result = String(text || '').trim();
  if (textTransform === 'uppercase') result = result.toUpperCase();
  if (textTransform === 'lowercase') result = result.toLowerCase();
  return result;
}

function getCropFilter(aspectRatio) {
  switch (aspectRatio) {
    case '9:16':
      return ['scale=-2:1920', 'crop=1080:1920:(in_w-1080)/2:max(0,(in_h-1920)*0.18)'].join(',');
    case '1:1':
      return ['scale=1080:-2', 'crop=1080:1080:(in_w-1080)/2:max(0,(in_h-1080)*0.12)'].join(',');
    case '16:9':
    default:
      return ['scale=1280:-2', 'crop=1280:720:(in_w-1280)/2:max(0,(in_h-720)*0.08)'].join(',');
  }
}

function generateClip({ inputPath, startTime, endTime, aspectRatio }) {
  return new Promise((resolve, reject) => {
    try {
      ensureDir(exportsDir);
      const startSeconds = parseTimeToSeconds(startTime);
      const endSeconds = parseTimeToSeconds(endTime);
      const duration = Math.max(endSeconds - startSeconds, 1);
      const fileName = `clip_${Date.now()}.mp4`;
      const outputPath = path.join(exportsDir, fileName);

      ffmpeg(inputPath)
        .setStartTime(startSeconds)
        .setDuration(duration)
        .videoFilters(getCropFilter(aspectRatio))
        .outputOptions([
          '-preset', 'ultrafast',
          '-crf', '23',
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-movflags', '+faststart',
        ])
        .on('end', () => resolve({ fileName, outputPath }))
        .on('error', (err) => reject(err))
        .save(outputPath);
    } catch (err) {
      reject(err);
    }
  });
}

function calcWrapChars(videoW, fontSize) {
  return Math.max(10, Math.round((videoW * 0.78) / (fontSize * 0.52)));
}

function getCaptionAnchor(style = {}, videoW = 1080, videoH = 1920) {
  let x, y;
  if (style.positionX != null && Number.isFinite(Number(style.positionX))) {
    x = Math.round(videoW * (Number(style.positionX) / 100));
  } else {
    x = Math.round(videoW / 2);
  }

  if (style.positionY != null && Number.isFinite(Number(style.positionY))) {
    y = Math.round(videoH * (Number(style.positionY) / 100));
  } else {
    const margin = Number(style.marginV || 0) || Math.round(videoH * 0.08);
    if (style.position === 'top') y = Math.round(videoH * 0.12);
    else if (style.position === 'center') y = Math.round(videoH / 2);
    else y = Math.round(videoH - margin);
  }
  return { x, y };
}

function assAnimTag(animStyle, durationMs, anchor) {
  const dur = Math.max(300, Number(durationMs) || 300);
  const fadeIn = Math.min(180, Math.round(dur * 0.18));
  const fadeOut = Math.min(140, Math.round(dur * 0.14));

  const x = Math.round(anchor?.x ?? 540);
  const y = Math.round(anchor?.y ?? 1600);

  switch (animStyle) {
    case 'classic':
      return `{\\an5\\pos(${x},${y})\\fad(${fadeIn},${fadeOut})}`;

    case 'elevate':
      return `{\\an5\\fad(80,80)\\move(${x},${y + 24},${x},${y},0,260)\\fscx94\\fscy94\\t(0,260,\\fscx100\\fscy100)}`;

    case 'reveal':
      return `{\\an5\\pos(${x},${y})\\fad(100,90)\\blur8\\t(0,260,\\blur0)}`;

    case 'highlight':
      return `{\\an5\\pos(${x},${y})\\fad(60,80)\\fscx88\\fscy88\\t(0,180,\\fscx108\\fscy108)\\t(180,320,\\fscx100\\fscy100)}`;

    case 'neon':
      return `{\\an5\\pos(${x},${y})\\fad(100,80)\\blur5\\t(0,240,\\blur0.8)}`;

    case 'cinematic':
      return `{\\an5\\fad(140,120)\\move(${x},${y + 20},${x},${y},0,300)}`;

    case 'pop':
      return `{\\an5\\pos(${x},${y})\\fad(40,60)\\fscx65\\fscy65\\t(0,140,\\fscx115\\fscy115)\\t(140,260,\\fscx100\\fscy100)}`;

    case 'typewriter':
      return `{\\an5\\pos(${x},${y})\\fad(25,40)}`;

    case 'oneword':
    case 'twoword':
      return `{\\an5\\pos(${x},${y})\\fad(30,40)\\fscx92\\fscy92\\t(0,110,\\fscx100\\fscy100)}`;

    case 'wordappend':
      return `{\\an5\\pos(${x},${y})\\fad(30,40)}`;

    case 'highlightimpact':
      return `{\\an5\\pos(${x},${y})\\fad(45,70)\\fscx90\\fscy90\\t(0,140,\\fscx110\\fscy110)\\t(140,280,\\fscx100\\fscy100)}`;

    case 'wordcolor':
      return `{\\an5\\pos(${x},${y})\\fad(${fadeIn},${fadeOut})}`;

    case 'none':
    default:
      return `{\\an5\\pos(${x},${y})}`;
  }
}

function colorizeAssWords(text) {
  const colors = ['&H00FFFFFF', '&H0000E5FF', '&H004ADE80', '&H00FB923C', '&H00C084FC', '&H00FF6B6B'];
  let index = 0;
  return String(text).split(/(\\N|\s+)/).map((part) => {
    if (!part || part === '\\N' || /^\s+$/.test(part)) return part;
    const color = colors[index % colors.length];
    index += 1;
    return `{\\1c${color}\\b1}${part}{\\rDefault}`;
  }).join('');
}

function highlightImpactAssWords(text) {
  return String(text).split(/(\\N|\s+)/).map((part, index) => {
    if (!part || part === '\\N' || /^\s+$/.test(part)) return part;
    const clean = part.replace(/[^a-zA-Z0-9]/g, '');
    if (clean.length >= 5 || index % 3 === 1) {
      return `{\\1c&H00E5FF&\\b1}${part}{\\rDefault}`;
    }
    return part;
  }).join('');
}

function buildAssDialogueText(text, animStyle, durationMs, anchor) {
  const tag = assAnimTag(animStyle, durationMs, anchor);
  if (animStyle === 'wordcolor') return `${tag}${colorizeAssWords(text)}`;
  if (animStyle === 'highlightimpact') return `${tag}${highlightImpactAssWords(text)}`;
  return `${tag}${text}`;
}



function buildAssContent(segments, style = {}) {
  const fontSize = Math.round(Number(style.fontSize) || 28);
  const fontName = String(style.fontFamily || 'Arial').replace(/['"]/g, '').split(',')[0].trim() || 'Arial';
  const bold = Number(style.fontWeight) >= 700 ? -1 : 0;
  const italic = style.fontStyle === 'italic' ? -1 : 0;
  const textTransform = style.textTransform || 'none';
  const animStyle = style.animationStyle || style.sourceAnimationStyle || 'none';
  const videoW = Number(style.exportVideoWidth || style.playResX || 1080);
  const videoH = Number(style.exportVideoHeight || style.playResY || 1920);
  const letterSpacing = Number(style.letterSpacing) || 0;
  const bgOpacity = clamp(Number(style.bgOpacity ?? 0), 0, 100);
  const hasShadow = Boolean(style.textShadow);

  const primaryColor = hexToABGR(style.textColor || '#ffffff', 100);
  const backColor = hexToABGR(style.bgColor || '#000000', bgOpacity);

  let outlineColor = hexToABGR(style.shadowColor || '#000000', 100);
  let borderStyle = bgOpacity > 5 ? 3 : 1;
  let outline = 0;
  let shadow = 0;

  switch (animStyle) {
    case 'neon':
      outlineColor = hexToABGR(style.shadowColor || '#00e5ff', 90);
      borderStyle = 1; outline = 4; shadow = 0;
      break;
    case 'highlightimpact':
      outlineColor = hexToABGR(style.shadowColor || '#00e5ff', 90);
      borderStyle = 1; outline = 5; shadow = 1;
      break;
    case 'reveal':
      outlineColor = hexToABGR(style.shadowColor || '#0d1b3e', 80);
      borderStyle = bgOpacity > 5 ? 3 : 1; outline = bgOpacity > 5 ? 0 : 1; shadow = 0;
      break;
    case 'highlight':
    case 'wordcolor':
    case 'wordappend':
      borderStyle = 3; outline = 0; shadow = 0;
      break;
    case 'pop':
      borderStyle = bgOpacity > 5 ? 3 : 1;
      outlineColor = hexToABGR(style.shadowColor || '#7b0000', 100);
      outline = 3; shadow = 2;
      break;
    case 'cinematic':
      borderStyle = 3; outline = 0; shadow = 0;
      break;
    case 'typewriter':
      borderStyle = 3;
      outlineColor = hexToABGR(style.shadowColor || '#39ff14', 65);
      outline = 1; shadow = 0;
      break;
    case 'elevate':
    case 'oneword':
    case 'twoword':
      if (hasShadow) {
        outlineColor = hexToABGR(style.shadowColor || '#000000', 80);
        outline = 2; shadow = 1;
      }
      break;
    default:
      if (hasShadow) {
        outlineColor = hexToABGR(style.shadowColor || '#000000', 80);
        outline = 2; shadow = 1;
      }
      if (bgOpacity > 5) {
        borderStyle = 3; outlineColor = '&H00000000'; outline = 0; shadow = 0;
      }
      break;
  }

  const alignment = style.position === 'top' ? 8 : style.position === 'center' ? 5 : 2;
  const marginV = style.position === 'top' ? Math.round(videoH * 0.06) : style.position === 'center' ? 0 : Math.round(videoH * 0.06);
  const charsPerLine = calcWrapChars(videoW, fontSize);
  const anchor = getCaptionAnchor({ ...style, marginV }, videoW, videoH);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${videoW}
PlayResY: ${videoH}
ScaledBorderAndShadow: yes
WrapStyle: 0
YCbCr Matrix: TV.601

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},${primaryColor},${outlineColor},${backColor},${bold},${italic},0,0,100,100,${letterSpacing},0,${borderStyle},${outline},${shadow},${alignment},60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = segments.map((seg) => {
    const start = Number(seg.start) || 0;
    const end = Math.max(start + 0.2, Number(seg.end) || start + 0.2);
    const durationMs = Math.round((end - start) * 1000);

    let text = normalizeText(seg.text, textTransform);
    text = text.replace(/\r?\n/g, '\\N');
    if (!text.includes('\\N')) text = wrapText(text, charsPerLine);
    text = escapeAssText(text);
    text = buildAssDialogueText(text, animStyle, durationMs, anchor);

    return `Dialogue: 0,${toAssTime(start)},${toAssTime(end)},Default,,0,0,0,,${text}`;
  }).join('\n');

  return header + events;
}

function buildDrawtextFilters(segments, style = {}) {
  const fontSize = Math.round(Number(style.fontSize) || 28);
  const fontColor = hexToFFmpegColor(style.textColor || '#ffffff', 1);
  const bgOpacity = clamp(Number(style.bgOpacity ?? 0), 0, 100) / 100;
  const bgColor = hexToFFmpegColor(style.bgColor || '#000000', bgOpacity);
  const textTransform = style.textTransform || 'none';
  const videoW = Number(style.exportVideoWidth || 1080);
  const videoH = Number(style.exportVideoHeight || 1920);
  const animStyle = style.animationStyle || style.sourceAnimationStyle || 'none';
  const charsPerLine = calcWrapChars(videoW, fontSize);

  const posXPercent = Number.isFinite(Number(style.positionX)) ? Number(style.positionX) : 50;
  const posYPercent = Number.isFinite(Number(style.positionY))
    ? Number(style.positionY)
    : style.position === 'top' ? 12 : style.position === 'center' ? 50 : 82;

  const x = `(w-text_w)*${(posXPercent / 100).toFixed(2)}`;
  const y = `(h-text_h)*${(posYPercent / 100).toFixed(2)}`;

  return segments.map((seg) => {
    const start = Number(seg.start) || 0;
    const end = Math.max(start + 0.2, Number(seg.end) || start + 0.2);
    const dur = end - start;
    const fadeInDur = Math.min(0.3, dur * 0.25);
    const fadeOutDur = Math.min(0.25, dur * 0.18);
    const fadeOutStart = Math.max(start + fadeInDur, end - fadeOutDur);

    let text = normalizeText(seg.text, textTransform);
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    for (const word of words) {
      if (!current) current = word;
      else if (current.length + 1 + word.length <= charsPerLine) current += ` ${word}`;
      else { lines.push(current); current = word; }
    }
    if (current) lines.push(current);
    text = lines.join('\n');

    const safeText = escapeDrawtextText(text);
    const enableExpr = `between(t,${start},${end})`;

    let alphaExpr;
    switch (animStyle) {
      case 'reveal':
      case 'cinematic':
        alphaExpr = `if(lt(t,${(start + fadeInDur).toFixed(3)}),(t-${start.toFixed(3)})/${fadeInDur.toFixed(3)},if(gt(t,${fadeOutStart.toFixed(3)}),(${end.toFixed(3)}-t)/${fadeOutDur.toFixed(3)},1))`;
        break;
      case 'neon':
        alphaExpr = `if(lt(t,${(start + 0.1).toFixed(3)}),(t-${start.toFixed(3)})/0.1,if(gt(t,${fadeOutStart.toFixed(3)}),(${end.toFixed(3)}-t)/${fadeOutDur.toFixed(3)},0.72+0.28*sin(2*PI*(t-${start.toFixed(3)})/0.8)))`;
        break;
      default:
        alphaExpr = `if(lt(t,${(start + fadeInDur).toFixed(3)}),(t-${start.toFixed(3)})/${fadeInDur.toFixed(3)},if(gt(t,${fadeOutStart.toFixed(3)}),(${end.toFixed(3)}-t)/${fadeOutDur.toFixed(3)},1))`;
    }

    const boxBorderW = bgOpacity > 0 ? Math.max(2, Math.round(fontSize * 0.35)) : 0;

    let filter = 'drawtext=';
    filter += `text='${safeText}'`;
    filter += `:fontsize=${fontSize}`;
    filter += `:fontcolor=${fontColor}`;
    filter += `:alpha='${alphaExpr}'`;
    filter += `:x=${x}`;
    filter += `:y=${y}`;
    filter += `:enable='${enableExpr}'`;
    filter += `:line_spacing=${Math.max(0, Math.round(fontSize * 0.18))}`;
    if (boxBorderW > 0) filter += `:box=1:boxcolor=${bgColor}:boxborderw=${boxBorderW}`;
    if (style.textShadow) filter += `:shadowx=2:shadowy=2:shadowcolor=0x000000@0.7`;

    return filter;
  });
}

function burnSubtitles({ inputPath, segments, style }) {
  return new Promise((resolve, reject) => {
    if (!segments || !segments.length) return reject(new Error('No segments'));

    ensureDir(exportsDir);

    const fileName = `captioned_${Date.now()}.mp4`;
    const outputPath = path.join(exportsDir, fileName);

    // Write ASS next to output — exportsDir has no spaces, avoids os.tmpdir() space issue
    const assPath = path.join(exportsDir, `subs_${Date.now()}.ass`);
    const assContent = buildAssContent(segments, style || {});
    fs.writeFileSync(assPath, assContent, 'utf8');

    // escapeFilterPath: backslashes → forward slashes + escape drive colon (E: → E\:)
    const safeAssPath = escapeFilterPath(assPath);
    const safeOutput = outputPath.replace(/\\/g, '/');

    const ffmpegBin = fs.existsSync(localBinFfmpeg) ? localBinFfmpeg : 'ffmpeg';
    const proc = spawn(ffmpegBin, [
      '-y',
      '-i', inputPath,
      '-vf', `ass='${safeAssPath}'`,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      safeOutput,
    ], { windowsHide: true });

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('error', (err) => {
      try { fs.unlinkSync(assPath); } catch {}
      reject(err);
    });

    proc.on('close', (code) => {
      try { fs.unlinkSync(assPath); } catch {}
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve({ fileName, outputPath });
      } else {
        reject(new Error(`FFmpeg burn failed: ${stderr.slice(-600)}`));
      }
    });
  });
}

function suggestMoments() {
  return [
    { start: '00:00:00', end: '00:00:30', note: 'Strong intro clip' },
    { start: '00:00:30', end: '00:01:00', note: 'Second engaging segment' },
    { start: '00:01:00', end: '00:01:30', note: 'Good hook-worthy part' },
  ];
}

module.exports = {
  generateClip,
  burnSubtitles,
  suggestMoments,
  buildAssContent,
  buildDrawtextFilters,
  parseTimeToSeconds,
  hexToABGR,
};