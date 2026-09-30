import { Search } from "lucide-react";
import type { ChangeEventHandler } from "react";
import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import { InputControl } from "./form-controls";

export function ToolbarSearchField({
  id,
  label,
  loading = false,
  onChange,
  placeholder,
  value,
}: {
  id: string;
  label: string;
  loading?: boolean;
  onChange: ChangeEventHandler<HTMLInputElement>;
  placeholder: string;
  value: string;
}) {
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <label
        aria-hidden={loading || undefined}
        className={cn(
          "font-sans text-[11px] leading-[1.4] font-medium text-ink-muted",
          loading && loadingPlaceholder(true, "label", "short"),
        )}
        htmlFor={id}
      >
        {label}
      </label>
      <div className="relative grid items-center">
        <Search
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute left-3 z-[1] text-ink-muted",
            loading && "opacity-0",
          )}
          size={17}
        />
        <InputControl
          className="pl-10"
          id={id}
          loading={loading}
          disabled={loading}
          onChange={onChange}
          placeholder={loading ? "" : placeholder}
          type="search"
          value={value}
        />
      </div>
    </div>
  );
}
