const { PrismaClient } = require('./apps/api/node_modules/@prisma/client');
const prisma = new PrismaClient();

const email = 'nazimsaeed@gmail.com';
function monthKeyUTC(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log('[DB USER STATE] NOT_FOUND', email);
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      role: 'ADMIN',
      extraLabelCredits: 500,
    },
  });

  const refreshed = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, role: true, extraLabelCredits: true },
  });

  const month = monthKeyUTC();
  const sub = await prisma.subscription.findFirst({
    where: { userId: user.id, status: 'ACTIVE' },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
  });
  const usage = await prisma.usageMonthly.findUnique({ where: { userId_month: { userId: user.id, month } } });
  const labelLimit = (sub?.plan?.monthlyLabelLimit ?? 0) + (refreshed?.extraLabelCredits ?? 0);
  const used = (usage?.labelsGenerated ?? 0) + (usage?.labelsQueued ?? 0);
  const remaining = Math.max(0, labelLimit - used);

  console.log(`[DB USER STATE] id=${refreshed.id} email=${refreshed.email} role=${refreshed.role} remaining=${remaining}`);
  console.log(JSON.stringify({ labelLimit, used, remaining }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
