import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const email = "nazimsaeed@gmail.com";
const fallbackPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || "Admin@12345";

async function main() {
  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    const user = await prisma.user.update({
      where: { email },
      data: { role: "ADMIN" },
      select: { id: true, email: true, role: true, createdAt: true },
    });

    console.log(JSON.stringify({ action: "updated", user }, null, 2));
    return;
  }

  const passwordHash = await bcrypt.hash(fallbackPassword, 10);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: "ADMIN",
    },
    select: { id: true, email: true, role: true, createdAt: true },
  });

  console.log(JSON.stringify({ action: "created", user, password: fallbackPassword }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
