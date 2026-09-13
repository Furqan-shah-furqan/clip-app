/**
 * ClipFlow YouTube Downloader Diagnostic Script
 *
 * Usage:
 *   node server/scripts/diagnoseYouTube.js [youtube-url] [--download-test]
 *   npm run diagnose:youtube -- "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
 *
 * Verifies:
 * - yt-dlp binary availability and version
 * - Cookie file detection, readability, and Netscape format validity (without exposing tokens)
 * - JavaScript runtimes (Deno / Node.js) for challenge solving
 * - Metadata & format extraction via yt-dlp simulation
 * - Structured authentication classification (OK vs BOT_CHECK vs PO_TOKEN_REQUIRED)
 * - Optional lightweight download smoke test (--download-test)
 */

const fs = require("fs");
const path = require("path");
const {
  getYtDlpPath,
  getFfmpegPath,
  resolveYouTubeCookieFile,
  buildYtDlpBaseArgs,
  classifyYtDlpError,
  runCommand,
  cleanupFile,
} = require("../services/youtubeDownloader");

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));

  const targetUrl = args[0] || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const runDownloadTest = flags.includes("--download-test");

  console.log("\n=================================================");
  console.log("=== ClipFlow YouTube Downloader Diagnostic ===");
  console.log("=================================================");
  console.log(`Target URL: ${targetUrl}`);

  // 1. yt-dlp binary & version probe
  const ytDlpBinary = getYtDlpPath();
  let ytDlpVersion = "unknown";
  let ytDlpAvailable = false;

  try {
    const vRes = await runCommand(ytDlpBinary, ["--version"], { timeoutMs: 10000 });
    ytDlpVersion = (vRes.stdout || "").trim();
    ytDlpAvailable = true;
    console.log(`[Diagnostic] yt-dlp binary:      ${ytDlpBinary} (v${ytDlpVersion})`);
  } catch (vErr) {
    console.error(`[Diagnostic] yt-dlp binary:      FAILED (${vErr.message})`);
  }

  // 2. FFmpeg probe
  const ffmpegBinary = getFfmpegPath();
  let ffmpegAvailable = false;
  try {
    await runCommand(ffmpegBinary, ["-version"], { timeoutMs: 10000 });
    ffmpegAvailable = true;
    console.log(`[Diagnostic] FFmpeg binary:      ${ffmpegBinary} (OK)`);
  } catch {
    console.log(`[Diagnostic] FFmpeg binary:      ${ffmpegBinary} (Not found / not in PATH)`);
  }

  // 3. JavaScript runtime probe (Deno / Node)
  let denoAvailable = false;
  try {
    await runCommand("deno", ["--version"], { timeoutMs: 5000 });
    denoAvailable = true;
  } catch {}

  console.log(`[Diagnostic] JS Runtimes:        Deno: ${denoAvailable ? "available" : "not found"}, Node: available (v${process.version})`);

  // 4. Cookie file detection & Netscape format check
  const cookieInfo = resolveYouTubeCookieFile();
  if (cookieInfo.valid) {
    console.log(`[Diagnostic] Cookies configured: YES`);
    console.log(`[Diagnostic] Cookies format:     VALID Netscape HTTP Cookie File (${(cookieInfo.size / 1024).toFixed(1)} KB)`);
    console.log(`[Diagnostic] Cookies path:       ${cookieInfo.path}`);
  } else {
    console.log(`[Diagnostic] Cookies configured: NO (${cookieInfo.reason})`);
    if (cookieInfo.path) {
      console.log(`[Diagnostic] Candidate path:     ${cookieInfo.path} (Failed: ${cookieInfo.reason})`);
    }
  }

  // 5. Metadata extraction test (Simulation without download)
  console.log("\n[Diagnostic] Probing YouTube metadata & format extraction...");
  const simArgs = buildYtDlpBaseArgs({
    targetUrl,
    simulate: true,
    playerClient: null,
    cookiePath: cookieInfo.valid ? cookieInfo.path : null,
  });

  let metadataPass = false;
  let classifiedResult = null;
  let videoTitle = "";
  let durationSec = 0;
  let formatCount = 0;

  try {
    const simRes = await runCommand(ytDlpBinary, simArgs, { timeoutMs: 35000 });
    const jsonLines = simRes.stdout.split("\n").filter((l) => l.trim().startsWith("{"));
    if (jsonLines.length > 0) {
      const parsed = JSON.parse(jsonLines[0]);
      videoTitle = parsed.title || "Unknown Title";
      durationSec = parsed.duration || 0;
      formatCount = Array.isArray(parsed.formats) ? parsed.formats.length : 0;
      metadataPass = true;
    }
  } catch (simErr) {
    classifiedResult = classifyYtDlpError(simErr);
  }

  if (metadataPass) {
    console.log(`[Diagnostic] Metadata status:    PASS`);
    console.log(`[Diagnostic] Title:              "${videoTitle}"`);
    console.log(`[Diagnostic] Duration:           ${durationSec}s`);
    console.log(`[Diagnostic] Available formats:  ${formatCount} stream formats found`);
    console.log(`[Diagnostic] Authentication:     OK (No bot block detected)`);
  } else {
    console.log(`[Diagnostic] Metadata status:    FAILED`);
    console.log(`[Diagnostic] Classified Code:    ${classifiedResult?.code}`);
    console.log(`[Diagnostic] Technical Summary:  ${classifiedResult?.technicalSummary}`);
    console.log(`[Diagnostic] Authentication:     ${classifiedResult?.code === "BOT_CHECK" ? "BOT_CHECK (Challenge enforced on IP)" : "FAILED"}`);
  }

  // 6. Optional lightweight download smoke test
  if (runDownloadTest && metadataPass) {
    console.log("\n[Diagnostic] Executing lightweight download smoke test (smallest available stream)...");
    const testPath = path.resolve(__dirname, "../../scratch", `smoke_test_${Date.now()}.mp4`);
    fs.mkdirSync(path.dirname(testPath), { recursive: true });

    const dlArgs = buildYtDlpBaseArgs({
      targetUrl,
      targetPath: testPath,
      playerClient: null,
      cookiePath: cookieInfo.valid ? cookieInfo.path : null,
      format: "bestvideo*[height<=720]+bestaudio/best[height<=720]/best",
      extraArgs: ["--download-sections", "*0-5"],
    });

    try {
      await runCommand(ytDlpBinary, dlArgs, { timeoutMs: 45000 });
      if (fs.existsSync(testPath) && fs.statSync(testPath).size > 1000) {
        const sizeKb = (fs.statSync(testPath).size / 1024).toFixed(1);
        console.log(`[Diagnostic] Download test:      PASS (${sizeKb} KB downloaded)`);
        cleanupFile(testPath);
      } else {
        console.log(`[Diagnostic] Download test:      FAILED (Downloaded file was empty or missing)`);
      }
    } catch (dlErr) {
      const classifiedDl = classifyYtDlpError(dlErr);
      console.log(`[Diagnostic] Download test:      FAILED (${classifiedDl.code}: ${classifiedDl.technicalSummary})`);
      cleanupFile(testPath);
    }
  } else if (runDownloadTest) {
    console.log("\n[Diagnostic] Skipping download smoke test because metadata probe failed.");
  }

  // 7. Overall Summary
  console.log("\n=================================================");
  console.log("=== Diagnostic Summary ===");
  console.log("=================================================");
  console.log(`yt-dlp available:            ${ytDlpAvailable ? "PASS" : "FAIL"}`);
  console.log(`Cookies path configured:     ${cookieInfo.valid ? "PASS" : "NOT_CONFIGURED"}`);
  console.log(`Cookies format valid:        ${cookieInfo.valid ? "PASS" : "FAIL_OR_NOT_PRESENT"}`);
  console.log(`JS Runtimes (Deno/Node):     ${denoAvailable ? "DENO+NODE" : "NODE_ONLY"}`);
  console.log(`Metadata extraction:         ${metadataPass ? "PASS" : "FAIL"}`);
  console.log(`Overall Readiness:           ${metadataPass ? "READY FOR YOUTUBE EXTRACTION" : "AUTHENTICATION_OR_IP_CHALLENGE"}`);

  if (!metadataPass && classifiedResult?.code === "BOT_CHECK") {
    console.log("\n[Action Required for Render Cloud Deployment]:");
    console.log("1. Export fresh YouTube cookies in Netscape cookies.txt format from your browser.");
    console.log("2. Upload the file to Render Dashboard -> clipflow-studio -> Environment -> Secret Files -> cookies.txt.");
    console.log("3. Re-run this diagnostic to verify authenticated access.");
  }
  console.log("=================================================\n");
}

main().catch((err) => {
  console.error("Diagnostic script encountered unhandled error:", err);
  process.exit(1);
});
