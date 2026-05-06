import Card from "./Card";

type MoneyOrderTemplate = {
  id: string;
  name: string;
  backgroundUrl: string | null;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export default function TemplateSidebar(props: {
  templates: MoneyOrderTemplate[];
  selectedTemplateId: string | null;
  onSelectTemplate: (templateId: string) => void;
  onSetActiveTemplate: (templateId: string) => void;
  onRenameTemplate: (templateId: string, name: string) => Promise<void>;
  onPreviewTemplate: (templateId: string) => void;
}) {
  return (
    <Card className="h-fit p-4">
      <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">Template Dashboard</div>
      <div className="mt-2 text-xs text-slate-500">Load templates, mark active, and edit selected template with immediate persistence.</div>

      <div className="mt-4 space-y-2">
        {props.templates.map((template) => (
          <button
            key={template.id}
            className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
              props.selectedTemplateId === template.id
                ? "border-brand bg-brand/5"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
            onClick={() => props.onSelectTemplate(template.id)}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-sm font-semibold text-slate-900">{template.name}</div>
              {template.isActive ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                  Active
                </span>
              ) : null}
            </div>
            <div className="mt-1 text-xs text-slate-500">v{template.version}</div>
            <div className="mt-1 text-xs text-slate-500">Created: {new Date(template.createdAt).toLocaleDateString("en-PK")}</div>
            <div className="mt-3 flex flex-wrap gap-1">
              <button
                className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onSelectTemplate(template.id);
                }}
              >
                Edit
              </button>
              <button
                className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onSetActiveTemplate(template.id);
                }}
              >
                Set Active
              </button>
              <button
                className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700"
                onClick={(event) => {
                  event.stopPropagation();
                  const name = window.prompt("Rename template", template.name);
                  if (!name || !name.trim()) return;
                  void props.onRenameTemplate(template.id, name.trim());
                }}
              >
                Rename
              </button>
              <button
                className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onPreviewTemplate(template.id);
                }}
              >
                Preview
              </button>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}
