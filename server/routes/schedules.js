const {enabled,requireCustomer,asyncHandler} = require("../middleware/customerAuth");
const express = require("express");
const prisma = require("../lib/prisma");
const {
  createScheduledPost,
  listScheduledPosts,
  getScheduledPostById,
  updateScheduledPost,
  cancelScheduledPost,
  retryScheduledPost,
  ScheduleMutationError
} = require("../services/scheduleDbService");
const {
  runScheduledPostById,
  ScheduledPostExecutionError
} = require("../services/publishing/runScheduledPost");

const router = express.Router();
router.use(requireCustomer);
router.use(asyncHandler(async(req,res,next)=>{
  if (!enabled()) return next();
  if (req.body) req.body.userId=req.user.id;
  const id=req.path.split("/").filter(Boolean)[0];
  if (id && !await prisma.scheduledPost.findFirst({where:{id,userId:req.user.id}})) return res.status(404).json({error:"Scheduled post not found"});
  next();
}));

function sendScheduleMutationError(res, error, schedule = null) {
  let statusCode = 409;

  if (error.code === "NOT_FOUND") statusCode = 404;
  if (
    error.code === "INVALID_SCHEDULE_TIME" ||
    error.code === "INVALID_TITLE" ||
    error.code === "NO_UPDATES"
  ) {
    statusCode = 400;
  }

  return res.status(statusCode).json({
    error: error.message,
    code: error.code,
    schedule
  });
}

router.post("/", async (req, res) => {
  try {
    const {
      userId,
      socialAccountId,
      clipId,
      platform,
      title,
      caption,
      hashtags,
      visibility,
      scheduledFor
    } = req.body || {};

    if (!userId || !socialAccountId || !clipId || !platform || !title || !scheduledFor) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const socialAccount = await prisma.socialAccount.findUnique({
      where: { id: socialAccountId }
    });

    if (!socialAccount || (enabled() && (socialAccount.userId !== req.user.id || socialAccount.platform !== platform))) {
      return res.status(404).json({ error: "Social account not found" });
    }

    const clip = await prisma.clip.findUnique({
      where: { id: clipId }
    });

    if (!clip || (enabled() && clip.userId !== req.user.id)) {
      return res.status(404).json({ error: "Clip not found" });
    }

    const when = new Date(scheduledFor);

    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      return res.status(400).json({
        error: "scheduledFor must be a valid future datetime"
      });
    }

    const scheduledPost = await createScheduledPost({
      userId,
      socialAccountId,
      clipId,
      platform,
      title,
      caption,
      hashtags,
      visibility,
      scheduledFor
    });

    return res.json({
      message: "Scheduled post queued successfully",
      scheduledPost
    });
  } catch (error) {
    console.error("Create schedule error:", error);
    return res.status(500).json({
      error: "Failed to create scheduled post",
      details: error.message
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const posts = await listScheduledPosts(enabled() ? req.user.id : undefined);
    return res.json({ schedules: posts });
  } catch (error) {
    console.error("List schedules error:", error);
    return res.status(500).json({
      error: "Failed to load schedules",
      details: error.message
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const schedule = await getScheduledPostById(req.params.id);

    if (!schedule) {
      return res.status(404).json({ error: "Scheduled post not found" });
    }

    return res.json({ schedule });
  } catch (error) {
    console.error("Get schedule error:", error);
    return res.status(500).json({
      error: "Failed to load scheduled post",
      details: error.message
    });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const schedule = await updateScheduledPost(req.params.id, req.body || {});
    return res.json({
      message: "Scheduled post updated successfully",
      schedule
    });
  } catch (error) {
    console.error("Update schedule error:", error);

    if (error instanceof ScheduleMutationError) {
      const schedule = await getScheduledPostById(req.params.id);
      return sendScheduleMutationError(res, error, schedule);
    }

    return res.status(500).json({
      error: "Failed to update scheduled post",
      details: error.message
    });
  }
});

router.post("/:id/cancel", async (req, res) => {
  try {
    const schedule = await cancelScheduledPost(req.params.id);
    return res.json({
      message: "Scheduled post cancelled successfully",
      schedule
    });
  } catch (error) {
    console.error("Cancel schedule error:", error);

    if (error instanceof ScheduleMutationError) {
      const schedule = await getScheduledPostById(req.params.id);
      return sendScheduleMutationError(res, error, schedule);
    }

    return res.status(500).json({
      error: "Failed to cancel scheduled post",
      details: error.message
    });
  }
});

router.post("/:id/retry", async (req, res) => {
  try {
    const schedule = await retryScheduledPost(req.params.id, req.body || {});
    return res.json({
      message: "Scheduled post re-queued successfully",
      schedule
    });
  } catch (error) {
    console.error("Retry schedule error:", error);

    if (error instanceof ScheduleMutationError) {
      const schedule = await getScheduledPostById(req.params.id);
      return sendScheduleMutationError(res, error, schedule);
    }

    return res.status(500).json({
      error: "Failed to retry scheduled post",
      details: error.message
    });
  }
});

router.post("/:id/run-now", async (req, res) => {
  try {
    const result = await runScheduledPostById(req.params.id);

    const updatedSchedule = await prisma.scheduledPost.findUnique({
      where: { id: req.params.id },
      include: {
        socialAccount: {select:{id:true,userId:true,platform:true,platformUsername:true}},
        clip: true,
        publishAttempts: true
      }
    });

    return res.json({
      message: "Scheduled post executed successfully",
      schedule: updatedSchedule,
      result
    });
  } catch (error) {
    console.error("Run-now error:", error);

    const updatedSchedule = await prisma.scheduledPost.findUnique({
      where: { id: req.params.id },
      include: {
        socialAccount: {select:{id:true,userId:true,platform:true,platformUsername:true}},
        clip: true,
        publishAttempts: true
      }
    });

    if (error instanceof ScheduledPostExecutionError) {
      let statusCode = 409;

      if (error.code === "NOT_FOUND") statusCode = 404;
      if (error.code === "UNSUPPORTED_PLATFORM") statusCode = 400;

      return res.status(statusCode).json({
        error: error.message,
        code: error.code,
        schedule: updatedSchedule
      });
    }

    return res.status(500).json({
      error: "Failed to execute scheduled post",
      details: error.message,
      schedule: updatedSchedule
    });
  }
});

module.exports = router;