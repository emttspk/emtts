import Card from "./Card";

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

export default function TemplateLayers(props: {
  template: MoneyOrderTemplate | null;
  selectedFieldId: string | null;
  selectedField: MoneyOrderTemplateField | null;
  onSelectField: (fieldId: string) => void;
  onUpdateField: (fieldId: string, patch: Partial<MoneyOrderTemplateField>) => Promise<void>;
  onDeleteField: (fieldId: string) => Promise<void>;
  onDuplicateField: (field: MoneyOrderTemplateField) => Promise<void>;
}) {
  return (
    <Card className="h-fit p-4">
      <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">Layers</div>

      <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
        {props.template?.fields.map((field) => (
          <button
            key={field.id}
            className={`w-full rounded-xl border px-3 py-2 text-left transition ${
              props.selectedFieldId === field.id
                ? "border-brand bg-brand/5"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
            onClick={() => props.onSelectField(field.id)}
          >
            <div className="text-xs font-semibold text-slate-900">{field.fieldKey}</div>
            <div className="mt-1 text-[11px] text-slate-500">
              {field.fieldType} | {Math.round(field.x)}, {Math.round(field.y)}
            </div>
          </button>
        ))}
      </div>

      {props.selectedField ? (
        <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
          <div className="text-sm font-semibold text-slate-900">Field editor</div>

          <label className="block text-xs font-medium text-slate-600">
            Field key
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={props.selectedField.fieldKey}
              onChange={(event) => void props.onUpdateField(props.selectedField!.id, { fieldKey: event.target.value })}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-medium text-slate-600">
              Font size
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                value={props.selectedField.fontSize}
                onChange={(event) => void props.onUpdateField(props.selectedField!.id, { fontSize: Number(event.target.value) })}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Rotation
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                value={props.selectedField.rotation}
                onChange={(event) => void props.onUpdateField(props.selectedField!.id, { rotation: Number(event.target.value) })}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              className={`rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                props.selectedField.fontWeight === "bold"
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
              onClick={() =>
                void props.onUpdateField(props.selectedField!.id, {
                  fontWeight: props.selectedField!.fontWeight === "bold" ? "normal" : "bold",
                })
              }
            >
              Bold toggle
            </button>
            <button
              className={`rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                props.selectedField.isLocked
                  ? "border-amber-300 bg-amber-100 text-amber-800"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
              onClick={() =>
                void props.onUpdateField(props.selectedField!.id, {
                  isLocked: !props.selectedField!.isLocked,
                })
              }
            >
              {props.selectedField.isLocked ? "Unlock" : "Lock"}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700"
              onClick={() => void props.onDuplicateField(props.selectedField!)}
            >
              Duplicate
            </button>
            <button
              className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-700"
              onClick={() => {
                if (!window.confirm("Delete selected field?")) return;
                void props.onDeleteField(props.selectedField!.id);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 text-xs text-slate-500">Select a field to edit layer properties.</div>
      )}
    </Card>
  );
}
