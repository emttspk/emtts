import { Search } from "lucide-react";
import { cn } from "../../lib/cn";

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export default function SearchInput({ value, onChange, placeholder = "Search", className }: SearchInputProps) {
  return (
    <label
      className={cn(
        "flex min-h-[46px] items-center gap-3 rounded-xl border border-[color:var(--line)] bg-white px-4 text-sm text-[color:var(--text-muted)] shadow-[0_10px_24px_rgba(8,18,37,0.05)] transition focus-within:border-[#BFDBFE] focus-within:ring-4 focus-within:ring-[#DBEAFE]",
        className,
      )}
    >
      <Search className="h-4 w-4 text-slate-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-sm text-[color:var(--text-strong)] outline-none placeholder:text-slate-400"
      />
    </label>
  );
}