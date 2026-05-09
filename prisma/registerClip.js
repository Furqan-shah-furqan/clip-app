const fs = require("fs");
const path = require("path");
const prisma = require("../server/lib/prisma");

const DEMO_USER_ID = "cmo9s5bws0000w01wv1qwpl2b";

async function main() {
  const filePathArg = process.argv[2];
  const titleArg = process.argv[3];

  if (!filePathArg) {
    throw new Error('Usage: node prisma/registerClip.js "FULL_PATH_TO_MP4" "Optional Title"');
  }

  const absolutePath = path.resolve(filePathArg);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File does not exist: ${absolutePath}`);
  }

  const stats = fs.statSync(absolutePath);

  const clip = await prisma.clip.create({
    data: {
      userId: DEMO_USER_ID,
      title: titleArg || path.basename(absolutePath),
      localPath: absolutePath,
      fileName: path.basename(absolutePath),
      mimeType: "video/mp4",
      fileSize: stats.size,
      aspectRatio: "9:16"
    }
  });

  console.log("Clip registered successfully");
  console.log(clip);
}

main()
  .catch((error) => {
    console.error("Register clip failed:", error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });