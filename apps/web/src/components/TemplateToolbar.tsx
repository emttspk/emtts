import Card from "./Card";

type FieldType = "text" | "barcode" | "box" | "date" | "amount";

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
  previewMode: boolean;
  fieldKeys: readonly string[];
  onUploadBackground: (file: File) => Promise<void>;
  onAddField: (fieldType: FieldType, fieldKey: string) => Promise<void>;
  onTogglePreview: () => void;
  onRefresh: () => Promise<void>;
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
          Upload background
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
          onClick={props.onTogglePreview}
          disabled={!props.selectedTemplate}
        >
          {props.previewMode ? "Exit preview" : "Preview"}
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
    </Card>
  );
}
