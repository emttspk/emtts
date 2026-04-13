type SampleDownloadLinkProps = {
  className?: string;
  label?: string;
};

const defaultClassName =
  "inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-indigo-700";

export default function SampleDownloadLink(props: SampleDownloadLinkProps) {
  return (
    <a
      href="/sample.csv"
      download="sample.csv"
      className={props.className ?? defaultClassName}
    >
      {props.label ?? "Download Sample File"}
    </a>
  );
}