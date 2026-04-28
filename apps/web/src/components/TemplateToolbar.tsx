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

type MoneyOrderTemplate = {
  id: string;
  name: string;
  backgroundUrl: string | null;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export default function TemplateToolbar(props: {
  selectedTemplate: MoneyOrderTemplate | null;
  selectedField: MoneyOrderTemplateField | null;
  fieldKeys: readonly string[];
  onUploadBackground: (file: File) => Promise<void>;
  onDeleteBackground: () => Promise<void>;
  onAddField: (fieldType: FieldType, fieldKey: string) => Promise<void>;
  onUpdateField: (fieldId: string, patch: Partial<MoneyOrderTemplateField>) => Promise<void>;
  onOpenPreview: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
          {props.selectedTemplate?.backgroundUrl ? "Replace background" : "Upload background"}
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.pdf"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void props.onUploadBackground(file);
              event.target.value = "";
            }}
            disabled={!props.selectedTemplate}
          />
        </label>

        <button
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
          onClick={() => void props.onDeleteBackground()}
          disabled={!props.selectedTemplate?.backgroundUrl}
        >
          Delete background
        </button>

        <button
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
          onClick={() => void props.onAddField("text", "sender_name")}
          disabled={!props.selectedTemplate}
        >
          Add text
        </button>

        <button
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
          onClick={() => void props.onAddField("barcode", "barcode_tracking")}
          disabled={!props.selectedTemplate}
        >
          Add barcode
        </button>

        <button
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
          onClick={() => void props.onAddField("box", "box")}
          disabled={!props.selectedTemplate}
        >
          Add box
        </button>

        <button
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
          onClick={() => void props.onOpenPreview()}
          disabled={!props.selectedTemplate}
        >
          Preview Template
        </button>

        <button
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
          onClick={() => void props.onRefresh()}
        >
          Refresh
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {props.fieldKeys.map((fieldKey) => (
          <button
            key={fieldKey}
            className="rounded-full border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700"
            onClick={() => void props.onAddField(fieldKey.includes("barcode") ? "barcode" : fieldKey === "date" ? "date" : fieldKey === "amount" ? "amount" : "text", fieldKey)}
            disabled={!props.selectedTemplate}
          >
            {fieldKey}
          </button>
        ))}
      </div>

      {props.selectedField ? (
        <div className="mt-4 grid gap-2 border-t border-slate-200 pt-4 md:grid-cols-5">
          <label className="text-xs font-medium text-slate-600">
            X
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={props.selectedField.x}
              onChange={(event) => void props.onUpdateField(props.selectedField!.id, { x: Number(event.target.value) })}
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Y
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={props.selectedField.y}
              onChange={(event) => void props.onUpdateField(props.selectedField!.id, { y: Number(event.target.value) })}
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Width
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={props.selectedField.width}
              onChange={(event) =>
                void props.onUpdateField(props.selectedField!.id, { width: Math.max(20, Number(event.target.value) || 0) })
              }
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Height
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={props.selectedField.height}
              onChange={(event) =>
                void props.onUpdateField(props.selectedField!.id, { height: Math.max(20, Number(event.target.value) || 0) })
              }
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

          <label className="text-xs font-medium text-slate-600">
            Font family
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={props.selectedField.fontFamily}
              onChange={(event) => void props.onUpdateField(props.selectedField!.id, { fontFamily: event.target.value })}
            >
              <option value="Arial">Arial</option>
              <option value="Verdana">Verdana</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Courier New">Courier New</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Font size
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={props.selectedField.fontSize}
              onChange={(event) =>
                void props.onUpdateField(props.selectedField!.id, { fontSize: Math.max(6, Number(event.target.value) || 0) })
              }
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Text color
            <input
              type="color"
              className="mt-1 h-[34px] w-full rounded-lg border border-slate-200 px-1 py-1"
              value={props.selectedField.textColor}
              onChange={(event) => void props.onUpdateField(props.selectedField!.id, { textColor: event.target.value })}
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Align
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={props.selectedField.textAlign}
              onChange={(event) =>
                void props.onUpdateField(props.selectedField!.id, {
                  textAlign: event.target.value as "left" | "center" | "right",
                })
              }
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
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
              Bold
            </button>
            <button
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                props.selectedField.fontStyle === "italic"
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
              onClick={() =>
                void props.onUpdateField(props.selectedField!.id, {
                  fontStyle: props.selectedField!.fontStyle === "italic" ? "normal" : "italic",
                })
              }
            >
              Italic
            </button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
