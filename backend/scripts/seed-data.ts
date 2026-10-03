import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface SeedLink {
  type: string;
  label: string;
  url: string;
  sortOrder: number;
}

export interface SeedProfileEntry {
  label: string | null;
  content: string;
}

export interface SeedProfileSubsection {
  heading: string | null;
  entries: SeedProfileEntry[];
}

export interface SeedProfileSection {
  type: string;
  title: string;
  subsections: SeedProfileSubsection[];
}

export interface SeedPerson {
  sourceId: string;
  sourceUrl: string;
  slug: string;
  fullName: string;
  headline: string | null;
  biography: string | null;
  email: string | null;
  roleTitle: string | null;
  phone: string | null;
  contactAddress: string | null;
  appointedRank: string | null;
  expertise: string[];
  isAlumni: boolean;
  isPublished: boolean;
  avatarSourceFile: string | null;
  links: SeedLink[];
  profileSections: SeedProfileSection[];
}

export interface SeedDepartment {
  sourceId: string;
  sourceUrl: string;
  slug: string;
  name: string;
  abbreviation: string | null;
  description: string | null;
  isPublished: boolean;
  memberships: Array<{
    personSourceId: string;
    role: string;
    sortOrder: number;
  }>;
}

export interface SeedPaper {
  sourceId: string;
  sourceUrl: string;
  title: string | null;
  doi: string | null;
  canonicalUrl: string | null;
  year: number | null;
  venue: string | null;
  publicationType: string | null;
  citation: string | null;
  contributorSourceIds: string[];
}

export interface SeedProject {
  sourceId: string;
  sourceUrl: string;
  title: string | null;
  canonicalUrl: string | null;
  summary: string | null;
  objective: string | null;
  status: string | null;
  publicPageEnabled: boolean;
}

export interface SeedPosition {
  slug: string;
  title: string;
  summary: string;
  description: string | null;
  requirements: string[];
  targetRank: string | null;
  positionType: string;
  status: string;
  engagementType: string;
}

export function firstKnownContributorSourceIdForSeed(
  contributorSourceIds: readonly string[],
  knownContributorSourceIds: ReadonlySet<string>,
): string | null {
  return (
    contributorSourceIds.find((sourceId) =>
      knownContributorSourceIds.has(sourceId),
    ) ?? null
  );
}

export interface AmirSeedData {
  schemaVersion: number;
  source: {
    site: string;
    capturedAt: string;
    liveVerifiedPages: string[];
    notes: string;
  };
  site: Record<string, unknown>;
  departments: SeedDepartment[];
  people: SeedPerson[];
  papers: SeedPaper[];
  datasets: unknown[];
  projects: SeedProject[];
  positions: SeedPosition[];
}

export const seedPath = resolve(process.cwd(), 'seed/amirl-site.json');
export const seedAssetRoot = resolve(process.cwd(), 'seed/assets/people');

export async function readSeedData(): Promise<AmirSeedData> {
  const parsed = JSON.parse(await readFile(seedPath, 'utf8')) as AmirSeedData;
  validateSeedData(parsed);
  return parsed;
}

export function validateSeedData(data: AmirSeedData): void {
  if (data.schemaVersion !== 4) {
    throw new Error(
      `Unsupported seed schema version ${String(data.schemaVersion)}; expected 4`,
    );
  }
  if (!data.source?.site || !data.source?.capturedAt) {
    throw new Error('Seed source metadata is incomplete');
  }
  if (!/^https:\/\/amirl\.org\/?$/i.test(data.source.site)) {
    throw new Error(`Unexpected canonical source site: ${data.source.site}`);
  }

  unique(data.people, (item) => item.slug, 'person slug');
  unique(data.people, (item) => item.sourceId, 'person sourceId');
  uniqueOptional(data.people, (item) => item.sourceUrl, 'person sourceUrl');
  unique(data.departments, (item) => item.slug, 'department slug');
  unique(data.departments, (item) => item.sourceId, 'department sourceId');
  unique(data.papers, (item) => item.sourceId, 'paper sourceId');
  uniqueOptional(data.papers, (item) => item.doi, 'paper DOI');
  uniqueOptional(
    data.papers,
    (item) => item.canonicalUrl,
    'paper canonical URL',
  );
  unique(data.positions, (item) => item.slug, 'position slug');

  const people = new Set(data.people.map((person) => person.sourceId));
  for (const person of data.people) {
    ensureUrl(person.sourceUrl, `person ${person.slug} sourceUrl`);
    ensureEnum(
      person.appointedRank,
      [
        'RESEARCH_INTERN',
        'RESEARCH_ASSISTANT',
        'RESEARCHER',
        'SENIOR_RESEARCHER',
        'LEAD_RESEARCHER',
        'DEPARTMENT_HEAD',
        'ADVISOR',
      ],
      `person ${person.slug} appointedRank`,
    );
    ensureMeaningfulText(person.fullName, `person ${person.slug} fullName`);
    ensureEmail(person.email, `person ${person.slug} email`);
    rejectImportedJunk(person.headline, `person ${person.slug} headline`);
    rejectImportedJunk(person.biography, `person ${person.slug} biography`);
    unique(person.links, (link) => link.url, `link URL for ${person.slug}`);
    uniqueNumber(
      person.links,
      (link) => link.sortOrder,
      `link sortOrder for ${person.slug}`,
    );
    for (const section of person.profileSections) {
      ensureMeaningfulText(
        section.title,
        `profile section title for ${person.slug}`,
      );
      for (const subsection of section.subsections) {
        if (subsection.heading !== null) {
          ensureMeaningfulText(
            subsection.heading,
            `profile subsection heading for ${person.slug}/${section.title}`,
          );
        }
        for (const entry of subsection.entries) {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new Error(
              `Profile entry for ${person.slug}/${section.title} must be an object`,
            );
          }
          if (entry.label !== null) {
            ensureMeaningfulText(
              entry.label,
              `profile entry label for ${person.slug}/${section.title}`,
            );
            rejectImportedJunk(
              entry.label,
              `profile entry label for ${person.slug}/${section.title}`,
            );
          }
          ensureMeaningfulText(
            entry.content,
            `profile entry for ${person.slug}/${section.title}`,
          );
          rejectImportedJunk(
            entry.content,
            `profile entry for ${person.slug}/${section.title}`,
          );
          if (isDateOnlyProfileEntry(entry.content)) {
            throw new Error(
              `Profile entry for ${person.slug}/${section.title} is only a date; keep dates with the record they describe: ${entry.content}`,
            );
          }
        }
      }
    }
  }

  for (const department of data.departments) {
    ensureUrl(department.sourceUrl, `department ${department.slug} sourceUrl`);
    const memberIds = new Set<string>();
    for (const membership of department.memberships) {
      if (!people.has(membership.personSourceId)) {
        throw new Error(
          `Department ${department.slug} references unknown person ${membership.personSourceId}`,
        );
      }
      if (memberIds.has(membership.personSourceId)) {
        throw new Error(
          `Department ${department.slug} repeats person ${membership.personSourceId}`,
        );
      }
      memberIds.add(membership.personSourceId);
      ensureEnum(
        membership.role,
        ['HEAD', 'LEAD', 'MEMBER'],
        `department ${department.slug} membership role`,
      );
    }
  }

  for (const paper of data.papers) {
    ensureUrl(paper.sourceUrl, `paper ${paper.sourceId} sourceUrl`);
    ensureMeaningfulText(paper.title, `paper ${paper.sourceId} title`);
    rejectImportedJunk(paper.title, `paper ${paper.sourceId} title`);
    rejectImportedJunk(paper.citation, `paper ${paper.sourceId} citation`);
    if (paper.canonicalUrl)
      ensureUrl(paper.canonicalUrl, `paper ${paper.sourceId} canonicalUrl`);
    const contributors = new Set<string>();
    for (const contributor of paper.contributorSourceIds) {
      if (!people.has(contributor)) {
        throw new Error(
          `Paper ${paper.sourceId} references unknown contributor ${contributor}`,
        );
      }
      if (contributors.has(contributor)) {
        throw new Error(
          `Paper ${paper.sourceId} repeats contributor ${contributor}`,
        );
      }
      contributors.add(contributor);
    }
  }

  for (const project of data.projects) {
    ensureUrl(project.sourceUrl, `project ${project.sourceId} sourceUrl`);
    ensureMeaningfulText(project.title, `project ${project.sourceId} title`);
    rejectImportedJunk(project.summary, `project ${project.sourceId} summary`);
    rejectImportedJunk(
      project.objective,
      `project ${project.sourceId} objective`,
    );
    if (
      project.publicPageEnabled &&
      !project.summary?.trim() &&
      !project.objective?.trim()
    ) {
      throw new Error(
        `Public project ${project.sourceId} needs a summary or objective`,
      );
    }
    if (project.canonicalUrl)
      ensureUrl(
        project.canonicalUrl,
        `project ${project.sourceId} canonicalUrl`,
      );
    ensureEnum(
      project.status,
      ['PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED'],
      `project ${project.sourceId} status`,
    );
  }

  for (const position of data.positions) {
    ensureMeaningfulText(position.title, `position ${position.slug} title`);
    ensureMeaningfulText(position.summary, `position ${position.slug} summary`);
    rejectImportedJunk(position.summary, `position ${position.slug} summary`);
    rejectImportedJunk(
      position.description,
      `position ${position.slug} description`,
    );
    for (const requirement of position.requirements) {
      ensureMeaningfulText(
        requirement,
        `position ${position.slug} requirement`,
      );
      rejectImportedJunk(requirement, `position ${position.slug} requirement`);
    }
    ensureEnum(
      position.targetRank,
      [
        'RESEARCH_INTERN',
        'RESEARCH_ASSISTANT',
        'RESEARCHER',
        'SENIOR_RESEARCHER',
        'LEAD_RESEARCHER',
        'DEPARTMENT_HEAD',
        'ADVISOR',
      ],
      `position ${position.slug} targetRank`,
    );
    ensureEnum(
      position.positionType,
      [
        'INTERNSHIP',
        'RESEARCH_ASSISTANT',
        'PROJECT_ASSISTANT',
        'FELLOW',
        'STAFF',
        'VOLUNTEER',
        'OTHER',
      ],
      `position ${position.slug} positionType`,
    );
    ensureEnum(
      position.status,
      ['DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED'],
      `position ${position.slug} status`,
    );
    ensureEnum(
      position.engagementType,
      ['FIXED_TERM', 'OPEN_ENDED', 'FLEXIBLE'],
      `position ${position.slug} engagementType`,
    );
  }
}

const importedJunkPatterns: readonly RegExp[] = [
  /\[Not Intending to Share\]/i,
  /\bKeywords\s*:/i,
  /\bAbstract\s*:/i,
  /\bPaper No\.?\s*:/i,
  /\bCongratulations\b/i,
  /\bnull\s+2025\b/i,
  /\bsource profile\b/i,
];

function ensureMeaningfulText(
  value: string | null | undefined,
  label: string,
): void {
  if (!value?.trim()) throw new Error(`Empty ${label}`);
}

function rejectImportedJunk(
  value: string | null | undefined,
  label: string,
): void {
  if (!value) return;
  const pattern = importedJunkPatterns.find((candidate) =>
    candidate.test(value),
  );
  if (pattern)
    throw new Error(`Imported source artifact remains in ${label}: ${value}`);
}

function isDateOnlyProfileEntry(value: string): boolean {
  const normalized = value.trim();
  return /^(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?\d{4}(?:\s*[-—-]\s*(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?(?:\d{4}|Present))?$/i.test(
    normalized,
  );
}

export async function missingSeedAvatarFiles(
  data: AmirSeedData,
): Promise<Array<{ slug: string; file: string }>> {
  const missing: Array<{ slug: string; file: string }> = [];
  for (const person of data.people) {
    if (!person.avatarSourceFile) continue;
    const file = resolve(seedAssetRoot, person.avatarSourceFile);
    try {
      const info = await stat(file);
      if (!info.isFile()) missing.push({ slug: person.slug, file });
    } catch {
      missing.push({ slug: person.slug, file });
    }
  }
  return missing;
}

function uniqueOptional<T>(
  values: T[],
  selector: (item: T) => string | null | undefined,
  label: string,
): void {
  const seen = new Set<string>();
  for (const item of values) {
    const value = selector(item)?.trim();
    if (!value) continue;
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function uniqueNumber<T>(
  values: T[],
  selector: (item: T) => number,
  label: string,
): void {
  const seen = new Set<number>();
  for (const item of values) {
    const value = selector(item);
    if (seen.has(value))
      throw new Error(`Duplicate ${label}: ${String(value)}`);
    seen.add(value);
  }
}

function ensureEnum(
  value: string | null | undefined,
  allowed: readonly string[],
  label: string,
): void {
  if (!value) return;
  if (!allowed.includes(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function ensureEmail(value: string | null | undefined, label: string): void {
  if (!value) return;
  const normalized = value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function ensureUrl(value: string, label: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Invalid ${label} protocol: ${value}`);
  }
}

function unique<T>(
  values: T[],
  selector: (item: T) => string,
  label: string,
): void {
  const seen = new Set<string>();
  for (const item of values) {
    const value = selector(item);
    if (!value) throw new Error(`Empty ${label}`);
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}
