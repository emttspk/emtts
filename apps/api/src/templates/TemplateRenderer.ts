import { prisma } from "../lib/prisma.js";

export type TemplateRenderData = Record<string, string | number | null | undefined>;

export type RenderedTemplateField = {
  id: string;
  fieldKey: string;
  fieldType: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  textColor: string;
  textAlign: string;
  rotation: number;
  isLocked: boolean;
  value: string;
};

export type RenderedMoneyOrderTemplate = {
  id: string;
  name: string;
  version: number;
  backgroundUrl: string | null;
  isActive: boolean;
  fields: RenderedTemplateField[];
};

function normalizeFieldValue(fieldKey: string, data: TemplateRenderData): string {
  let rawValue = data[fieldKey];
  if ((rawValue === null || rawValue === undefined || rawValue === "") && fieldKey === "receiver_address") {
    rawValue = data.address;
  }
  if (rawValue === null || rawValue === undefined) return "";
  return String(rawValue);
}

export async function renderMoneyOrderTemplate(templateId: string, data: TemplateRenderData): Promise<RenderedMoneyOrderTemplate> {
  const template = await prisma.moneyOrderTemplate.findUnique({
    where: { id: templateId },
    include: {
      fields: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!template) {
    throw new Error("Template not found");
  }

  return {
    id: template.id,
    name: template.name,
    version: template.version,
    backgroundUrl: template.backgroundUrl,
    isActive: template.isActive,
    fields: template.fields.map((field) => ({
      id: field.id,
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
      value: normalizeFieldValue(field.fieldKey, data),
    })),
  };
}
