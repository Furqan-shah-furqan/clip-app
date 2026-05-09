const path = require("path");
const fs = require("fs");

const rootDir = path.join(__dirname, "../../");
const uploadsDir = path.join(rootDir, "uploads");
const exportsDir = path.join(rootDir, "exports");
const captionsDir = path.join(rootDir, "captions");
const subtitlesDir = path.join(rootDir, "subtitles");
const storageDir = path.join(__dirname, "../storage");

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

[uploadsDir, exportsDir, captionsDir, subtitlesDir, storageDir].forEach(ensureDir);

const ensureJsonFile = (filePath, defaultValue) => {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), "utf8");
  }
};

const scheduleFile = path.join(storageDir, "schedule.json");
const projectsFile = path.join(storageDir, "projects.json");

ensureJsonFile(scheduleFile, []);
ensureJsonFile(projectsFile, []);

module.exports = {
  rootDir,
  uploadsDir,
  exportsDir,
  captionsDir,
  subtitlesDir,
  storageFile: storageDir,
  scheduleFile,
  projectsFile
};