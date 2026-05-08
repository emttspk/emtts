import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { env } from "../config.js";
import { requireAuth, requireAdmin, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { uploadsDir } from "../storage/paths.js";
import { launchPuppeteerBrowser } from "../pdf/render.js";
import { moneyOrderHtml } from "../templates/labels.js";
import { loadMoneyOrderBackgrounds } from "../money-order/backgrounds.js";
import { renderMoneyOrderTemplate } from "../templates/TemplateRenderer.js";

const TEMPLATE_DESIGNER_ADMIN_EMAIL = "nazimsaeed@gmail.com";
const TEMPLATE_UPLOAD_DIR = path.join(uploadsDir(), "templates");
const DEFAULT_TEMPLATE_BACKGROUND_URL = "/templates/mo-front-default.png";
const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".pdf"]);
const SUPPORTED_MIME_TYPES = new Set(["image/png", "image/jpeg", "application/pdf"]);

function isTemplateDesignerEnabled() {
  return String(env.ENABLE_TEMPLATE_DESIGNER ?? "false").trim().toLowerCase() === "true";
}

async function ensureTemplateUploadDir() {
  await fs.mkdir(TEMPLATE_UPLOAD_DIR, { recursive: true });
}

async function ensureDefaultTemplateBackgroundAsset() {
  return;
}

async function convertPdfFirstPageToPng(pdfFileName: string): Promise<string | null> {
  const safePdfFileName = sanitizeFilename(pdfFileName);
  const absPdfPath = path.resolve(TEMPLATE_UPLOAD_DIR, safePdfFileName);
  const absTemplateDir = path.resolve(TEMPLATE_UPLOAD_DIR);

  if (!absPdfPath.startsWith(absTemplateDir)) {
    return null;
  }

  const pngFileName = `${randomUUID()}.png`;
  const absPngPath = path.resolve(TEMPLATE_UPLOAD_DIR, pngFileName);
  const pdfUrl = pathToFileURL(absPdfPath).toString();
  const browser = await launchPuppeteerBrowser();

  try {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 1.25 });
      await page.goto(pdfUrl, { waitUntil: "networkidle0", timeout: 30_000 });
      await page.screenshot({ path: absPngPath, type: "png", fullPage: false });
    } finally {
      await page.close();
    }
  } catch (error) {
    console.error("[TemplateDesigner] Failed to convert PDF background to PNG preview:", error);
    await fs.rm(absPngPath, { force: true }).catch(() => undefined);
    return null;
  } finally {
    await browser.close().catch(() => undefined);
  }

  return pngFileName;
}

function sanitizeFilename(input: string) {
  return path.basename(input).replace(/[^a-zA-Z0-9._-]/g, "");
}

const templateUpload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => {
      try {
        await ensureTemplateUploadDir();
        cb(null, TEMPLATE_UPLOAD_DIR);
      } catch (error) {
        cb(error as Error, TEMPLATE_UPLOAD_DIR);
      }
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      cb(new Error("Only png, jpg, jpeg, and pdf files are supported"));
      return;
    }

    if (!SUPPORTED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error("Unsupported file type"));
      return;
    }

    cb(null, true);
  },
});

const templateCreateSchema = z.object({
  name: z.string().min(1).max(120),
  backgroundUrl: z.string().max(500).optional().nullable(),
  version: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

const templateUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  backgroundUrl: z.string().max(500).optional().nullable(),
  version: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

const fieldTypeEnum = z.enum(["text", "barcode", "box", "date", "amount"]);

const fieldCreateSchema = z.object({
  fieldKey: z.string().min(1).max(120),
  fieldType: fieldTypeEnum,
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  fontSize: z.number().int().min(6).max(200).optional(),
  fontFamily: z.string().min(1).max(80).optional(),
  fontWeight: z.enum(["normal", "bold"]).optional(),
  fontStyle: z.enum(["normal", "italic"]).optional(),
  textColor: z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  rotation: z.number().min(-360).max(360).optional(),
  isLocked: z.boolean().optional(),
});

const fieldUpdateSchema = z.object({
  fieldKey: z.string().min(1).max(120).optional(),
  fieldType: fieldTypeEnum.optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  fontSize: z.number().int().min(6).max(200).optional(),
  fontFamily: z.string().min(1).max(80).optional(),
  fontWeight: z.enum(["normal", "bold"]).optional(),
  fontStyle: z.enum(["normal", "italic"]).optional(),
  textColor: z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  rotation: z.number().min(-360).max(360).optional(),
  isLocked: z.boolean().optional(),
});

const previewSchema = z.object({
  sampleData: z.record(z.union([z.string(), z.number(), z.null()])).optional(),
});

const templateInclude = {
  fields: {
    orderBy: { createdAt: "asc" as const },
  },
};

const DEFAULT_TEMPLATE_NAME = "Default Money Order Template";
const DEFAULT_TEMPLATE_FIELDS = [
  "sender_name",
  "sender_cnic",
  "receiver_name",
  "receiver_address",
  "sender_address",
  "tracking_id",
  "money_order_id",
  "amount",
  "amount_words",
  "date",
] as const;

function inferFieldType(fieldKey: string): "text" | "date" | "amount" {
  if (fieldKey === "date") return "date";
  if (fieldKey === "amount") return "amount";
  return "text";
}

async function ensureDefaultTemplate() {
  await ensureDefaultTemplateBackgroundAsset();
  const existing = await prisma.moneyOrderTemplate.count();
  if (existing > 0) {
    const activeTemplate = await prisma.moneyOrderTemplate.findFirst({
      where: { isActive: true },
      select: { id: true, backgroundUrl: true },
    });

    if (activeTemplate && !activeTemplate.backgroundUrl) {
      await prisma.moneyOrderTemplate.update({
        where: { id: activeTemplate.id },
        data: { backgroundUrl: DEFAULT_TEMPLATE_BACKGROUND_URL },
      });
    }
    return;
  }

  await prisma.moneyOrderTemplate.create({
    data: {
      name: DEFAULT_TEMPLATE_NAME,
      version: 1,
      isActive: true,
      backgroundUrl: DEFAULT_TEMPLATE_BACKGROUND_URL,
      fields: {
        create: DEFAULT_TEMPLATE_FIELDS.map((fieldKey, index) => ({
          fieldKey,
          fieldType: inferFieldType(fieldKey),
          x: 40,
          y: 40 + index * 42,
          width: 320,
          height: 34,
          fontSize: 13,
          fontFamily: "Arial",
          fontWeight: "normal",
          fontStyle: "normal",
          textColor: "#0f172a",
          textAlign: "left",
          rotation: 0,
          isLocked: false,
        })),
      },
    },
  });
}

async function requireTemplateDesignerAccess(req: AuthedRequest, res: any, next: any) {
  if (!isTemplateDesignerEnabled()) {
    return res.status(404).json({ error: "Not found" });
  }

  if (!req.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { email: true, role: true },
  });

  if (!user || user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (user.email.toLowerCase() !== TEMPLATE_DESIGNER_ADMIN_EMAIL) {
    return res.status(403).json({ error: "Forbidden" });
  }

  return next();
}

export const adminTemplatesRouter = Router();

adminTemplatesRouter.use(requireAuth, requireAdmin, requireTemplateDesignerAccess);

adminTemplatesRouter.get("/", async (_req, res) => {
  await ensureDefaultTemplate();

  const templates = await prisma.moneyOrderTemplate.findMany({
    include: templateInclude,
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
  });

  return res.json({ templates });
});

adminTemplatesRouter.post("/", async (req, res) => {
  const body = templateCreateSchema.parse(req.body);

  const template = await prisma.moneyOrderTemplate.create({
    data: {
      name: body.name,
      backgroundUrl: body.backgroundUrl ?? null,
      version: body.version ?? 1,
      isActive: Boolean(body.isActive),
    },
    include: templateInclude,
  });

  if (template.isActive) {
    await prisma.moneyOrderTemplate.updateMany({
      where: { id: { not: template.id } },
      data: { isActive: false },
    });
  }

  return res.status(201).json({ template });
});

adminTemplatesRouter.post("/upload", (req, res) => {
  templateUpload.single("file")(req, res, (err) => {
    if (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      return res.status(400).json({ error: message });
    }

    const finalizeUpload = async () => {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "File is required" });
      }

      const originalFileName = sanitizeFilename(file.filename);
      const ext = path.extname(originalFileName).toLowerCase();
      let responseFileName = originalFileName;
      let sourcePdfUrl: string | null = null;

      if (ext === ".pdf") {
        sourcePdfUrl = `/api/admin/templates/background/${encodeURIComponent(originalFileName)}`;
        const convertedPngName = await convertPdfFirstPageToPng(originalFileName);
        if (convertedPngName) {
          responseFileName = convertedPngName;
        }
      }

      const backgroundUrl = `/api/admin/templates/background/${encodeURIComponent(responseFileName)}`;

      return res.status(201).json({
        backgroundUrl,
        fileName: responseFileName,
        sourcePdfUrl,
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
      });
    };

    void finalizeUpload().catch((error) => {
      const message = error instanceof Error ? error.message : "Upload finalization failed";
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      }
    });
  });
});

adminTemplatesRouter.get("/background/:fileName", async (req, res) => {
  await ensureTemplateUploadDir();

  const fileName = sanitizeFilename(req.params.fileName);
  const ext = path.extname(fileName).toLowerCase();
  if (!fileName || !SUPPORTED_EXTENSIONS.has(ext)) {
    return res.status(404).json({ error: "File not found" });
  }

  const absPath = path.resolve(TEMPLATE_UPLOAD_DIR, fileName);
  if (!absPath.startsWith(path.resolve(TEMPLATE_UPLOAD_DIR))) {
    return res.status(404).json({ error: "File not found" });
  }

  try {
    await fs.access(absPath);
    return res.sendFile(absPath);
  } catch {
    return res.status(404).json({ error: "File not found" });
  }
});

adminTemplatesRouter.get("/:id", async (req, res) => {
  const template = await prisma.moneyOrderTemplate.findUnique({
    where: { id: req.params.id },
    include: templateInclude,
  });

  if (!template) {
    return res.status(404).json({ error: "Template not found" });
  }

  return res.json({ template });
});

adminTemplatesRouter.put("/:id", async (req, res) => {
  const body = templateUpdateSchema.parse(req.body);

  const template = await prisma.moneyOrderTemplate.update({
    where: { id: req.params.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.backgroundUrl !== undefined ? { backgroundUrl: body.backgroundUrl ?? DEFAULT_TEMPLATE_BACKGROUND_URL } : {}),
      ...(body.version !== undefined ? { version: body.version } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
    include: templateInclude,
  });

  if (body.isActive === true) {
    await prisma.moneyOrderTemplate.updateMany({
      where: { id: { not: template.id } },
      data: { isActive: false },
    });
  }

  return res.json({ template });
});

adminTemplatesRouter.delete("/:id", async (req, res) => {
  await prisma.moneyOrderTemplate.delete({ where: { id: req.params.id } });
  return res.json({ success: true });
});

adminTemplatesRouter.post("/:id/activate", async (req, res) => {
  const template = await prisma.$transaction(async (tx) => {
    await tx.moneyOrderTemplate.updateMany({ data: { isActive: false } });
    return tx.moneyOrderTemplate.update({
      where: { id: req.params.id },
      data: { isActive: true, version: { increment: 1 } },
      include: templateInclude,
    });
  });

  return res.json({ template });
});

adminTemplatesRouter.post("/:id/duplicate", async (req, res) => {
  const source = await prisma.moneyOrderTemplate.findUnique({
    where: { id: req.params.id },
    include: templateInclude,
  });

  if (!source) {
    return res.status(404).json({ error: "Template not found" });
  }

  const template = await prisma.moneyOrderTemplate.create({
    data: {
      name: `${source.name} Copy`,
      backgroundUrl: source.backgroundUrl,
      version: source.version,
      isActive: false,
      fields: {
        create: source.fields.map((field) => ({
          fieldKey: field.fieldKey,
          fieldType: field.fieldType,
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
          fontSize: field.fontSize,
          fontFamily: field.fontFamily,
          fontWeight: field.fontWeight,
          fontStyle: field.fontStyle,
          textColor: field.textColor,
          textAlign: field.textAlign,
          rotation: field.rotation,
          isLocked: field.isLocked,
        })),
      },
    },
    include: templateInclude,
  });

  return res.status(201).json({ template });
});

adminTemplatesRouter.post("/:id/fields", async (req, res) => {
  const body = fieldCreateSchema.parse(req.body);

  const template = await prisma.moneyOrderTemplate.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!template) {
    return res.status(404).json({ error: "Template not found" });
  }

  const field = await prisma.moneyOrderTemplateField.create({
    data: {
      templateId: req.params.id,
      fieldKey: body.fieldKey,
      fieldType: body.fieldType,
      x: body.x,
      y: body.y,
      width: body.width,
      height: body.height,
      fontSize: body.fontSize ?? 12,
      fontFamily: body.fontFamily ?? "Arial",
      fontWeight: body.fontWeight ?? "normal",
      fontStyle: body.fontStyle ?? "normal",
      textColor: body.textColor ?? "#0f172a",
      textAlign: body.textAlign ?? "left",
      rotation: body.rotation ?? 0,
      isLocked: body.isLocked ?? false,
    },
  });

  return res.status(201).json({ field });
});

adminTemplatesRouter.put("/fields/:id", async (req, res) => {
  const body = fieldUpdateSchema.parse(req.body);

  const field = await prisma.moneyOrderTemplateField.update({
    where: { id: req.params.id },
    data: body,
  });

  return res.json({ field });
});

adminTemplatesRouter.delete("/fields/:id", async (req, res) => {
  await prisma.moneyOrderTemplateField.delete({ where: { id: req.params.id } });
  return res.json({ success: true });
});

adminTemplatesRouter.post("/:id/preview", async (req, res) => {
  const body = previewSchema.parse(req.body ?? {});
  const now = new Date();

  const defaultSampleData: Record<string, string | number | null> = {
    sender_name: "Muhammad Ahmad",
    sender_cnic: "3520212345671",
    sender_address: "House 14, Street 9, Gulberg, Lahore",
    receiver_name: "Ali Raza",
    receiver_address: "Shop 22, Urdu Bazar, Karachi",
    address: "Shop 22, Urdu Bazar, Karachi",
    tracking_id: "VPL26039999",
    money_order_id: "MO24079999",
    amount: 425,
    amount_words: "Four Hundred Twenty Five Rupees Only",
    date: now.toISOString().slice(0, 10),
  };

  const sampleData = { ...defaultSampleData, ...(body.sampleData ?? {}) };
  const renderedTemplate = await renderMoneyOrderTemplate(req.params.id, sampleData);
  const amountValue = Number(sampleData.amount ?? 0) || 0;

  const orderLikeRecord = {
    sender_name: sampleData.sender_name,
    senderName: sampleData.sender_name,
    sender_cnic: sampleData.sender_cnic,
    senderCnic: sampleData.sender_cnic,
    sender_address: sampleData.sender_address,
    shipperAddress: sampleData.sender_address,
    receiver_name: sampleData.receiver_name,
    consignee_name: sampleData.receiver_name,
    receiver_address: sampleData.address ?? sampleData.receiver_address,
    consignee_address: sampleData.address ?? sampleData.receiver_address,
    tracking_id: sampleData.tracking_id,
    trackingId: sampleData.tracking_id,
    mo_number: sampleData.money_order_id,
    moNumber: sampleData.money_order_id,
    amount: amountValue,
    amountRs: amountValue,
    CollectAmount: amountValue,
    amount_words: sampleData.amount_words,
    issueDate: sampleData.date,
    shipmentType: "VPL",
  };

  const backgrounds = await loadMoneyOrderBackgrounds().catch(() => null);
  const html = moneyOrderHtml([orderLikeRecord as any], { backgrounds: backgrounds ?? undefined });

  return res.json({
    renderedTemplate,
    html,
    sampleData,
  });
});
