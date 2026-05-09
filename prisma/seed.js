const prisma = require("../server/lib/prisma");
const { encryptText } = require("../server/utils/encrypt");

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "demo@clipflow.local" },
    update: {},
    create: {
      email: "demo@clipflow.local",
      name: "Demo User"
    }
  });

  let account = await prisma.socialAccount.findFirst({
    where: {
      userId: user.id,
      platform: "YOUTUBE"
    }
  });

  if (!account) {
    account = await prisma.socialAccount.create({
      data: {
        userId: user.id,
        platform: "YOUTUBE",
        platformUserId: "demo-channel-1",
        platformUsername: "Demo YouTube Channel",
        accessTokenEncrypted: encryptText("demo-access-token"),
        refreshTokenEncrypted: encryptText("demo-refresh-token")
      }
    });
  }

  let clip = await prisma.clip.findFirst({
    where: {
      userId: user.id,
      title: "Demo Clip"
    }
  });

  if (!clip) {
    clip = await prisma.clip.create({
      data: {
        userId: user.id,
        title: "Demo Clip",
        localPath: "server/storage/demo-clip.mp4",
        fileName: "demo-clip.mp4",
        mimeType: "video/mp4",
        durationSeconds: 30,
        aspectRatio: "9:16",
        fileSize: 1024000
      }
    });
  }

  console.log("Seed completed");
  console.log({
    userId: user.id,
    socialAccountId: account.id,
    clipId: clip.id
  });
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });