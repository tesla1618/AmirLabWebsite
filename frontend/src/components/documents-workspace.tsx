"use client";

import { SyntheticEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Award,
  Download,
  ExternalLink,
  FilePlus2,
  FileText,
  Mail,
  Save,
  Send,
  Star,
  Trash2,
  Upload,
  UserCheck,
} from "lucide-react";
import { AdminOnly } from "@/components/admin-only";
import { useNotifications } from "@/components/notification-provider";
import { StatePanel } from "@/components/state-panel";
import { ButtonAnchor, ButtonControl } from "@/components/ui/button-control";
import { CheckboxControl } from "@/components/ui/checkbox-control";
import { FormField, FormMessage } from "@/components/ui/form-field";
import {
  FileInputControl,
  InputControl,
  TextareaControl,
} from "@/components/ui/form-controls";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SelectControl } from "@/components/ui/select-control";
import { API_URL } from "@/lib/api";
import { apiRequest } from "@/lib/client-api";
import { cn } from "@/lib/cn";

type DocumentKind = "OFFER" | "LETTER" | "CERTIFICATE";
type WorkspaceView = "issue" | "templates" | "issued" | "approval";

interface DocumentTemplate {
  id: string;
  kind: DocumentKind;
  name: string;
  titleTemplate: string;
  bodyMarkdown: string;
  emailSubjectTemplate: string;
  version: number;
  isActive: boolean;
  isDefaultOffer: boolean;
  variables: Array<{ label: string; token: string }>;
}

interface IssuedDocument {
  id: string;
  kind: DocumentKind;
  reference: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  pdfChecksum: string | null;
  emailSentAt: string | null;
  lastEmailError: string | null;
  createdAt: string;
  template: { id: string; name: string } | null;
}

interface Recipient {
  id: string;
  fullName: string;
  email: string | null;
  roleTitle: string | null;
  phone: string | null;
  user: { email: string | null } | null;
}

interface DocumentApproval {
  approverPersonId: string | null;
  approver: {
    name: string;
    title: string;
    email: string;
    phone: string;
  } | null;
  signatureAssetId: string | null;
  signatureAvailable: boolean;
  watermarkAssetId: string | null;
  watermarkAvailable: boolean;
  updatedAt: string;
}

const EMPTY_TEMPLATE: Omit<DocumentTemplate, "id"> = {
  bodyMarkdown: "",
  emailSubjectTemplate: "",
  isActive: true,
  isDefaultOffer: false,
  kind: "LETTER",
  name: "",
  titleTemplate: "",
  variables: [],
  version: 1,
};

const KIND_OPTIONS = [
  { label: "Offer", value: "OFFER" },
  { label: "Letter", value: "LETTER" },
  { label: "Certificate", value: "CERTIFICATE" },
];

export function DocumentsWorkspace() {
  const [view, setView] = useState<WorkspaceView>("issue");
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [issued, setIssued] = useState<IssuedDocument[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [approval, setApproval] = useState<DocumentApproval>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [reload, setReload] = useState(0);

  function refresh() {
    setLoading(true);
    setError(undefined);
    setReload((value) => value + 1);
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<DocumentTemplate[]>("/admin/document-templates", {
        method: "GET",
      }),
      apiRequest<IssuedDocument[]>("/admin/documents", { method: "GET" }),
      apiRequest<Recipient[]>("/admin/documents/recipients", { method: "GET" }),
      apiRequest<DocumentApproval>("/admin/documents/approval", {
        method: "GET",
      }),
    ])
      .then(([nextTemplates, nextIssued, nextRecipients, nextApproval]) => {
        if (!active) return;
        setTemplates(nextTemplates);
        setIssued(nextIssued);
        setRecipients(nextRecipients);
        setApproval(nextApproval);
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : "Document records could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);

  if (error && !templates.length && !loading) {
    return (
      <AdminOnly>
        <StatePanel
          action={{
            label: "Retry",
            onClick: refresh,
          }}
          body="Templates and issued documents could not be retrieved."
          title={error}
          variant="error"
        />
      </AdminOnly>
    );
  }

  return (
    <AdminOnly>
      <div className="grid gap-6" data-loading={loading || undefined}>
        <header className="frame-rail-section grid grid-cols-[42px_minmax(0,1fr)] items-start gap-5 py-5 max-[640px]:grid-cols-1">
          <FileText aria-hidden="true" className="mt-1 text-brand" size={26} />
          <div className="flex items-end justify-between gap-5 max-[720px]:items-start max-[720px]:flex-col">
            <div>
              <p className="m-0 font-mono text-[.64rem] font-semibold uppercase tracking-[.12em] text-brand">
                Official records
              </p>
              <h1 className="mt-2 font-sans text-[clamp(2rem,4vw,3.4rem)] font-normal leading-none">
                Documents
              </h1>
              <p className="mt-3 max-w-[700px] text-[.84rem] leading-[1.6] text-ink-muted">
                Issue offers, letters, and certificates from versioned
                templates. Every PDF keeps the approver and template values used
                at issue time.
              </p>
            </div>
            <SegmentedControl
              ariaLabel="Document workspace view"
              disabled={loading}
              onValueChange={(value) => setView(value as WorkspaceView)}
              options={[
                { label: "Issue", value: "issue" },
                { label: "Templates", value: "templates" },
                { label: "Issued", value: "issued" },
                { label: "Approval", value: "approval" },
              ]}
              value={view}
            />
          </div>
        </header>

        {error ? <FormMessage>{error}</FormMessage> : null}
        {view === "issue" ? (
          <IssueDocumentPanel
            loading={loading}
            onIssued={(document) => {
              setIssued((current) => [document, ...current]);
              setView("issued");
            }}
            recipients={recipients}
            templates={templates}
          />
        ) : view === "templates" ? (
          <TemplatesPanel
            key={templates.length ? "loaded" : "loading"}
            loading={loading}
            onChanged={refresh}
            templates={templates}
          />
        ) : view === "issued" ? (
          <IssuedPanel
            documents={issued}
            loading={loading}
            onChanged={refresh}
          />
        ) : (
          <ApprovalPanel
            approval={approval}
            key={approval?.approverPersonId ?? "loading"}
            loading={loading}
            onSaved={(nextApproval) => setApproval(nextApproval)}
            people={recipients}
          />
        )}
      </div>
    </AdminOnly>
  );
}

function IssueDocumentPanel({
  loading,
  onIssued,
  recipients,
  templates,
}: {
  loading: boolean;
  onIssued: (document: IssuedDocument) => void;
  recipients: Recipient[];
  templates: DocumentTemplate[];
}) {
  const { showToast } = useNotifications();
  const [kind, setKind] = useState<DocumentKind>("OFFER");
  const activeTemplates = useMemo(
    () =>
      templates.filter(
        (template) => template.kind === kind && template.isActive,
      ),
    [kind, templates],
  );
  const defaultTemplate =
    activeTemplates.find((template) => template.isDefaultOffer) ??
    activeTemplates[0];
  const [templateId, setTemplateId] = useState("");
  const selectedTemplateId = activeTemplates.some(
    (template) => template.id === templateId,
  )
    ? templateId
    : (defaultTemplate?.id ?? "");
  const [recipientChoice, setRecipientChoice] = useState("external");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  function selectRecipient(value: string) {
    setRecipientChoice(value);
    if (value === "external") {
      setRecipientName("");
      setRecipientEmail("");
      return;
    }
    const recipient = recipients.find((item) => item.id === value);
    if (!recipient) return;
    setRecipientName(recipient.fullName);
    setRecipientEmail(recipient.email ?? recipient.user?.email ?? "");
  }

  async function issue(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const body = {
        kind,
        templateId: selectedTemplateId,
        ...(recipientChoice === "external"
          ? { recipientEmail: recipientEmail || undefined, recipientName }
          : {
              recipientEmail: recipientEmail || undefined,
              recipientPersonId: recipientChoice,
            }),
        ...(kind === "OFFER"
          ? {
              duration: fields.duration,
              endDate: fields.endDate,
              positionTitle: fields.positionTitle,
              responsibilities: (fields.responsibilities ?? "")
                .split("\n")
                .map((value) => value.trim())
                .filter(Boolean),
              startDate: fields.startDate,
              weeklyCommitment: fields.weeklyCommitment,
            }
          : kind === "LETTER"
            ? {
                letterDetails: fields.letterDetails,
                letterSubject: fields.letterSubject,
              }
            : {
                certificateAchievement: fields.certificateAchievement,
                certificateProgram: fields.certificateProgram,
                completionDate: fields.completionDate,
              }),
      };
      const document = await apiRequest<IssuedDocument>("/admin/documents", {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      showToast({
        body: `${document.reference ?? "The document"} is ready to download.`,
        title: "Document issued",
      });
      onIssued(document);
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "The document could not be issued.";
      setError(message);
      showToast({
        body: message,
        title: "Document was not issued",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid gap-0" onSubmit={issue}>
      <section className="frame-rail-section grid gap-5 py-[clamp(1rem,3vw,1.7rem)]">
        <div className="grid grid-cols-3 gap-4 max-[820px]:grid-cols-1">
          <FormField label="Document type">
            <SelectControl
              disabled={loading || saving}
              onValueChange={(value) => {
                const nextKind = value as DocumentKind;
                const nextTemplates = templates.filter(
                  (template) => template.kind === nextKind && template.isActive,
                );
                setKind(nextKind);
                setTemplateId(
                  nextTemplates.find((template) => template.isDefaultOffer)
                    ?.id ??
                    nextTemplates[0]?.id ??
                    "",
                );
                setFields({});
              }}
              options={KIND_OPTIONS}
              value={kind}
            />
          </FormField>
          <FormField label="Template">
            <SelectControl
              disabled={loading || saving || !activeTemplates.length}
              onValueChange={setTemplateId}
              options={activeTemplates.map((template) => ({
                label: `${template.name}${template.isDefaultOffer ? " - default" : ""}`,
                value: template.id,
              }))}
              placeholder="No active template"
              value={selectedTemplateId}
            />
          </FormField>
          <FormField label="Recipient source">
            <SearchableSelect
              disabled={loading || saving}
              onValueChange={selectRecipient}
              options={[
                {
                  description: "Enter a name and email manually",
                  label: "External recipient",
                  value: "external",
                },
                ...recipients.map((recipient) => ({
                  description:
                    recipient.roleTitle ??
                    recipient.email ??
                    recipient.user?.email ??
                    undefined,
                  label: recipient.fullName,
                  value: recipient.id,
                })),
              ]}
              searchPlaceholder="Search recipients…"
              value={recipientChoice}
            />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4 max-[640px]:grid-cols-1">
          <FormField htmlFor="document-recipient-name" label="Recipient name">
            <InputControl
              disabled={loading || saving || recipientChoice !== "external"}
              id="document-recipient-name"
              onChange={(event) => setRecipientName(event.target.value)}
              required
              value={recipientName}
            />
          </FormField>
          <FormField
            description="Optional for download-only documents."
            htmlFor="document-recipient-email"
            label="Recipient email"
          >
            <InputControl
              disabled={loading || saving}
              id="document-recipient-email"
              onChange={(event) => setRecipientEmail(event.target.value)}
              type="email"
              value={recipientEmail}
            />
          </FormField>
        </div>
      </section>

      <KindFields
        disabled={loading || saving}
        fields={fields}
        kind={kind}
        setField={(key, value) =>
          setFields((current) => ({ ...current, [key]: value }))
        }
      />
      {error ? <FormMessage>{error}</FormMessage> : null}
      <footer className="flex justify-end border-b border-line-strong px-[clamp(1rem,3vw,1.7rem)] py-5">
        <ButtonControl
          disabled={!templateId}
          loading={saving}
          type="submit"
          variant="primary"
        >
          <FilePlus2 aria-hidden="true" size={15} /> Issue document
        </ButtonControl>
      </footer>
    </form>
  );
}

function KindFields({
  disabled,
  fields,
  kind,
  setField,
}: {
  disabled: boolean;
  fields: Record<string, string>;
  kind: DocumentKind;
  setField: (key: string, value: string) => void;
}) {
  if (kind === "OFFER") {
    return (
      <section className="grid gap-4 border-b border-line-strong bg-transparent p-[clamp(1rem,3vw,1.7rem)]">
        <header className="flex items-center gap-3 border-b border-line pb-4">
          <Send aria-hidden="true" className="text-brand" size={19} />
          <strong>Offer details</strong>
        </header>
        <div className="grid grid-cols-2 gap-4 max-[640px]:grid-cols-1">
          {[
            ["positionTitle", "Position title"],
            ["startDate", "Start date"],
            ["endDate", "End date"],
            ["duration", "Duration"],
            ["weeklyCommitment", "Weekly commitment"],
          ].map(([key, label]) => (
            <FormField htmlFor={`offer-${key}`} key={key} label={label}>
              <InputControl
                disabled={disabled}
                id={`offer-${key}`}
                onChange={(event) => setField(key, event.target.value)}
                required={key === "positionTitle"}
                value={fields[key] ?? ""}
              />
            </FormField>
          ))}
        </div>
        <FormField
          description="Enter one responsibility per line."
          htmlFor="offer-responsibilities"
          label="Responsibilities"
        >
          <TextareaControl
            disabled={disabled}
            id="offer-responsibilities"
            onChange={(event) =>
              setField("responsibilities", event.target.value)
            }
            required
            rows={7}
            value={fields.responsibilities ?? ""}
          />
        </FormField>
      </section>
    );
  }
  if (kind === "LETTER") {
    return (
      <section className="grid gap-4 border-b border-line-strong bg-transparent p-[clamp(1rem,3vw,1.7rem)]">
        <header className="flex items-center gap-3 border-b border-line pb-4">
          <Mail aria-hidden="true" className="text-brand" size={19} />
          <strong>Letter details</strong>
        </header>
        <FormField htmlFor="letter-subject" label="Subject">
          <InputControl
            disabled={disabled}
            id="letter-subject"
            onChange={(event) => setField("letterSubject", event.target.value)}
            required
            value={fields.letterSubject ?? ""}
          />
        </FormField>
        <FormField htmlFor="letter-details" label="Details">
          <TextareaControl
            disabled={disabled}
            id="letter-details"
            onChange={(event) => setField("letterDetails", event.target.value)}
            required
            rows={10}
            value={fields.letterDetails ?? ""}
          />
        </FormField>
      </section>
    );
  }
  return (
    <section className="grid gap-4 border-b border-line-strong bg-transparent p-[clamp(1rem,3vw,1.7rem)]">
      <header className="flex items-center gap-3 border-b border-line pb-4">
        <Award aria-hidden="true" className="text-brand" size={20} />
        <strong>Certificate details</strong>
      </header>
      <div className="grid grid-cols-2 gap-4 max-[640px]:grid-cols-1">
        <FormField htmlFor="certificate-program" label="Program">
          <InputControl
            disabled={disabled}
            id="certificate-program"
            onChange={(event) =>
              setField("certificateProgram", event.target.value)
            }
            required
            value={fields.certificateProgram ?? ""}
          />
        </FormField>
        <FormField htmlFor="certificate-completion" label="Completion date">
          <InputControl
            disabled={disabled}
            id="certificate-completion"
            onChange={(event) => setField("completionDate", event.target.value)}
            placeholder="28 August 2026"
            required
            value={fields.completionDate ?? ""}
          />
        </FormField>
      </div>
      <FormField htmlFor="certificate-achievement" label="Achievement">
        <TextareaControl
          disabled={disabled}
          id="certificate-achievement"
          onChange={(event) =>
            setField("certificateAchievement", event.target.value)
          }
          required
          rows={5}
          value={fields.certificateAchievement ?? ""}
        />
      </FormField>
    </section>
  );
}

function TemplatesPanel({
  loading,
  onChanged,
  templates,
}: {
  loading: boolean;
  onChanged: () => void;
  templates: DocumentTemplate[];
}) {
  const { showToast } = useNotifications();
  const bodyEditor = useRef<HTMLTextAreaElement>(null);
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? "new");
  const selected = templates.find((template) => template.id === selectedId);
  const [draft, setDraft] = useState<
    DocumentTemplate | Omit<DocumentTemplate, "id">
  >(selected ?? EMPTY_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [defaultSaving, setDefaultSaving] = useState(false);
  const [error, setError] = useState<string>();

  function newTemplate() {
    setSelectedId("new");
    setDraft(EMPTY_TEMPLATE);
  }

  function selectTemplate(template: DocumentTemplate) {
    setSelectedId(template.id);
    setDraft(template);
  }

  function insertVariable(token: string) {
    const editor = bodyEditor.current;
    const start = editor?.selectionStart ?? draft.bodyMarkdown.length;
    const end = editor?.selectionEnd ?? start;
    setDraft({
      ...draft,
      bodyMarkdown: `${draft.bodyMarkdown.slice(0, start)}${token}${draft.bodyMarkdown.slice(end)}`,
    });
    requestAnimationFrame(() => {
      editor?.focus();
      editor?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function save(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const saved = await apiRequest<DocumentTemplate>(
        selected
          ? `/admin/document-templates/${selected.id}`
          : "/admin/document-templates",
        {
          body: JSON.stringify({
            bodyMarkdown: draft.bodyMarkdown,
            emailSubjectTemplate: draft.emailSubjectTemplate,
            isActive: draft.isActive,
            kind: draft.kind,
            name: draft.name,
            titleTemplate: draft.titleTemplate,
          }),
          headers: { "content-type": "application/json" },
          method: selected ? "PATCH" : "POST",
        },
      );
      setSelectedId(saved.id);
      setDraft(saved);
      showToast({
        body: `${saved.name} is available for ${saved.kind.toLowerCase()} documents.`,
        title: selected ? "Template updated" : "Template created",
      });
      onChanged();
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "The template could not be saved.";
      setError(message);
      showToast({
        body: message,
        title: "Template was not saved",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function setDefault() {
    if (!selected) return;
    setDefaultSaving(true);
    try {
      await apiRequest(
        `/admin/document-templates/${selected.id}/default-offer`,
        {
          method: "POST",
        },
      );
      showToast({
        body: selected.name,
        title: "Default offer template updated",
      });
      onChanged();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Default template was not changed.",
      );
    } finally {
      setDefaultSaving(false);
    }
  }

  const variables =
    "variables" in draft && draft.variables.length
      ? draft.variables
      : (templates.find((template) => template.kind === draft.kind)
          ?.variables ?? []);

  return (
    <div className="frame-rail-section grid grid-cols-[290px_minmax(0,1fr)] !px-0 max-[900px]:grid-cols-1">
      <aside className="grid content-start border-r border-line-strong p-4 max-[900px]:border-r-0 max-[900px]:border-b">
        <ButtonControl
          className="mb-2 justify-start"
          onClick={newTemplate}
          variant="dashed"
        >
          <FilePlus2 aria-hidden="true" size={15} /> New template
        </ButtonControl>
        {templates.map((template) => (
          <button
            className={cn(
              "grid cursor-pointer gap-1 border-b border-line-strong p-4 text-left transition-colors first-of-type:border-t focus-visible:z-10 focus-visible:shadow-[var(--focus-ring)]",
              selectedId === template.id
                ? "border-brand bg-brand-faint"
                : "border-line bg-transparent hover:border-brand hover:bg-brand-faint",
            )}
            key={template.id}
            onClick={() => selectTemplate(template)}
            type="button"
          >
            <span className="flex items-center justify-between gap-3">
              <strong className="text-[.82rem]">{template.name}</strong>
              {template.isDefaultOffer ? (
                <Star aria-label="Default offer" size={14} />
              ) : null}
            </span>
            <span className="font-mono text-[.62rem] uppercase tracking-[.08em] text-ink-muted">
              {template.kind} · v{template.version} ·{" "}
              {template.isActive ? "Active" : "Inactive"}
            </span>
          </button>
        ))}
      </aside>

      <form
        className="grid gap-5 p-[clamp(1rem,3vw,1.7rem)]"
        onSubmit={save}
      >
        <div className="grid grid-cols-2 gap-4 max-[640px]:grid-cols-1">
          <FormField htmlFor="template-name" label="Template name">
            <InputControl
              disabled={loading || saving}
              id="template-name"
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
              required
              value={draft.name}
            />
          </FormField>
          <FormField label="Document type">
            <SelectControl
              disabled={loading || saving || Boolean(selected)}
              onValueChange={(value) =>
                setDraft({ ...draft, kind: value as DocumentKind })
              }
              options={KIND_OPTIONS}
              value={draft.kind}
            />
          </FormField>
          <FormField htmlFor="template-title" label="PDF title">
            <InputControl
              disabled={loading || saving}
              id="template-title"
              onChange={(event) =>
                setDraft({ ...draft, titleTemplate: event.target.value })
              }
              required
              value={draft.titleTemplate}
            />
          </FormField>
          <FormField htmlFor="template-email-subject" label="Email subject">
            <InputControl
              disabled={loading || saving}
              id="template-email-subject"
              onChange={(event) =>
                setDraft({ ...draft, emailSubjectTemplate: event.target.value })
              }
              required
              value={draft.emailSubjectTemplate}
            />
          </FormField>
        </div>
        <FormField
          description="Safe Markdown only. Signature placement is controlled by Document approval."
          htmlFor="template-body"
          label="Document body"
        >
          <TextareaControl
            className="font-mono text-[.78rem] leading-[1.6]"
            disabled={loading || saving}
            id="template-body"
            onChange={(event) =>
              setDraft({ ...draft, bodyMarkdown: event.target.value })
            }
            ref={bodyEditor}
            required
            rows={18}
            value={draft.bodyMarkdown}
          />
        </FormField>
        <div className="flex flex-wrap gap-2 border-y border-line-strong bg-canvas p-4">
          {variables.map((variable) => (
            <ButtonControl
              compact
              key={variable.token}
              onClick={() => insertVariable(variable.token)}
              title={variable.label}
              variant="add-another"
            >
              {variable.token}
            </ButtonControl>
          ))}
        </div>
        <CheckboxControl
          checked={draft.isActive}
          disabled={loading || saving}
          id="template-active"
          onCheckedChange={(checked) =>
            setDraft({ ...draft, isActive: checked })
          }
        >
          Active for new documents
        </CheckboxControl>
        {error ? <FormMessage>{error}</FormMessage> : null}
        <footer className="flex flex-wrap justify-end gap-3 border-t border-line pt-5">
          {selected ? (
            <ButtonControl
              disabled={saving || defaultSaving}
              onClick={() =>
                void openPdf(`/admin/document-templates/${selected.id}/preview`)
              }
            >
              <ExternalLink aria-hidden="true" size={15} /> Preview PDF
            </ButtonControl>
          ) : null}
          {selected?.kind === "OFFER" && !selected.isDefaultOffer ? (
            <ButtonControl
              disabled={saving || defaultSaving || !draft.isActive}
              loading={defaultSaving}
              onClick={() => void setDefault()}
            >
              <Star aria-hidden="true" size={15} /> Make default offer
            </ButtonControl>
          ) : null}
          <ButtonControl loading={saving} type="submit" variant="primary">
            <Save aria-hidden="true" size={15} /> Save template
          </ButtonControl>
        </footer>
      </form>
    </div>
  );
}

function IssuedPanel({
  documents,
  loading,
  onChanged,
}: {
  documents: IssuedDocument[];
  loading: boolean;
  onChanged: () => void;
}) {
  const { showToast } = useNotifications();
  const [sendingIds, setSendingIds] = useState<Set<string>>(() => new Set());

  async function email(document: IssuedDocument) {
    setSendingIds((current) => new Set(current).add(document.id));
    try {
      await apiRequest(`/admin/documents/${document.id}/email`, {
        method: "POST",
      });
      showToast({
        body: `${document.reference ?? "The document"} is queued for delivery.`,
        title: "Email queued",
      });
      onChanged();
    } catch (caught) {
      showToast({
        body:
          caught instanceof Error
            ? caught.message
            : "The email could not be queued.",
        title: "Email was not queued",
        tone: "error",
      });
    } finally {
      setSendingIds((current) => {
        const next = new Set(current);
        next.delete(document.id);
        return next;
      });
    }
  }

  if (!documents.length && !loading) {
    return (
      <StatePanel
        body="Issue an offer, letter, or certificate to create the first immutable PDF record."
        frame="workspace"
        title="No documents issued yet"
        variant="empty"
      />
    );
  }

  return (
    <div className="grid gap-3">
      {documents.map((document) => (
        <article
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-5 border-y border-line-strong bg-transparent p-4 max-[720px]:grid-cols-1"
          key={document.id}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <strong>{document.recipientName ?? "Legacy recipient"}</strong>
              <span className="rounded-small border border-brand/20 bg-brand-soft px-2 py-1 font-mono text-[.58rem] font-semibold uppercase tracking-[.08em] text-brand">
                {document.kind}
              </span>
            </div>
            <p className="mt-1 font-mono text-[.68rem] text-ink-muted">
              {document.reference ?? "Legacy offer"} ·{" "}
              {document.template?.name ?? "Archived template"} ·{" "}
              {new Date(document.createdAt).toLocaleDateString()}
            </p>
            <p className="mt-2 text-[.72rem] text-ink-muted">
              {document.emailSentAt
                ? `Emailed ${new Date(document.emailSentAt).toLocaleString()}`
                : document.lastEmailError
                  ? "Last email attempt failed."
                  : document.recipientEmail
                    ? "Ready to email."
                    : "Download only - no recipient email."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonAnchor
              compact
              href={`${API_URL}/admin/documents/${document.id}/pdf`}
              target="_blank"
            >
              <Download aria-hidden="true" size={14} /> Download
            </ButtonAnchor>
            {document.recipientEmail && !document.emailSentAt ? (
              <ButtonControl
                compact
                loading={sendingIds.has(document.id)}
                disabled={sendingIds.has(document.id)}
                onClick={() => void email(document)}
                variant="primary"
              >
                <Mail aria-hidden="true" size={14} /> Email
              </ButtonControl>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function ApprovalPanel({
  approval,
  loading,
  onSaved,
  people,
}: {
  approval: DocumentApproval | undefined;
  loading: boolean;
  onSaved: (approval: DocumentApproval) => void;
  people: Recipient[];
}) {
  const { showToast } = useNotifications();
  const inputRef = useRef<HTMLInputElement>(null);
  const watermarkInputRef = useRef<HTMLInputElement>(null);
  const [personId, setPersonId] = useState(approval?.approverPersonId ?? "");
  const [signature, setSignature] = useState<File>();
  const [removeSignature, setRemoveSignature] = useState(false);
  const [watermark, setWatermark] = useState<File>();
  const [removeWatermark, setRemoveWatermark] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const selected = people.find((person) => person.id === personId);
  const display =
    personId === approval?.approverPersonId && approval.approver
      ? approval.approver
      : selected
        ? {
            email: selected.email ?? selected.user?.email ?? "No email set",
            name: selected.fullName,
            phone: selected.phone ?? "No phone set",
            title: selected.roleTitle ?? "No role title set",
          }
        : null;
  const showStoredSignature =
    approval?.signatureAvailable && !signature && !removeSignature;
  const showStoredWatermark =
    approval?.watermarkAvailable && !watermark && !removeWatermark;

  async function save(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (!personId) return;
    setSaving(true);
    setError(undefined);
    const body = new FormData();
    body.set("approverPersonId", personId);
    if (signature) body.set("signature", signature);
    if (removeSignature) body.set("removeSignature", "true");
    if (watermark) body.set("watermark", watermark);
    if (removeWatermark) body.set("removeWatermark", "true");
    try {
      const saved = await apiRequest<DocumentApproval>(
        "/admin/documents/approval",
        {
          body,
          method: "PUT",
        },
      );
      onSaved(saved);
      setSignature(undefined);
      setRemoveSignature(false);
      setWatermark(undefined);
      setRemoveWatermark(false);
      if (inputRef.current) inputRef.current.value = "";
      if (watermarkInputRef.current) watermarkInputRef.current.value = "";
      showToast({
        body: "New documents will use this approval identity, signature, and watermark.",
        title: "Document approval updated",
      });
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Approval settings could not be saved.";
      setError(message);
      showToast({
        body: message,
        title: "Changes were not saved",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid gap-5" onSubmit={save}>
      <section className="frame-rail-section grid gap-5 py-[clamp(1rem,3vw,1.7rem)]">
        <header className="flex items-start gap-3 border-b border-line pb-4">
          <UserCheck
            aria-hidden="true"
            className="mt-0.5 text-brand"
            size={20}
          />
          <div>
            <strong>Document approval</strong>
            <p className="mt-1 text-[.76rem] leading-[1.55] text-ink-muted">
              Choose the existing person whose identity verifies newly issued
              documents. Their profile remains the source for name, role, and
              contact details.
            </p>
          </div>
        </header>
        <FormField label="Approving person">
          <SearchableSelect
            disabled={loading || saving}
            onValueChange={setPersonId}
            options={people.map((person) => ({
              description:
                person.roleTitle ??
                person.email ??
                person.user?.email ??
                undefined,
              label: person.fullName,
              value: person.id,
            }))}
            placeholder="Choose a person"
            searchPlaceholder="Search people…"
            value={personId}
          />
        </FormField>
        {display ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line-strong bg-canvas p-4 text-[.78rem] max-[640px]:grid-cols-1">
            {[
              ["Name", display.name],
              ["Role", display.title],
              ["Email", display.email],
              ["Phone", display.phone],
            ].map(([label, value]) => (
              <div key={label}>
                <span className="font-mono text-[.6rem] font-semibold uppercase tracking-[.08em] text-ink-muted">
                  {label}
                </span>
                <p className="mt-1">{value}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="frame-rail-section grid gap-4 py-[clamp(1rem,3vw,1.7rem)]">
        <div>
          <strong>Approval signature</strong>
          <p className="mt-1 text-[.76rem] leading-[1.55] text-ink-muted">
            Any valid image is normalized to a private PNG. If it is missing or
            unavailable, the PDF is generated without an image.
          </p>
        </div>
        <label className="relative flex min-h-[150px] cursor-pointer items-center justify-center overflow-hidden rounded-control border border-dashed border-[color-mix(in_srgb,var(--brand)_38%,var(--line))] bg-canvas p-5 text-center hover:border-brand hover:bg-brand-faint">
          {signature ? (
            <span className="grid gap-2 text-[.78rem]">
              <strong>{signature.name}</strong>
              <span className="text-ink-muted">
                {(signature.size / 1024).toFixed(1)} KB selected
              </span>
            </span>
          ) : showStoredSignature ? (
            <img
              alt="Stored approval signature"
              className="max-h-[105px] max-w-full object-contain"
              src={`${API_URL}/admin/documents/approval/signature?v=${encodeURIComponent(approval?.updatedAt ?? "")}`}
            />
          ) : (
            <span className="grid justify-items-center gap-2 text-ink-muted">
              <Upload aria-hidden="true" className="text-brand" size={22} />
              <strong className="text-[.8rem] text-ink">
                Choose a signature image
              </strong>
              <span className="text-[.7rem]">Maximum 8 MB</span>
            </span>
          )}
          <FileInputControl
            accept="image/*,.svg"
            disabled={loading || saving}
            onChange={(event) => {
              const file = event.target.files?.[0];
              setSignature(file);
              if (file) setRemoveSignature(false);
            }}
            ref={inputRef}
          />
        </label>
        {signature || showStoredSignature ? (
          <ButtonControl
            className="justify-self-start"
            compact
            disabled={loading || saving}
            onClick={() => {
              setSignature(undefined);
              setRemoveSignature(true);
              if (inputRef.current) inputRef.current.value = "";
            }}
            variant="danger-ghost"
          >
            <Trash2 aria-hidden="true" size={14} /> Remove signature
          </ButtonControl>
        ) : null}
      </section>

      <section className="frame-rail-section grid gap-4 py-[clamp(1rem,3vw,1.7rem)]">
        <div>
          <strong>Document watermark</strong>
          <p className="mt-1 text-[.76rem] leading-[1.55] text-ink-muted">
            Upload the Head logo or another valid image. It is stored privately,
            normalized to PNG, and centered behind every generated PDF page.
          </p>
        </div>
        <label className="relative flex min-h-[180px] cursor-pointer items-center justify-center overflow-hidden rounded-control border border-dashed border-[color-mix(in_srgb,var(--brand)_38%,var(--line))] bg-canvas p-5 text-center hover:border-brand hover:bg-brand-faint">
          {watermark ? (
            <span className="grid gap-2 text-[.78rem]">
              <strong>{watermark.name}</strong>
              <span className="text-ink-muted">
                {(watermark.size / 1024).toFixed(1)} KB selected
              </span>
            </span>
          ) : showStoredWatermark ? (
            <img
              alt="Stored document watermark"
              className="max-h-[135px] max-w-full object-contain opacity-60"
              src={`${API_URL}/admin/documents/approval/watermark?v=${encodeURIComponent(approval?.updatedAt ?? "")}`}
            />
          ) : (
            <span className="grid justify-items-center gap-2 text-ink-muted">
              <Upload aria-hidden="true" className="text-brand" size={22} />
              <strong className="text-[.8rem] text-ink">
                Choose a watermark image
              </strong>
              <span className="text-[.7rem]">Maximum 8 MB</span>
            </span>
          )}
          <FileInputControl
            accept="image/*,.svg"
            disabled={loading || saving}
            onChange={(event) => {
              const file = event.target.files?.[0];
              setWatermark(file);
              if (file) setRemoveWatermark(false);
            }}
            ref={watermarkInputRef}
          />
        </label>
        {watermark || showStoredWatermark ? (
          <ButtonControl
            className="justify-self-start"
            compact
            disabled={loading || saving}
            onClick={() => {
              setWatermark(undefined);
              setRemoveWatermark(true);
              if (watermarkInputRef.current)
                watermarkInputRef.current.value = "";
            }}
            variant="danger-ghost"
          >
            <Trash2 aria-hidden="true" size={14} /> Remove watermark
          </ButtonControl>
        ) : null}
      </section>
      {error ? <FormMessage>{error}</FormMessage> : null}
      <footer className="flex justify-end border-t border-line pt-5">
        <ButtonControl
          disabled={!personId}
          loading={saving}
          type="submit"
          variant="primary"
        >
          <Save aria-hidden="true" size={15} /> Save approval settings
        </ButtonControl>
      </footer>
    </form>
  );
}

async function openPdf(path: string): Promise<void> {
  const csrfToken = sessionStorage.getItem("amirl_csrf");
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: csrfToken ? { "x-csrf-token": csrfToken } : undefined,
    method: "POST",
  });
  if (!response.ok) throw new Error("The PDF preview could not be generated.");
  const url = URL.createObjectURL(await response.blob());
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
