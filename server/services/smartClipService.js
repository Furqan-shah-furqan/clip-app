const path = require("path");
const { spawn } = require("child_process");
const { exportsDir } = require("../utils/paths");

function smartGenerateClip({ inputPath, startTime, endTime, aspectRatio }) {
  return new Promise((resolve, reject) => {
    const pythonBin = process.env.PYTHON_BIN || "python";
    const scriptPath = path.join(__dirname, "../../python/smart_reframe.py");

    const args = [
      scriptPath,
      inputPath,
      exportsDir,
      startTime,
      endTime,
      aspectRatio || "9:16"
    ];

    const child = spawn(pythonBin, args, {
      cwd: path.join(__dirname, "../../"),
      shell: false
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      try {
        const lines = stdout.trim().split("\n");
        const lastLine = lines[lines.length - 1] || "{}";
        const parsed = JSON.parse(lastLine);

        if (code !== 0 || !parsed.success) {
          return reject(new Error(parsed.error || stderr || "Smart reframe failed"));
        }

        resolve({
          fileName: parsed.fileName,
          outputPath: parsed.outputPath
        });
      } catch (err) {
        reject(new Error(stderr || stdout || err.message));
      }
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

module.exports = {
  smartGenerateClip
};