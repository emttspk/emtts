const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  try {
    const count = await p.shipment.count();
    console.log('shipment_count=' + count);
  } catch (e) {
    console.error(e && e.message ? e.message : String(e));
    process.exit(1);
  } finally {
    await p.$disconnect();
  }
})();
