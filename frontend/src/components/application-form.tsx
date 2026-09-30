"use client";

import Image from "next/image";
import { SyntheticEvent, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Upload } from "lucide-react";
import type { Position } from "@/lib/types";
import { apiRequest } from "@/lib/client-api";
import { parseResumeFile, type ResumeParseResult } from "@/lib/resume-parser";
import { ButtonControl } from "@/components/ui/button-control";
import { CheckboxControl } from "@/components/ui/checkbox-control";
import { FileInputControl } from "@/components/ui/form-controls";
import { SelectControl } from "@/components/ui/select-control";
import { useNotifications } from "@/components/notification-provider";
import { cn } from "@/lib/cn";
import { FormField } from "@/components/ui/form-field";
import { loadingPlaceholder } from "@/lib/loading-style";

type SubmissionState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; id: string }
  | { kind: "error"; message: string };

export function ApplicationForm({
  positions,
  loading = false,
}: {
  positions: Position[];
  loading?: boolean;
}) {
  const { showToast } = useNotifications();
  const [file, setFile] = useState<File>();
  const [parseResult, setParseResult] = useState<ResumeParseResult>();
  const [parseMessage, setParseMessage] = useState<string>();
  const [parsing, setParsing] = useState(false);
  const [submission, setSubmission] = useState<SubmissionState>({
    kind: "idle",
  });

  async function inspectFile(selectedFile: File | undefined) {
    setFile(selectedFile);
    setParseResult(undefined);
    setParseMessage(undefined);
    if (!selectedFile) return;
    setParsing(true);
    try {
      setParseResult(await parseResumeFile(selectedFile));
    } catch (error) {
      setParseMessage(
        error instanceof Error ? error.message : "Unable to read PDF.",
      );
    } finally {
      setParsing(false);
    }
  }

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!file) {
      setSubmission({
        kind: "error",
        message: "Choose a CV PDF before submitting.",
      });
      return;
    }
    const profile = parseResult?.resume.profile;
    if (!parseResult || !profile?.fullName || !profile.email) {
      setSubmission({
        kind: "error",
        message: "Your CV must contain a readable name and email address.",
      });
      return;
    }
    setSubmission({ kind: "submitting" });
    const form = new FormData(formElement);
    form.set("fullName", profile.fullName);
    form.set("email", profile.email);
    if (profile.phone) form.set("phone", profile.phone);
    form.set("cv", file);
    if (parseResult.profileImage)
      form.set("profileImage", parseResult.profileImage, "cv-profile.jpg");
    try {
      const result = await apiRequest<{ id: string }>("/applications", {
        body: form,
        method: "POST",
      });
      setSubmission({ kind: "success", id: result.id });
      showToast({
        body: "Application received. The review team can now inspect it.",
        title: "Application submitted",
      });
      formElement.reset();
      setFile(undefined);
      setParseResult(undefined);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Application failed.";
      setSubmission({ kind: "error", message });
      showToast({
        body: message,
        title: "Application was not submitted",
        tone: "error",
      });
    }
  }

  return (
    <form
      aria-busy={loading || undefined}
      className="grid gap-4"
      onSubmit={submit}
    >
      <div>
        <p
          aria-hidden={loading || undefined}
          className={cn(
            "m-0 mb-4 font-[var(--font-sans)] text-[.75rem] font-extrabold uppercase tracking-[.12em] text-brand",
            loading && loadingPlaceholder(true, "label", "medium"),
          )}
        >
          Apply without an account
        </p>
        <h2
          aria-hidden={loading || undefined}
          className={cn(
            "mb-[.7rem] mt-[.65rem] font-sans text-[clamp(2rem,4vw,3rem)] font-medium leading-none tracking-[-.04em]",
            loading && loadingPlaceholder(true, "text", "medium"),
          )}
        >
          Start with your CV
        </h2>
        <p
          aria-hidden={loading || undefined}
          className={cn(
            "m-0 max-w-[580px] text-[.86rem] leading-[1.6] text-ink-muted",
            loading && loadingPlaceholder(true, "text", "long"),
          )}
        >
          Choose a role and upload your CV as a PDF. The browser reads the
          document to preview the name, email, phone number, and detected
          sections before you submit.
        </p>
      </div>
      <FormField
        htmlFor="positionId"
        label="Position"
        labelClassName={cn(
          "text-[.78rem] font-semibold tracking-[.04em]",
          loading && loadingPlaceholder(true, "label", "short"),
        )}
      >
        <SelectControl
          disabled={!positions.length || loading}
          id="positionId"
          name="positionId"
          loading={loading}
          options={positions.map((position) => ({
            label: position.title,
            value: position.id,
          }))}
          placeholder="Select a position"
          required
        />
      </FormField>
      <FormField
        label="CV or resume"
        labelClassName={cn(
          "text-[.78rem] font-semibold tracking-[.04em]",
          loading && loadingPlaceholder(true, "label", "short"),
        )}
      >
        <label
          className={cn(
            "grid min-h-[170px] cursor-pointer place-content-center gap-[.35rem] rounded-panel border border-dashed border-line-strong bg-surface-subtle p-[1.6rem] text-center transition-[background,border-color] duration-[220ms] hover:border-brand-hover hover:bg-brand-soft focus-within:border-brand focus-within:border-solid motion-reduce:transition-none",
            loading && loadingPlaceholder(true, "control"),
          )}
          htmlFor="cv"
        >
          <span className="mx-auto mb-[.45rem] flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-brand">
            <Upload aria-hidden="true" size={20} />
          </span>
          <strong className="text-[.9rem]">
            {file ? file.name : "Drop your CV here, or click to browse"}
          </strong>
          <span className="text-[.75rem] text-ink-muted">
            PDF only · selectable text · maximum 8 MB
          </span>
          <FileInputControl
            accept="application/pdf,.pdf"
            disabled={loading}
            id="cv"
            loading={loading}
            onChange={(event) => void inspectFile(event.target.files?.[0])}
          />
        </label>
        {parsing ? (
          <p
            className="inline-flex items-center gap-2 text-[.75rem] text-ink-muted"
            role="status"
          >
            <LoaderCircle
              aria-hidden="true"
              className="animate-spin"
              size={15}
            />{" "}
            Reading PDF in your browser…
          </p>
        ) : null}
        {parseResult ? <ResumePreview result={parseResult} /> : null}
        {parseMessage ? (
          <p className="text-[.75rem] text-danger" role="alert">
            {parseMessage}
          </p>
        ) : null}
      </FormField>
      <CheckboxControl
        id="application-consent"
        loading={loading}
        name="consent"
        required
      >
        <span>
          I consent to AmirLab storing this application and CV for recruitment
          review.
        </span>
      </CheckboxControl>
      {submission.kind === "error" ? (
        <p className="text-[.75rem] text-danger" role="alert">
          {submission.message}
        </p>
      ) : null}
      {submission.kind === "success" ? (
        <p className="text-[.75rem] text-success" role="status">
          Application received. Reference: {submission.id}
        </p>
      ) : null}
      <ButtonControl
        disabled={
          !positions.length ||
          parsing ||
          !parseResult?.likelyAtsFriendly ||
          !parseResult?.resume.profile.fullName ||
          !parseResult.resume.profile.email ||
          submission.kind === "submitting"
        }
        loading={loading}
        type="submit"
      >
        Submit application
      </ButtonControl>
      <p
        aria-hidden={loading || undefined}
        className={cn(
          "-mt-[.3rem] text-[.73rem] leading-[1.5] text-ink-muted",
          loading && loadingPlaceholder(true, "text", "long"),
        )}
      >
        The server checks the PDF again after submission. If it cannot read the
        document, the application is rejected with formatting feedback.
      </p>
    </form>
  );
}

function ResumePreview({ result }: { result: ResumeParseResult }) {
  const { profile, pageCount, sections } = result.resume;
  const profileImageUrl = useMemo(
    () =>
      result.profileImage
        ? URL.createObjectURL(result.profileImage)
        : undefined,
    [result.profileImage],
  );
  useEffect(
    () => () => {
      if (profileImageUrl) URL.revokeObjectURL(profileImageUrl);
    },
    [profileImageUrl],
  );
  const detectedSections = Object.entries(sections)
    .filter(([name, lines]) => name !== "profile" && lines.length > 0)
    .map(([name]) => name);

  return (
    <section
      className="overflow-hidden rounded-panel border border-line animate-[preview-enter_420ms_cubic-bezier(.22,1,.36,1)_both] motion-reduce:animate-none"
      aria-label="Parsed CV preview"
    >
      <header className="flex items-start justify-between gap-[.8rem] border-b border-line bg-canvas p-4">
        <div>
          <h3 className="m-0 text-[.9rem]">CV preview</h3>
          <p className="mt-1 text-[.72rem] text-ink-muted">{result.feedback}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-[.35rem] font-mono text-[.62rem] uppercase",
            result.likelyAtsFriendly
              ? "bg-brand-soft text-brand"
              : "bg-danger-soft text-danger",
          )}
        >
          {result.likelyAtsFriendly ? "ATS readable" : "Needs attention"}
        </span>
      </header>
      <div className="flex items-stretch max-[640px]:grid">
        {profileImageUrl ? (
          <div className="grid basis-[150px] place-items-center gap-[.55rem] border-r border-line p-4 text-center max-[640px]:border-b max-[640px]:border-r-0">
            <Image
              alt={`Profile photo extracted for ${profile.fullName ?? "applicant"}`}
              className="h-28 w-28 rounded-[3px] object-cover"
              height={112}
              src={profileImageUrl}
              unoptimized
              width={112}
            />
            <span className="text-[.66rem] text-ink-muted">
              Photo extracted from CV
            </span>
          </div>
        ) : null}
        <div className="grid flex-1 grid-cols-2 max-[640px]:grid-cols-1">
          <ParsedField label="Name" value={profile.fullName} odd />
          <ParsedField label="Email" value={profile.email} />
          <ParsedField label="Phone" value={profile.phone} odd />
          <ParsedField
            label="Document"
            value={`${pageCount} ${pageCount === 1 ? "page" : "pages"}`}
          />
        </div>
      </div>
      <div className="p-4">
        <span className="mb-[.65rem] block text-[.68rem] text-ink-muted">
          Detected sections
        </span>
        <div className="flex flex-wrap gap-[.4rem]">
          {detectedSections.length ? (
            detectedSections.map((section) => (
              <strong
                className="rounded-full bg-surface-subtle px-[.65rem] py-[.4rem] text-[.7rem] font-semibold capitalize"
                key={section}
              >
                {section}
              </strong>
            ))
          ) : (
            <strong className="rounded-full bg-surface-subtle px-[.65rem] py-[.4rem] text-[.7rem] font-semibold">
              None detected
            </strong>
          )}
        </div>
      </div>
    </section>
  );
}

function ParsedField({
  label,
  value,
  odd = false,
}: {
  label: string;
  value: string | null;
  odd?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-[.3rem] border-b border-line p-4",
        odd && "border-r max-[640px]:border-r-0",
      )}
    >
      <span className="text-[.68rem] text-ink-muted">{label}</span>
      <strong className="[overflow-wrap:anywhere] text-[.82rem]">
        {value ?? "Not detected"}
      </strong>
    </div>
  );
}
