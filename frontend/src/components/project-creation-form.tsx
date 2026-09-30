"use client";

import { SyntheticEvent, useEffect, useMemo, useState } from "react";
import { LockKeyhole, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { useNotifications } from "@/components/notification-provider";
import { InputControl, TextareaControl } from "@/components/ui/form-controls";
import { FormField, FormMessage } from "@/components/ui/form-field";
import { IconButton } from "@/components/ui/icon-button";
import { ButtonControl } from "@/components/ui/button-control";
import { DateField } from "@/components/ui/date-time-field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SelectControl } from "@/components/ui/select-control";
import {
  WorkspaceRecord,
  WorkspaceRecordForm,
  WorkspaceRecordPanelHeader,
  WorkspaceRecordPanelTitle,
} from "@/components/workspace-record";
import { apiRequest } from "@/lib/client-api";

interface ProjectPerson {
  id: string;
  fullName: string;
  headline: string | null;
  roleTitle: string | null;
  departments: Array<{ departmentId: string; isPrimary: boolean }>;
}

interface ProjectDepartment {
  id: string;
  name: string;
  abbreviation: string | null;
}

interface ProjectOptions {
  people: ProjectPerson[];
  departments: ProjectDepartment[];
}

const statusOptions = [
  { label: "Planned", value: "PLANNED" },
  { label: "Active", value: "ACTIVE" },
  { label: "Paused", value: "PAUSED" },
];

export function ProjectCreationForm() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useNotifications();
  const staff = Boolean(user && user.role !== "MEMBER");
  const [options, setOptions] = useState<ProjectOptions>({
    departments: [],
    people: [],
  });
  const [departmentId, setDepartmentId] = useState("");
  const [ownerPersonId, setOwnerPersonId] = useState("");
  const [contributorIds, setContributorIds] = useState<string[]>([]);
  const [endsAt, setEndsAt] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void apiRequest<ProjectOptions>("/projects/options", { method: "GET" })
      .then((nextOptions) => {
        if (!active) return;
        setOptions(nextOptions);
        const owner = staff
          ? undefined
          : nextOptions.people.find((person) => person.id === user?.person?.id);
        setOwnerPersonId(owner?.id ?? "");
        setContributorIds(owner ? [owner.id] : []);
        setDepartmentId(
          owner?.departments.find((department) => department.isPrimary)
            ?.departmentId ??
            owner?.departments[0]?.departmentId ??
            "",
        );
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Project options could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });
    return () => {
      active = false;
    };
  }, [staff, user?.person?.id]);

  const contributors = useMemo(
    () =>
      contributorIds.flatMap(
        (id) => options.people.find((person) => person.id === id) ?? [],
      ),
    [contributorIds, options.people],
  );
  const availablePeople = options.people.filter(
    (person) => !contributorIds.includes(person.id),
  );

  function chooseOwner(personId: string) {
    const owner = options.people.find((person) => person.id === personId);
    setOwnerPersonId(personId);
    setContributorIds((current) => [
      personId,
      ...current.filter((id) => id !== personId && id !== ownerPersonId),
    ]);
    if (owner) {
      setDepartmentId(
        owner.departments.find((department) => department.isPrimary)
          ?.departmentId ??
          owner.departments[0]?.departmentId ??
          departmentId,
      );
    }
  }

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    setError(undefined);
    if (!departmentId) {
      setError("Select the lab unit responsible for this project.");
      return;
    }
    if (!ownerPersonId) {
      setError(
        staff
          ? "Select the registered person this project is being created for."
          : "A registered project owner is required.",
      );
      return;
    }
    if (!contributorIds.includes(ownerPersonId)) {
      setError("The project owner must be part of the project team.");
      return;
    }
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const project = await apiRequest<{ researchItemId: string }>(
        "/projects",
        {
          body: JSON.stringify({
            contributorPersonIds: contributorIds,
            departmentId,
            ...(staff ? { ownerPersonId } : {}),
            endsAt: endsAt || undefined,
            objective: form.get("objective"),
            startsAt: startsAt || undefined,
            status: form.get("status"),
            summary: form.get("summary") || undefined,
            title: form.get("title"),
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      showToast({
        body: staff
          ? "The workspace was created for the selected registered member."
          : "The private workspace, project chat, and team access are ready.",
        title: "Project created",
      });
      router.push(`/workspace/projects/${project.researchItemId}`);
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Project could not be created.";
      setError(message);
      showToast({
        body: message,
        title: "Project was not created",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <WorkspaceRecord
      backHref="/workspace/projects"
      backLabel="Projects"
      description="Start a private operational workspace for a registered AMIR Lab team. Public presentation can be prepared separately."
      eyebrow="Internal project"
      title="New project"
    >
      <WorkspaceRecordForm onSubmit={submit}>
        <WorkspaceRecordPanelHeader>
          <p className="m-0 font-sans text-[.65rem] font-semibold uppercase tracking-[.1em] text-brand">
            Project foundation
          </p>
          <WorkspaceRecordPanelTitle>
            Scope and ownership
          </WorkspaceRecordPanelTitle>
          <p className="m-0 text-[.84rem] leading-[1.5] text-ink-muted">
            Define who owns the work and where it belongs before planning
            milestones.
          </p>
        </WorkspaceRecordPanelHeader>

        <FormField htmlFor="project-title" label="Working title">
          <InputControl id="project-title" name="title" required />
        </FormField>
        <FormField
          description="State the concrete research outcome this project exists to achieve."
          htmlFor="project-objective"
          label="Primary objective"
        >
          <TextareaControl id="project-objective" name="objective" required />
        </FormField>
        <FormField htmlFor="project-summary" label="Internal summary">
          <TextareaControl id="project-summary" name="summary" />
        </FormField>

        {staff ? (
          <FormField label="Create on behalf of">
            <SearchableSelect
              ariaLabel="Registered project owner"
              disabled={loadingOptions}
              emptyMessage="No registered people found."
              onValueChange={chooseOwner}
              options={options.people.map((person) => ({
                description: person.roleTitle ?? person.headline ?? undefined,
                label: person.fullName,
                value: person.id,
              }))}
              placeholder={
                loadingOptions
                  ? "Loading registered people…"
                  : "Select registered owner…"
              }
              searchPlaceholder="Search by name or role…"
              value={ownerPersonId}
            />
            <p className="m-0 text-[.82rem] leading-[1.5] text-ink-muted">
              The selected member is the project owner. Your staff account
              records the administrative action but is not added as an owner.
            </p>
          </FormField>
        ) : null}

        <div className="grid grid-cols-2 gap-[1.2rem] max-[700px]:grid-cols-1">
          <FormField label="Lab unit">
            <SearchableSelect
              ariaLabel="Project lab unit"
              disabled={loadingOptions}
              emptyMessage="No lab units found."
              onValueChange={setDepartmentId}
              options={options.departments.map((department) => ({
                description: department.abbreviation ?? undefined,
                label: department.name,
                value: department.id,
              }))}
              placeholder={
                loadingOptions ? "Loading lab units…" : "Select lab unit…"
              }
              searchPlaceholder="Search lab units…"
              value={departmentId}
            />
          </FormField>
          <FormField htmlFor="project-status" label="Initial status">
            <SelectControl
              defaultValue="PLANNED"
              id="project-status"
              name="status"
              options={statusOptions}
              required
            />
          </FormField>
          <FormField label="Expected start">
            <DateField
              label="Expected start"
              maxValue={endsAt}
              onChange={setStartsAt}
              showInlineLabel={false}
              value={startsAt}
            />
          </FormField>
          <FormField label="Expected end">
            <DateField
              label="Expected end"
              minValue={startsAt}
              onChange={setEndsAt}
              showInlineLabel={false}
              value={endsAt}
            />
          </FormField>
        </div>

        <FormField label="Project team">
          <div className="grid gap-[.75rem]">
            <SearchableSelect
              ariaLabel="Add project contributor"
              disabled={loadingOptions}
              emptyMessage="No more registered people found."
              onValueChange={(personId) =>
                setContributorIds((current) => [...current, personId])
              }
              options={availablePeople.map((person) => ({
                description: person.roleTitle ?? person.headline ?? undefined,
                label: person.fullName,
                value: person.id,
              }))}
              placeholder={
                loadingOptions
                  ? "Loading registered people…"
                  : "Add registered contributor…"
              }
              searchPlaceholder="Search by name or role…"
            />
            {contributors.length ? (
              <div className="grid border-t border-line">
                {contributors.map((person, index) => {
                  const owner = person.id === ownerPersonId;
                  return (
                    <div
                      className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-line py-[.7rem]"
                      key={person.id}
                    >
                      <span className="grid gap-[.15rem]">
                        <strong className="text-[.9rem] font-semibold">
                          {person.fullName}
                        </strong>
                        <small className="text-[.7rem] text-ink-muted">
                          {owner
                            ? "Owner · manage access"
                            : "Contributor · update access"}
                        </small>
                      </span>
                      {!owner ? (
                        <IconButton
                          className="text-danger hover:bg-danger-soft hover:text-danger"
                          aria-label={`Remove ${person.fullName}`}
                          variant="bordered"
                          onClick={() =>
                            setContributorIds((current) =>
                              current.filter((id) => id !== person.id),
                            )
                          }
                        >
                          <X size={14} />
                        </IconButton>
                      ) : (
                        <i
                          aria-hidden="true"
                          className="font-mono text-[.65rem] not-italic text-ink-faint"
                        >
                          1
                        </i>
                      )}
                      {!owner ? (
                        <i className="font-mono text-[.65rem] not-italic text-ink-faint">
                          {index + 1}
                        </i>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
          <p className="m-0 text-[.82rem] leading-[1.5] text-ink-muted">
            Selected members receive immediate access to the project workspace
            and chat.
          </p>
        </FormField>

        <div className="flex items-start gap-3 border border-[color-mix(in_srgb,var(--brand)_24%,var(--line))] bg-brand-soft p-4 text-brand">
          <LockKeyhole aria-hidden="true" size={18} />
          <div>
            <strong className="text-[.88rem] text-ink">
              Private by default
            </strong>
            <p className="m-0 text-[.8rem] leading-[1.5] text-ink-muted">
              This creates an internal workspace. Nothing appears on the public
              website until public settings are enabled and approved.
            </p>
          </div>
        </div>
        {error ? <FormMessage>{error}</FormMessage> : null}
        <div className="flex flex-wrap justify-end gap-[.65rem] max-[700px]:justify-start">
          <ButtonControl
            disabled={saving || loadingOptions}
            type="submit"
            variant="primary"
          >
            {saving
              ? "Creating workspace…"
              : staff
                ? "Create workspace on behalf"
                : "Create project workspace"}
          </ButtonControl>
        </div>
      </WorkspaceRecordForm>
    </WorkspaceRecord>
  );
}
