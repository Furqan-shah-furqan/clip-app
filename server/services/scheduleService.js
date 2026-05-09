const fs = require("fs");
const cron = require("node-cron");
const { scheduleFile } = require("../utils/paths");

let scheduledTasks = [];

function readSchedule() {
  return JSON.parse(fs.readFileSync(scheduleFile, "utf8"));
}

function writeSchedule(data) {
  fs.writeFileSync(scheduleFile, JSON.stringify(data, null, 2), "utf8");
}

function addSchedule(item) {
  const current = readSchedule();
  const newItem = {
    id: Date.now().toString(),
    ...item,
    status: "pending",
    createdAt: new Date().toISOString()
  };
  current.push(newItem);
  writeSchedule(current);
  return newItem;
}

function getAllSchedules() {
  return readSchedule();
}

function markAsDone(id) {
  const current = readSchedule();
  const updated = current.map((item) =>
    item.id === id ? { ...item, status: "done" } : item
  );
  writeSchedule(updated);
}

function startScheduler() {
  const task = cron.schedule("* * * * *", () => {
    const now = Date.now();
    const items = readSchedule();

    items.forEach((item) => {
      if (item.status !== "pending") return;

      const scheduledTime = new Date(item.postTime).getTime();
      if (!Number.isNaN(scheduledTime) && scheduledTime <= now) {
        console.log(`[Scheduler] Ready to post: ${item.platform} | ${item.postTitle}`);
        markAsDone(item.id);
      }
    });
  });

  scheduledTasks.push(task);
}

module.exports = {
  addSchedule,
  getAllSchedules,
  startScheduler
};