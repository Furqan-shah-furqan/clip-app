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

const scratchJobsDir = path.join(rootDir, "scratch", "jobs");
[uploadsDir, exportsDir, captionsDir, subtitlesDir, storageDir, scratchJobsDir].forEach(ensureDir);

const ensureJsonFile = (filePath, defaultValue) => {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), "utf8");
  }
};

const scheduleFile = path.join(storageDir, "schedule.json");
const projectsFile = path.join(storageDir, "projects.json");

ensureJsonFile(scheduleFile, []);
ensureJsonFile(projectsFile, []);

const getJobWorkspace = (jobId) => {
  const safeJobId = String(jobId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeJobId) throw new Error("Invalid jobId for workspace");
  const jobDir = path.join(scratchJobsDir, safeJobId);
  const sourceDir = path.join(jobDir, "source");
  const clipsDir = path.join(jobDir, "clips");
  const tempDir = path.join(jobDir, "temp");
  [jobDir, sourceDir, clipsDir, tempDir].forEach(ensureDir);
  return {
    jobDir,
    sourceDir,
    clipsDir,
    tempDir
  };
};

module.exports = {
  rootDir,
  uploadsDir,
  exportsDir,
  captionsDir,
  subtitlesDir,
  scratchJobsDir,
  getJobWorkspace,
  storageFile: storageDir,
  scheduleFile,
  projectsFile
};