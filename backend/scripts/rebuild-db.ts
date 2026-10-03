import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import sharp from 'sharp';
import {
  AcademicRank,
  AccountStatus,
  AssetAccess,
  AssetKind,
  ContributorMatchSource,
  ContributorMatchStatus,
  DepartmentRole,
  DocumentKind,
  EngagementType,
  PlatformRole,
  ProfileReviewStatus,
  ProjectChangeKind,
  PositionStatus,
  PositionType,
  ProjectStatus,
  ResearchItemType,
  ReviewStatus,
  Prisma,
} from '../generated/prisma/client';
import { hashPassword } from '../src/auth/password';
import {
  DEFAULT_DOCUMENT_SITE,
  DEFAULT_DOCUMENT_TEMPLATES,
} from '../src/documents/documents.service';
import { createCliPrisma } from './prisma';
import { seedAdminCredentials } from './seed-credentials';
import {
  type AmirSeedData,
  type SeedPaper,
  firstKnownContributorSourceIdForSeed,
  missingSeedAvatarFiles,
  readSeedData,
  seedAssetRoot,
} from './seed-data';

const uploadRoot = resolve(process.env.UPLOAD_ROOT ?? './storage');
const peopleStorageRoot = resolve(uploadRoot, 'peoples');
const signatureStorageRoot = resolve(uploadRoot, 'document-signatures');
const watermarkStorageRoot = resolve(uploadRoot, 'document-watermarks');
const signatureSeedPath = resolve(
  process.cwd(),
  'src/applications/brand/signature.svg',
);
const watermarkSeedPath = resolve(
  process.cwd(),
  'src/applications/brand/Logo-high-res.png',
);
const {
  email: adminEmail,
  fullName: adminName,
  password: adminPassword,
} = seedAdminCredentials();

export async function rebuildDatabase() {
  const data = await readSeedData();
  const missingFiles = await missingSeedAvatarFiles(data);
  if (missingFiles.length) {
    throw new Error(
      `Seed references ${missingFiles.length} missing avatar file(s)`,
    );
  }

  const prisma = createCliPrisma();
  try {
    const nonEmpty = await Promise.all([
      prisma.user.count(),
      prisma.person.count(),
      prisma.department.count(),
      prisma.researchItem.count(),
      prisma.position.count(),
      prisma.asset.count(),
      prisma.siteSetting.count(),
      prisma.university.count(),
    ]);
    if (nonEmpty.some((count) => count > 0)) {
      throw new Error(
        'Database is not empty. Use `pnpm run db:rebuild` for a destructive rebuild, or reset the schema before running `pnpm run db:seed`.',
      );
    }

    await rm(peopleStorageRoot, { recursive: true, force: true });
    await rm(signatureStorageRoot, { recursive: true, force: true });
    await rm(watermarkStorageRoot, { recursive: true, force: true });
    await mkdir(peopleStorageRoot, { recursive: true });

    const passwordHash = await hashPassword(adminPassword);
    const admin = await prisma.user.create({
      data: {
        activatedAt: new Date(),
        passwordHash,
        passwordSetAt: new Date(),
        role: PlatformRole.ADMIN,
        isSystemAccount: true,
        status: AccountStatus.ACTIVE,
      },
    });
    await prisma.person.create({
      data: {
        fullName: adminName,
        headline: 'Research operations administrator',
        isPublished: false,
        roleTitle: 'Lab Administrator',
        slug: 'amirlab-administrator',
        userId: admin.id,
      },
    });

    await seedSiteSettings(prisma, data);

    const departmentIdBySource = new Map<string, string>();
    for (const department of data.departments) {
      const created = await prisma.department.create({
        data: {
          abbreviation: department.abbreviation,
          description: department.description,
          isPublished: department.isPublished,
          legacySourceId: department.sourceId,
          legacyUrl: department.sourceUrl,
          name: department.name,
          slug: department.slug,
        },
      });
      departmentIdBySource.set(department.sourceId, created.id);
    }

    const personIdBySource = new Map<string, string>();
    const personNameBySource = new Map<string, string>();
    const userIdBySource = new Map<string, string>();
    const usedAccountEmails = new Set<string>([adminEmail]);
    let importedAvatars = 0;

    for (const person of data.people) {
      const candidateEmail = person.email?.trim().toLowerCase() || null;
      const accountEmail =
        candidateEmail && !usedAccountEmails.has(candidateEmail)
          ? candidateEmail
          : null;
      if (accountEmail) usedAccountEmails.add(accountEmail);

      const account = await prisma.user.create({
        data: {
          email: accountEmail,
          role: PlatformRole.MEMBER,
          status: AccountStatus.PENDING_SETUP,
        },
      });

      const avatarAssetId = person.avatarSourceFile
        ? await createAvatarAsset(
            prisma,
            person.slug,
            person.avatarSourceFile,
            admin.id,
          )
        : null;
      if (avatarAssetId) importedAvatars += 1;

      // The person record is the identity anchor used by departments and
      // contributor matching. Public profile content stays unpublished until
      // the imported profile review request is explicitly approved.
      const created = await prisma.person.create({
        data: {
          appointedRank: enumValue(AcademicRank, person.appointedRank),
          fullName: person.fullName,
          isAlumni: person.isAlumni,
          isPublished: false,
          legacySourceId: person.sourceId,
          legacyUrl: person.sourceUrl,
          roleTitle: person.roleTitle,
          slug: person.slug,
          userId: account.id,
        },
      });

      await prisma.profileEditRequest.create({
        data: {
          avatarAssetId,
          personId: created.id,
          status: ProfileReviewStatus.NEEDS_REVIEW,
          payload: {
            fullName: person.fullName,
            headline: person.headline,
            biography: person.biography,
            phone: person.phone,
            contactAddress: person.contactAddress,
            expertise: person.expertise,
            links: person.links.map(({ label, type, url }) => ({
              label,
              type,
              url,
            })),
            sections: person.profileSections.map((section) => ({
              type: section.type,
              title: section.title,
              subsections: section.subsections.map((subsection) => ({
                heading: subsection.heading,
                entries: subsection.entries.map((entry) => ({
                  label: entry.label,
                  content: entry.content,
                })),
              })),
            })),
            removeAvatar: false,
          },
        },
      });

      personIdBySource.set(person.sourceId, created.id);
      personNameBySource.set(person.sourceId, person.fullName);
      userIdBySource.set(person.sourceId, account.id);
    }

    const defaultApprover = data.people.find((person) =>
      person.roleTitle?.toLowerCase().includes('director'),
    );
    await seedDocuments(
      prisma,
      admin.id,
      defaultApprover
        ? (personIdBySource.get(defaultApprover.sourceId) ?? null)
        : null,
    );

    for (const department of data.departments) {
      const departmentId = required(
        departmentIdBySource.get(department.sourceId),
        `Missing department ${department.sourceId}`,
      );
      for (const [index, membership] of department.memberships.entries()) {
        const personId = required(
          personIdBySource.get(membership.personSourceId),
          `Missing person ${membership.personSourceId}`,
        );
        await prisma.personDepartment.create({
          data: {
            departmentId,
            isPrimary: index === 0 && membership.role === 'HEAD',
            personId,
            role:
              enumValue(DepartmentRole, membership.role) ??
              DepartmentRole.MEMBER,
            sortOrder: membership.sortOrder,
          },
        });
      }
    }

    const knownContributorSourceIds = new Set(userIdBySource.keys());
    for (const paper of data.papers) {
      const firstKnownContributorSourceId =
        firstKnownContributorSourceIdForSeed(
          paper.contributorSourceIds,
          knownContributorSourceIds,
        );
      const firstKnownSubmitterId = firstKnownContributorSourceId
        ? (userIdBySource.get(firstKnownContributorSourceId) ?? null)
        : null;
      const researchItem = await prisma.researchItem.create({
        data: {
          canonicalUrl: paper.canonicalUrl,
          legacySourceId: paper.sourceId,
          legacyUrl: paper.sourceUrl,
          reviewStatus: ReviewStatus.NEEDS_REVIEW,
          slug: paperSlug(paper),
          submittedById: firstKnownSubmitterId,
          title: paper.title,
          type: ResearchItemType.PAPER,
          paper: {
            create: {
              citation: paper.citation,
              doi: paper.doi,
              publicationType: paper.publicationType,
              venue: paper.venue,
              year: paper.year,
            },
          },
        },
      });
      await prisma.auditRecord.create({
        data: {
          action: 'research.imported',
          actorId: admin.id,
          entityId: researchItem.id,
          entityType: 'ResearchItem',
          details: {
            sourceId: paper.sourceId,
            ownerSourceId: firstKnownContributorSourceId,
          },
        },
      });

      for (const [
        sortOrder,
        sourceId,
      ] of paper.contributorSourceIds.entries()) {
        const personId = personIdBySource.get(sourceId);
        const displayName = personNameBySource.get(sourceId);
        if (!personId || !displayName) continue;
        await prisma.researchContributor.create({
          data: {
            displayName,
            researchItemId: researchItem.id,
            sortOrder,
            matches: {
              create: {
                confidence: 1,
                evidence: {
                  matchReason: 'Imported identity',
                  personSourceId: sourceId,
                  researchSourceId: paper.sourceId,
                },
                personId,
                requestedById: admin.id,
                source: ContributorMatchSource.SOURCE_METADATA,
                status: ContributorMatchStatus.PROPOSED,
              },
            },
          },
        });
      }
    }

    for (const project of data.projects) {
      if (!project.title) continue;
      const item = await prisma.researchItem.create({
        data: {
          canonicalUrl: project.canonicalUrl,
          legacySourceId: project.sourceId,
          legacyUrl: project.sourceUrl,
          reviewStatus: ReviewStatus.DRAFT,
          slug: stableSlug(project.title, project.sourceId),
          title: project.title,
          type: ResearchItemType.PROJECT,
          project: {
            create: {
              objective: null,
              publicPageEnabled: false,
              status: enumValue(ProjectStatus, project.status),
            },
          },
        },
      });
      await prisma.projectChangeRequest.create({
        data: {
          baseVersion: 1,
          kind: ProjectChangeKind.DETAILS,
          payload: {
            endsAt: null,
            objective: project.objective,
            objectives: [],
            publicPageEnabled: project.publicPageEnabled,
            startsAt: null,
            status: enumValue(ProjectStatus, project.status),
            summary: project.summary,
            title: project.title,
          },
          projectId: item.id,
          submittedById: admin.id,
        },
      });
    }

    for (const position of data.positions) {
      await prisma.position.create({
        data: {
          description: position.description,
          engagementType:
            enumValue(EngagementType, position.engagementType) ??
            EngagementType.FLEXIBLE,
          positionType:
            enumValue(PositionType, position.positionType) ??
            PositionType.OTHER,
          requirements: position.requirements,
          responsibilities: [],
          slug: position.slug,
          status: PositionStatus.DRAFT,
          summary: position.summary,
          targetRank: enumValue(AcademicRank, position.targetRank),
          title: position.title,
        },
      });
    }

    for (const person of data.people) {
      const personId = required(
        personIdBySource.get(person.sourceId),
        `Missing person ${person.sourceId}`,
      );
      await prisma.personMetric.create({
        data: {
          personId,
          publishedPaperCount: 0,
        },
      });
    }

    console.log('[db] Canonical AMIR Lab dataset imported.');
    console.log(`[db] People: ${data.people.length}`);
    console.log(`[db] People images imported: ${importedAvatars}`);
    console.log(`[db] Departments: ${data.departments.length}`);
    console.log(`[db] Papers: ${data.papers.length}`);
    console.log(`[db] Projects: ${data.projects.length}`);
    console.log(`[db] Positions: ${data.positions.length}`);
    console.log(`[db] Admin login: ${adminEmail}`);
    console.log(
      '[db] Run `pnpm run db:verify` to verify database and storage integrity.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function seedDocuments(
  prisma: ReturnType<typeof createCliPrisma>,
  createdById: string,
  approverPersonId: string | null,
): Promise<void> {
  const signatureAssetId = await createApprovalSignatureAsset(
    prisma,
    createdById,
  );
  const watermarkAssetId = await createDocumentWatermarkAsset(
    prisma,
    createdById,
  );
  const templates = [];
  for (const template of DEFAULT_DOCUMENT_TEMPLATES) {
    templates.push(
      await prisma.documentTemplate.create({
        data: {
          ...template,
          createdById,
          updatedById: createdById,
        },
      }),
    );
  }
  await prisma.documentSettings.create({
    data: {
      id: 'documents',
      approverPersonId,
      defaultOfferTemplateId:
        templates.find((template) => template.kind === DocumentKind.OFFER)
          ?.id ?? null,
      siteEmail: DEFAULT_DOCUMENT_SITE.email,
      siteLocation: DEFAULT_DOCUMENT_SITE.location,
      siteUrl: DEFAULT_DOCUMENT_SITE.url,
      signatureAssetId,
      watermarkAssetId,
    },
  });
}

async function createDocumentWatermarkAsset(
  prisma: ReturnType<typeof createCliPrisma>,
  createdById: string,
): Promise<string | null> {
  let source: Buffer;
  try {
    source = await readFile(watermarkSeedPath);
  } catch {
    console.warn(
      '[db] Document watermark source is unavailable; continuing without it.',
    );
    return null;
  }
  let image: { data: Buffer; info: sharp.OutputInfo };
  try {
    image = await sharp(source, {
      animated: false,
      limitInputPixels: 40_000_000,
    })
      .resize(2_000, 2_000, { fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    console.warn(
      '[db] Document watermark source is invalid; continuing without it.',
    );
    return null;
  }
  const checksum = createHash('sha256').update(image.data).digest('hex');
  const storageKey = `document-watermarks/head-${checksum.slice(0, 12)}.png`;
  const target = resolve(uploadRoot, storageKey);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, image.data, { flag: 'wx' });
  const asset = await prisma.asset.create({
    data: {
      access: AssetAccess.PRIVATE,
      byteSize: image.data.length,
      checksum,
      createdById,
      height: image.info.height,
      kind: AssetKind.DOCUMENT_WATERMARK,
      mimeType: 'image/png',
      originalName: basename(watermarkSeedPath),
      storageKey,
      width: image.info.width,
    },
  });
  return asset.id;
}

async function createApprovalSignatureAsset(
  prisma: ReturnType<typeof createCliPrisma>,
  createdById: string,
): Promise<string | null> {
  let source: Buffer;
  try {
    source = await readFile(signatureSeedPath);
  } catch {
    console.warn(
      '[db] Approval signature source is unavailable; continuing without it.',
    );
    return null;
  }
  let image: { data: Buffer; info: sharp.OutputInfo };
  try {
    image = await sharp(source, {
      animated: false,
      limitInputPixels: 40_000_000,
    })
      .resize(1_600, 800, { fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    console.warn(
      '[db] Approval signature source is invalid; continuing without it.',
    );
    return null;
  }
  const checksum = createHash('sha256').update(image.data).digest('hex');
  const storageKey = `document-signatures/approval-${checksum.slice(0, 12)}.png`;
  const target = resolve(uploadRoot, storageKey);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, image.data, { flag: 'wx' });
  const asset = await prisma.asset.create({
    data: {
      access: AssetAccess.PRIVATE,
      byteSize: image.data.length,
      checksum,
      createdById,
      height: image.info.height,
      kind: AssetKind.DOCUMENT_SIGNATURE,
      mimeType: 'image/png',
      originalName: basename(signatureSeedPath),
      storageKey,
      width: image.info.width,
    },
  });
  return asset.id;
}

async function seedSiteSettings(
  prisma: ReturnType<typeof createCliPrisma>,
  data: AmirSeedData,
) {
  const values: Record<string, unknown> = {
    'page.home': data.site.home,
    'page.about': data.site.about,
    'site.vision': data.site.vision,
    'site.mission': data.site.mission,
    'site.why-amirlab': data.site.whyAmirLab,
    'site.contact': data.site.contact,
    'site.ethics-committee': data.site.ethicsCommittee,
    'site.administrative-units': data.site.administrativeUnits,
    'site.application-policy': data.site.applicationPolicy,
    'site.training-programs': data.site.trainingPrograms,
    'site.achievement': data.site.achievement,
    'seed.provenance': data.source,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    await prisma.siteSetting.create({
      data: { key, value: toInputJsonValue(value) },
    });
  }
}

async function createAvatarAsset(
  prisma: ReturnType<typeof createCliPrisma>,
  slug: string,
  sourceFile: string,
  createdById?: string,
): Promise<string> {
  const sourcePath = resolve(seedAssetRoot, sourceFile);
  const source = await readFile(sourcePath);
  const image = await sharp(source)
    .rotate()
    .resize(1_200, 1_200, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 86 })
    .toBuffer({ resolveWithObject: true });
  const checksum = createHash('sha256').update(image.data).digest('hex');
  const storageKey = `peoples/${slug}-${checksum.slice(0, 12)}.webp`;
  const target = resolve(uploadRoot, storageKey);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, image.data, { flag: 'wx' });
  const asset = await prisma.asset.create({
    data: {
      access: AssetAccess.PUBLIC,
      byteSize: image.data.length,
      checksum,
      createdById,
      height: image.info.height,
      kind: AssetKind.AVATAR,
      mimeType: 'image/webp',
      originalName: basename(sourceFile),
      storageKey,
      width: image.info.width,
    },
  });
  return asset.id;
}

function paperSlug(paper: SeedPaper): string {
  return stableSlug(
    paper.title ?? paper.doi ?? `publication-${paper.year ?? 'undated'}`,
    paper.sourceId,
  );
}

function stableSlug(label: string, stableKey: string): string {
  const readable = label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 72);
  const suffix = createHash('sha1')
    .update(stableKey)
    .digest('hex')
    .slice(0, 10);
  return `${readable || 'research-record'}-${suffix}`;
}

function enumValue<T extends Record<string, string>>(
  values: T,
  candidate: string | null | undefined,
): T[keyof T] | null {
  if (!candidate) return null;
  return Object.prototype.hasOwnProperty.call(values, candidate)
    ? (values[candidate] as T[keyof T])
    : null;
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

if (
  process.argv[1] &&
  ['rebuild-db.ts', 'rebuild-db.js'].includes(basename(process.argv[1]))
) {
  void rebuildDatabase().catch((error) => {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
    process.exitCode = 1;
  });
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Seed JSON cannot contain non-finite numbers');
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) =>
      entry === null ? null : toInputJsonValue(entry),
    );
  }
  if (isJsonRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) =>
        entry === undefined
          ? []
          : [[key, entry === null ? null : toInputJsonValue(entry)]],
      ),
    );
  }
  throw new Error('Seed setting is not valid JSON');
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return !!value && !Array.isArray(value) && typeof value === 'object';
}
