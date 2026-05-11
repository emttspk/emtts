import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type AuthInputFieldProps = {
  label: string;
  icon: LucideIcon;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>["inputMode"];
  name?: string;
  helpText?: string;
  error?: string | null;
  rightAdornment?: ReactNode;
};

export default function AuthInputField({
  label,
  icon: Icon,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  required,
  minLength,
  maxLength,
  inputMode,
  name,
  helpText,
  error,
  rightAdornment,
}: AuthInputFieldProps) {
  const hasError = Boolean(error);

  return (
    <label className="block text-sm">
      <div className="mb-2.5 flex items-center justify-between gap-3 text-[0.95rem] font-semibold text-slate-900">
        <span>{label}</span>
        {helpText ? <span className="text-xs font-medium text-slate-400">{helpText}</span> : null}
      </div>

      <div className="group relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors duration-200 group-focus-within:text-[#12B347]">
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>

        <input
          name={name}
          className={[
            "h-14 w-full rounded-2xl border bg-slate-50/85 pl-12 pr-12 text-[15px] font-medium text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_10px_30px_rgba(15,23,42,0.05)] outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-[#12B347]/30 hover:bg-white focus:border-[#12B347] focus:bg-white focus:ring-4 focus:ring-[#12B347]/15",
            hasError ? "border-red-300 bg-red-50/80 focus:border-red-500 focus:ring-red-200" : "border-slate-200/90",
          ].join(" ")}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          inputMode={inputMode}
          aria-invalid={hasError}
        />

        {rightAdornment ? (
          <div className="absolute inset-y-0 right-3 flex items-center">{rightAdornment}</div>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
    </label>
  );
}