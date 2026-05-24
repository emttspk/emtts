import { FileText, UploadCloud } from "lucide-react";
import Card from "./Card";
import ActionButton from "./ui/ActionButton";

export default function EmptyState(props: { onUploadClick?: () => void }) {
  return (
    <Card className="border-[color:var(--line)] p-8 text-center sm:p-10">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EFF6FF] shadow-sm">
        <FileText className="h-7 w-7 text-[#2563EB]" />
      </div>
      <h3 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--text-strong)]">No jobs yet</h3>
      <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">Upload a file to start generating ePost.pk labels and downloadable outputs.</p>
      {props.onUploadClick ? (
        <ActionButton
          onClick={props.onUploadClick}
          className="mt-6 w-full sm:w-auto"
          leadingIcon={<UploadCloud className="h-4 w-4" />}
        >
          Upload file
        </ActionButton>
      ) : null}
    </Card>
  );
}
