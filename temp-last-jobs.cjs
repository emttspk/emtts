const { PrismaClient } = require('./apps/api/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main(){
  const jobs = await prisma.labelJob.findMany({
    where: { status: 'COMPLETED' },
    orderBy: { updatedAt: 'desc' },
    take: 3,
    select: { id: true, updatedAt: true, userId: true }
  });
  console.log('LAST_3_COMPLETED_JOBS=' + JSON.stringify(jobs));
}

main().catch((e)=>{console.error(e);process.exitCode=1;}).finally(async()=>{await prisma.$disconnect();});
