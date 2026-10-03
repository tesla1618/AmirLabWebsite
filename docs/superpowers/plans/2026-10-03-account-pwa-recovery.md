# Account PWA Recovery Implementation Plan

> **For agentic workers:** Use executing-plans for the session task and dispatching-parallel-agents for independent frontend, push and recovery work.

**Goal:** Implement device/session management, remote logout, PWA, workspace push and backup/restore interfaces.
**Architecture:** PostgreSQL owns sessions and notification jobs; the existing service worker owns installation/offline/push. Recovery currently exposes an administrator status contract and disabled controls; operational tooling awaits storage selection.
**Tech Stack:** NestJS, Prisma/PostgreSQL, Next.js, web-push and existing jobs.
**Spec:** ../specs/2026-10-03-account-pwa-recovery.md

## Global Constraints
User approved implementation and later commit/push to main; no manual deployment or hosted DB changes during development. Preserve __agent__. Read RULES and frontend/AGENTS. Canonical Session, PushSubscription, JobsService and shared UI only. Session activity throttle five minutes. Backup scheduling and retention remain future work after storage selection.

## Review Focus
Cross-account session/subscription access; revoked live connections; retry delivery after logout; service-worker private-data caching; corrupted or mis-targeted restore.

## Task 1: Sessions and live authentication (root)
Files: auth/session-management.service.ts and spec, auth controller/decorators/guard/module, collaboration gateway, notifications stream controller/service.
Interfaces: request.currentSessionId: string; GET /auth/sessions -> session array; DELETE /auth/sessions/:id -> {revoked:boolean}; POST /auth/sessions/logout-others -> {revoked:number}. Expose CurrentSession decorator returning session id. Session userAgent labels handled frontend.
- [x] Add ownership, current-session preservation and expiry tests; observe failure.
- [x] Implement transactional revocation/audit and five-minute conditional activity update.
- [x] Revalidate existing SSE and sockets and stop revoked connections; test.
- [x] Run focused backend checks.

## Task 2: PWA and frontend settings (frontend worker)
Files: app/manifest.ts, app/offline/page.tsx, app/layout.tsx, components/pwa-provider.tsx, public/push-worker.js and icons, account-settings.tsx, app/workspace/settings/account/page.tsx, workspace-shell navigation; tests.
Consumes session endpoints above; push endpoints in spec. Produces installable manifest, safe offline fallback and account settings. Do not change backend.
- [x] Add meaningful settings/worker tests and observe failure.
- [x] Implement settings with shared controls, session actions, native loading, push enable/disable/test, install and update UX.
- [x] Generate icons from existing branding; register one worker globally; safe offline navigation only.
- [x] Run frontend production verification and browser checks.

## Task 3: Reliable push (push worker)
Files: collaboration/push.service and controller/DTO, new push module, notification service/module/tests, relevant frontend API contract declarations if necessary.
Consumes CurrentSession decorator from root; root owns schema optional sessionId relation and generates client. Produces validated subscription/test APIs and job-backed inbox push. Worker owns notifications service edits; coordinate root SSE needs.
- [x] Add eligibility, expired endpoint, transient retry, validation and notification dedupe tests; observe failures.
- [x] Implement module reuse and eligible session-bound subscriptions; delivery jobs and safe lock-screen payloads.
- [x] Update all constructor test providers; run backend checks.

## Task 4: Backup & restore interfaces (root/recovery worker)
User steering: keep only interfaces because storage is undecided. Root owns backend backups status module/controller and administrator frontend page/navigation; worker documents provider-neutral recovery contracts. No storage adapter or actual backup/restore integration.
- [x] Define protected GET /backups/status with configured:false, provider:null, canBackup:false, canRestore:false, lastBackup:null, reason:STORAGE_NOT_CONFIGURED.
- [x] Add administrator UI explaining unconfigured storage and disabled create/restore controls.
- [x] Document provider-neutral contracts and future encrypted coordination/isolated verification requirements.
- [x] Verify admin route visibility, disabled actions and production checks.

## Task 5: Integration and review (root)
- [x] Inspect all changes and ownership boundaries; run both production gates and interface checks.
- [x] Check local browser desktop/mobile settings/PWA; audit private cache and revoked connections.
- [x] Fresh independent review, resolve issues and rerun affected checks.
- [x] Deliver exact passing checks and outstanding external activation requirements; no automatic commit.

## Verification evidence
Backend verify:production passed: 37 suites, 211 tests, lint, typecheck, contracts and build. Frontend architecture, lint, typecheck and safety passed; lint retains two existing documents-workspace img warnings. Full frontend tests passed (13 suites, 36 tests); final Webpack production build passed. Logs are in /tmp/amirlab-features-frontend-tests-final.log and /tmp/amirlab-features-webpack-final2.log. Browser fixture checks verified preserved current session after signing out other devices and administrator backup controls disabled; desktop/mobile layouts inspected. Review repaired zero-queued push-test copy and cross-account rebind recovery instructions. Turbopack could not bind its worker port in this sandbox, so the supported Webpack build was used. No real provider push delivery, physical-device installation, hosted schema update, deployment, commit or push was performed.

## Review fixes
Explicit SESSION_INVALID responses now distinguish ended sessions from credential/CSRF validation failures. Session notice updates use one notifying store, including initial login-page session checks. Post-commit chat delivery errors are logged and preserve acknowledgement of the saved message. Push retry errors retain validated HTTP status, allowlisted network code and subscription ID without provider bodies, endpoints or keys. Regression tests cover credential validation, remote session invalidation, initial notice display, post-commit recipient/broadcast/queue failure and safe provider diagnostics.

Review-fix verification passed: backend verify:production (37 suites, 217 tests, typecheck, lint, safety, API/recovery contracts and build); frontend architecture, lint, typecheck, safety, 14 suites/40 tests and Webpack production build. Two pre-existing frontend img lint warnings remain. No deployment or hosted database changes were performed during validation.
