import { FileText } from "lucide-react";
import Card from "./Card";

export default function EmptyState(props: { onUploadClick?: () => void }) {
  return (
    <Card className="p-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50">
        <FileText className="h-6 w-6 text-gray-500" />
      </div>
      <h3 className="mt-4 text-xl font-medium text-gray-900">No label jobs yet</h3>
      <p className="mt-2 text-sm text-gray-600">Upload your first CSV file to generate shipping labels.</p>
      {props.onUploadClick ? (
        <button
          onClick={props.onUploadClick}
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-md transition-all duration-200 ease-in-out hover:bg-indigo-700"
        >
          Upload file
        </button>
      ) : null}
    </Card>
  );
}
