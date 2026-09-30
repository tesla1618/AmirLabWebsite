"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useNotifications } from "@/components/notification-provider";
import { TextareaControl } from "@/components/ui/form-controls";
import { ButtonControl } from "@/components/ui/button-control";
import { cn } from "@/lib/cn";

import { FormField } from "@/components/ui/form-field";
import { ApiRequestError } from "@/lib/client-api";

export interface ReviewAction<Status extends string> {
  confirmDescription: string;
  confirmLabel: string;
  confirmTitle: string;
  disabled?: boolean;
  label: string;
  notePlaceholder?: string;
  pendingLabel?: string;
  requiresNote?: boolean;
  status: Status;
  tone: "primary" | "secondary" | "danger";
}

export function ReviewActions<Status extends string>({
  actions,
  className = "",
  errorTitle = "Review was not saved",
  noteLabel = "Reviewer note",
  loading = false,
  onError,
  onSubmit,
  onSuccess,
  successBody,
  successTitle,
}: {
  actions: Array<ReviewAction<Status>>;
  className?: string;
  errorTitle?: string;
  noteLabel?: string;
  loading?: boolean;
  onError?: (error: ApiRequestError) => void;
  onSubmit: (decision: { note?: string; status: Status }) => Promise<void>;
  onSuccess?: (status: Status) => void;
  successBody: (status: Status) => string;
  successTitle: string;
}) {
  const { showToast } = useNotifications();
  const [active, setActive] = useState<ReviewAction<Status>>();
  const [confirming, setConfirming] = useState<ReviewAction<Status>>();
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string>();
  const [busy, setBusy] = useState(false);

  function choose(action: ReviewAction<Status>) {
    setNoteError(undefined);
    if (action.requiresNote && active?.status !== action.status) {
      setActive(action);
      return;
    }
    if (action.requiresNote && !note.trim()) {
      setActive(action);
      setNoteError("Add a reviewer note before continuing.");
      return;
    }
    setConfirming(action);
  }

  async function submit(action: ReviewAction<Status>) {
    setBusy(true);
    setNoteError(undefined);
    try {
      await onSubmit({
        note: action.requiresNote ? note.trim() : undefined,
        status: action.status,
      });
      showToast({ body: successBody(action.status), title: successTitle });
      onSuccess?.(action.status);
      setActive(undefined);
      setConfirming(undefined);
      setNote("");
    } catch (caught) {
      const error =
        caught instanceof ApiRequestError
          ? caught
          : new ApiRequestError("The review could not be saved. Try again.", 0);
      onError?.(error);
      showToast({ body: error.message, title: errorTitle, tone: "error" });
      setConfirming(undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn("grid gap-4", className)}
      data-loading={loading || undefined}
    >
      {!loading && active?.requiresNote ? (
        <FormField
          className="min-w-0"
          htmlFor={`review-note-${active.status}`}
          label={noteLabel}
        >
          <TextareaControl
            id={`review-note-${active.status}`}
            onChange={(event) => {
              setNote(event.target.value);
              if (event.target.value.trim()) setNoteError(undefined);
            }}
            placeholder={
              active.notePlaceholder ?? "Explain the decision clearly."
            }
            rows={4}
            value={note}
          />
        </FormField>
      ) : null}
      {noteError ? (
        <p
          className="m-0 rounded-small border border-warning/25 bg-warning-soft p-[.8rem] text-[.82rem] leading-[1.5] text-warning"
          role="alert"
        >
          {noteError}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-3">
        {actions.map((action) => {
          const awaitingNote =
            action.requiresNote && active?.status === action.status;
          const disabled =
            loading ||
            busy ||
            action.disabled ||
            Boolean(awaitingNote && !note.trim());
          return (
            <ButtonControl
              compact={className.includes("compact")}
              disabled={disabled}
              key={action.status}
              loading={loading}
              onClick={() => choose(action)}
              variant={action.tone}
            >
              {awaitingNote
                ? (action.pendingLabel ?? "Send review")
                : action.label}
            </ButtonControl>
          );
        })}
      </div>
      <ConfirmDialog
        busy={busy}
        confirmLabel={confirming?.confirmLabel ?? ""}
        description={confirming?.confirmDescription ?? ""}
        onCancel={() => setConfirming(undefined)}
        onConfirm={() => {
          if (confirming) void submit(confirming);
        }}
        open={Boolean(confirming)}
        title={confirming?.confirmTitle ?? ""}
        tone={confirming?.tone === "danger" ? "danger" : "primary"}
      />
    </div>
  );
}
