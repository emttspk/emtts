import { PrismaClient } from "@prisma/client";
import path from "node:path";
import { fileURLToPath } from "node:url";

function normalizeSqliteDatabaseUrl(url: string | undefined) {
	if (!url || !url.startsWith("file:")) return url;

	const fileTarget = url.slice(5);
	const isAbsolute = /^[A-Za-z]:[/\\]|^\//.test(fileTarget);
	if (isAbsolute) return url;

	const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
	const resolved = path.resolve(appDir, fileTarget).replace(/\\/g, "/");
	return `file:${resolved}`;
}

process.env.DATABASE_URL = normalizeSqliteDatabaseUrl(process.env.DATABASE_URL);

export const prisma = new PrismaClient();

