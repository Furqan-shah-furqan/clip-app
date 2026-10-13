const express = require("express");
const prisma = require("../lib/prisma");

const {enabled, requireCustomer, asyncHandler} = require("../middleware/customerAuth");
const router = express.Router();
router.use(requireCustomer);

router.get("/", async (req, res) => {
  try {
    const accounts = await prisma.socialAccount.findMany({
      where: enabled() ? {userId:req.user.id} : {},
      select: {id:true,userId:true,platform:true,platformUserId:true,platformUsername:true,createdAt:true,tokenExpiresAt:true},
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

router.delete("/:id", asyncHandler(async(req,res)=>{
  if (!enabled()) return res.status(403).json({error:"Customer sign-in required"});
  const account = await prisma.socialAccount.findFirst({where:{id:req.params.id,userId:req.user.id}});
  if (!account) return res.status(404).json({error:"Account not found"});
  await prisma.scheduledPost.updateMany({where:{socialAccountId:account.id,status:{in:["QUEUED","DRAFT","RETRYING"]}},data:{status:"CANCELLED"}});
  await prisma.socialAccount.delete({where:{id:account.id}});
  res.json({success:true});
}));
module.exports = router;