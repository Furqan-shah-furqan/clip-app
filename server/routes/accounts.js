const express = require("express");
const prisma = require("../lib/prisma");

const router = express.Router();

router.get("/", async (_req, res) => {
  try {
    const accounts = await prisma.socialAccount.findMany({
      orderBy: { createdAt: "desc" }
    });

    return res.json({ accounts });
  } catch (error) {
    console.error("List accounts error:", error);
    return res.status(500).json({
      error: "Failed to load accounts",
      details: error.message
    });
  }
});

module.exports = router;