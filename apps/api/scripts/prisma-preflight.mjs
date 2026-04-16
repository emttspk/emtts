import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const migrationsTable = await prisma.$queryRawUnsafe(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = '_prisma_migrations'
    ) AS exists`
  );

  const userTables = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
       AND table_name NOT LIKE 'pg_%'
       AND table_name <> '_prisma_migrations'`
  );

  const hasMigrationsTable = Boolean(migrationsTable?.[0]?.exists);
  const tableCount = Number(userTables?.[0]?.count ?? 0);

  if (!hasMigrationsTable && tableCount > 0) {
    console.error("Prisma preflight failed: database is not empty and _prisma_migrations is missing.");
    console.error("Resolve with one of these production-safe options before startup:");
    console.error("1) Reset DB to empty, then deploy migrations.");
    console.error("2) Baseline existing schema, then deploy migrations:");
    console.error("   npm run prisma:baseline:mark-init");
    console.error("   npm run prisma:migrate:deploy");
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("Prisma preflight error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
