"use client";

import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SyntheticEvent, useEffect, useState } from "react";
import { ArrowRight, Save, Trash2 } from "lucide-react";
import { AdminOnly } from "@/components/admin-only";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useNotifications } from "@/components/notification-provider";
import { StatePanel } from "@/components/state-panel";
import {
  WorkspaceRecord,
  WorkspaceRecordForm,
  WorkspaceRecordPanel,
} from "@/components/workspace-record";
import { ApiRequestError, apiRequest } from "@/lib/client-api";
import { Badge } from "@/components/ui/badge";
import { ButtonControl } from "@/components/ui/button-control";
import { CheckboxControl } from "@/components/ui/checkbox-control";
import { InputControl, TextareaControl } from "@/components/ui/form-controls";
import { FormField } from "@/components/ui/form-field";
import { IconButton } from "@/components/ui/icon-button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SelectControl } from "@/components/ui/select-control";
import type { Department, Person } from "@/lib/types";
import {
  ReviewIssueStamp,
  SemanticStatus,
} from "@/components/ui/semantic-status";
import { useReviewIssues } from "@/lib/use-review-issues";
import {
  WorkspaceCollection,
  WorkspaceRow,
} from "@/components/ui/workspace-surface";

const EMPTY_DEPARTMENT: Department = {
  abbreviation: null,
  description: "",
  id: "",
  isPublished: false,
  name: "",
  people: [],
  slug: "",
};

export function DepartmentIndex() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  const load = () => {
    setError(undefined);
    setLoading(true);
    void apiRequest<Department[]>("/admin/departments", { method: "GET" })
      .then(setDepartments)
      .catch((value: unknown) =>
        setError(
          value instanceof Error
            ? value.message
            : "Unable to load departments.",
        ),
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    void apiRequest<Department[]>("/admin/departments", { method: "GET" })
      .then((items) => {
        if (active) setDepartments(items);
      })
      .catch((value: unknown) => {
        if (active)
          setError(
            value instanceof Error
              ? value.message
              : "Unable to load departments.",
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
      ) : !loading && !departments.length ? (
        <StatePanel
          frame="workspace"
          body="Create the first public research unit from the page action above."
          title="No departments yet"
        />
      ) : (
        <WorkspaceCollection data-loading={loading || undefined}>
          {(loading && !departments.length
            ? Array.from({ length: 5 }, () => undefined)
            : departments
          ).map((department, index) => (
            <WorkspaceRow key={department?.id ?? `department-loading-${index}`}>
              <Link
                aria-disabled={loading || !department}
                className="flex min-h-[64px] items-center justify-between gap-4 bg-transparent py-[.72rem] text-inherit transition-colors hover:bg-surface-subtle"
                href={
                  department ? `/workspace/departments/${department.id}` : "#"
                }
                tabIndex={loading ? -1 : undefined}
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
                    {department?.name ?? "Loading department"}
                  </strong>
                  <div className="mt-[.35rem] flex flex-wrap items-center gap-2">
                    <small
                      className={cn(
                        "font-mono text-[.6rem] text-ink-muted",
                        loadingPlaceholder(loading, "label", "medium"),
                      )}
                      data-placeholder="label"
                      data-placeholder-width="medium"
                    >
                      {department
                        ? `${department.people.length} member${department.people.length === 1 ? "" : "s"}`
                        : "Loading members"}
                    </small>
                    {department ? (
                      <SemanticStatus
                        loading={loading}
                        tone={department.isPublished ? "success" : "warning"}
                      >
                        {department.isPublished ? "Published" : "Draft"}
                      </SemanticStatus>
                    ) : null}
                  </div>
                </div>
                <ArrowRight
                  aria-hidden="true"
                  className={loading ? "opacity-[.12]" : undefined}
                  data-loading-icon={loading ? "true" : undefined}
                  size={17}
                />
              </Link>
            </WorkspaceRow>
          ))}
        </WorkspaceCollection>
      )}
    </AdminOnly>
  );
}

export function DepartmentEditor({ id }: { id?: string }) {
  const router = useRouter();
  const { showToast } = useNotifications();
  const [department, setDepartment] = useState<Department>(EMPTY_DEPARTMENT);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [memberToRemove, setMemberToRemove] = useState<{
    id: string;
    name: string;
  }>();
  const [deletePending, setDeletePending] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [personId, setPersonId] = useState("");
  const [role, setRole] = useState("MEMBER");
  const memberIssues = useReviewIssues();

  const load = () => {
    setLoading(Boolean(id));
    void Promise.all([
      id
        ? apiRequest<Department>(`/admin/departments/${id}`, { method: "GET" })
        : Promise.resolve(EMPTY_DEPARTMENT),
      apiRequest<Person[]>("/people", { method: "GET" }),
    ])
      .then(([nextDepartment, nextPeople]) => {
        setDepartment(nextDepartment);
        setPeople(nextPeople);
        setPersonId((current) => current || nextPeople[0]?.id || "");
      })
      .catch((value: unknown) =>
        setError(
          value instanceof Error ? value.message : "Unable to load department.",
        ),
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!id) return;
    let active = true;
    void Promise.all([
      apiRequest<Department>(`/admin/departments/${id}`, { method: "GET" }),
      apiRequest<Person[]>("/people", { method: "GET" }),
    ])
      .then(([nextDepartment, nextPeople]) => {
        if (!active) return;
        setDepartment(nextDepartment);
        setPeople(nextPeople);
        setPersonId(nextPeople[0]?.id || "");
      })
      .catch((value: unknown) => {
        if (active)
          setError(
            value instanceof Error
              ? value.message
              : "Unable to load department.",
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
    try {
      const saved = await apiRequest<Department>(
        id ? `/admin/departments/${id}` : "/admin/departments",
        {
          body: JSON.stringify({
            description: department.description || null,
            isPublished: department.isPublished,
            name: department.name,
          }),
          headers: { "content-type": "application/json" },
          method: id ? "PATCH" : "POST",
        },
      );
      showToast({
        body: id
          ? "The department record was updated."
          : "The department record was created.",
        title: id ? "Department updated" : "Department created",
      });
      if (!id) router.replace(`/workspace/departments/${saved.id}`);
      else {
        setDepartment(saved);
        router.refresh();
      }
    } catch (value) {
      const message =
        value instanceof Error ? value.message : "Unable to save department.";
      setError(message);
      showToast({
        body: message,
        title: "Department was not saved",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function changeMember(
    path: string,
    init: RequestInit,
    success: string,
    itemId?: string,
  ) {
    try {
      await apiRequest(path, init);
      if (itemId) memberIssues.clearOne(itemId);
      showToast({ body: success, title: "Department team updated" });
      load();
    } catch (value) {
      const requestError = value instanceof ApiRequestError ? value : undefined;
      if (itemId) {
        if (requestError?.issues.length) memberIssues.capture(requestError);
        else
          memberIssues.setOne(itemId, {
            code: "DEPARTMENT_MEMBER_UPDATE_FAILED",
            message: "This department membership could not be updated.",
            tone: "error",
          });
      }
      showToast({
        body: requestError?.message ?? "Unable to update the department team.",
        title: "Department team was not updated",
        tone: "error",
      });
    }
  }

  async function removeDepartment() {
    setDeleteSaving(true);
    try {
      await apiRequest(`/admin/departments/${id}`, { method: "DELETE" });
      showToast({
        body: "The department was permanently deleted.",
        title: "Department deleted",
      });
      router.push("/workspace/departments");
      router.refresh();
    } catch (value) {
      const message =
        value instanceof Error ? value.message : "Unable to delete department.";
      setError(message);
      showToast({
        body: message,
        title: "Department was not deleted",
        tone: "error",
      });
    } finally {
      setDeleteSaving(false);
    }
  }

  if (!loading && error && !department.id && id)
    return (
      <StatePanel
        action={{ label: "Retry", onClick: load }}
        body="The department record could not be retrieved."
        title={error}
        variant="error"
      />
    );

  return (
    <AdminOnly>
      <WorkspaceRecord
        actions={
          <ButtonControl
            loading={loading}
            disabled={saving}
            form="department-record"
            type="submit"
            variant="primary"
          >
            <Save size={15} /> {id ? "Save changes" : "Create department"}
          </ButtonControl>
        }
        backHref="/workspace/departments"
        backLabel="Departments"
        description="Set public information first, then manage the people who appear with this research unit."
        eyebrow="Department record"
        loading={loading}
        title={
          department.name || (loading ? "Loading department" : "New department")
        }
      >
        <WorkspaceRecordForm
          className="gap-[1.2rem]"
          data-loading={loading || undefined}
          id="department-record"
          onSubmit={save}
        >
          <header className="grid gap-[.35rem] border-b border-line pb-[1.15rem]">
            <p className="m-0 font-mono text-[.62rem] font-semibold uppercase tracking-[.1em] text-brand">
              Details
            </p>
            <h2 className="m-0 font-sans text-[clamp(1.4rem,2.4vw,2rem)] font-normal leading-[1.1]">
              Department information
            </h2>
          </header>
          <div className="grid gap-[1.2rem] grid-cols-2 max-[640px]:grid-cols-1">
            <FormField htmlFor="department-name" label="Name">
              <InputControl
                loading={loading}
                disabled={loading}
                id="department-name"
                onChange={(event) =>
                  setDepartment({ ...department, name: event.target.value })
                }
                required
                value={department.name}
              />
            </FormField>
            <FormField
              className="col-span-full"
              htmlFor="department-description"
              label="Description"
            >
              <TextareaControl
                loading={loading}
                disabled={loading}
                id="department-description"
                onChange={(event) =>
                  setDepartment({
                    ...department,
                    description: event.target.value,
                  })
                }
                value={department.description ?? ""}
              />
            </FormField>
          </div>
          <CheckboxControl
            checked={department.isPublished}
            id="department-published"
            loading={loading}
            onCheckedChange={(checked) =>
              setDepartment({ ...department, isPublished: checked })
            }
          >
            Published publicly
          </CheckboxControl>
          {error ? (
            <p
              className="m-0 flex items-center gap-[.45rem] text-[.82rem] leading-[1.5] text-ink-muted rounded-panel bg-danger-soft p-[.8rem] text-danger"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </WorkspaceRecordForm>
        {id ? (
          <WorkspaceRecordPanel data-loading={loading || undefined}>
            <header className="grid gap-[.35rem] border-b border-line pb-[1.15rem]">
              <p className="m-0 font-mono text-[.62rem] font-semibold uppercase tracking-[.1em] text-brand">
                Membership
              </p>
              <h2 className="m-0 font-sans text-[clamp(1.4rem,2.4vw,2rem)] font-normal leading-[1.1]">
                Department team
              </h2>
              <p className="m-0 text-[.82rem] leading-[1.55] text-ink-muted">
                Link registered people to the department and set their role.
              </p>
            </header>
            <div className="grid border-t border-line">
              {(loading && !department.people.length
                ? Array.from({ length: 2 }, () => undefined)
                : department.people
              ).map((membership, index) => {
                const person = membership?.person;
                const memberRole = membership?.role ?? "MEMBER";
                const issue = person
                  ? memberIssues.forItem(person.id)[0]
                  : undefined;
                return (
                  <article
                    className="relative flex items-center justify-between gap-4 border-b border-line px-1 py-[.9rem] pr-10"
                    key={person?.id ?? `member-loading-${index}`}
                  >
                    {person ? <ReviewIssueStamp issue={issue} /> : null}
                    <div className="flex flex-wrap items-center gap-[.6rem]">
                      <strong
                        className={loadingPlaceholder(loading, "text", "long")}
                        data-placeholder="text"
                        data-placeholder-width="long"
                      >
                        {person?.fullName ?? "Loading member"}
                      </strong>
                      <Badge
                        loading={loading}
                        tone={memberRole === "HEAD" ? "info" : "neutral"}
                      >
                        {readableDepartmentRole(memberRole)}
                      </Badge>
                      {issue ? (
                        <SemanticStatus
                          loading={loading}
                          tone={issue.tone ?? "error"}
                        >
                          {issue.message}
                        </SemanticStatus>
                      ) : null}
                    </div>
                    <IconButton
                      aria-label={
                        person ? `Remove ${person.fullName}` : "Remove member"
                      }
                      className="text-danger hover:text-danger"
                      disabled={!person}
                      loading={loading}
                      onClick={() =>
                        person &&
                        setMemberToRemove({
                          id: person.id,
                          name: person.fullName,
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </article>
                );
              })}
            </div>
            <div className="grid grid-cols-[minmax(220px,1fr)_minmax(160px,.6fr)_auto] items-end gap-4 max-[700px]:grid-cols-1">
              <FormField label="Person">
                <SearchableSelect
                  ariaLabel="Add department member"
                  disabled={loading}
                  placeholderLoading={loading}
                  onValueChange={setPersonId}
                  options={people.map((person) => ({
                    label: person.fullName,
                    value: person.id,
                  }))}
                  placeholder="Select registered person…"
                  searchPlaceholder="Search people…"
                  value={personId}
                />
              </FormField>
              <FormField label="Department role">
                <SelectControl
                  ariaLabel="Department role"
                  loading={loading}
                  onValueChange={setRole}
                  options={[
                    { label: "Head", value: "HEAD" },
                    { label: "Lead", value: "LEAD" },
                    { label: "Member", value: "MEMBER" },
                  ]}
                  value={role}
                />
              </FormField>
              <ButtonControl
                loading={loading}
                disabled={!personId}
                onClick={() =>
                  void changeMember(
                    `/admin/departments/${id}/members`,
                    {
                      body: JSON.stringify({
                        isPrimary: false,
                        personId,
                        role,
                        sortOrder: department.people.length,
                      }),
                      headers: { "content-type": "application/json" },
                      method: "POST",
                    },
                    "The person was added to this department.",
                  )
                }
                type="button"
              >
                Add member
              </ButtonControl>
            </div>
          </WorkspaceRecordPanel>
        ) : null}
        {id ? (
          <WorkspaceRecordPanel className="border-danger/40 bg-danger-soft/30">
            <header className="grid gap-[.35rem] border-b border-danger/30 pb-[1.15rem]">
              <p className="m-0 font-mono text-[.62rem] font-semibold uppercase tracking-[.1em] text-danger">
                Danger zone
              </p>
              <h2 className="m-0 font-sans text-[clamp(1.4rem,2.4vw,2rem)] font-normal leading-[1.1]">
                Delete department
              </h2>
              <p className="m-0 text-[.82rem] leading-[1.55] text-ink-muted">
                Deleting this department removes it permanently from the
                database and public directory.
              </p>
            </header>
            <ButtonControl
              onClick={() => setDeletePending(true)}
              type="button"
              variant="danger"
            >
              <Trash2 size={14} /> Delete this department
            </ButtonControl>
          </WorkspaceRecordPanel>
        ) : null}
      </WorkspaceRecord>
      <ConfirmDialog
        confirmLabel="Delete department"
        description={`\"${department.name}\" will be permanently removed.`}
        onCancel={() => setDeletePending(false)}
        busy={deleteSaving}
        onConfirm={() => {
          void removeDepartment();
        }}
        open={deletePending}
        title="Delete this department?"
        tone="danger"
      />
      <ConfirmDialog
        confirmLabel="Remove member"
        description={
          memberToRemove
            ? `${memberToRemove.name} will no longer appear in this department.`
            : ""
        }
        onCancel={() => setMemberToRemove(undefined)}
        onConfirm={() => {
          if (memberToRemove)
            void changeMember(
              `/admin/departments/${id}/members/${memberToRemove.id}`,
              { method: "DELETE" },
              "The person was removed from this department.",
              memberToRemove.id,
            );
          setMemberToRemove(undefined);
        }}
        open={Boolean(memberToRemove)}
        title="Remove department member?"
        tone="danger"
      />
    </AdminOnly>
  );
}

function readableDepartmentRole(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}
