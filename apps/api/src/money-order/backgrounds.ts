import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { uploadsDir } from "../storage/paths.js";

export type MoneyOrderBackgrounds = {
  frontDataUrl?: string;
  backDataUrl?: string;
};

export async function loadMoneyOrderBackgrounds(): Promise<MoneyOrderBackgrounds | null> {
  const activeTemplateFrontDataUrl = await resolveActiveTemplateFrontDataUrl();
  const frontPath = (
    env.MONEY_ORDER_FRONT_IMAGE_PATH?.trim() ||
    (await resolveDefaultPath("apps/web/public/templates/mo-front-default.png")) ||
    (await resolveDefaultPath("images/NEW MO F A5.jpg")) ||
    (await resolveDefaultPath("MO/MO Front.png"))
  ) ?? "";
  const backPath = (env.MONEY_ORDER_BACK_IMAGE_PATH?.trim() || (await resolveDefaultPath("MO/MO Back.png"))) ?? "";
  if (!activeTemplateFrontDataUrl && !frontPath && !backPath) return null;

  const [front, back] = await Promise.all([
    activeTemplateFrontDataUrl ? Promise.resolve(activeTemplateFrontDataUrl) : frontPath ? fileToDataUrl(frontPath) : Promise.resolve(undefined),
    backPath ? fileToDataUrl(backPath) : Promise.resolve(undefined),
  ]);

  return { frontDataUrl: front, backDataUrl: back };
}

function getPathnameFromUrlInput(input: string) {
  try {
    if (input.startsWith("http://") || input.startsWith("https://")) {
      return new URL(input).pathname;
    }
    if (input.startsWith("/")) {
      return new URL(input, "http://local").pathname;
    }
  } catch {
    // Fallback to best-effort path normalization below.
  }

  const hashIndex = input.indexOf("#");
  const withoutHash = hashIndex >= 0 ? input.slice(0, hashIndex) : input;
  const queryIndex = withoutHash.indexOf("?");
  return queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
}

async function resolveActiveTemplateFrontDataUrl() {
  try {
    const activeTemplate = await prisma.moneyOrderTemplate.findFirst({
      where: { isActive: true },
      select: { backgroundUrl: true },
    });

    const backgroundUrl = String(activeTemplate?.backgroundUrl ?? "").trim();
    if (!backgroundUrl) return undefined;
    const pathname = getPathnameFromUrlInput(backgroundUrl);

    if (pathname.startsWith("/api/admin/templates/background/")) {
      const fileName = sanitizeFilename(decodeURIComponent(pathname.split("/").pop() ?? ""));
      if (!fileName) return undefined;
      const abs = path.resolve(uploadsDir(), "templates", fileName);
      return fileToDataUrl(abs);
    }

    if (backgroundUrl.startsWith("http://") || backgroundUrl.startsWith("https://") || backgroundUrl.startsWith("data:")) {
      return undefined;
    }

    if (pathname.startsWith("/")) {
      const normalized = pathname.replace(/^\/+/, "");
      const candidateFromWebPublic = await resolveDefaultPath(`apps/web/public/${normalized}`);
      if (candidateFromWebPublic) return fileToDataUrl(candidateFromWebPublic);

      const candidateFromApiTemplates = await resolveDefaultPath(`apps/api/templates/${normalized}`);
      if (candidateFromApiTemplates) return fileToDataUrl(candidateFromApiTemplates);
    }

    return fileToDataUrl(backgroundUrl);
  } catch {
    return undefined;
  }
}

function sanitizeFilename(input: string) {
  return path.basename(input).replace(/[^a-zA-Z0-9._-]/g, "");
}

async function resolveDefaultPath(relativePath: string) {
  const abs = path.resolve(process.cwd(), relativePath);
  try {
    await fs.access(abs);
    return abs;
  } catch {
    return undefined;
  }
}

async function fileToDataUrl(p: string) {
  const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  const buf = await fs.readFile(abs);
  const ext = path.extname(abs).toLowerCase();
  const mime =
    ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "application/octet-stream";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

