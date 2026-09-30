"use client";

import { useEffect, useId, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";
import { ButtonControl } from "@/components/ui/button-control";
import { cn } from "@/lib/cn";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  tone?: "primary" | "danger";
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  tone = "primary",
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  return (
    <dialog
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className="m-auto max-h-dvh w-[520px] max-w-full border-0 bg-transparent p-4 text-ink backdrop:bg-[color-mix(in_srgb,var(--ink)_62%,transparent)] backdrop:backdrop-blur-[5px]"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
      ref={dialog}
    >
      <div className="relative animate-[dialog-enter_220ms_cubic-bezier(.22,1,.36,1)_both] rounded-dialog border border-line-strong bg-surface p-6 shadow-[var(--shadow-float)] motion-reduce:animate-none">
        <div
          className={cn(
            "mb-5 flex h-10 w-10 items-center justify-center rounded-control border border-brand/25 bg-brand-faint text-brand",
            tone === "danger" && "bg-danger-soft text-danger",
          )}
        >
          <AlertTriangle aria-hidden="true" size={20} />
        </div>
        <button
          aria-label="Close confirmation"
          className="absolute top-4 right-4 flex h-9 w-9 cursor-pointer items-center justify-center rounded-control border border-line bg-transparent text-ink-muted hover:border-line-strong hover:bg-surface-subtle hover:text-ink"
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          <X aria-hidden="true" size={19} />
        </button>
        <p className="mb-3 font-mono text-[.58rem] font-semibold tracking-[.1em] text-brand uppercase">
          Confirm action
        </p>
        <h2
          className="mt-0 mb-3 text-[clamp(1.45rem,4vw,1.85rem)] leading-tight font-semibold tracking-[-.03em]"
          id={titleId}
        >
          {title}
        </h2>
        <p
          className="m-0 text-[.82rem] leading-[1.6] text-ink-muted"
          id={descriptionId}
        >
          {description}
        </p>
        <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
          <ButtonControl autoFocus disabled={busy} onClick={onCancel}>
            Cancel
          </ButtonControl>
          <ButtonControl disabled={busy} onClick={onConfirm} variant={tone}>
            {busy ? "Working…" : confirmLabel}
          </ButtonControl>
        </div>
      </div>
    </dialog>
  );
}
