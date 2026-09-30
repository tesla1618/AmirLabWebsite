import Link from "next/link";
import { ArrowLeft, ExternalLink, Mail, Phone } from "lucide-react";
import { ExpandableBiography } from "@/components/expandable-biography";
import { PersonPortrait } from "@/components/person-portrait";
import { PersonResearchOutputs } from "@/components/person-research-outputs";
import { ProfileRecords } from "@/components/profile-records";
import { Badge } from "@/components/ui/badge";
import {
  FrameBays,
  FrameRule,
  PublicShell,
} from "@/components/ui/public-shell";
import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import type { Person } from "@/lib/types";
import { normalizeProfileSection } from "@/lib/profile-content";

export function PersonProfileView({
  person,
  loading = false,
}: {
  person?: Person;
  loading?: boolean;
}) {
  const roles = (
    person?.roleTitle ??
    person?.rank?.replaceAll("_", " ") ??
    "AMIR Lab member"
  )
    .split(/\s*\|\|?\s*/)
    .map((role) => role.trim())
    .filter(Boolean);
  const visibleRoles = loading ? ["Research role", "Lab appointment"] : roles;
  const records = (person?.profileSections ?? []).map(normalizeProfileSection);
  const hasResearchOutputs = loading || Boolean(person?.contributions?.length);
  const hasProfileRecords = loading || records.length > 0;

  return (
    <>
      <header
        aria-busy={loading || undefined}
        className="relative bg-canvas"
        data-loading={loading || undefined}
      >
        <FrameBays pattern="plus" />
        {hasResearchOutputs || hasProfileRecords ? (
          <FrameRule edge="bottom" />
        ) : null}
        <PublicShell className="relative grid grid-cols-[minmax(280px,420px)_minmax(0,1fr)] items-start gap-[clamp(3rem,7vw,7rem)] pt-[clamp(2.3rem,4.5vw,4.2rem)] pb-[clamp(3rem,6vw,5rem)] max-[960px]:max-w-[760px] max-[960px]:grid-cols-1 max-[640px]:gap-8 max-[640px]:pt-8 max-[640px]:pb-12">
          <div className="relative z-[1] grid gap-4">
            <Link
              className="inline-flex w-fit items-center gap-1.5 text-[.78rem] text-ink-muted hover:text-brand"
              href="/people"
            >
              <ArrowLeft aria-hidden="true" size={16} /> All people
            </Link>
            <PersonPortrait
              loading={loading}
              person={person}
              priority
              variant="profile"
            />
          </div>
          <div className="relative z-[1] min-w-0">
            <div
              aria-hidden={loading || undefined}
              className="mb-6 flex flex-wrap gap-2"
            >
              {visibleRoles.map((role, index) =>
                loading ? (
                  <span
                    className={loadingPlaceholder(true, "label", "medium")}
                    data-placeholder="label"
                    key={`${role}-${index}`}
                  />
                ) : (
                  <Badge key={`${role}-${index}`} tone="info">
                    {role}
                  </Badge>
                ),
              )}
            </div>
            <h1
              className={cn(
                "m-0 font-sans text-[clamp(2.6rem,4.2vw,3.8rem)] leading-[.98] font-medium tracking-[-.045em] max-[640px]:text-[clamp(2rem,9vw,2.7rem)]",
                loading && loadingPlaceholder(true, "text"),
              )}
              aria-hidden={loading || undefined}
              data-placeholder={loading ? "text" : undefined}
            >
              {person?.fullName ?? "Research member name"}
            </h1>
            {loading || person?.headline ? (
              <p
                className={cn(
                  "mt-4 mb-0 text-[.95rem] leading-[1.6] text-ink-muted",
                  loading && loadingPlaceholder(true, "text"),
                )}
                aria-hidden={loading || undefined}
                data-placeholder={loading ? "text" : undefined}
              >
                {loading ? "Profile headline is loading" : person?.headline}
              </p>
            ) : null}
            {loading || person?.biography ? (
              <ExpandableBiography
                loading={loading}
                text={person?.biography ?? undefined}
              />
            ) : null}
            {loading ||
            person?.email ||
            person?.phone ||
            person?.links?.length ? (
              <div className="relative mt-7 flex max-w-[760px] flex-wrap gap-x-6 gap-y-3 border-y border-line-strong py-3">
                {loading ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="inline-flex items-center"
                    >
                      <span
                        className={loadingPlaceholder(true, "text", "medium")}
                        data-placeholder="text"
                      />
                    </span>
                    <span
                      aria-hidden="true"
                      className="inline-flex items-center"
                    >
                      <span
                        className={loadingPlaceholder(true, "text", "medium")}
                        data-placeholder="text"
                      />
                    </span>
                  </>
                ) : (
                  <>
                    {person?.email ? (
                      <a
                        className="inline-flex items-center gap-2 break-words text-[.78rem] text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-brand"
                        href={`mailto:${person.email}`}
                      >
                        <Mail aria-hidden="true" size={16} /> {person.email}
                      </a>
                    ) : null}
                    {person?.phone ? (
                      <a
                        className="inline-flex items-center gap-2 break-words text-[.78rem] text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-brand"
                        href={`tel:${person.phone}`}
                      >
                        <Phone aria-hidden="true" size={16} /> {person.phone}
                      </a>
                    ) : null}
                    {person?.links?.map((link) => (
                      <a
                        className="inline-flex items-center gap-2 break-words text-[.78rem] text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-brand"
                        href={link.url}
                        key={link.id}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <ExternalLink aria-hidden="true" size={16} />{" "}
                        {link.label}
                      </a>
                    ))}
                  </>
                )}
              </div>
            ) : null}
            {loading || person?.contactAddress ? (
              <p
                className={cn(
                  "mt-4 mb-0 max-w-[620px] font-mono text-[.68rem] leading-[1.6] text-ink-muted",
                  loading && loadingPlaceholder(true, "text"),
                )}
                aria-hidden={loading || undefined}
                data-placeholder={loading ? "text" : undefined}
              >
                {loading
                  ? "Contact address is loading"
                  : person?.contactAddress}
              </p>
            ) : null}
          </div>
        </PublicShell>
      </header>
      {loading || person?.contributions?.length ? (
        <PersonResearchOutputs
          contributions={person?.contributions ?? []}
          loading={loading}
          borderBottom={hasProfileRecords}
        />
      ) : null}
      {loading || records.length ? (
        <ProfileRecords loading={loading} records={records} />
      ) : null}
    </>
  );
}
