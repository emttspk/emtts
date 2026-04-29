import { useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import { api, uploadFile } from "../lib/api";
import { TEMPLATE_DESIGNER_ADMIN_EMAIL, TEMPLATE_DESIGNER_ENABLED } from "../lib/featureFlags";
import {
  createTemplateField,
  deleteTemplateField,
  getActiveAdminTemplate,
  updateAdminTemplate,
  updateTemplateField,
  type MoneyOrderTemplate,
  type MoneyOrderTemplateField,
  type TemplateFieldType,
} from "../lib/template.service";
import TemplateCanvas from "../components/TemplateCanvas";
import TemplateSidebar from "../components/TemplateSidebar";
import TemplateToolbar from "../components/TemplateToolbar";
import TemplateLayers from "../components/TemplateLayers";
import PreviewModal from "../components/PreviewModal";

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
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
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

  function syncWithActiveTemplate(items: MoneyOrderTemplate[]) {
    const activeTemplate = items.find((template) => template.isActive) ?? items[0] ?? null;
    const normalizedTemplates = activeTemplate ? [activeTemplate] : [];
    setTemplates(normalizedTemplates);
    setSelectedTemplateId(activeTemplate?.id ?? null);
    return activeTemplate;
  }

  async function refreshTemplates() {
    const { templates: templateList } = await getActiveAdminTemplate();
    const activeTemplate = syncWithActiveTemplate(templateList);
    if (!activeTemplate) {
      setSelectedFieldId(null);
      return;
    }
    if (!activeTemplate.fields.some((field) => field.id === selectedFieldId)) {
      setSelectedFieldId(activeTemplate.fields[0]?.id ?? null);
    }
  }

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([
      api<{ user: { email: string } }>("/api/me"),
      getActiveAdminTemplate(),
    ])
      .then(([me, templateData]) => {
        if (!mounted) return;
        setMeEmail(me.user.email.toLowerCase());
        const activeTemplate = syncWithActiveTemplate(templateData.templates);
        setSelectedFieldId(activeTemplate?.fields[0]?.id ?? null);
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

  async function renameTemplate(templateId: string, name: string) {
    const result = await updateAdminTemplate(templateId, { name });
    setTemplates((previous) => previous.map((template) => (template.id === templateId ? result.template : template)));
  }

  async function uploadBackground(file: File) {
    if (!selectedTemplate) return;
    const upload = await uploadFile("/api/admin/templates/upload", file);
    const result = await updateAdminTemplate(selectedTemplate.id, { backgroundUrl: upload.backgroundUrl as string });
    setTemplates((previous) => previous.map((template) => (template.id === selectedTemplate.id ? result.template : template)));
  }

  async function deleteBackground() {
    if (!selectedTemplate) return;
    const result = await updateAdminTemplate(selectedTemplate.id, { backgroundUrl: null });
    setTemplates((previous) => previous.map((template) => (template.id === selectedTemplate.id ? result.template : template)));
  }

  async function addField(fieldType: TemplateFieldType, fieldKey: string) {
    if (!selectedTemplate) return;
    const key = nextFieldKey(selectedTemplate.fields, fieldKey);
    const result = await createTemplateField(selectedTemplate.id, {
      fieldKey: key,
      fieldType,
      x: 80,
      y: 80,
      width: fieldType === "barcode" ? 220 : 200,
      height: fieldType === "barcode" ? 70 : 40,
      fontSize: 14,
      fontFamily: "Arial",
      fontWeight: "normal",
      fontStyle: "normal",
      textColor: "#0f172a",
      textAlign: "left",
      rotation: 0,
      isLocked: false,
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
    const result = await updateTemplateField(fieldId, patch);

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
    await deleteTemplateField(fieldId);
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
    const result = await createTemplateField(selectedTemplate.id, {
      fieldKey: nextFieldKey(selectedTemplate.fields, field.fieldKey),
      fieldType: field.fieldType,
      x: field.x + 14,
      y: field.y + 14,
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

  async function openPreview(templateId?: string) {
    const activeTemplateId = templateId ?? selectedTemplate?.id;
    if (!activeTemplateId) return;

    setPreviewModalOpen(true);
    setPreviewLoading(true);

    try {
      const result = await api<{ html: string }>(`/api/admin/templates/${activeTemplateId}/preview`, {
        method: "POST",
        body: JSON.stringify({ sampleData: PREVIEW_SAMPLE_DATA }),
      });
      setPreviewHtml(result.html);
    } catch (err) {
      setPreviewHtml(`<html><body style="font-family:Arial;padding:16px"><h3>Preview failed</h3><p>${
        err instanceof Error ? err.message : "Unknown preview error"
      }</p></body></html>`);
    } finally {
      setPreviewLoading(false);
    }
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
        onRenameTemplate={renameTemplate}
        onPreviewTemplate={(templateId) => {
          setSelectedTemplateId(templateId);
          void openPreview(templateId);
        }}
      />

      <div className="space-y-4">
        <TemplateToolbar
          selectedTemplate={selectedTemplate}
          selectedField={selectedField}
          fieldKeys={DEFAULT_FIELD_KEYS}
          onAddField={addField}
          onRefresh={refreshTemplates}
          onUpdateField={updateField}
          onOpenPreview={() => openPreview()}
          onUploadBackground={uploadBackground}
          onDeleteBackground={deleteBackground}
        />
        <TemplateCanvas
          template={selectedTemplate}
          previewMode={false}
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

      <PreviewModal
        open={previewModalOpen}
        html={previewHtml}
        loading={previewLoading}
        onClose={() => setPreviewModalOpen(false)}
      />
    </div>
  );
}
