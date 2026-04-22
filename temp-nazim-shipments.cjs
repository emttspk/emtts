const { PrismaClient } = require('./apps/api/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main(){
  const userId = 'f15498a3-5f0f-43e2-b03e-a4f380d43de1';
  const rows = await prisma.shipment.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    select: { trackingNumber: true, currentStatus: true, complaintStatus: true, updatedAt: true }
  });
  const pending = rows.filter(r => String(r.currentStatus || '').toUpperCase().startsWith('PENDING'));
  console.log('NAZIM_SHIPMENTS=' + JSON.stringify(rows.slice(0,10)));
  console.log('NAZIM_PENDING=' + JSON.stringify(pending.slice(0,10)));
}

main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await prisma.$disconnect();});
