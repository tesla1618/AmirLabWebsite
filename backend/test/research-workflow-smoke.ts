import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createCliPrisma } from '../scripts/prisma';
import { hashPassword } from '../src/auth/password';
import {
  ResearchItemType,
  ResearchAutomationState,
} from '../generated/prisma/client';

// Run against an API explicitly started with the same private local DATABASE_URL.
// Fixtures are isolated by UUID and deleted even when an assertion fails.
async function main() {
  const database = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(database.hostname, '127.0.0.1');
  assert.equal(database.port, '5433');
  const api = 'http://127.0.0.1:3001/api';
  const prisma = createCliPrisma();
  const prefix = `research-smoke-${randomUUID()}`;
  const password = randomUUID();
  const users: string[] = [];
  const items: string[] = [];
  try {
    const reviewer = await prisma.user.create({
      data: {
        email: `${prefix}-reviewer@example.test`,
        passwordHash: await hashPassword(password),
        role: 'MODERATOR',
        status: 'ACTIVE',
        passwordSetAt: new Date(),
        activatedAt: new Date(),
      },
    });
    users.push(reviewer.id);
    const member = await prisma.user.create({
      data: {
        email: `${prefix}-member@example.test`,
        role: 'MEMBER',
        status: 'ACTIVE',
        person: {
          create: {
            fullName: 'Smoke accountable person',
            slug: prefix,
            isPublished: true,
          },
        },
      },
      include: { person: true },
    });
    users.push(member.id);
    assert.ok(member.person);
    const personId = member.person.id;
    const section = await prisma.personProfileSection.create({
      data: {
        personId,
        type: 'PUBLICATIONS',
        title: 'Publications',
        sortOrder: 0,
        subsections: {
          create: {
            sortOrder: 0,
            entries: {
              create: { sortOrder: 0, content: 'Smoke PAPER' },
            },
          },
        },
      },
    });
    const login = await fetch(`${api}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: reviewer.email, password }),
    });
    assert.equal(login.status, 201, await login.clone().text());
    const session = (await login.json()) as { csrfToken: string };
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    assert.ok(cookie);
    async function request(
      path: string,
      body: object,
      status = 201,
      method = 'POST',
    ) {
      const response = await fetch(`${api}${path}`, {
        method,
        headers: {
          cookie,
          'x-csrf-token': session.csrfToken,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, status, await response.clone().text());
      return response;
    }
    for (const type of [
      ResearchItemType.PAPER,
      ResearchItemType.DATASET,
      ResearchItemType.PROJECT,
    ]) {
      const item = await prisma.researchItem.create({
        data: {
          type,
          slug: `${prefix}-${type}`,
          title: `Smoke ${type}`,
          submittedById: member.id,
          reviewStatus: type === 'PROJECT' ? 'PUBLISHED' : 'NEEDS_REVIEW',
          publishedAt: type === 'PROJECT' ? new Date() : null,
          contributors: {
            create: {
              displayName: 'Source author, not accountable person',
              sortOrder: 0,
            },
          },
          ...(type === 'PAPER'
            ? { paper: { create: {} } }
            : type === 'DATASET'
              ? { dataset: { create: {} } }
              : { project: { create: { publicPageEnabled: true } } }),
        },
      });
      items.push(item.id);
      if (type !== 'PROJECT') {
        await request(`/research/${item.id}/review`, {
          status: 'PUBLISHED',
          expectedAutomationVersion: 0,
        });
      }
    }
    async function profileIds() {
      const response = await fetch(`${api}/people/${prefix}`);
      assert.equal(response.status, 200);
      const profile = (await response.json()) as {
        contributions: Array<{ researchItem: { id: string } }>;
      };
      return profile.contributions.map(({ researchItem }) => researchItem.id);
    }
    assert.deepEqual(new Set(await profileIds()), new Set(items));
    assert.equal(
      await prisma.personProfileSection.count({ where: { id: section.id } }),
      0,
      'Accountable-person manual duplicate should be normalized on publication',
    );
    assert.equal(
      await prisma.researchContributor.count({
        where: { researchItemId: { in: items }, personId },
      }),
      0,
    );
    await request(`/research/${items[0]}/contributors/0/link`, {
      personId,
      expectedAutomationVersion: 1,
    });
    assert.equal(
      (await profileIds()).filter((id) => id === items[0]).length,
      1,
    );
    await prisma.project.update({
      where: { researchItemId: items[2] },
      data: { publicPageEnabled: false },
    });
    assert.ok(!(await profileIds()).includes(items[2]));
    console.log(
      'PASS: authenticated paper/dataset approval; accountable paper/dataset/project visibility; no fabricated authorship; deduplication; private project excluded',
    );

    const paperId = items[0];
    await prisma.researchItem.update({
      where: { id: paperId },
      data: {
        reviewStatus: 'NEEDS_REVIEW',
        automationVersion: 10,
      },
    });
    for (const state of [
      ResearchAutomationState.QUEUED,
      ResearchAutomationState.RUNNING,
    ]) {
      await prisma.researchItem.update({
        where: { id: paperId },
        data: {
          automationState: state,
          automationOwner: 'smoke-worker',
          automationClaimedAt: new Date(),
        },
      });
      await request(
        `/research/${paperId}/contributors/0/link`,
        { personId, expectedAutomationVersion: 10 },
        409,
      );
      const current = await prisma.researchItem.findUniqueOrThrow({
        where: { id: paperId },
      });
      assert.equal(current.automationVersion, 10);
      assert.equal(current.automationState, state);
    }
    const finished = await prisma.researchItem.updateMany({
      where: {
        id: paperId,
        automationVersion: 10,
        automationOwner: 'smoke-worker',
        automationState: 'RUNNING',
      },
      data: {
        automationVersion: { increment: 1 },
        automationState: 'SUCCEEDED',
        automationOwner: null,
        automationClaimedAt: null,
      },
    });
    assert.equal(finished.count, 1);
    await request(`/research/${paperId}/contributors/0/link`, {
      personId,
      expectedAutomationVersion: 11,
    });
    console.log(
      'PASS: active discovery blocks relationship changes without invalidating its completion revision',
    );

    await request(
      `/research/${paperId}/review`,
      { status: 'PUBLISHED', expectedAutomationVersion: 11 },
      409,
    );
    await request(
      `/research/${paperId}`,
      {
        type: 'PAPER',
        title: 'Stale overwrite',
        canonicalUrl: 'https://example.org/stale',
        contributors: ['Wrong author'],
        expectedAutomationVersion: 11,
      },
      409,
      'PATCH',
    );
    await prisma.researchItem.update({
      where: { id: items[1] },
      data: { reviewStatus: 'NEEDS_REVIEW' },
    });
    await request(
      '/research-review/bulk-review',
      {
        ids: [paperId, items[1]],
        expectedAutomationVersions: [11, 1],
        status: 'PUBLISHED',
      },
      409,
    );
    assert.equal(
      (await prisma.researchItem.findUniqueOrThrow({ where: { id: paperId } }))
        .title,
      'Smoke PAPER',
    );
    assert.equal(
      (await prisma.researchItem.findUniqueOrThrow({ where: { id: items[1] } }))
        .reviewStatus,
      'NEEDS_REVIEW',
    );
    await request('/research-review/bulk-review', {
      ids: [paperId, items[1]],
      expectedAutomationVersions: [12, 1],
      status: 'PUBLISHED',
    });
    assert.equal(
      await prisma.researchItem.count({
        where: { id: { in: [paperId, items[1]] }, reviewStatus: 'PUBLISHED' },
      }),
      2,
    );
    console.log(
      'PASS: stale edit/review/bulk revisions rejected; current bulk review publishes atomically',
    );
  } finally {
    await prisma.auditRecord.deleteMany({
      where: { OR: [{ actorId: { in: users } }, { entityId: { in: items } }] },
    });
    await prisma.researchItem.deleteMany({ where: { id: { in: items } } });
    await prisma.person.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
