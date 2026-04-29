import { api } from "./api";

export type TemplateFieldType = "text" | "barcode" | "box" | "date" | "amount";

export type MoneyOrderTemplateField = {
  id: string;
  templateId: string;
  fieldKey: string;
  fieldType: TemplateFieldType;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  textColor: string;
  textAlign: "left" | "center" | "right";
  rotation: number;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MoneyOrderTemplate = {
  id: string;
  name: string;
  backgroundUrl: string | null;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  fields: MoneyOrderTemplateField[];
};

export async function listAdminTemplates() {
  return api<{ templates: MoneyOrderTemplate[] }>("/api/admin/templates");
}

export async function getActiveAdminTemplate() {
  const response = await listAdminTemplates();
  const activeTemplate = response.templates.find((template) => template.isActive) ?? response.templates[0] ?? null;
  return { activeTemplate, templates: response.templates };
}

export async function updateAdminTemplate(templateId: string, patch: Partial<Pick<MoneyOrderTemplate, "name" | "backgroundUrl" | "version" | "isActive">>) {
  return api<{ template: MoneyOrderTemplate }>(`/api/admin/templates/${templateId}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export async function createTemplateField(templateId: string, body: {
  fieldKey: string;
  fieldType: TemplateFieldType;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  textColor: string;
  textAlign: "left" | "center" | "right";
  rotation: number;
  isLocked: boolean;
}) {
  return api<{ field: MoneyOrderTemplateField }>(`/api/admin/templates/${templateId}/fields`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateTemplateField(fieldId: string, patch: Partial<MoneyOrderTemplateField>) {
  return api<{ field: MoneyOrderTemplateField }>(`/api/admin/templates/fields/${fieldId}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export async function deleteTemplateField(fieldId: string) {
  return api(`/api/admin/templates/fields/${fieldId}`, { method: "DELETE" });
}
