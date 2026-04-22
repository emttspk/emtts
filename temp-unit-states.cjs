const { PrismaClient } = require('./apps/api/node_modules/@prisma/client');
const prisma = new PrismaClient();

function monthKeyUTC(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

async function dump(email) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, extraLabelCredits: true } });
  if (!user) return null;
  const month = monthKeyUTC();
  const sub = await prisma.subscription.findFirst({ where: { userId: user.id, status: 'ACTIVE' }, include: { plan: true }, orderBy: { createdAt: 'desc' } });
  const usage = await prisma.usageMonthly.findUnique({ where: { userId_month: { userId: user.id, month } } });
  const limit = (sub?.plan?.monthlyLabelLimit ?? 0) + (user.extraLabelCredits ?? 0);
  const used = (usage?.labelsGenerated ?? 0) + (usage?.labelsQueued ?? 0);
  return { email, userId: user.id, month, limit, labelsGenerated: usage?.labelsGenerated ?? 0, labelsQueued: usage?.labelsQueued ?? 0, remaining: Math.max(0, limit - used) };
}

async function main(){
  const emails = [
    'railway.quick.1776853708912@example.com',
    'railway.units.1776853643666@example.com',
    'railway.complaint.1776853993493@example.com'
  ];
  const rows = [];
  for (const e of emails) rows.push(await dump(e));
  console.log('UNIT_STATE_ROWS=' + JSON.stringify(rows));
}

main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await prisma.$disconnect();});
