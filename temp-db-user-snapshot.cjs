const { PrismaClient } = require('./apps/api/node_modules/@prisma/client');
const prisma = new PrismaClient();

const email = 'nazimsaeed@gmail.com';
function monthKeyUTC(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, extraLabelCredits: true, extraTrackingCredits: true, createdAt: true },
  });

  if (!user) {
    console.log('[DB USER STATE] NOT_FOUND', email);
    return;
  }

  const subscription = await prisma.subscription.findFirst({
    where: { userId: user.id, status: 'ACTIVE' },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
  });

  const month = monthKeyUTC();
  const usage = await prisma.usageMonthly.findUnique({
    where: { userId_month: { userId: user.id, month } },
  });

  const labelLimit = (subscription?.plan?.monthlyLabelLimit ?? 0) + (user.extraLabelCredits ?? 0);
  const used = (usage?.labelsGenerated ?? 0) + (usage?.labelsQueued ?? 0);
  const remaining = Math.max(0, labelLimit - used);

  console.log(JSON.stringify({
    user,
    month,
    subscription: subscription ? {
      id: subscription.id,
      status: subscription.status,
      planId: subscription.planId,
      currentPeriodEnd: subscription.currentPeriodEnd,
      monthlyLabelLimit: subscription.plan?.monthlyLabelLimit ?? 0,
      monthlyTrackingLimit: subscription.plan?.monthlyTrackingLimit ?? 0,
    } : null,
    usage: usage ?? null,
    computed: { labelLimit, used, remaining },
  }, null, 2));

  console.log(`[DB USER STATE] id=${user.id} email=${user.email} remaining=${remaining}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
