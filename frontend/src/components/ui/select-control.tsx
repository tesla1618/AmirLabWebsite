"use client";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import { formControlClass } from "./form-controls";

export interface SelectOption {
  label: string;
  value: string;
}

export function SelectControl({
  ariaLabel,
  className,
  defaultValue,
  disabled,
  id,
  loading = false,
  name,
  onValueChange,
  options,
  placeholder = "Select…",
  required,
  size = "default",
  value,
}: {
  ariaLabel?: string;
  className?: string;
  defaultValue?: string;
  disabled?: boolean;
  id?: string;
  loading?: boolean;
  name?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  required?: boolean;
  size?: "compact" | "default";
  value?: string;
}) {
  const compact = size === "compact";
  return (
    <Select.Root
      defaultValue={defaultValue}
      disabled={disabled || loading}
      name={name}
      onValueChange={onValueChange}
      required={required}
      value={value}
    >
      <Select.Trigger
        aria-label={ariaLabel}
        className={cn(
          formControlClass,
          "inline-flex min-w-[150px] cursor-pointer items-center justify-between gap-3 text-left",
          compact && "h-[38px] min-h-[38px] min-w-[138px] px-[.7rem] text-xs",
          loading && loadingPlaceholder(true, "control"),
          className,
        )}
        data-loading={loading || undefined}
        data-placeholder={loading ? "control" : undefined}
        id={id}
      >
        <Select.Value placeholder={placeholder} />
        <Select.Icon>
          <ChevronDown aria-hidden="true" size={15} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className={cn(
            "z-[100] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-control border border-line-strong bg-canvas p-1 shadow-[var(--shadow-float)] animate-[popover-enter_160ms_ease-out] motion-reduce:animate-none",
            compact && "rounded-control",
          )}
          position="popper"
          sideOffset={6}
        >
          <Select.Viewport className="grid gap-[var(--space-1)]">
            {options.map((option) => (
              <Select.Item
                className="flex min-h-9 cursor-pointer select-none items-center justify-between rounded-control px-2.5 py-2 text-[.76rem] text-ink outline-none data-[highlighted]:bg-brand-faint data-[highlighted]:text-brand data-[state=checked]:bg-brand-faint data-[state=checked]:font-semibold data-[state=checked]:text-brand"
                key={option.value}
                value={option.value}
              >
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator>
                  <Check aria-hidden="true" size={14} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
