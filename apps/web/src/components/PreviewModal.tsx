import Card from "./Card";

type PreviewModalProps = {
  open: boolean;
  html: string;
  loading: boolean;
  onClose: () => void;
};

export default function PreviewModal(props: PreviewModalProps) {
  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <Card className="flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Money Order Preview</div>
            <div className="text-xs text-slate-500">Production-like rendered layout</div>
          </div>
          <button
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
            onClick={props.onClose}
          >
            Close
          </button>
        </div>

        <div className="flex-1 bg-slate-100">
          {props.loading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-600">Rendering preview...</div>
          ) : (
            <iframe title="Money Order Preview" srcDoc={props.html} className="h-full w-full bg-white" />
          )}
        </div>
      </Card>
    </div>
  );
}
