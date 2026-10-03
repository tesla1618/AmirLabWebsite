"use client";

import { SyntheticEvent, useEffect, useState } from "react";
import { apiRequest } from "@/lib/client-api";
import { SelectControl } from "@/components/ui/select-control";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ButtonControl } from "@/components/ui/button-control";
import { InputControl, TextareaControl } from "@/components/ui/form-controls";
import { FormField, FormMessage } from "@/components/ui/form-field";
import { useAuth } from "@/components/auth-provider";
import { useNotifications } from "@/components/notification-provider";
import {
  WorkspaceRecord,
  WorkspaceRecordForm,
  WorkspaceRecordPanelHeader,
  WorkspaceRecordPanelTitle,
} from "@/components/workspace-record";
const researchOutputOptions = [
  { label: "Paper", value: "PAPER" },
  { label: "Dataset", value: "DATASET" },
];

export function ResearchSubmissionForm() {
  const { user } = useAuth();
  const { showToast } = useNotifications();
  const staff = Boolean(user && user.role !== "MEMBER");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [people, setPeople] = useState<
    Array<{
      id: string;
      fullName: string;
      roleTitle: string | null;
      headline: string | null;
    }>
  >();
  const [submitterPersonId, setSubmitterPersonId] = useState("");

  useEffect(() => {
    if (!staff) return;
    let active = true;
    void apiRequest<Array<{
        id: string;
        fullName: string;
        roleTitle: string | null;
        headline: string | null;
      }>>("/research/submitters", { method: "GET" })
      .then((result) => {
        if (active) setPeople(result);
      })
      .catch((caught) => {
        if (!active) return;
        setPeople([]);
        setError(
          caught instanceof Error
            ? caught.message
            : "Registered people could not be loaded.",
        );
      });
    return () => {
      active = false;
    };
  }, [staff]);
  const loadingPeople = staff && people === undefined;
  const availablePeople = people ?? [];
  const effectiveSubmitterPersonId = staff
    ? submitterPersonId
    : (user?.person?.id ?? "");

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    setError(undefined);
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (staff && !effectiveSubmitterPersonId) {
      setError(
        "Select the registered person this record is being submitted for.",
      );
      setLoading(false);
      return;
    }
    const contributors = String(form.get("contributors") ?? "")
      .split("\n")
      .map((name) => name.trim())
      .filter(Boolean);
    const type = form.get("type");
    try {
      const body: Record<string, unknown> = {
        canonicalUrl: form.get("canonicalUrl"),
        contributors,
        summary: form.get("summary") || undefined,
        title: form.get("title"),
        type,
        ...(staff ? { submitterPersonId: effectiveSubmitterPersonId } : {}),
      };
      const result = await apiRequest<{
        outcome: "APPLIED" | "QUEUED_FOR_REVIEW";
        reviewStatus: string;
      }>("/research", {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      formElement.reset();
      setSubmitterPersonId("");
      showToast({
        body:
          result.outcome === "QUEUED_FOR_REVIEW"
            ? "The source and registered contributor matches are being checked before review."
            : "The research output is published. Source details are being checked.",
        title:
          result.outcome === "QUEUED_FOR_REVIEW"
            ? staff
              ? "Research record submitted on behalf"
              : "Research output submitted"
            : "Research output published",
      });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Submission failed.";
      setError(message);
      showToast({
        body: message,
        title: "Research output was not submitted",
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <WorkspaceRecord
      backHref="/workspace/submissions"
      backLabel="Papers & datasets"
      description="Add a canonical public source before contributors are checked for registered-person matches."
      eyebrow="Paper or dataset"
      title={staff ? "New record on behalf" : "New research output"}
    >
      <WorkspaceRecordForm onSubmit={submit}>
        <WorkspaceRecordPanelHeader>
          <p className="m-0 font-sans text-[.65rem] font-semibold uppercase tracking-[.1em] text-brand">
            Source details
          </p>
          <WorkspaceRecordPanelTitle>
            Publication information
          </WorkspaceRecordPanelTitle>
        </WorkspaceRecordPanelHeader>
        {staff ? (
          <FormField label="Submitted by">
            <SearchableSelect
              ariaLabel="Submitted by"
              disabled={loadingPeople || loading}
              emptyMessage="No registered people found."
              onValueChange={setSubmitterPersonId}
              options={availablePeople.map((person) => ({
                description: person.roleTitle ?? person.headline ?? undefined,
                label: person.fullName,
                value: person.id,
              }))}
              placeholder={
                loadingPeople
                  ? "Loading registered people…"
                   : "Select registered person…"
              }
              searchPlaceholder="Search by name or role…"
              value={submitterPersonId}
            />
            <p className="m-0 text-[.82rem] leading-[1.5] text-ink-muted">
              Select the person this research belongs to. Your account is recorded in the activity history.
            </p>
          </FormField>
        ) : (
          <FormField label="Submitted by">
            <p className="m-0 text-sm text-ink">{user?.person?.fullName ?? "Your registered profile"}</p>
          </FormField>
        )}
        <FormField htmlFor="research-type" label="Type">
          <SelectControl
            defaultValue="PAPER"
            id="research-type"
            name="type"
            options={researchOutputOptions}
            required
          />
        </FormField>
        <FormField htmlFor="research-title" label="Title">
          <InputControl id="research-title" name="title" required />
        </FormField>
        <FormField htmlFor="canonical-url" label="Canonical URL">
          <InputControl
            id="canonical-url"
            name="canonicalUrl"
            required
            type="url"
          />
          <p className="m-0 text-[.82rem] leading-[1.5] text-ink-muted">
            DOI, repository, or dataset page. No file is uploaded.
          </p>
        </FormField>
        <FormField htmlFor="contributors" label="Authors">
          <TextareaControl id="contributors" name="contributors" rows={3} />
          <p className="m-0 text-[.82rem] leading-[1.5] text-ink-muted">
            One author per line, in publication order. You can leave this empty for source discovery; authors are required before publication.
          </p>
        </FormField>
        <FormField htmlFor="research-summary" label="Summary">
          <TextareaControl id="research-summary" name="summary" />
        </FormField>
        {error ? <FormMessage>{error}</FormMessage> : null}
        <div className="flex flex-wrap justify-end gap-[.65rem] max-[700px]:justify-start">
          <ButtonControl
            disabled={loading || loadingPeople || !effectiveSubmitterPersonId}
            type="submit"
            variant="primary"
          >
            {staff ? "Submit on behalf for review" : "Submit for review"}
          </ButtonControl>
        </div>
      </WorkspaceRecordForm>
    </WorkspaceRecord>
  );
}
