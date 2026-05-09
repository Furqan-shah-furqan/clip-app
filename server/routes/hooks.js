const express = require("express");
const router = express.Router();

router.post("/generate", (req, res) => {
  const { topic, style } = req.body;

  if (!topic) {
    return res.status(400).json({ error: "Topic is required" });
  }

  const hooks = [
    `Stop scrolling — ${topic} is easier than you think.`,
    `This is the mistake most people make with ${topic}.`,
    `Want better results with ${topic}? Start here.`,
    `Nobody tells you this about ${topic}.`
  ];

  const titles = [
    `How to improve ${topic}`,
    `${topic}: beginner shortcut`,
    `${topic} made simple`,
    `Best way to start ${topic}`
  ];

  const hashtags = [
    "#shorts #viral #contentcreator",
    "#reels #growth #socialmedia",
    "#tiktoktips #creator #videoediting"
  ];

  res.json({
    style: style || "Bold",
    hooks,
    titles,
    hashtags
  });
});

module.exports = router;