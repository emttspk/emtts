const { PrismaClient } = require('./apps/api/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main(){
  const userId = '484bf7c6-5e8d-454c-bdb0-88a3295be8fe';
  const rows = await prisma.shipment.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: 20,
    select: { trackingNumber: true, currentStatus: true, complaintStatus: true, updatedAt: true, rawJson: true }
  });
  console.log('QUICK_USER_SHIPMENTS=' + JSON.stringify(rows.map(r=>({trackingNumber:r.trackingNumber,currentStatus:r.currentStatus,complaintStatus:r.complaintStatus,updatedAt:r.updatedAt,hasRaw:Boolean(r.rawJson)}))));
}

main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await prisma.$disconnect();});
