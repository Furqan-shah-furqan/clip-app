const path = require("path");
const fs = require("fs");
const { rootDir } = require("./paths");

/**
 * Returns an ordered array of potential Python binary candidates.
 * Prioritizes virtualenvs (.venv) on Windows and Linux/Docker (including Render /app/.venv),
 * then explicit environment variables, then known system Python installations, and finally PATH commands.
 */
function getPythonCandidates() {
  const isWindows = process.platform === "win32";

  const winVenv = path.resolve(rootDir, ".venv", "Scripts", "python.exe");
  const linuxVenv = path.resolve(rootDir, ".venv", "bin", "python");
  const dockerVenv = "/app/.venv/bin/python";

  const winPy311 = "C:\\Users\\xpert computers\\AppData\\Local\\Programs\\Python\\Python311\\python.exe";
  const winPy312 = "C:\\Users\\xpert computers\\AppData\\Local\\Programs\\Python\\Python312\\python.exe";

  const candidates = [
    // 1. Explicit environment variable if valid
    process.env.PYTHON_PATH && (fs.existsSync(process.env.PYTHON_PATH) || !path.isAbsolute(process.env.PYTHON_PATH))
      ? process.env.PYTHON_PATH
      : null,

    // 2. Docker / Cloud container virtualenv (Render / Railway)
    fs.existsSync(dockerVenv) ? dockerVenv : null,

    // 3. Local virtual environments
    isWindows && fs.existsSync(winVenv) ? winVenv : null,
    !isWindows && fs.existsSync(linuxVenv) ? linuxVenv : null,

    // 4. Windows Python 3.11 / 3.12 installs with compiled wheels
    isWindows && fs.existsSync(winPy311) ? winPy311 : null,
    isWindows && fs.existsSync(winPy312) ? winPy312 : null,

    // 5. Standard command binaries
    isWindows ? "python" : "python3",
    isWindows ? "py" : "python",
    "python3",
  ];

  // De-duplicate and filter nulls
  const seen = new Set();
  const result = [];
  for (const c of candidates) {
    if (c && !seen.has(c)) {
      seen.add(c);
      result.push(c);
    }
  }

  return result;
}

function getPrimaryPythonPath() {
  const candidates = getPythonCandidates();
  return candidates[0] || (process.platform === "win32" ? "python" : "python3");
}

module.exports = {
  getPythonCandidates,
  getPrimaryPythonPath,
};
