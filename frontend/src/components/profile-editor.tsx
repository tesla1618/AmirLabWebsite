"use client";

import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import Image from "next/image";
import { SyntheticEvent, useEffect, useMemo, useState } from "react";
import { Camera, Check, Plus, Trash2, UserRound, X } from "lucide-react";
import { SelectControl } from "@/components/ui/select-control";
import { ButtonControl } from "@/components/ui/button-control";
import {
  FileInputControl,
  InputControl,
  TextareaControl,
} from "@/components/ui/form-controls";
import { FormField } from "@/components/ui/form-field";
import { ProfileAvatar } from "@/components/profile-avatar";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useNotifications } from "@/components/notification-provider";
import { StatePanel } from "@/components/state-panel";
import { API_URL } from "@/lib/api";
import { apiRequest } from "@/lib/client-api";
import type {
  MyProfile,
  ProfileEditPayload,
  ProfileEditRequest,
  ProfileSectionEntry,
} from "@/lib/types";

const LINK_TYPES = [
  "GOOGLE_SCHOLAR",
  "RESEARCH_GATE",
  "WEBSITE",
  "GITHUB",
  "LINKEDIN",
  "KAGGLE",
  "OTHER",
];

const SECTION_TYPES = [
  "ACADEMIC_BACKGROUND",
  "PROFESSIONAL_EXPERIENCE",
  "PUBLICATIONS",
  "AWARDS_AND_GRANTS",
  "PROFESSIONAL_MEMBERSHIP",
  "PROFESSIONAL_COLLABORATION",
  "OTHER",
];

const ROLES = ["MEMBER", "MODERATOR", "ADMIN"] as const;
const RANKS = [
  "RESEARCH_INTERN",
  "RESEARCH_ASSISTANT",
  "RESEARCHER",
  "SENIOR_RESEARCHER",
  "LEAD_RESEARCHER",
  "DEPARTMENT_HEAD",
  "ADVISOR",
] as const;

function readable(value: string): string {
  return value.replaceAll("_", " ").toLowerCase();
}

const EMPTY_PROFILE: ProfileEditPayload = {
  fullName: "",
  headline: null,
  biography: null,
  phone: null,
  contactAddress: null,
  roleTitle: null,
  expertise: [],
  links: [],
  sections: [],
  removeAvatar: false,
};

const EMPTY_ENTRY: ProfileSectionEntry = { label: null, content: "" };

function emptySubsection(): ProfileEditPayload["sections"][number]["subsections"][number] {
  return { heading: null, entries: [{ ...EMPTY_ENTRY }] };
}

function normalizeEditorEntries(entries: unknown[]): ProfileSectionEntry[] {
  const normalized = entries.map((entry) => {
    if (typeof entry === "string") return { label: null, content: entry };
    const candidate = entry as Partial<ProfileSectionEntry> | null;
    return {
      label: candidate?.label ?? null,
      content: typeof candidate?.content === "string" ? candidate.content : "",
    };
  });
  return normalized.length ? normalized : [{ ...EMPTY_ENTRY }];
}

function normalizeProfileEditPayload(
  payload: ProfileEditPayload,
): ProfileEditPayload {
  return {
    ...payload,
    sections: payload.sections.map((section) => ({
      ...section,
      subsections: section.subsections.map((subsection) => ({
        ...subsection,
        entries: normalizeEditorEntries(subsection.entries as unknown[]),
      })),
    })),
  };
}

interface ProfileEditorProps {
  userId?: string;
}

export function ProfileEditor({ userId }: ProfileEditorProps) {
  const { loading: authLoading, refreshUser, user } = useAuth();
  const { showToast } = useNotifications();
  const [record, setRecord] = useState<MyProfile>();
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [avatar, setAvatar] = useState<File>();
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [removeAvatarPending, setRemoveAvatarPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const [editRole, setEditRole] = useState("MEMBER");
  const [editRank, setEditRank] = useState("NONE");
  const [editEmail, setEditEmail] = useState("");
  const accountRole = userId ? editRole : (user?.role ?? "MEMBER");
  const moderatorProfile = accountRole === "MODERATOR";
  const adminProfile = accountRole === "ADMIN";
  const staffProfile = moderatorProfile || adminProfile;
  const researchProfile = accountRole === "MEMBER";
  const managingAccount = Boolean(userId && user?.role === "ADMIN");
  const showAside = researchProfile || managingAccount;
  const avatarPreview = useMemo(
    () => (avatar ? URL.createObjectURL(avatar) : null),
    [avatar],
  );

  useEffect(
    () => () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    },
    [avatarPreview],
  );

  useEffect(() => {
    if (!userId && (authLoading || !user)) return;
    const endpoint = userId ? `/users/${userId}/profile` : "/profile/me";
    void apiRequest<MyProfile>(endpoint, { method: "GET" })
      .then((result) => {
        const current = result.profile;
        const latest =
          !userId &&
          (result.draft?.status === "NEEDS_REVIEW" ||
            result.draft?.status === "REJECTED")
            ? result.draft.payload
            : {
                fullName: current.fullName,
                headline: current.headline,
                biography: current.biography,
                phone: current.phone,
                roleTitle:
                  userId || result.accountRole !== "MEMBER"
                    ? current.roleTitle
                    : null,
                contactAddress: current.contactAddress,
                expertise: current.expertise,
                links: (current.links ?? []).map(({ label, type, url }) => ({
                  label,
                  type,
                  url,
                })),
                sections: (current.profileSections ?? []).map(
                  ({ content, subsections, title, type }) => ({
                    subsections: subsections?.length
                      ? subsections.map(({ entries, heading }) => ({
                          entries: normalizeEditorEntries(entries as unknown[]),
                          heading,
                        }))
                      : content
                        ? [
                            {
                              heading: null,
                              entries: [{ label: null, content }],
                            },
                          ]
                        : [emptySubsection()],
                    title,
                    type,
                  }),
                ),
                removeAvatar: false,
              };
        setRecord(result);
        setProfile(normalizeProfileEditPayload(latest as ProfileEditPayload));
        setRemoveAvatar(latest.removeAvatar);
        setLoadError(undefined);
      })
      .catch((error: unknown) =>
        setLoadError(
          error instanceof Error ? error.message : "Unable to load profile.",
        ),
      )
      .finally(() => setLoading(false));
  }, [authLoading, user, userId]);

  useEffect(() => {
    if (!userId) return;
    void apiRequest<{
      email: string | null;
      role: string;
      person: { fullName: string; rank: string | null } | null;
    }>(`/users/${userId}`, { method: "GET" })
      .then((account) => {
        setEditRole(account.role);
        setEditEmail(account.email ?? "");
        setEditRank(account.person?.rank ?? "NONE");
      })
      .catch(() => {});
  }, [userId]);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    setSaving(true);
    setMessage(undefined);
    const body = new FormData();
    body.set(
      "profile",
      JSON.stringify(
        staffProfile
          ? {
              contactAddress: profile.contactAddress,
              fullName: profile.fullName,
              phone: profile.phone,
              roleTitle: profile.roleTitle,
            }
          : {
              biography: profile.biography,
              contactAddress: profile.contactAddress,
              expertise: profile.expertise,
              fullName: profile.fullName,
              headline: profile.headline,
              ...(userId ? { roleTitle: profile.roleTitle } : {}),
              links: profile.links,
              phone: profile.phone,
              sections: profile.sections,
            },
      ),
    );
    body.set("removeAvatar", String(removeAvatar));
    if (avatar) body.set("avatar", avatar);
    const endpoint = userId ? `/users/${userId}/profile` : "/profile/me";

    let accountUpdated = false;
    let profileSubmitted = false;
    try {
      if (userId) {
        await apiRequest(`/users/${userId}`, {
          body: JSON.stringify({
            email: editEmail,
            fullName: profile.fullName,
            rank: editRank === "NONE" ? null : editRank,
            role: editRole,
          }),
          headers: { "content-type": "application/json" },
          method: "PATCH",
        });
        accountUpdated = true;
      }
      const result = await apiRequest<
        | { outcome: "APPLIED"; direct: true }
        | (Omit<ProfileEditRequest, "person"> & {
            outcome: "QUEUED_FOR_REVIEW";
          })
      >(endpoint, { body, method: "POST" });
      profileSubmitted = true;
      if (result.outcome === "APPLIED") {
        const fetchEndpoint = userId
          ? `/users/${userId}/profile`
          : "/profile/me";
        const current = await apiRequest<MyProfile>(fetchEndpoint, {
          method: "GET",
        });
        setRecord(current);
        setRemoveAvatar(false);
        if (!userId) await refreshUser();
        showToast({
          body: userId
            ? "Profile updated and published."
            : "Your public profile and portrait are now up to date.",
          title: "Profile published",
        });
      } else {
        if (record) setRecord({ ...record, draft: result });
        showToast({
          body: "Your changes are awaiting review. A new save will replace them.",
          title: "Profile submitted",
        });
      }
      setAvatar(undefined);
    } catch (error) {
      if (accountUpdated && !profileSubmitted && userId) {
        try {
          const current = await apiRequest<MyProfile>(
            `/users/${userId}/profile`,
            { method: "GET" },
          );
          setRecord(current);
        } catch {
          // Keep the form values; the account update already succeeded.
        }
      }
      const message = profileSubmitted
        ? "Profile changes were saved, but the current profile could not be refreshed."
        : accountUpdated
          ? "Account details were updated, but profile changes were not saved."
          : error instanceof Error
            ? error.message
            : "Unable to submit profile.";
      setMessage(message);
      showToast({
        body: message,
        title: profileSubmitted
          ? "Profile saved, refresh failed"
          : accountUpdated
            ? "Profile was only partly saved"
            : "Profile was not saved",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  const editorLoading = authLoading || loading;
  if (!editorLoading && loadError) {
    return (
      <StatePanel
        body="The profile record could not be retrieved."
        title={loadError}
        variant="error"
      />
    );
  }

  const pendingAvatarId = record?.draft?.avatarAsset?.id;
  const visibleAvatarId = removeAvatar
    ? null
    : (pendingAvatarId ?? record?.profile.avatar?.id);
  const completionItems = moderatorProfile
    ? [
        { complete: Boolean(profile.fullName), label: "Full name" },
        { complete: Boolean(profile.phone), label: "Phone" },
        { complete: Boolean(profile.contactAddress), label: "Contact address" },
      ]
    : adminProfile
      ? [
          { complete: Boolean(profile.fullName), label: "Full name" },
          { complete: Boolean(visibleAvatarId), label: "Profile image" },
        ]
      : [
          { complete: Boolean(profile.fullName), label: "Full name" },
          { complete: Boolean(profile.headline), label: "Headline" },
          { complete: Boolean(profile.biography), label: "Biography" },
          { complete: profile.links.length > 0, label: "Profile links" },
        ];
  const completion = Math.round(
    (completionItems.filter(({ complete }) => complete).length /
      completionItems.length) *
      100,
  );

  return (
    <form
      aria-busy={editorLoading}
      className="grid w-full grid-cols-1 items-start gap-[1.35rem]"
      data-loading={editorLoading || undefined}
      onSubmit={submit}
    >
      <header className="sticky top-[64px] z-10 col-span-full -mx-[var(--workspace-gutter)] flex items-center justify-between gap-4 border-y border-line-strong bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] px-[var(--workspace-gutter)] py-[.7rem] backdrop-blur-[12px] max-[820px]:top-[55px] max-[640px]:mx-0 max-[640px]:flex-col max-[640px]:items-stretch max-[640px]:px-4">
        <p className="m-0 flex items-center gap-[.55rem] text-[.76rem] text-ink-muted">
          <span className="h-[7px] w-[7px] rounded-full bg-brand" />
          {userId || user?.role === "ADMIN"
            ? "Changes publish immediately"
            : moderatorProfile
              ? "Contact changes are sent for review"
              : "Changes are sent for review"}
        </p>
        <ButtonControl
          disabled={editorLoading || saving}
          loading={editorLoading}
          type="submit"
          variant="primary"
        >
          {userId || user?.role === "ADMIN"
            ? "Save and publish"
            : "Submit for review"}
        </ButtonControl>
      </header>
      <section className="relative col-span-full -mx-[var(--workspace-gutter)] flex items-center gap-[1.6rem] border-y border-line-strong bg-transparent px-[var(--workspace-gutter)] py-[1.6rem] max-[640px]:mx-0 max-[640px]:flex-col max-[640px]:items-start max-[640px]:px-4">
          <div
            className={cn(
              "relative flex h-28 w-28 flex-[0_0_112px] items-center justify-center rounded-full border border-dashed border-[color-mix(in_srgb,var(--brand)_36%,transparent)]",
              loadingPlaceholder(editorLoading, "portrait"),
            )}
            data-placeholder={editorLoading ? "portrait" : undefined}
          >
            <label className="group relative flex aspect-square w-24 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-[color-mix(in_srgb,var(--ink)_18%,transparent)] bg-surface-subtle">
              <div className="absolute inset-0 z-10 bg-[color-mix(in_srgb,var(--ink)_40%,transparent)] opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none" />
              {avatarPreview ? (
                <Image
                  alt="New profile preview"
                  className="h-full w-full object-cover"
                  height={360}
                  src={avatarPreview}
                  width={360}
                />
              ) : visibleAvatarId ? (
                <Image
                  alt="Current profile"
                  className="h-full w-full object-cover"
                  height={360}
                  src={`${API_URL}/assets/${visibleAvatarId}`}
                  width={360}
                />
              ) : (
                <span className="text-[2rem] font-bold text-brand">
                  {profile.fullName.slice(0, 1) || (
                    <UserRound aria-hidden="true" size={34} />
                  )}
                </span>
              )}
              <FileInputControl
                loading={editorLoading}
                accept="image/jpeg,image/png,image/webp"
                aria-label="Profile image"
                name="avatar"
                onChange={(event) => {
                  setAvatar(event.target.files?.[0]);
                  setRemoveAvatar(false);
                }}
              />
            </label>
            <span className="pointer-events-none absolute bottom-[3px] right-[3px] z-20 flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-surface bg-brand text-on-accent">
              <Camera aria-hidden="true" size={14} />
            </span>
          </div>
          <div className="min-w-0">
            <p className="m-0 mb-4 font-[var(--font-sans)] text-[.75rem] font-extrabold uppercase tracking-[.12em] text-brand">
              {adminProfile ? "Account portrait" : "Public portrait"}
            </p>
            <h1
              className={cn(
                "mb-2 mt-[.35rem] font-sans text-[clamp(1.8rem,3vw,2.35rem)] font-semibold leading-[1.05] tracking-[-.035em]",
                loadingPlaceholder(editorLoading, "text", "long"),
              )}
              data-placeholder={editorLoading ? "text" : undefined}
              data-placeholder-width="long"
            >
              {profile.fullName ||
                (editorLoading ? "Loading profile" : "Your profile")}
            </h1>
            <p className="m-0 text-[.8rem] leading-[1.5] text-ink-muted">
              {adminProfile
                ? "Use a recognizable image for your administrator account."
                : "Use a clear portrait that remains recognizable throughout the AmirLab directory."}
            </p>
            <span className="mt-2 block font-mono text-[.62rem] text-ink-faint">
              JPEG, PNG, or WebP · up to 8 MB
            </span>
            {visibleAvatarId || avatar ? (
              <ButtonControl
                className="mt-3 w-fit"
                compact
                onClick={() => setRemoveAvatarPending(true)}
                variant="danger-ghost"
              >
                Remove profile image
              </ButtonControl>
            ) : null}
          </div>
        </section>
      <div
        className={cn(
          "grid min-w-0 items-start gap-[1.35rem]",
          showAside
            ? "grid-cols-[minmax(0,1fr)_320px] max-[980px]:grid-cols-1"
            : "grid-cols-1",
        )}
      >
        <div className="grid min-w-0 gap-[1.2rem]">
          <section className="relative -ml-[var(--workspace-gutter)] grid gap-[1.2rem] border-y border-line-strong bg-transparent py-[1.55rem] pr-[1.55rem] pl-[var(--workspace-gutter)] max-[640px]:ml-0 max-[640px]:px-4">
        <div className="mb-0 flex items-end justify-between gap-8 border-b border-line pb-[.95rem]">
          <div>
            <p className="m-0 mb-4 font-[var(--font-sans)] text-[.75rem] font-extrabold uppercase tracking-[.12em] text-brand">
              Identity
            </p>
            <h2 className="text-[1.35rem] font-semibold">
              {staffProfile ? "Staff information" : "Public information"}
            </h2>
          </div>
        </div>
        <div className="grid gap-[.8rem]">
          <div className="grid gap-[1.2rem] grid-cols-2 max-[640px]:grid-cols-1">
            <FormField htmlFor="profile-name" label="Full name">
              <InputControl
                loading={editorLoading}
                id="profile-name"
                maxLength={120}
                onChange={(event) =>
                  setProfile({ ...profile, fullName: event.target.value })
                }
                required
                value={profile.fullName}
              />
            </FormField>
            {userId ? (
              <FormField htmlFor="account-email" label="Email">
                <InputControl
                  loading={editorLoading}
                  id="account-email"
                  onChange={(event) => setEditEmail(event.target.value)}
                  required
                  type="email"
                  value={editEmail}
                />
              </FormField>
            ) : null}
            {researchProfile ? (
              <FormField
                className="col-span-full"
                htmlFor="profile-headline"
                label="Headline"
              >
                <InputControl
                  loading={editorLoading}
                  id="profile-headline"
                  maxLength={300}
                  onChange={(event) =>
                    setProfile({
                      ...profile,
                      headline: event.target.value || null,
                    })
                  }
                  value={profile.headline ?? ""}
                />
              </FormField>
            ) : null}
            {staffProfile || (userId && researchProfile) ? (
              <FormField
                className="col-span-full"
                htmlFor="profile-role-title"
                label={staffProfile ? "Staff title" : "Public role title"}
                description={staffProfile ? "Optional staff title." : undefined}
              >
                <InputControl
                  loading={editorLoading}
                  id="profile-role-title"
                  maxLength={200}
                  onChange={(event) =>
                    setProfile({
                      ...profile,
                      roleTitle: event.target.value || null,
                    })
                  }
                  value={profile.roleTitle ?? ""}
                />
              </FormField>
            ) : null}
            {researchProfile ? (
              <FormField
                className="col-span-full"
                htmlFor="profile-biography"
                label="Biography"
              >
                <TextareaControl
                  loading={editorLoading}
                  id="profile-biography"
                  maxLength={8000}
                  onChange={(event) =>
                    setProfile({
                      ...profile,
                      biography: event.target.value || null,
                    })
                  }
                  rows={7}
                  value={profile.biography ?? ""}
                />
              </FormField>
            ) : null}
            {staffProfile || researchProfile ? (
              <FormField htmlFor="profile-phone" label="Phone">
                <InputControl
                  loading={editorLoading}
                  id="profile-phone"
                  onChange={(event) =>
                    setProfile({
                      ...profile,
                      phone: event.target.value || null,
                    })
                  }
                  value={profile.phone ?? ""}
                />
              </FormField>
            ) : null}
            {researchProfile ? (
              <FormField htmlFor="profile-expertise" label="Expertise">
                <InputControl
                  loading={editorLoading}
                  id="profile-expertise"
                  onChange={(event) =>
                    setProfile({
                      ...profile,
                      expertise: event.target.value
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="Computer vision, NLP, healthcare AI"
                  value={profile.expertise.join(", ")}
                />
              </FormField>
            ) : null}
            {staffProfile || researchProfile ? (
              <FormField
                className="col-span-full"
                htmlFor="profile-address"
                label="Contact address"
              >
                <TextareaControl
                  loading={editorLoading}
                  id="profile-address"
                  onChange={(event) =>
                    setProfile({
                      ...profile,
                      contactAddress: event.target.value || null,
                    })
                  }
                  rows={3}
                  value={profile.contactAddress ?? ""}
                />
              </FormField>
            ) : null}
          </div>
        </div>
      </section>

      {researchProfile ? (
        <section className="relative col-start-1 -ml-[var(--workspace-gutter)] grid gap-[1.2rem] border-y border-line-strong bg-transparent py-[1.55rem] pr-[1.55rem] pl-[var(--workspace-gutter)] max-[980px]:col-start-1 max-[640px]:ml-0 max-[640px]:px-4">
          <div className="mb-0 flex items-end justify-between gap-8 border-b border-line pb-[.95rem]">
            <div>
              <p className="m-0 mb-4 font-[var(--font-sans)] text-[.75rem] font-extrabold uppercase tracking-[.12em] text-brand">
                Elsewhere
              </p>
              <h2 className="text-[1.35rem] font-semibold">Profile links</h2>
            </div>
            <ButtonControl
              loading={editorLoading}
              variant="add-empty"
              onClick={() =>
                setProfile({
                  ...profile,
                  links: [
                    ...profile.links,
                    { type: "WEBSITE", label: "Website", url: "" },
                  ],
                })
              }
              type="button"
            >
              <Plus aria-hidden="true" size={16} /> Add link
            </ButtonControl>
          </div>
          <div className="grid gap-0">
            {profile.links.map((link, index) => (
              <div
                className={`grid items-center gap-[.7rem] border-b border-line py-[.7rem] ${link.type !== "OTHER" ? "grid-cols-[170px_minmax(0,1fr)_42px]" : "grid-cols-[170px_180px_minmax(0,1fr)_42px]"} max-[760px]:grid-cols-1`}
                key={index}
              >
                <SelectControl
                  loading={editorLoading}
                  ariaLabel={`Link ${index + 1} type`}
                  onValueChange={(value) => {
                    const links = [...profile.links];
                    links[index] = {
                      ...link,
                      type: value,
                      label:
                        value === "OTHER" ? "" : value.replaceAll("_", " "),
                    };
                    setProfile({ ...profile, links });
                  }}
                  options={LINK_TYPES.map((type) => ({
                    label: type.replaceAll("_", " "),
                    value: type,
                  }))}
                  value={link.type}
                />
                {link.type === "OTHER" && (
                  <InputControl
                    loading={editorLoading}
                    aria-label={`Link ${index + 1} label`}
                    onChange={(event) => {
                      const links = [...profile.links];
                      links[index] = { ...link, label: event.target.value };
                      setProfile({ ...profile, links });
                    }}
                    placeholder="Label"
                    required
                    value={link.label}
                  />
                )}
                <InputControl
                  loading={editorLoading}
                  aria-label={`Link ${index + 1} URL`}
                  onChange={(event) => {
                    const links = [...profile.links];
                    links[index] = { ...link, url: event.target.value };
                    setProfile({ ...profile, links });
                  }}
                  placeholder="https://"
                  required
                  type="url"
                  value={link.url}
                />
                <ButtonControl
                  aria-label={`Remove link ${index + 1}`}
                  className="min-h-[42px] rounded-control p-0 text-ink-muted"
                  loading={editorLoading}
                  onClick={() =>
                    setProfile({
                      ...profile,
                      links: profile.links.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    })
                  }
                  type="button"
                >
                  <X aria-hidden="true" size={17} />
                </ButtonControl>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {researchProfile ? (
        <section className="relative col-start-1 -ml-[var(--workspace-gutter)] grid gap-[1.2rem] border-y border-line-strong bg-transparent py-[1.55rem] pr-[1.55rem] pl-[var(--workspace-gutter)] max-[980px]:col-start-1 max-[640px]:ml-0 max-[640px]:px-4">
          <div className="mb-0 flex items-end justify-between gap-8 border-b border-line pb-[.95rem]">
            <div>
              <p className="m-0 mb-4 font-[var(--font-sans)] text-[.75rem] font-extrabold uppercase tracking-[.12em] text-brand">
                Record
              </p>
              <h2 className="text-[1.35rem] font-semibold">Profile sections</h2>
            </div>
            <ButtonControl
              loading={editorLoading}
              variant="add-empty"
              onClick={() =>
                setProfile({
                  ...profile,
                  sections: [
                    ...profile.sections,
                    {
                      type: "OTHER",
                      title: "",
                      subsections: [emptySubsection()],
                    },
                  ],
                })
              }
              type="button"
            >
              <Plus aria-hidden="true" size={16} /> Add section
            </ButtonControl>
          </div>
          <div className="grid gap-[.8rem]">
            {profile.sections.map((section, index) => (
              <article
                className="grid gap-4 border-y border-line-strong bg-transparent p-4"
                key={index}
              >
                <div className="flex items-center justify-between">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <ButtonControl
                    aria-label={`Remove section ${index + 1}`}
                    className="min-h-[42px] rounded-control p-0 text-ink-muted"
                    loading={editorLoading}
                    onClick={() =>
                      setProfile({
                        ...profile,
                        sections: profile.sections.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      })
                    }
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={17} />
                  </ButtonControl>
                </div>
                <div className="grid gap-[1.2rem] grid-cols-2 max-[640px]:grid-cols-1">
                  <FormField label="Section type">
                    <SelectControl
                      loading={editorLoading}
                      ariaLabel={`Section ${index + 1} type`}
                      onValueChange={(value) => {
                        const sections = [...profile.sections];
                        sections[index] = {
                          ...section,
                          type: value,
                          title:
                            value === "OTHER" ? "" : value.replaceAll("_", " "),
                        };
                        setProfile({ ...profile, sections });
                      }}
                      options={SECTION_TYPES.map((type) => ({
                        label: type.replaceAll("_", " "),
                        value: type,
                      }))}
                      value={section.type}
                    />
                  </FormField>
                  {section.type === "OTHER" && (
                    <FormField label="Section title">
                      <InputControl
                        loading={editorLoading}
                        onChange={(event) => {
                          const sections = [...profile.sections];
                          sections[index] = {
                            ...section,
                            title: event.target.value,
                          };
                          setProfile({ ...profile, sections });
                        }}
                        required
                        value={section.title}
                      />
                    </FormField>
                  )}
                  <div className="col-span-full grid content-start gap-[.8rem]">
                    <div className="mb-0 flex items-end justify-between gap-8 border-b border-line pb-[.95rem]">
                      <div>
                        <label>Subsections</label>
                      </div>
                      <ButtonControl
                        loading={editorLoading}
                        variant="add-empty"
                        onClick={() => {
                          const sections = [...profile.sections];
                          sections[index] = {
                            ...section,
                            subsections: [
                              ...section.subsections,
                              emptySubsection(),
                            ],
                          };
                          setProfile({ ...profile, sections });
                        }}
                        type="button"
                      >
                        <Plus aria-hidden="true" size={15} /> Add subsection
                      </ButtonControl>
                    </div>
                    {section.subsections.map((subsection, subsectionIndex) => (
                      <article
                        className="grid gap-4 border-y border-line-strong bg-transparent p-4"
                        key={subsectionIndex}
                      >
                        <div className="flex items-center justify-between">
                          <span>
                            {String(subsectionIndex + 1).padStart(2, "0")}
                          </span>
                          <ButtonControl
                            aria-label={`Remove subsection ${subsectionIndex + 1}`}
                            className="min-h-[42px] rounded-control p-0 text-ink-muted"
                            loading={editorLoading}
                            disabled={section.subsections.length === 1}
                            onClick={() => {
                              const sections = [...profile.sections];
                              sections[index] = {
                                ...section,
                                subsections: section.subsections.filter(
                                  (_, itemIndex) =>
                                    itemIndex !== subsectionIndex,
                                ),
                              };
                              setProfile({ ...profile, sections });
                            }}
                            type="button"
                          >
                            <Trash2 aria-hidden="true" size={16} />
                          </ButtonControl>
                        </div>
                        <div className="grid gap-[1.2rem]">
                          <FormField label="Subsection heading">
                            <InputControl
                              loading={editorLoading}
                              onChange={(event) => {
                                const sections = [...profile.sections];
                                const subsections = [...section.subsections];
                                subsections[subsectionIndex] = {
                                  ...subsection,
                                  heading: event.target.value || null,
                                };
                                sections[index] = { ...section, subsections };
                                setProfile({ ...profile, sections });
                              }}
                              placeholder="Optional heading"
                              value={subsection.heading ?? ""}
                            />
                          </FormField>
                          <div className="grid gap-3">
                            <div className="flex items-center justify-between gap-4 border-b border-line pb-2">
                              <span className="text-[.78rem] font-semibold">
                                Entries
                              </span>
                              <ButtonControl
                                loading={editorLoading}
                                variant="add-empty"
                                onClick={() => {
                                  const sections = [...profile.sections];
                                  const subsections = [...section.subsections];
                                  subsections[subsectionIndex] = {
                                    ...subsection,
                                    entries: [
                                      ...subsection.entries,
                                      { ...EMPTY_ENTRY },
                                    ],
                                  };
                                  sections[index] = { ...section, subsections };
                                  setProfile({ ...profile, sections });
                                }}
                                type="button"
                              >
                                <Plus aria-hidden="true" size={14} /> Add entry
                              </ButtonControl>
                            </div>
                            {subsection.entries.map((entry, entryIndex) => (
                              <article
                                className="grid gap-3 border-b border-line pb-4 last:border-b-0 last:pb-0"
                                key={entryIndex}
                              >
                                <div className="flex items-center justify-between gap-4">
                                  <span className="font-mono text-[.66rem] text-ink-muted">
                                    ENTRY{" "}
                                    {String(entryIndex + 1).padStart(2, "0")}
                                  </span>
                                  <ButtonControl
                                    aria-label={`Remove entry ${entryIndex + 1}`}
                                    className="min-h-[36px] rounded-control p-0 text-ink-muted"
                                    disabled={subsection.entries.length === 1}
                                    loading={editorLoading}
                                    onClick={() => {
                                      const sections = [...profile.sections];
                                      const subsections = [
                                        ...section.subsections,
                                      ];
                                      subsections[subsectionIndex] = {
                                        ...subsection,
                                        entries: subsection.entries.filter(
                                          (_, itemIndex) =>
                                            itemIndex !== entryIndex,
                                        ),
                                      };
                                      sections[index] = {
                                        ...section,
                                        subsections,
                                      };
                                      setProfile({ ...profile, sections });
                                    }}
                                    type="button"
                                  >
                                    <Trash2 aria-hidden="true" size={15} />
                                  </ButtonControl>
                                </div>
                                <FormField label="Label">
                                  <InputControl
                                    loading={editorLoading}
                                    onChange={(event) => {
                                      const sections = [...profile.sections];
                                      const subsections = [
                                        ...section.subsections,
                                      ];
                                      const entries = [...subsection.entries];
                                      entries[entryIndex] = {
                                        ...entry,
                                        label: event.target.value || null,
                                      };
                                      subsections[subsectionIndex] = {
                                        ...subsection,
                                        entries,
                                      };
                                      sections[index] = {
                                        ...section,
                                        subsections,
                                      };
                                      setProfile({ ...profile, sections });
                                    }}
                                    placeholder="Optional label"
                                    value={entry.label ?? ""}
                                  />
                                </FormField>
                                <FormField label="Content">
                                  <TextareaControl
                                    loading={editorLoading}
                                    onChange={(event) => {
                                      const sections = [...profile.sections];
                                      const subsections = [
                                        ...section.subsections,
                                      ];
                                      const entries = [...subsection.entries];
                                      entries[entryIndex] = {
                                        ...entry,
                                        content: event.target.value,
                                      };
                                      subsections[subsectionIndex] = {
                                        ...subsection,
                                        entries,
                                      };
                                      sections[index] = {
                                        ...section,
                                        subsections,
                                      };
                                      setProfile({ ...profile, sections });
                                    }}
                                    required
                                    rows={4}
                                    value={entry.content}
                                  />
                                </FormField>
                              </article>
                            ))}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      </div>
      {showAside ? (
        <aside className="sticky top-[152px] grid min-w-0 gap-4 max-[980px]:static max-[980px]:grid-cols-2 max-[640px]:grid-cols-1">
          {managingAccount ? (
            <section className="grid gap-[1.2rem] border-y border-line-strong bg-transparent p-[1.55rem]">
              <div className="mb-0 flex items-end justify-between gap-8 border-b border-line pb-[.95rem]">
                <div>
                  <h2 className="text-[1.35rem] font-semibold">
                    {researchProfile ? "Role and rank" : "Permission role"}
                  </h2>
                </div>
              </div>
              <div className="grid gap-[.8rem]">
                <div className="flex flex-col gap-[.85rem]">
                  <FormField htmlFor="account-role" label="Permission role">
                    <SelectControl
                      loading={editorLoading}
                      id="account-role"
                      onValueChange={(value) => {
                        setEditRole(value);
                        if (value === "ADMIN") setEditRank("NONE");
                      }}
                      options={ROLES.map((item) => ({
                        label: readable(item),
                        value: item,
                      }))}
                      value={editRole}
                    />
                  </FormField>
                  <FormField htmlFor="account-rank" label="Research rank">
                    <SelectControl
                      loading={editorLoading}
                      id="account-rank"
                      onValueChange={setEditRank}
                      options={[
                        { label: "No research rank", value: "NONE" },
                        ...RANKS.map((item) => ({
                          label: readable(item),
                          value: item,
                        })),
                      ]}
                      value={editRank}
                    />
                  </FormField>
                </div>
              </div>
            </section>
          ) : null}
          {researchProfile ? (
            <>
              <section className="border-y border-line-strong bg-transparent p-[1.35rem]">
                <p className="m-0 mb-4 font-[var(--font-sans)] text-[.75rem] font-extrabold uppercase tracking-[.12em] text-brand">
                  Live preview
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <ProfileAvatar
                    avatarId={visibleAvatarId}
                    className="h-12 w-12"
                    loading={editorLoading}
                    name={profile.fullName}
                    size="lg"
                    src={avatarPreview}
                  />
                  <div>
                    <strong
                      className={cn(
                        "block font-sans text-[1.05rem] font-semibold",
                        loadingPlaceholder(editorLoading, "text", "long"),
                      )}
                      data-placeholder={editorLoading ? "text" : undefined}
                      data-placeholder-width="long"
                    >
                      {profile.fullName ||
                        (editorLoading ? "Loading name" : "Name not set")}
                    </strong>
                    <small
                      className={cn(
                        "mt-[.15rem] block text-[.68rem] text-ink-faint",
                        loadingPlaceholder(editorLoading, "label", "medium"),
                      )}
                      data-placeholder={editorLoading ? "label" : undefined}
                      data-placeholder-width="medium"
                    >
                      {profile.headline ||
                        profile.roleTitle ||
                        (editorLoading
                          ? "Loading headline"
                          : "Headline not set")}
                    </small>
                  </div>
                </div>
                <p
                  className={cn(
                    "mt-4 line-clamp-4 text-[.76rem] leading-[1.55] text-ink-muted",
                    loadingPlaceholder(editorLoading, "text", "full"),
                  )}
                  data-placeholder={editorLoading ? "text" : undefined}
                  data-placeholder-width="full"
                >
                  {profile.biography ||
                    (editorLoading
                      ? "Loading biography"
                      : "Add a short biography so visitors understand your work and role in the lab.")}
                </p>
              </section>
              <section className="border-y border-line-strong bg-transparent p-[1.35rem]">
                <div className="flex items-baseline justify-between">
                  <p className="m-0 mb-4 font-[var(--font-sans)] text-[.75rem] font-extrabold uppercase tracking-[.12em] text-brand">
                    Completeness
                  </p>
                  <strong
                    className={cn(
                      "font-mono text-[1.35rem] font-medium text-brand",
                      loadingPlaceholder(editorLoading, "value"),
                    )}
                    data-placeholder={editorLoading ? "value" : undefined}
                  >
                    {completion}%
                  </strong>
                </div>
                <div className="mt-[.9rem] flex gap-1">
                  {completionItems.map(({ complete, label }) => (
                    <span
                      className={`h-[14px] flex-1 rounded-[2px] ${complete ? "bg-brand" : "bg-surface-subtle"}`}
                      key={label}
                    />
                  ))}
                </div>
                <ul className="mt-4 grid list-none gap-[.65rem] p-0">
                  {completionItems.map(({ complete, label }) => (
                    <li
                      className={`flex items-center gap-[.55rem] text-[.72rem] ${complete ? "text-ink" : "text-ink-muted"}`}
                      key={label}
                    >
                      {complete ? (
                        <Check
                          aria-hidden="true"
                          className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-soft p-[2px] text-brand"
                          size={11}
                        />
                      ) : (
                        <span className="h-4 w-4 rounded-full border border-dashed border-line" />
                      )}
                      {label}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          ) : null}
        </aside>
      ) : null}
      </div>

      {message ? (
        <p className="m-0 flex items-center gap-[.45rem] text-[.82rem] leading-[1.5] text-ink-muted">
          {message}
        </p>
      ) : null}
      <ConfirmDialog
        confirmLabel="Remove image"
        description="Your public portrait will be removed and the default avatar shown instead."
        onCancel={() => setRemoveAvatarPending(false)}
        onConfirm={() => {
          setAvatar(undefined);
          setRemoveAvatar(true);
          setRemoveAvatarPending(false);
        }}
        open={removeAvatarPending}
        title="Remove profile image?"
        tone="danger"
      />
    </form>
  );
}
