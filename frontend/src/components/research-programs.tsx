"use client";

import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  BookOpenText,
  Building2,
  FolderKanban,
  Plus,
  Save,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { StatePanel } from "@/components/state-panel";
import { WorkspacePageShell } from "@/components/workspace-page-shell";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ButtonControl } from "@/components/ui/button-control";
import { CheckboxControl } from "@/components/ui/checkbox-control";
import { DateField } from "@/components/ui/date-time-field";
import { InputControl, TextareaControl } from "@/components/ui/form-controls";
import { FormField } from "@/components/ui/form-field";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import { SelectControl } from "@/components/ui/select-control";
import {
  WorkspaceEmpty,
  WorkspaceMetric,
  WorkspaceMetricStrip,
  WorkspacePanel,
  WorkspaceSplit,
} from "@/components/ui/workspace-surface";
import { apiRequest } from "@/lib/client-api";
import {
  researchProgramStatusLabel,
  type ResearchProgram,
  type ResearchProgramOptions,
  type ResearchProgramStatus,
} from "@/lib/research-programs";

const statusOptions = [
  { label: "Planned", value: "PLANNED" },
  { label: "Active", value: "ACTIVE" },
  { label: "Paused", value: "PAUSED" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Archived", value: "ARCHIVED" },
];

interface ProgramForm {
  name: string;
  summary: string;
  objective: string;
  status: ResearchProgramStatus;
  startsAt: string;
  endsAt: string;
  publicPageEnabled: boolean;
  leadPersonId: string;
  departmentIds: string[];
  projectIds: string[];
  outputIds: string[];
}

const emptyForm: ProgramForm = {
  name: "",
  summary: "",
  objective: "",
  status: "PLANNED",
  startsAt: "",
  endsAt: "",
  publicPageEnabled: false,
  leadPersonId: "",
  departmentIds: [],
  projectIds: [],
  outputIds: [],
};

export function ResearchPrograms() {
  const { loading: authLoading, user } = useAuth();
  const [programs, setPrograms] = useState<ResearchProgram[]>();
  const [options, setOptions] = useState<ResearchProgramOptions>();
  const [selectedId, setSelectedId] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ProgramForm>(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const admin = user?.role === "ADMIN";

  useEffect(() => {
    if (authLoading || !user) return;
    let active = true;
    Promise.all([
      apiRequest<ResearchProgram[]>("/research-programs", { method: "GET" }),
      admin
        ? apiRequest<ResearchProgramOptions>("/research-programs/options", {
            method: "GET",
          })
        : Promise.resolve(undefined),
    ])
      .then(([nextPrograms, nextOptions]) => {
        if (!active) return;
        setPrograms(nextPrograms);
        setOptions(nextOptions);
        const selected =
          nextPrograms.find(({ id }) => id === selectedId) ?? nextPrograms[0];
        setSelectedId(selected?.id);
        if (selected) setForm(programForm(selected));
        else if (admin) setCreating(true);
        setError("");
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : "Research programs could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [admin, authLoading, reload, selectedId, user]);

  const selected = programs?.find(({ id }) => id === selectedId);
  const activeCount =
    programs?.filter(({ status }) => status === "ACTIVE").length ?? 0;
  const projectCount = uniqueProgramItems(programs, "PROJECT");
  const outputCount = uniqueProgramItems(programs, "OUTPUT");
  const departmentCount = new Set(
    programs?.flatMap((program) =>
      program.departments.map(({ departmentId }) => departmentId),
    ),
  ).size;

  function choose(program: ResearchProgram) {
    setSelectedId(program.id);
    setForm(programForm(program));
    setCreating(false);
    setError("");
  }

  function startProgram() {
    setCreating(true);
    setSelectedId(undefined);
    setForm(emptyForm);
    setError("");
  }

  async function save() {
    if (!form.name.trim() || !form.objective.trim()) {
      setError("Program name and objective are required.");
      return;
    }
    setSaving(true);
    try {
      const program = await apiRequest<ResearchProgram>(
        creating ? "/research-programs" : `/research-programs/${selectedId}`,
        {
          body: JSON.stringify({
            ...form,
            endsAt: form.endsAt || null,
            leadPersonId: form.leadPersonId || null,
            startsAt: form.startsAt || null,
          }),
          headers: { "content-type": "application/json" },
          method: creating ? "POST" : "PUT",
        },
      );
      setPrograms((current) => [
        program,
        ...(current ?? []).filter(({ id }) => id !== program.id),
      ]);
      setSelectedId(program.id);
      setForm(programForm(program));
      setCreating(false);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The research program could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  const loading = authLoading || !programs;
  return (
    <WorkspacePageShell
      action={
        admin ? (
          <ButtonControl onClick={startProgram} variant="primary">
            <Plus aria-hidden="true" size={16} /> New program
          </ButtonControl>
        ) : undefined
      }
      description={
        loading
          ? "Long-running research portfolios and institutional objectives"
          : `${programs.length} current program${programs.length === 1 ? "" : "s"} · linked projects, outputs, and departments`
      }
    >
      <div className="grid gap-[1.5rem] max-[640px]:gap-[.9rem]">
        {error ? (
          <StatePanel
            action={
              !programs
                ? {
                    label: "Try again",
                    onClick: () => setReload((value) => value + 1),
                  }
                : undefined
            }
            body={error}
            title={
              programs
                ? "Program not saved"
                : "Could not load research programs"
            }
            variant="error"
          />
        ) : null}

        <WorkspaceMetricStrip>
          <WorkspaceMetric
            detail="currently moving"
            label="Active programs"
            loading={loading}
            tone="brand"
            value={loading ? "0" : activeCount}
          />
          <WorkspaceMetric
            detail="canonical project records"
            label="Linked projects"
            loading={loading}
            value={loading ? "0" : projectCount}
          />
          <WorkspaceMetric
            detail="papers and datasets"
            label="Linked outputs"
            loading={loading}
            tone="success"
            value={loading ? "0" : outputCount}
          />
          <WorkspaceMetric
            detail="participating lab units"
            label="Departments"
            loading={loading}
            value={loading ? "0" : departmentCount}
          />
        </WorkspaceMetricStrip>

        <WorkspaceSplit>
          <WorkspacePanel
            action={
              loading ? null : creating ? (
                <Badge tone="neutral">New</Badge>
              ) : selected ? (
                <Badge tone={statusTone(selected.status)}>
                  {researchProgramStatusLabel(selected.status)}
                </Badge>
              ) : null
            }
            description={
              admin
                ? "Keep the program identity stable while its projects and outputs evolve."
                : "Program scope, leadership, participating units, and connected research."
            }
            eyebrow="Program record"
            title={
              creating
                ? "Define a program"
                : (selected?.name ?? "Program details")
            }
          >
            {loading ? (
              <ProgramEditor
                disabled
                form={emptyForm}
                loading
                onChange={setForm}
                onSave={() => undefined}
                options={options}
              />
            ) : admin && (creating || selected) ? (
              <ProgramEditor
                disabled={saving}
                form={form}
                onChange={setForm}
                onSave={() => void save()}
                options={options}
              />
            ) : selected ? (
              <ProgramReadView program={selected} />
            ) : (
              <WorkspaceEmpty>
                No research program is available yet.
              </WorkspaceEmpty>
            )}
          </WorkspacePanel>

          <WorkspacePanel
            description="Programs are durable research directions; projects remain the units of execution."
            eyebrow="Portfolio index"
            title="Current programs"
          >
            <div
              aria-busy={loading}
              className="grid"
              data-loading={loading || undefined}
            >
              {(loading ? [undefined, undefined, undefined] : programs).map(
                (program, index) => (
                  <ButtonControl
                    aria-pressed={Boolean(
                      program && !creating && selectedId === program.id,
                    )}
                    className="min-h-[78px] w-full justify-between rounded-none border-0 border-b border-line px-5 py-4 text-left hover:bg-surface-subtle aria-pressed:bg-surface-subtle aria-pressed:text-ink"
                    disabled={!program}
                    key={program?.id ?? index}
                    loading={!program}
                    onClick={() => program && choose(program)}
                    variant="secondary"
                  >
                    <span className="grid min-w-0 gap-1">
                      <strong
                        className={cn(
                          "overflow-hidden text-ellipsis whitespace-nowrap text-[.84rem]",
                          loadingPlaceholder(!program, "text", "long"),
                        )}
                        data-placeholder={!program ? "text" : undefined}
                        data-placeholder-width="long"
                      >
                        {program?.name ?? "Research program"}
                      </strong>
                      <small
                        className={cn(
                          "text-[.7rem] text-ink-muted",
                          loadingPlaceholder(!program, "label", "medium"),
                        )}
                        data-placeholder={!program ? "label" : undefined}
                        data-placeholder-width="medium"
                      >
                        {program?.lead?.fullName ?? "Program leadership"}
                      </small>
                    </span>
                    <Badge
                      loading={!program}
                      tone={program ? statusTone(program.status) : "neutral"}
                    >
                      {program
                        ? researchProgramStatusLabel(program.status)
                        : "Status"}
                    </Badge>
                  </ButtonControl>
                ),
              )}
              {!loading && programs.length === 0 ? (
                <WorkspaceEmpty>
                  {admin
                    ? "Create the first research program to connect related work."
                    : "No current research programs."}
                </WorkspaceEmpty>
              ) : null}
            </div>
          </WorkspacePanel>
        </WorkspaceSplit>
      </div>
    </WorkspacePageShell>
  );
}

function ProgramEditor({
  disabled,
  form,
  loading = false,
  onChange,
  onSave,
  options,
}: {
  disabled: boolean;
  form: ProgramForm;
  loading?: boolean;
  onChange: (form: ProgramForm) => void;
  onSave: () => void;
  options?: ResearchProgramOptions;
}) {
  return (
    <form
      aria-busy={loading}
      className="grid min-w-0 grid-cols-1 gap-6 p-6 max-[640px]:p-5"
      data-loading={loading || undefined}

      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <FormField
        htmlFor="program-name"
        label="Program name"
        labelClassName="text-[.78rem] font-semibold tracking-[.04em]"
      >
        <InputControl
          loading={loading}
          disabled={disabled || loading}
          id="program-name"
          maxLength={180}
          onChange={(event) => onChange({ ...form, name: event.target.value })}
          placeholder="e.g. Trustworthy Medical AI"
          required
          value={form.name}
        />
      </FormField>
      <FormField
        htmlFor="program-summary"
        label="Portfolio summary"
        labelClassName="text-[.78rem] font-semibold tracking-[.04em]"
      >
        <TextareaControl
          loading={loading}
          disabled={disabled || loading}
          id="program-summary"
          maxLength={4_000}
          onChange={(event) =>
            onChange({ ...form, summary: event.target.value })
          }
          placeholder="Explain the research direction and why the lab sustains it across projects."
          value={form.summary}
        />
      </FormField>
      <FormField
        htmlFor="program-objective"
        label="Program objective"
        labelClassName="text-[.78rem] font-semibold tracking-[.04em]"
      >
        <TextareaControl
          loading={loading}
          disabled={disabled || loading}
          id="program-objective"
          maxLength={8_000}
          onChange={(event) =>
            onChange({ ...form, objective: event.target.value })
          }
          placeholder="State the long-term capability, evidence, or impact this program should produce."
          required
          value={form.objective}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4 max-[640px]:grid-cols-1">
        <FormField
          label="Program status"
          labelClassName="text-[.78rem] font-semibold tracking-[.04em]"
        >
          <SelectControl
            ariaLabel="Program status"
            disabled={disabled || loading}
            loading={loading}
            onValueChange={(status) =>
              onChange({ ...form, status: status as ResearchProgramStatus })
            }
            options={statusOptions}
            value={form.status}
          />
        </FormField>
        <FormField
          label="Program lead"
          labelClassName="text-[.78rem] font-semibold tracking-[.04em]"
        >
          <SearchableSelect
            ariaLabel="Program lead"
            disabled={disabled || loading}
            placeholderLoading={loading}
            onValueChange={(leadPersonId) =>
              onChange({ ...form, leadPersonId })
            }
            options={(options?.people ?? []).map((person) => ({
              description: person.roleTitle ?? person.headline ?? undefined,
              label: person.fullName,
              value: person.id,
            }))}
            placeholder="Select registered lead…"
            searchPlaceholder="Search registered people…"
            value={form.leadPersonId}
          />
        </FormField>
        <FormField
          label="Expected start"
          labelClassName="text-[.78rem] font-semibold tracking-[.04em]"
        >
          <DateField
            disabled={disabled || loading}
            label="Expected start"
            loading={loading}
            maxValue={form.endsAt || undefined}
            onChange={(startsAt) => onChange({ ...form, startsAt })}
            showInlineLabel={false}
            value={form.startsAt}
          />
        </FormField>
        <FormField
          label="Expected end"
          labelClassName="text-[.78rem] font-semibold tracking-[.04em]"
        >
          <DateField
            disabled={disabled || loading}
            label="Expected end"
            loading={loading}
            minValue={form.startsAt || undefined}
            onChange={(endsAt) => onChange({ ...form, endsAt })}
            showInlineLabel={false}
            value={form.endsAt}
          />
        </FormField>
      </div>

      <RelationshipPicker
        disabled={disabled || loading}
        loading={loading}
        icon={<Building2 aria-hidden="true" size={16} />}
        label="Participating departments"
        onChange={(departmentIds) => onChange({ ...form, departmentIds })}
        options={(options?.departments ?? []).map((department) => ({
          description: department.abbreviation ?? undefined,
          label: department.name,
          value: department.id,
        }))}
        placeholder="Add registered department…"
        values={form.departmentIds}
      />
      <RelationshipPicker
        disabled={disabled || loading}
        loading={loading}
        icon={<FolderKanban aria-hidden="true" size={16} />}
        label="Projects in this program"
        onChange={(projectIds) => onChange({ ...form, projectIds })}
        options={(options?.projects ?? []).map(researchOption)}
        placeholder="Add canonical project…"
        values={form.projectIds}
      />
      <RelationshipPicker
        disabled={disabled || loading}
        loading={loading}
        icon={<BookOpenText aria-hidden="true" size={16} />}
        label="Papers and datasets"
        onChange={(outputIds) => onChange({ ...form, outputIds })}
        options={(options?.outputs ?? []).map(researchOption)}
        placeholder="Add research output…"
        values={form.outputIds}
      />

      <CheckboxControl
        checked={form.publicPageEnabled}
        disabled={disabled || loading}
        loading={loading}
        id="program-public"
        onCheckedChange={(publicPageEnabled) =>
          onChange({ ...form, publicPageEnabled })
        }
      >
        <span className="grid gap-1">
          <strong className="text-[.84rem]">
            Prepare a public program page
          </strong>
          <small className="text-[.72rem] leading-[1.45] text-ink-muted">
            This only records publication intent. Explicit public projection and
            review remain a later governance step.
          </small>
        </span>
      </CheckboxControl>

      <div className="flex justify-end max-[640px]:grid max-[640px]:justify-stretch">
        <ButtonControl
          disabled={disabled || loading}
          loading={loading}
          type="submit"
          variant="primary"
        >
          <Save aria-hidden="true" size={16} /> Save program
        </ButtonControl>
      </div>
    </form>
  );
}

function RelationshipPicker({
  icon,
  label,
  disabled,
  loading = false,
  onChange,
  options,
  placeholder,
  values,
}: {
  disabled: boolean;
  loading?: boolean;
  icon: ReactNode;
  label: string;
  onChange: (values: string[]) => void;
  options: SearchableSelectOption[];
  placeholder: string;
  values: string[];
}) {
  const available = options.filter(({ value }) => !values.includes(value));
  return (
    <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0">
      <legend className="mb-3 flex items-center gap-2 text-[.78rem] font-semibold tracking-[.03em]">
        {icon}
        {label}
      </legend>
      <SearchableSelect
        ariaLabel={label}
        disabled={disabled}
        placeholderLoading={loading}
        emptyMessage="Every available record is already linked."
        onValueChange={(value) => onChange([...values, value])}
        options={available}
        placeholder={placeholder}
        searchPlaceholder={`Search ${label.toLowerCase()}…`}
      />
      <div
        className="grid overflow-hidden rounded-control border border-line"
        data-loading={loading || undefined}
      >
        {(loading && !values.length ? ["loading-record"] : values).map(
          (value) => {
            const option = options.find(
              (candidate) => candidate.value === value,
            );
            return (
              <div
                className="flex min-h-[var(--control-height)] items-center justify-between gap-4 border-t border-line px-3 py-2 first:border-t-0"
                key={value}
              >
                <span className="grid min-w-0 gap-[2px]">
                  <strong
                    className={cn(
                      "overflow-hidden text-ellipsis whitespace-nowrap text-[.82rem]",
                      loadingPlaceholder(loading, "text", "long"),
                    )}
                    data-placeholder={loading ? "text" : undefined}
                    data-placeholder-width="long"
                  >
                    {option?.label ?? "Linked record"}
                  </strong>
                  {loading || option?.description ? (
                    <small
                      className={cn(
                        "text-[.7rem] text-ink-muted",
                        loadingPlaceholder(loading, "label", "medium"),
                      )}
                      data-placeholder={loading ? "label" : undefined}
                      data-placeholder-width="medium"
                    >
                      {option?.description ?? "Relationship metadata"}
                    </small>
                  ) : null}
                </span>
                <ButtonControl
                  compact
                  disabled={disabled}
                  loading={loading}
                  onClick={() =>
                    onChange(values.filter((current) => current !== value))
                  }
                  variant="secondary"
                >
                  Remove
                </ButtonControl>
              </div>
            );
          },
        )}
        {!loading && !values.length ? (
          <small className="p-4 text-[.7rem] text-ink-muted">
            No records linked yet.
          </small>
        ) : null}
      </div>
    </fieldset>
  );
}

function ProgramReadView({ program }: { program: ResearchProgram }) {
  const projects = program.items.filter(
    ({ researchItem }) => researchItem.type === "PROJECT",
  );
  const outputs = program.items.filter(
    ({ researchItem }) => researchItem.type !== "PROJECT",
  );
  return (
    <div className="grid">
      <section className="px-6 py-5">
        <strong className="text-[.76rem] tracking-[.04em]">Objective</strong>
        <p className="mt-2 whitespace-pre-wrap leading-[1.6] text-ink-muted">
          {program.objective}
        </p>
      </section>
      {program.summary ? (
        <section className="border-t border-line px-6 py-5">
          <strong className="text-[.76rem] tracking-[.04em]">Direction</strong>
          <p className="mt-2 whitespace-pre-wrap leading-[1.6] text-ink-muted">
            {program.summary}
          </p>
        </section>
      ) : null}
      <section className="grid grid-cols-2 gap-4 border-t border-line px-6 py-5 max-[640px]:grid-cols-1">
        <span className="grid grid-cols-[auto_1fr] items-center gap-1">
          <UserRound
            aria-hidden="true"
            className="row-span-2 text-brand"
            size={16}
          />
          <small className="text-[.66rem] text-ink-muted">Lead</small>
          <strong className="text-[.82rem]">
            {program.lead?.fullName ?? "Not assigned"}
          </strong>
        </span>
        <span className="grid grid-cols-[auto_1fr] items-center gap-1">
          <Building2
            aria-hidden="true"
            className="row-span-2 text-brand"
            size={16}
          />
          <small className="text-[.66rem] text-ink-muted">Departments</small>
          <strong className="text-[.82rem]">
            {program.departments
              .map(
                ({ department }) => department.abbreviation ?? department.name,
              )
              .join(" · ") || "None linked"}
          </strong>
        </span>
      </section>
      <ProgramRecords
        icon={<FolderKanban aria-hidden="true" size={16} />}
        label="Projects"
        records={projects.map(
          ({ researchItem }) => researchItem.title ?? "Untitled project",
        )}
      />
      <ProgramRecords
        icon={<BookOpenText aria-hidden="true" size={16} />}
        label="Papers and datasets"
        records={outputs.map(
          ({ researchItem }) => researchItem.title ?? "Untitled output",
        )}
      />
    </div>
  );
}

function ProgramRecords({
  icon,
  label,
  records,
}: {
  icon: ReactNode;
  label: string;
  records: string[];
}) {
  return (
    <section className="grid gap-2 border-t border-line px-6 py-5">
      <strong className="mb-0 flex items-center gap-2 text-[.78rem] font-semibold tracking-[.03em]">
        {icon}
        {label}
      </strong>
      {records.length ? (
        records.map((record) => (
          <span
            className="rounded-small bg-surface-subtle px-4 py-3 text-[.8rem]"
            key={record}
          >
            {record}
          </span>
        ))
      ) : (
        <small className="text-[.76rem] text-ink-muted">
          No records linked.
        </small>
      )}
    </section>
  );
}

function programForm(program: ResearchProgram): ProgramForm {
  return {
    departmentIds: program.departments.map(({ departmentId }) => departmentId),
    endsAt: program.endsAt?.slice(0, 10) ?? "",
    leadPersonId: program.leadId ?? "",
    name: program.name,
    objective: program.objective,
    outputIds: program.items
      .filter(({ researchItem }) => researchItem.type !== "PROJECT")
      .map(({ researchItemId }) => researchItemId),
    projectIds: program.items
      .filter(({ researchItem }) => researchItem.type === "PROJECT")
      .map(({ researchItemId }) => researchItemId),
    publicPageEnabled: program.publicPageEnabled,
    startsAt: program.startsAt?.slice(0, 10) ?? "",
    status: program.status,
    summary: program.summary ?? "",
  };
}

function researchOption(
  item: ResearchProgramOptions["projects"][number],
): SearchableSelectOption {
  return {
    description:
      item.type === "PROJECT"
        ? "Project"
        : item.type === "PAPER"
          ? "Paper"
          : "Dataset",
    label: item.title ?? "Untitled research record",
    value: item.id,
  };
}

function uniqueProgramItems(
  programs: ResearchProgram[] | undefined,
  kind: "OUTPUT" | "PROJECT",
) {
  return new Set(
    programs?.flatMap((program) =>
      program.items
        .filter(({ researchItem }) =>
          kind === "PROJECT"
            ? researchItem.type === "PROJECT"
            : researchItem.type !== "PROJECT",
        )
        .map(({ researchItemId }) => researchItemId),
    ),
  ).size;
}

function statusTone(status: ResearchProgramStatus): BadgeTone {
  if (status === "ACTIVE") return "success";
  if (status === "PAUSED") return "warning";
  if (status === "ARCHIVED") return "neutral";
  return "neutral";
}
