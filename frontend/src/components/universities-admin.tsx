"use client";

import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import Image from "next/image";
import { WorkspaceRowLink } from "@/components/ui/workspace-row-link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { ArrowRight, Save, Trash2, Upload } from "lucide-react";
import { AdminOnly } from "@/components/admin-only";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useNotifications } from "@/components/notification-provider";
import { StatePanel } from "@/components/state-panel";
import {
  WorkspaceRecord,
  WorkspaceRecordForm,
  WorkspaceRecordPanel,
  WorkspaceRecordPanelHeader,
  WorkspaceRecordPanelTitle,
} from "@/components/workspace-record";
import { apiRequest } from "@/lib/client-api";
import { SemanticStatus } from "@/components/ui/semantic-status";
import { API_URL } from "@/lib/api";
import { CheckboxControl } from "@/components/ui/checkbox-control";
import { FileInputControl, InputControl } from "@/components/ui/form-controls";
import type { University } from "@/lib/types";
import { ButtonControl } from "@/components/ui/button-control";
import { WorkspaceCollection } from "@/components/ui/workspace-surface";

const EMPTY_UNIVERSITY: University = {
  createdAt: "",
  id: "",
  isPublished: false,
  logoAssetId: null,
  name: "",
  slug: "",
  updatedAt: "",
  websiteUrl: null,
};

export function UniversityIndex() {
  const [universities, setUniversities] = useState<University[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const load = () => {
    setError(undefined);
    setLoading(true);
    void apiRequest<University[]>("/admin/universities", { method: "GET" })
      .then(setUniversities)
      .catch((value: unknown) =>
        setError(
          value instanceof Error
            ? value.message
            : "Unable to load universities.",
        ),
      )
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    let active = true;
    void apiRequest<University[]>("/admin/universities", { method: "GET" })
      .then((items) => {
        if (active) setUniversities(items);
      })
      .catch((value: unknown) => {
        if (active)
          setError(
            value instanceof Error
              ? value.message
              : "Unable to load universities.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <AdminOnly>
      {error && !loading ? (
        <StatePanel
          frame="workspace"
          action={{ label: "Retry", onClick: load }}
          body="The connection dropped. Nothing was changed."
          title={error}
          variant="error"
        />
      ) : !loading && !universities.length ? (
        <StatePanel
          frame="workspace"
          body="Create the first collaborating university from the page action above."
          title="No universities yet"
        />
      ) : (
        <WorkspaceCollection data-loading={loading || undefined}>
          {(loading && !universities.length
            ? Array.from({ length: 4 }, () => undefined)
            : universities
          ).map((university, index) => (
            <WorkspaceRowLink
              key={university?.id ?? `university-loading-${index}`}
              loading={loading || !university}
              className="flex min-h-[64px] items-center justify-between gap-4 py-[.72rem]"
              href={
                university ? `/workspace/universities/${university.id}` : "#"
              }
            >
              <div>
                <strong
                  className={cn(
                    "text-[.84rem] font-medium leading-[1.35]",
                    loadingPlaceholder(loading, "text", "long"),
                  )}
                  data-placeholder="text"
                  data-placeholder-width="long"
                >
                  {university?.name ||
                    (loading ? "Loading university" : "Unnamed university")}
                </strong>
                <div className="mt-[.35rem]">
                  {university ? (
                    <SemanticStatus
                      loading={loading}
                      tone={university.isPublished ? "success" : "warning"}
                    >
                      {university.isPublished ? "Published" : "Draft"}
                    </SemanticStatus>
                  ) : (
                    <small
                      className={cn(
                        "font-mono text-[.6rem] text-ink-muted",
                        loadingPlaceholder(loading, "label", "medium"),
                      )}
                      data-placeholder="label"
                      data-placeholder-width="medium"
                    >
                      Loading status
                    </small>
                  )}
                </div>
              </div>
              <ArrowRight
                aria-hidden="true"
                className={loading ? "opacity-[.12]" : undefined}
                data-loading-icon={loading ? "true" : undefined}
                size={17}
              />
            </WorkspaceRowLink>
          ))}
        </WorkspaceCollection>
      )}
    </AdminOnly>
  );
}

export function UniversityEditor({ id }: { id?: string }) {
  const router = useRouter();
  const { showToast } = useNotifications();
  const [university, setUniversity] = useState<University>(EMPTY_UNIVERSITY);
  const [logoFile, setLogoFile] = useState<File>();
  const [removeLogo, setRemoveLogo] = useState(false);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [removeLogoPending, setRemoveLogoPending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    if (!id) return;
    setLoading(true);
    void apiRequest<University>(`/admin/universities/${id}`, { method: "GET" })
      .then(setUniversity)
      .catch((value: unknown) =>
        setError(
          value instanceof Error ? value.message : "Unable to load university.",
        ),
      )
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (!id) return;
    let active = true;
    void apiRequest<University>(`/admin/universities/${id}`, { method: "GET" })
      .then((record) => {
        if (active) setUniversity(record);
      })
      .catch((value: unknown) => {
        if (active)
          setError(
            value instanceof Error
              ? value.message
              : "Unable to load university.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function save(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    const body = new FormData();
    body.set("name", university.name.trim());
    if (university.websiteUrl)
      body.set("websiteUrl", university.websiteUrl.trim());
    body.set("isPublished", String(university.isPublished));
    if (logoFile) body.set("logo", logoFile);
    if (removeLogo) body.set("removeLogo", "true");
    try {
      await apiRequest<University>(
        id ? `/admin/universities/${id}` : "/admin/universities",
        { body, method: id ? "PATCH" : "POST" },
      );
      showToast({
        body: id
          ? "The university record was updated."
          : "The university record was created.",
        title: id ? "University updated" : "University created",
      });
      router.replace("/workspace/universities");
    } catch (value) {
      const message =
        value instanceof Error ? value.message : "Unable to save university.";
      setError(message);
      showToast({
        body: message,
        title: "University was not saved",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeUniversity() {
    try {
      await apiRequest(`/admin/universities/${id}`, { method: "DELETE" });
      showToast({
        body: "The university was permanently deleted.",
        title: "University deleted",
      });
      router.push("/workspace/universities");
      router.refresh();
    } catch (value) {
      const message =
        value instanceof Error ? value.message : "Unable to delete university.";
      setError(message);
      showToast({
        body: message,
        title: "University was not deleted",
        tone: "error",
      });
    }
  }

  if (!loading && error && id && !university.id)
    return (
      <StatePanel
        action={{ label: "Retry", onClick: load }}
        body="The university record could not be retrieved."
        title={error}
        variant="error"
      />
    );
  const displayLogo = !removeLogo && university.logoAssetId;

  return (
    <AdminOnly>
      <WorkspaceRecord
        actions={
          <ButtonControl
            loading={loading}
            disabled={saving}
            form="university-record"
            type="submit"
            variant="primary"
          >
            <Save size={15} /> {id ? "Save changes" : "Create university"}
          </ButtonControl>
        }
        backHref="/workspace/universities"
        backLabel="Universities"
        description="These records control the collaborating-university marquee on the public site."
        eyebrow="University record"
        loading={loading}
        title={
          university.name || (loading ? "Loading university" : "New university")
        }
      >
        <WorkspaceRecordForm
          className="grid-cols-1"
          data-loading={loading || undefined}
          id="university-record"
          onSubmit={save}
        >
          <WorkspaceRecordPanelHeader>
            <p className="m-0 mb-4 font-[var(--font-sans)] text-[.75rem] font-extrabold uppercase tracking-[.12em] text-brand">
              Details
            </p>
            <WorkspaceRecordPanelTitle>
              University information
            </WorkspaceRecordPanelTitle>
          </WorkspaceRecordPanelHeader>
          <div className="grid gap-[.45rem]">
            <label
              className="text-[.78rem] font-semibold tracking-[.04em]"
              htmlFor="university-name"
            >
              Name
            </label>
            <InputControl
              className={loadingPlaceholder(loading, "control")}
              data-placeholder={loading ? "control" : undefined}
              disabled={loading}
              id="university-name"
              onChange={(event) =>
                setUniversity({ ...university, name: event.target.value })
              }
              required
              value={university.name}
            />
          </div>
          <div className="grid gap-[.45rem]">
            <label
              className="text-[.78rem] font-semibold tracking-[.04em]"
              htmlFor="university-url"
            >
              Website URL
            </label>
            <InputControl
              className={loadingPlaceholder(loading, "control")}
              data-placeholder={loading ? "control" : undefined}
              disabled={loading}
              id="university-url"
              onChange={(event) =>
                setUniversity({ ...university, websiteUrl: event.target.value })
              }
              placeholder="https://"
              type="url"
              value={university.websiteUrl ?? ""}
            />
          </div>
          <label className="grid cursor-pointer gap-[.45rem]">
            <span className="text-[.78rem] font-semibold leading-[1.35] text-ink">
              Logo
            </span>
            <span className="relative flex min-h-[120px] items-center justify-center overflow-hidden rounded-control border border-dashed border-[color-mix(in_srgb,var(--brand)_36%,transparent)] bg-surface-subtle p-4 transition-colors hover:border-brand hover:bg-[color-mix(in_srgb,var(--brand-soft)_50%,transparent)]">
              {logoFile ? (
                <Image
                  alt="New logo preview"
                  className="h-auto max-h-20 w-auto object-contain"
                  height={60}
                  src={URL.createObjectURL(logoFile)}
                  width={200}
                />
              ) : displayLogo ? (
                <Image
                  alt={university.name}
                  className="h-auto max-h-20 w-auto object-contain"
                  height={60}
                  src={`${API_URL}/assets/${university.logoAssetId}`}
                  width={200}
                />
              ) : (
                <span className="flex flex-col items-center gap-2 text-ink-muted">
                  <Upload aria-hidden="true" className="text-brand" size={20} />
                  <span className="text-[.85rem] font-medium">
                    Click to upload logo
                  </span>
                </span>
              )}
              <FileInputControl
                accept="image/png,image/jpeg,image/webp"
                loading={loading}
                disabled={loading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  setLogoFile(file);
                  if (file) setRemoveLogo(false);
                }}
                ref={logoInputRef}
              />
            </span>
          </label>
          {displayLogo || logoFile ? (
            <ButtonControl
              className="w-fit"
              compact
              onClick={() => setRemoveLogoPending(true)}
              variant="danger-ghost"
            >
              Remove logo
            </ButtonControl>
          ) : null}
          <CheckboxControl
            checked={university.isPublished}
            id="university-published"
            loading={loading}
            onCheckedChange={(checked) =>
              setUniversity({ ...university, isPublished: checked })
            }
          >
            Published publicly
          </CheckboxControl>
          {error ? (
            <p
              className="border-l-[3px] border-danger bg-danger-soft px-4 py-3 text-[.78rem] text-danger"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </WorkspaceRecordForm>
        {id ? (
          <WorkspaceRecordPanel className="border-danger/30">
            <WorkspaceRecordPanelHeader>
              <p className="m-0 mb-4 font-[var(--font-sans)] text-[.75rem] font-extrabold uppercase tracking-[.12em] text-danger">
                Danger zone
              </p>
              <WorkspaceRecordPanelTitle>
                Delete university
              </WorkspaceRecordPanelTitle>
              <p className="m-0 text-[.84rem] leading-[1.5] text-ink-muted">
                Deleting this university removes it permanently from the
                database and the public marquee.
              </p>
            </WorkspaceRecordPanelHeader>
            <ButtonControl
              className="justify-self-start"
              onClick={() => setDeletePending(true)}
              type="button"
              variant="danger"
            >
              <Trash2 size={14} /> Delete this university
            </ButtonControl>
          </WorkspaceRecordPanel>
        ) : null}
      </WorkspaceRecord>
      <ConfirmDialog
        confirmLabel="Delete university"
        description={`\"${university.name || "Unnamed university"}\" will be permanently removed.`}
        onCancel={() => setDeletePending(false)}
        onConfirm={() => {
          void removeUniversity();
          setDeletePending(false);
        }}
        open={deletePending}
        title="Delete this university?"
        tone="danger"
      />
      <ConfirmDialog
        confirmLabel="Remove logo"
        description="The university logo will be removed from the public marquee."
        onCancel={() => setRemoveLogoPending(false)}
        onConfirm={() => {
          setRemoveLogo(true);
          setLogoFile(undefined);
          if (logoInputRef.current) logoInputRef.current.value = "";
          setRemoveLogoPending(false);
        }}
        open={removeLogoPending}
        title="Remove university logo?"
        tone="danger"
      />
    </AdminOnly>
  );
}
