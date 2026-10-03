import { Injectable } from '@nestjs/common';
import {
  PersonSectionType,
  Prisma,
  ProfileReviewStatus,
  ResearchItemType,
  ReviewStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';

export interface OutputIdentity {
  title: string | null;
  canonicalUrl: string | null;
  doi: string | null;
  type: ResearchItemType;
}

/**
 * Keeps the manually-entered profile record and the canonical research graph
 * from rendering the same paper/dataset twice. Canonical linked research wins:
 * once a linked output is published, matching manual profile entries are
 * removed from both the published profile rows and any pending profile draft.
 */
@Injectable()
export class ResearchProfileSyncService {
  constructor(private readonly prisma: PrismaService) {}

  async normalizePublishedOutputs(
    researchItemIds: readonly string[],
    actorId: string | null,
    transaction?: Prisma.TransactionClient,
  ): Promise<void> {
    const ids = [...new Set(researchItemIds)];
    if (!ids.length) return;
    if (transaction) {
      await this.normalizeWithClient(transaction, ids, actorId);
      return;
    }
    await this.prisma.$transaction((client) =>
      this.normalizeWithClient(client, ids, actorId),
    );
  }

  async normalizePublishedOutputsForPeople(
    personIds: readonly string[],
    actorId: string | null,
    transaction?: Prisma.TransactionClient,
  ): Promise<void> {
    const ids = [...new Set(personIds)];
    if (!ids.length) return;
    const run = async (db: Prisma.TransactionClient) => {
      const outputs = await db.researchItem.findMany({
        where: {
          reviewStatus: ReviewStatus.PUBLISHED,
          type: { in: [ResearchItemType.PAPER, ResearchItemType.DATASET] },
          OR: [
            { contributors: { some: { personId: { in: ids } } } },
            { submittedBy: { is: { person: { is: { id: { in: ids } } } } } },
          ],
        },
        select: { id: true },
      });
      await this.normalizeWithClient(
        db,
        outputs.map(({ id }) => id),
        actorId,
      );
    };
    if (transaction) {
      await run(transaction);
      return;
    }
    await this.prisma.$transaction(run);
  }

  private async normalizeWithClient(
    db: Prisma.TransactionClient,
    ids: string[],
    actorId: string | null,
  ): Promise<void> {
    const items = await db.researchItem.findMany({
      where: {
        id: { in: ids },
        reviewStatus: ReviewStatus.PUBLISHED,
        type: { in: [ResearchItemType.PAPER, ResearchItemType.DATASET] },
      },
      select: {
        id: true,
        type: true,
        title: true,
        canonicalUrl: true,
        paper: { select: { doi: true } },
        submittedBy: { select: { person: { select: { id: true } } } },
        contributors: {
          where: { personId: { not: null } },
          select: { personId: true },
        },
      },
    });
    if (!items.length) return;

    const personIds = [...new Set(items.flatMap(outputPersonIds))];
    if (!personIds.length) return;

    const people = await db.person.findMany({
      where: { id: { in: personIds } },
      select: {
        id: true,
        profileEditRequest: {
          select: { id: true, payload: true, status: true },
        },
        profileSections: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            type: true,
            title: true,
            subsections: {
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                heading: true,
                entries: {
                  orderBy: { sortOrder: 'asc' },
                  select: { id: true, label: true, content: true },
                },
              },
            },
          },
        },
      },
    });
    const peopleById = new Map(people.map((person) => [person.id, person]));

    const entryIds = new Set<string>();
    const subsectionIds = new Set<string>();
    const sectionIds = new Set<string>();
    const pendingPayloads = new Map<string, Prisma.InputJsonObject>();
    const auditRows: Prisma.AuditRecordCreateManyInput[] = [];

    for (const item of items) {
      const identity: OutputIdentity = {
        canonicalUrl: item.canonicalUrl,
        doi: item.paper?.doi ?? null,
        title: item.title,
        type: item.type,
      };
      for (const personId of outputPersonIds(item)) {
        const person = peopleById.get(personId);
        if (!person) continue;

        let publishedRemoved = 0;
        for (const section of person.profileSections) {
          if (!isOutputSection(section.type, section.title, identity.type)) {
            continue;
          }

          if (matchesProfileOutput(section.title, identity)) {
            sectionIds.add(section.id);
            publishedRemoved += section.subsections.reduce(
              (sum, subsection) => sum + subsection.entries.length,
              0,
            );
            continue;
          }

          for (const subsection of section.subsections) {
            if (
              subsection.heading &&
              matchesProfileOutput(subsection.heading, identity)
            ) {
              subsectionIds.add(subsection.id);
              publishedRemoved += subsection.entries.length;
              continue;
            }
            for (const entry of subsection.entries) {
              const value = `${entry.label ?? ''}\n${entry.content}`;
              if (
                matchesProfileOutput(entry.label ?? '', identity) ||
                matchesProfileOutput(entry.content, identity) ||
                matchesProfileOutput(value, identity)
              ) {
                entryIds.add(entry.id);
                publishedRemoved += 1;
              }
            }
          }
        }

        let draftRemoved = 0;
        if (
          person.profileEditRequest?.status === ProfileReviewStatus.NEEDS_REVIEW
        ) {
          const current =
            pendingPayloads.get(person.profileEditRequest.id) ??
            jsonObject(person.profileEditRequest.payload);
          const normalized = prunePendingProfile(current, identity);
          if (normalized.removed > 0) {
            draftRemoved = normalized.removed;
            pendingPayloads.set(
              person.profileEditRequest.id,
              normalized.payload,
            );
          }
        }

        if (publishedRemoved || draftRemoved) {
          auditRows.push({
            action: 'research.profile-output-normalized',
            actorId,
            entityId: item.id,
            entityType: 'ResearchItem',
            details: {
              draftEntriesRemoved: draftRemoved,
              personId,
              publishedEntriesRemoved: publishedRemoved,
              researchItemId: item.id,
            },
          });
        }
      }
    }

    if (
      !entryIds.size &&
      !subsectionIds.size &&
      !sectionIds.size &&
      !pendingPayloads.size
    ) {
      return;
    }

    if (entryIds.size) {
      await db.personProfileEntry.deleteMany({
        where: { id: { in: [...entryIds] } },
      });
    }
    if (subsectionIds.size) {
      await db.personProfileSubsection.deleteMany({
        where: { id: { in: [...subsectionIds] } },
      });
    }
    if (sectionIds.size) {
      await db.personProfileSection.deleteMany({
        where: { id: { in: [...sectionIds] } },
      });
    }

    // Remove containers made empty by entry-level normalization.
    await db.personProfileSubsection.deleteMany({
      where: {
        section: { is: { personId: { in: personIds } } },
        entries: { none: {} },
      },
    });
    await db.personProfileSection.deleteMany({
      where: {
        personId: { in: personIds },
        subsections: { none: {} },
      },
    });

    for (const [requestId, payload] of pendingPayloads) {
      await db.profileEditRequest.update({
        where: { id: requestId },
        data: { payload },
      });
    }
    if (auditRows.length) {
      await db.auditRecord.createMany({ data: auditRows });
    }
  }
}

function isOutputSection(
  type: PersonSectionType,
  title: string,
  outputType: ResearchItemType,
): boolean {
  if (type === PersonSectionType.PUBLICATIONS) return true;
  const normalized = title.toLowerCase();
  if (/\b(publications?|papers?|research outputs?)\b/.test(normalized)) {
    return true;
  }
  return (
    outputType === ResearchItemType.DATASET && /\bdatasets?\b/.test(normalized)
  );
}

export function matchesProfileOutput(
  value: string,
  identity: OutputIdentity,
): boolean {
  const lower = value.toLowerCase();
  const canonicalUrl = identity.canonicalUrl?.trim().toLowerCase();
  if (canonicalUrl && lower.includes(canonicalUrl)) return true;

  const doi = normalizeDoi(identity.doi);
  if (doi && lower.includes(doi)) return true;

  const title = normalizeIdentityText(identity.title);
  const candidate = normalizeIdentityText(value);
  if (!title || !candidate) return false;
  if (candidate === title) return true;
  if (title.length < 8) return false;
  return candidate.includes(title);
}

function normalizeDoi(value: string | null): string | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '')
    .replace(/^doi\s*:\s*/, '');
  return normalized || null;
}

export function normalizeIdentityText(
  value: string | null | undefined,
): string {
  if (!value) return '';
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function outputPersonIds(item: {
  contributors: Array<{ personId: string | null }>;
  submittedBy?: { person: { id: string } | null } | null;
}): string[] {
  return [
    ...new Set([
      ...item.contributors.flatMap(({ personId }) =>
        personId ? [personId] : [],
      ),
      ...(item.submittedBy?.person ? [item.submittedBy.person.id] : []),
    ]),
  ];
}

function jsonObject(value: Prisma.JsonValue): Prisma.InputJsonObject {
  return isJsonObject(value) ? value : {};
}

export function prunePendingProfile(
  payload: Prisma.InputJsonObject,
  identity: OutputIdentity,
): { payload: Prisma.InputJsonObject; removed: number } {
  const sourceSections = Array.isArray(payload.sections)
    ? payload.sections
    : null;
  if (!sourceSections) return { payload, removed: 0 };

  let removed = 0;
  const sections = sourceSections.flatMap((sectionValue) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    if (!isJsonObject(sectionValue)) return [sectionValue];
    const section = { ...sectionValue };
    const type = typeof section.type === 'string' ? section.type : '';
    const title = typeof section.title === 'string' ? section.title : '';
    if (!isPendingOutputSection(type, title, identity.type)) return [section];

    const subsections = Array.isArray(section.subsections)
      ? section.subsections
      : [];
    if (matchesProfileOutput(title, identity)) {
      removed += countPendingEntries(subsections);
      return [];
    }

    const nextSubsections = subsections.flatMap((subsectionValue) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      if (!isJsonObject(subsectionValue)) return [subsectionValue];
      const subsection = { ...subsectionValue };
      const heading =
        typeof subsection.heading === 'string' ? subsection.heading : null;
      const entries = Array.isArray(subsection.entries)
        ? subsection.entries
        : [];
      if (heading && matchesProfileOutput(heading, identity)) {
        removed += entries.length;
        return [];
      }
      const nextEntries = entries.filter((entryValue) => {
        if (!isJsonObject(entryValue)) return true;
        const label =
          typeof entryValue.label === 'string' ? entryValue.label : '';
        const content =
          typeof entryValue.content === 'string' ? entryValue.content : '';
        if (
          !matchesProfileOutput(label, identity) &&
          !matchesProfileOutput(content, identity) &&
          !matchesProfileOutput(`${label}\n${content}`, identity)
        ) {
          return true;
        }
        removed += 1;
        return false;
      });
      if (!nextEntries.length) return [];
      return [{ ...subsection, entries: nextEntries }];
    });

    if (!nextSubsections.length) return [];
    return [{ ...section, subsections: nextSubsections }];
  });

  if (!removed) return { payload, removed: 0 };
  return { payload: { ...payload, sections }, removed };
}

function isPendingOutputSection(
  type: string,
  title: string,
  outputType: ResearchItemType,
): boolean {
  if (type === PersonSectionType.PUBLICATIONS) return true;
  const normalized = title.toLowerCase();
  if (/\b(publications?|papers?|research outputs?)\b/.test(normalized)) {
    return true;
  }
  return (
    outputType === ResearchItemType.DATASET && /\bdatasets?\b/.test(normalized)
  );
}

function countPendingEntries(subsections: readonly unknown[]): number {
  let count = 0;
  for (const subsection of subsections) {
    if (isJsonObject(subsection) && Array.isArray(subsection.entries)) {
      count += subsection.entries.length;
    }
  }
  return count;
}

function isJsonObject(value: unknown): value is Prisma.InputJsonObject {
  return !!value && !Array.isArray(value) && typeof value === 'object';
}
