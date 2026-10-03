import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { ApplicationsModule } from './applications/applications.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { BackupsModule } from './backups/backups.module';
import { AuthModule } from './auth/auth.module';
import { RoleGuard } from './auth/role.guard';
import { SessionAuthGuard } from './auth/session-auth.guard';
import { validateEnvironment } from './config/environment';
import { DatabaseModule } from './database/database.module';
import { DepartmentsModule } from './departments/departments.module';
import { DocumentsModule } from './documents/documents.module';
import { UniversitiesModule } from './universities/universities.module';
import { JobsModule } from './jobs/jobs.module';
import { MailModule } from './mail/mail.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProfilesModule } from './profiles/profiles.module';
import { ProjectsModule } from './projects/projects.module';
import { ResearchModule } from './research/research.module';
import { ResearchProgramsModule } from './research-programs/research-programs.module';
import { SettingsModule } from './settings/settings.module';
import { SiteContentModule } from './site-content/site-content.module';
import { UsersModule } from './users/users.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { WeeklyReportsModule } from './weekly-reports/weekly-reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    DepartmentsModule,
    DocumentsModule,
    UniversitiesModule,
    JobsModule,
    MailModule,
    AuthModule,
    BackupsModule,
    NotificationsModule,
    ProfilesModule,
    ProjectsModule,
    ApplicationsModule,
    ResearchModule,
    ResearchProgramsModule,
    SettingsModule,
    SiteContentModule,
    UsersModule,
    CollaborationModule,
    WorkspaceModule,
    WeeklyReportsModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: RoleGuard },
  ],
})
export class AppModule {}
