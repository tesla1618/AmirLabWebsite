import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  PlatformRole,
  ProjectTaskStatus,
  ResearchItemType,
  WeeklyReportStatus,
} from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { reviewConflict } from '../common/review-problem';
import { accessibleProjectWhere } from '../projects/project-access';
import type {
  BulkReviewWeeklyReportsDto,
  ReviewWeeklyReportDto,
  SaveWeeklyReportDto,
} from './dto/weekly-report.dto';

const REPORT_INCLUDE = {
  author: { select: { email: true, person: { select: { fullName: true } } } },
  reviewedBy: {
    select: { email: true, person: { select: { fullName: true } } },
  },
  projects: {
    include: {
      project: {
        select: { researchItem: { select: { title: true } } },
      },
    },
  },
  outputs: {
    include: {
      output: { select: { title: true, type: true } },
    },
  },
} as const;

@Injectable()
export class WeeklyReportsService {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  async current(user: AuthenticatedUser) {
    this.requireMember(user);
    const weekStart = currentWeekStart();
    const weekEnd = addDays(weekStart, 7);
    const [report, projects, outputs] = await Promise.all([
      this.prisma.weeklyReport.findUnique({
        where: { authorId_weekStart: { authorId: user.id, weekStart } },
        include: REPORT_INCLUDE,
      }),
      this.prisma.project.findMany({
        where: accessibleProjectWhere(user),
        select: {
          researchItemId: true,
          researchItem: { select: { title: true } },
          tasks: {
            where: user.person ? { ownerId: user.person.id } : { id: '' },
            select: { completedAt: true, dueAt: true, status: true },
          },
        },
        orderBy: { researchItem: { title: 'asc' } },
      }),
      this.prisma.researchItem.findMany({
        where: reportOutputWhere(user),
        select: { id: true, title: true, type: true },
        orderBy: { title: 'asc' },
      }),
    ]);
    return {
      outputs: outputs.map((output) => ({
        id: output.id,
        title: output.title ?? 'Untitled output',
        type: output.type,
      })),
      projects: projects.map((project) => ({
        id: project.researchItemId,
        title: project.researchItem.title ?? 'Untitled project',
        tasks: {
          completed: project.tasks.filter(
            ({ completedAt }) =>
              completedAt && completedAt >= weekStart && completedAt < weekEnd,
          ).length,
          due: project.tasks.filter(
            ({ dueAt }) => dueAt && dueAt >= weekStart && dueAt < weekEnd,
          ).length,
          open: project.tasks.filter(
            ({ status }) => status !== ProjectTaskStatus.DONE,
          ).length,
        },
      })),
      report,
      weekStart,
    };
  }

  mine(user: AuthenticatedUser) {
    this.requireMember(user);
    return this.prisma.weeklyReport.findMany({
      where: { authorId: user.id },
      include: REPORT_INCLUDE,
      orderBy: { weekStart: 'desc' },
      take: 24,
    });
  }

  async save(dto: SaveWeeklyReportDto, user: AuthenticatedUser) {
    this.requireMember(user);
    if (!user.person) {
      throw new ForbiddenException(
        'A registered person account is required for weekly reporting',
      );
    }
    const projectIds = [...new Set(dto.projectIds)];
    const outputIds = [...new Set(dto.outputIds ?? [])];
    if (projectIds.length !== dto.projectIds.length) {
      throw new BadRequestException('A project can only be selected once');
    }
    if (outputIds.length !== (dto.outputIds?.length ?? 0)) {
      throw new BadRequestException('An output can only be selected once');
    }
    const [accessibleProjects, accessibleOutputs] = await Promise.all([
      this.prisma.project.count({
        where: {
          ...accessibleProjectWhere(user),
          researchItemId: { in: projectIds },
        },
      }),
      outputIds.length
        ? this.prisma.researchItem.count({
            where: { ...reportOutputWhere(user), id: { in: outputIds } },
          })
        : Promise.resolve(0),
    ]);
    if (accessibleProjects !== projectIds.length) {
      throw new BadRequestException(
        'Every selected project must be available to the report author',
      );
    }
    if (accessibleOutputs !== outputIds.length) {
      throw new BadRequestException(
        'Every selected output must belong to the report author',
      );
    }

    const weekStart = currentWeekStart();
    const existing = await this.prisma.weeklyReport.findUnique({
      where: { authorId_weekStart: { authorId: user.id, weekStart } },
      select: { id: true, status: true },
    });
    if (
      existing?.status === WeeklyReportStatus.SUBMITTED ||
      existing?.status === WeeklyReportStatus.REVIEWED
    ) {
      throw new ConflictException(
        'Submitted weekly reports cannot be edited unless changes are requested',
      );
    }

    const report = await this.prisma.$transaction(async (transaction) => {
      const saved = await transaction.weeklyReport.upsert({
        where: { authorId_weekStart: { authorId: user.id, weekStart } },
        create: {
          accomplishments: dto.accomplishments.trim(),
          authorId: user.id,
          blockers: dto.blockers?.trim() || null,
          nextWeekPlan: dto.nextWeekPlan.trim(),
          outputs: {
            create: outputIds.map((outputId) => ({ outputId })),
          },
          projects: {
            create: projectIds.map((projectId) => ({ projectId })),
          },
          weekStart,
        },
        update: {
          accomplishments: dto.accomplishments.trim(),
          blockers: dto.blockers?.trim() || null,
          nextWeekPlan: dto.nextWeekPlan.trim(),
          reviewedAt: null,
          reviewedById: null,
          status: WeeklyReportStatus.DRAFT,
        },
      });
      if (existing) {
        await transaction.weeklyReportProject.deleteMany({
          where: { reportId: saved.id },
        });
        await transaction.weeklyReportProject.createMany({
          data: projectIds.map((projectId) => ({
            projectId,
            reportId: saved.id,
          })),
        });
        await transaction.weeklyReportOutput.deleteMany({
          where: { reportId: saved.id },
        });
        if (outputIds.length) {
          await transaction.weeklyReportOutput.createMany({
            data: outputIds.map((outputId) => ({
              outputId,
              reportId: saved.id,
            })),
          });
        }
      }
      await transaction.auditRecord.create({
        data: {
          action: 'weekly-report.saved',
          actorId: user.id,
          entityId: saved.id,
          entityType: 'WeeklyReport',
          details: {
            outputIds,
            projectIds,
            weekStart: weekStart.toISOString(),
          },
        },
      });
      return saved;
    });
    return this.report(report.id);
  }

  async submit(user: AuthenticatedUser) {
    this.requireMember(user);
    const weekStart = currentWeekStart();
    const report = await this.prisma.weeklyReport.findUnique({
      where: { authorId_weekStart: { authorId: user.id, weekStart } },
      include: { _count: { select: { projects: true } } },
    });
    if (!report) {
      throw new BadRequestException(
        'Save this week’s report before submitting',
      );
    }
    if (
      report.status !== WeeklyReportStatus.DRAFT &&
      report.status !== WeeklyReportStatus.CHANGES_REQUESTED
    ) {
      throw new ConflictException('This weekly report is already submitted');
    }
    if (!report.accomplishments.trim() || !report.nextWeekPlan.trim()) {
      throw new BadRequestException(
        'Completed work and next week’s plan are required',
      );
    }
    if (!report._count.projects) {
      throw new BadRequestException('Link at least one project');
    }

    const submitted = await this.prisma.weeklyReport.update({
      where: { id: report.id },
      data: {
        status: WeeklyReportStatus.SUBMITTED,
        submittedAt: new Date(),
      },
    });
    await this.notifications.notifyReviewers({
      type: NotificationType.WEEKLY_REPORT_SUBMITTED,
      title: 'Weekly report submitted',
      body: `${user.person?.fullName ?? user.email ?? 'A lab member'} submitted their weekly report.`,
      actionUrl: '/workspace/weekly-reports/review',
      payload: { reportId: report.id },
    });
    return this.report(submitted.id);
  }

  reviewQueue() {
    return this.prisma.weeklyReport.findMany({
      where: { status: { not: WeeklyReportStatus.DRAFT } },
      include: REPORT_INCLUDE,
      orderBy: [{ status: 'asc' }, { weekStart: 'desc' }],
      take: 100,
    });
  }

  async bulkReview(dto: BulkReviewWeeklyReportsDto, user: AuthenticatedUser) {
    const ids = [...new Set(dto.ids)];
    if (ids.length !== dto.ids.length) {
      throw new BadRequestException(
        'Duplicate weekly report IDs are not allowed',
      );
    }
    const reviewNote = dto.note?.trim() || null;
    if (dto.status === WeeklyReportStatus.CHANGES_REQUESTED && !reviewNote) {
      throw new BadRequestException(
        'Explain what must change before returning the reports',
      );
    }

    const reports = await this.prisma.weeklyReport.findMany({
      where: { id: { in: ids } },
      select: { authorId: true, id: true, status: true },
    });
    if (reports.length !== ids.length) {
      throw new NotFoundException('One or more weekly reports were not found');
    }
    assertNoSelfAuthoredWeeklyReport(reports, user.id);
    const unavailableReports = reports.filter(
      ({ status }) => status !== WeeklyReportStatus.SUBMITTED,
    );
    if (unavailableReports.length) {
      throw reviewConflict(
        'Some selected weekly reports are no longer awaiting review. Reload the queue.',
        unavailableReports.map(({ id }) => ({
          code: 'WEEKLY_REPORT_CHANGED',
          itemId: id,
          message: 'This weekly report is no longer awaiting review.',
          tone: 'warning',
        })),
      );
    }

    const reviewedAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.weeklyReport.updateMany({
        where: {
          authorId: { not: user.id },
          id: { in: ids },
          status: WeeklyReportStatus.SUBMITTED,
        },
        data: {
          reviewNote,
          reviewedAt,
          reviewedById: user.id,
          status: dto.status,
        },
      });
      if (updated.count !== ids.length) {
        throw reviewConflict(
          'Some weekly reports changed while the bulk review was being saved. Reload and retry.',
          reports.map(({ id }) => ({
            code: 'WEEKLY_REPORT_CHANGED',
            itemId: id,
            message:
              'This weekly report may have changed while the decision was being saved.',
            tone: 'warning',
          })),
        );
      }
      await transaction.auditRecord.createMany({
        data: reports.map(({ id }) => ({
          action: 'weekly-report.reviewed',
          actorId: user.id,
          entityId: id,
          entityType: 'WeeklyReport',
          details: { bulk: true, status: dto.status },
        })),
      });
    });

    await this.notifications.createMany(
      reports.map(({ authorId, id }) => ({
        actionUrl: '/workspace/weekly-reports',
        body:
          reviewNote || 'Your supervisor reviewed the latest weekly report.',
        payload: { reportId: id },
        recipientId: authorId,
        title:
          dto.status === WeeklyReportStatus.REVIEWED
            ? 'Weekly report reviewed'
            : 'Weekly report needs changes',
        type: NotificationType.WEEKLY_REPORT_REVIEWED,
      })),
    );

    return { count: ids.length, ids, status: dto.status };
  }

  async review(
    id: string,
    dto: ReviewWeeklyReportDto,
    user: AuthenticatedUser,
  ) {
    const report = await this.prisma.weeklyReport.findUnique({
      where: { id },
      select: { authorId: true, id: true, status: true },
    });
    if (!report) throw new NotFoundException('Weekly report not found');
    assertNoSelfAuthoredWeeklyReport([report], user.id);
    if (report.status !== WeeklyReportStatus.SUBMITTED) {
      throw reviewConflict('This weekly report is no longer awaiting review.', [
        {
          code: 'WEEKLY_REPORT_CHANGED',
          itemId: id,
          message: 'This weekly report is no longer awaiting review.',
          tone: 'warning',
        },
      ]);
    }
    if (
      dto.status === WeeklyReportStatus.CHANGES_REQUESTED &&
      !dto.note?.trim()
    ) {
      throw new BadRequestException(
        'Explain what must change before returning the report',
      );
    }

    const reviewed = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.weeklyReport.update({
        where: { id },
        data: {
          reviewNote: dto.note?.trim() || null,
          reviewedAt: new Date(),
          reviewedById: user.id,
          status: dto.status,
        },
      });
      await transaction.auditRecord.create({
        data: {
          action: 'weekly-report.reviewed',
          actorId: user.id,
          entityId: id,
          entityType: 'WeeklyReport',
          details: { status: dto.status },
        },
      });
      return result;
    });
    await this.notifications.create(report.authorId, {
      type: NotificationType.WEEKLY_REPORT_REVIEWED,
      title:
        dto.status === WeeklyReportStatus.REVIEWED
          ? 'Weekly report reviewed'
          : 'Weekly report needs changes',
      body:
        dto.note?.trim() ||
        'Your supervisor reviewed the latest weekly report.',
      actionUrl: '/workspace/weekly-reports',
      payload: { reportId: id },
    });
    return this.report(reviewed.id);
  }

  private requireMember(user: AuthenticatedUser) {
    if (user.role !== PlatformRole.MEMBER) {
      throw new ForbiddenException(
        'Weekly reports are only available to member accounts',
      );
    }
  }

  private report(id: string) {
    return this.prisma.weeklyReport.findUniqueOrThrow({
      where: { id },
      include: REPORT_INCLUDE,
    });
  }
}

function assertNoSelfAuthoredWeeklyReport(
  reports: Array<{ id: string; authorId: string }>,
  reviewerId: string,
): void {
  const selfAuthoredReports = reports.filter(
    ({ authorId }) => authorId === reviewerId,
  );
  if (selfAuthoredReports.length) {
    throw reviewConflict(
      'You cannot review your own weekly report.',
      selfAuthoredReports.map(({ id }) => ({
        code: 'WEEKLY_REPORT_SELF_REVIEW',
        itemId: id,
        message: 'The reviewer cannot review their own weekly report.',
        tone: 'error' as const,
      })),
    );
  }
}

function reportOutputWhere(user: AuthenticatedUser) {
  return {
    type: { in: [ResearchItemType.PAPER, ResearchItemType.DATASET] },
    ...(user.role === PlatformRole.ADMIN
      ? {}
      : {
          OR: [
            { submittedById: user.id },
            { contributors: { some: { personId: user.person?.id ?? '' } } },
          ],
        }),
  };
}

export function currentWeekStart(now = new Date()) {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const day = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - (day === 0 ? 6 : day - 1));
  return start;
}

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
