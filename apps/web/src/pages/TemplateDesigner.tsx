import { useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import { api, uploadFile } from "../lib/api";
import { TEMPLATE_DESIGNER_ADMIN_EMAIL, TEMPLATE_DESIGNER_ENABLED } from "../lib/featureFlags";
import TemplateCanvas from "../components/TemplateCanvas";
import TemplateSidebar from "../components/TemplateSidebar";
import TemplateToolbar from "../components/TemplateToolbar";
import TemplateLayers from "../components/TemplateLayers";

type FieldType = "text" | "barcode" | "box" | "date" | "amount";

type MoneyOrderTemplateField = {
  id: string;
  templateId: string;
  fieldKey: string;
  fieldType: FieldType;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontWeight: "normal" | "bold";
  rotation: number;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
};

type MoneyOrderTemplate = {
  id: string;
  name: string;
  backgroundUrl: string | null;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  fields: MoneyOrderTemplateField[];
};

const DEFAULT_FIELD_KEYS = [
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
  "barcode_tracking",
  "barcode_money_order",
] as const;

const PREVIEW_SAMPLE_DATA: Record<string, string> = {
  sender_name: "Hoja Seeds",
  sender_cnic: "35202-1234567-1",
  receiver_name: "Sajid Hussain",
  receiver_address: "Bahawalpur",
  sender_address: "",
  tracking_id: "VPL26030759",
  money_order_id: "MOS26040001",
  amount: "800",
  amount_words: "",
  date: "",
  barcode_tracking: "VPL26030759",
  barcode_money_order: "MOS26040001",
};

function nextFieldKey(existingFields: MoneyOrderTemplateField[], preferred: string) {
  if (!existingFields.some((field) => field.fieldKey === preferred)) return preferred;
  let index = 2;
  while (existingFields.some((field) => field.fieldKey === `${preferred}_${index}`)) {
    index += 1;
  }
  return `${preferred}_${index}`;
}

export default function TemplateDesigner() {
  const [meEmail, setMeEmail] = useState<string>("");
  const [templates, setTemplates] = useState<MoneyOrderTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  const selectedField = useMemo(
    () => selectedTemplate?.fields.find((field) => field.id === selectedFieldId) ?? null,
    [selectedFieldId, selectedTemplate],
  );

  async function refreshTemplates() {
    const result = await api<{ templates: MoneyOrderTemplate[] }>("/api/admin/templates");
    setTemplates(result.templates);
    if (!selectedTemplateId && result.templates.length > 0) {
      setSelectedTemplateId(result.templates[0].id);
    }
  }

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([
      api<{ user: { email: string } }>("/api/me"),
      api<{ templates: MoneyOrderTemplate[] }>("/api/admin/templates"),
    ])
      .then(([me, templateData]) => {
        if (!mounted) return;
        setMeEmail(me.user.email.toLowerCase());
        setTemplates(templateData.templates);
        setSelectedTemplateId((current) => current ?? templateData.templates[0]?.id ?? null);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load template designer");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function createTemplate(name: string) {
    const result = await api<{ template: MoneyOrderTemplate }>("/api/admin/templates", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    setTemplates((previous) => [result.template, ...previous]);
    setSelectedTemplateId(result.template.id);
  }

  async function activateTemplate(templateId: string) {
    const result = await api<{ template: MoneyOrderTemplate }>(`/api/admin/templates/${templateId}/activate`, {
      method: "POST",
    });
    setTemplates((previous) =>
      previous.map((item) =>
        item.id === result.template.id
          ? result.template
          : {
              ...item,
              isActive: false,
            },
      ),
    );
  }

  async function duplicateTemplate(templateId: string) {
    const result = await api<{ template: MoneyOrderTemplate }>(`/api/admin/templates/${templateId}/duplicate`, {
      method: "POST",
    });
    setTemplates((previous) => [result.template, ...previous]);
    setSelectedTemplateId(result.template.id);
    setPreviewMode(false);
  }

  async function removeTemplate(templateId: string) {
    await api(`/api/admin/templates/${templateId}`, { method: "DELETE" });
    setTemplates((previous) => previous.filter((template) => template.id !== templateId));
    setSelectedTemplateId((current) => (current === templateId ? null : current));
    setSelectedFieldId(null);
  }

  async function renameTemplate(templateId: string, name: string) {
    const result = await api<{ template: MoneyOrderTemplate }>(`/api/admin/templates/${templateId}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    });
    setTemplates((previous) => previous.map((template) => (template.id === templateId ? result.template : template)));
  }

  async function uploadBackground(file: File) {
    if (!selectedTemplate) return;
    const upload = await uploadFile("/api/admin/templates/upload", file);
    const result = await api<{ template: MoneyOrderTemplate }>(`/api/admin/templates/${selectedTemplate.id}`, {
      method: "PUT",
      body: JSON.stringify({ backgroundUrl: upload.backgroundUrl }),
    });
    setTemplates((previous) => previous.map((template) => (template.id === selectedTemplate.id ? result.template : template)));
  }

  async function deleteBackground() {
    if (!selectedTemplate) return;
    const result = await api<{ template: MoneyOrderTemplate }>(`/api/admin/templates/${selectedTemplate.id}`, {
      method: "PUT",
      body: JSON.stringify({ backgroundUrl: null }),
    });
    setTemplates((previous) => previous.map((template) => (template.id === selectedTemplate.id ? result.template : template)));
  }

  async function addField(fieldType: FieldType, fieldKey: string) {
    if (!selectedTemplate) return;
    const key = nextFieldKey(selectedTemplate.fields, fieldKey);
    const result = await api<{ field: MoneyOrderTemplateField }>(`/api/admin/templates/${selectedTemplate.id}/fields`, {
      method: "POST",
      body: JSON.stringify({
        fieldKey: key,
        fieldType,
        x: 80,
        y: 80,
        width: fieldType === "barcode" ? 220 : 200,
        height: fieldType === "barcode" ? 70 : 40,
        fontSize: 14,
        fontWeight: "normal",
        rotation: 0,
        isLocked: false,
      }),
    });

    setTemplates((previous) =>
      previous.map((template) =>
        template.id === selectedTemplate.id
          ? {
              ...template,
              fields: [...template.fields, result.field],
            }
          : template,
      ),
    );
    setSelectedFieldId(result.field.id);
  }

  async function updateField(fieldId: string, patch: Partial<MoneyOrderTemplateField>) {
    if (!selectedTemplate) return;
    const result = await api<{ field: MoneyOrderTemplateField }>(`/api/admin/templates/fields/${fieldId}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    });

    setTemplates((previous) =>
      previous.map((template) =>
        template.id === selectedTemplate.id
          ? {
              ...template,
              fields: template.fields.map((field) => (field.id === fieldId ? { ...field, ...result.field } : field)),
            }
          : template,
      ),
    );
  }

  async function deleteField(fieldId: string) {
    if (!selectedTemplate) return;
    await api(`/api/admin/templates/fields/${fieldId}`, { method: "DELETE" });
    setTemplates((previous) =>
      previous.map((template) =>
        template.id === selectedTemplate.id
          ? {
              ...template,
              fields: template.fields.filter((field) => field.id !== fieldId),
            }
          : template,
      ),
    );
    setSelectedFieldId((current) => (current === fieldId ? null : current));
  }

  async function duplicateField(field: MoneyOrderTemplateField) {
    if (!selectedTemplate) return;
    const result = await api<{ field: MoneyOrderTemplateField }>(`/api/admin/templates/${selectedTemplate.id}/fields`, {
      method: "POST",
      body: JSON.stringify({
        fieldKey: nextFieldKey(selectedTemplate.fields, field.fieldKey),
        fieldType: field.fieldType,
        x: field.x + 14,
        y: field.y + 14,
        width: field.width,
        height: field.height,
        fontSize: field.fontSize,
        fontWeight: field.fontWeight,
        rotation: field.rotation,
        isLocked: field.isLocked,
      }),
    });

    setTemplates((previous) =>
      previous.map((template) =>
        template.id === selectedTemplate.id
          ? {
              ...template,
              fields: [...template.fields, result.field],
            }
          : template,
      ),
    );
    setSelectedFieldId(result.field.id);
  }

  if (!TEMPLATE_DESIGNER_ENABLED) {
    return (
      <Card className="p-6">
        <div className="text-lg font-semibold text-slate-900">Template Designer Disabled</div>
        <div className="mt-2 text-sm text-slate-600">
          Set VITE_ENABLE_TEMPLATE_DESIGNER=true and ENABLE_TEMPLATE_DESIGNER=true to activate this module.
        </div>
      </Card>
    );
  }

  if (loading) {
    return <Card className="p-6 text-sm text-slate-600">Loading template designer...</Card>;
  }

  if (error) {
    return <Card className="p-6 text-sm text-red-700">{error}</Card>;
  }

  if (meEmail !== TEMPLATE_DESIGNER_ADMIN_EMAIL) {
    return <Card className="p-6 text-sm text-red-700">Only the designated admin can access this module.</Card>;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_1fr_300px]">
      <TemplateSidebar
        templates={templates}
        selectedTemplateId={selectedTemplateId}
        onSelectTemplate={setSelectedTemplateId}
        onCreateTemplate={createTemplate}
        onDuplicateTemplate={duplicateTemplate}
        onActivateTemplate={activateTemplate}
        onDeleteTemplate={removeTemplate}
        onRenameTemplate={renameTemplate}
        onPreviewTemplate={(templateId) => {
          setSelectedTemplateId(templateId);
          setPreviewMode(true);
        }}
      />

      <div className="space-y-4">
        <TemplateToolbar
          selectedTemplate={selectedTemplate}
          previewMode={previewMode}
          fieldKeys={DEFAULT_FIELD_KEYS}
          onAddField={addField}
          onRefresh={refreshTemplates}
          onTogglePreview={() => setPreviewMode((current) => !current)}
          onUploadBackground={uploadBackground}
          onDeleteBackground={deleteBackground}
        />
        <TemplateCanvas
          template={selectedTemplate}
          previewMode={previewMode}
          selectedFieldId={selectedFieldId}
          onSelectField={setSelectedFieldId}
          onUpdateField={updateField}
          previewValues={PREVIEW_SAMPLE_DATA}
        />
      </div>

      <TemplateLayers
        template={selectedTemplate}
        selectedFieldId={selectedFieldId}
        selectedField={selectedField}
        onSelectField={setSelectedFieldId}
        onUpdateField={updateField}
        onDeleteField={deleteField}
        onDuplicateField={duplicateField}
      />
    </div>
  );
}
