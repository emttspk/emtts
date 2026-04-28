import { useState } from "react";
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
  onCreateTemplate: (name: string) => Promise<void>;
  onActivateTemplate: (templateId: string) => Promise<void>;
  onDeleteTemplate: (templateId: string) => Promise<void>;
  onRenameTemplate: (templateId: string, name: string) => Promise<void>;
}) {
  const [newTemplateName, setNewTemplateName] = useState("Money Order Template");

  return (
    <Card className="h-fit p-4">
      <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">Templates</div>
      <div className="mt-3 flex gap-2">
        <input
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          value={newTemplateName}
          onChange={(event) => setNewTemplateName(event.target.value)}
          placeholder="Template name"
        />
        <button
          className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
          onClick={() => {
            if (!newTemplateName.trim()) return;
            void props.onCreateTemplate(newTemplateName.trim());
          }}
        >
          New
        </button>
      </div>

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
            <div className="mt-3 flex flex-wrap gap-1">
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
                  void props.onActivateTemplate(template.id);
                }}
              >
                Activate
              </button>
              <button
                className="rounded-lg border border-red-200 px-2 py-1 text-[11px] font-medium text-red-700"
                onClick={(event) => {
                  event.stopPropagation();
                  const confirmed = window.confirm("Delete this template and all fields?");
                  if (!confirmed) return;
                  void props.onDeleteTemplate(template.id);
                }}
              >
                Delete
              </button>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}
