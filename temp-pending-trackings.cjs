const { PrismaClient } = require('./apps/api/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main(){
  const rows = await prisma.shipment.findMany({
    where: { complaintEligible: true },
    orderBy: { updatedAt: 'desc' },
    take: 20,
    select: { trackingNumber: true, currentStatus: true, status: true, complaintEligible: true, complaintStatus: true, updatedAt: true, userId: true }
  });
  console.log('COMPLAINT_ELIGIBLE=' + JSON.stringify(rows));
}

main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await prisma.$disconnect();});
