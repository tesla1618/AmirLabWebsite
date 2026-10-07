# AMIRLab


AMIRLab is a full-stack research-lab platform with a public website and a private workspace for people, publications, datasets, projects, applications, reviews, weekly reports, and lab administration.

## Stack

- Next.js 16 + React 19
- NestJS 11
- Prisma + PostgreSQL
- Tailwind CSS
- Nodemailer / SMTP

## Run locally

Requirements: Node.js 22+, pnpm 10+, and PostgreSQL binaries (`initdb`, `pg_ctl`, `psql`, `createdb`).

Install each application independently from the repository root:

```bash
pnpm --dir backend install
pnpm --dir frontend install
```

Configure local values in `backend/.env`, prepare the database, and start both applications. The root command starts the API first, waits for its health endpoint, and only then starts Next.js:

```bash
pnpm run db:rebuild
pnpm run dev
```

Open `http://localhost:3000`. The API runs at `http://localhost:3001/api`.

The applications can also be started separately:

```bash
pnpm run dev:backend
pnpm run dev:frontend
```

## Database commands

Run the commands below from the repository root with `pnpm run <command>`.
The root scripts forward to the backend, except for the Docker commands.
Database schema, seed, and verification commands use `DATABASE_URL` from the
environment or `backend/.env`. Seeding requires `ADMIN_EMAIL`, `ADMIN_NAME`,
and `ADMIN_PASSWORD` (at least 12 characters, with no placeholder value).

### Local PostgreSQL

These commands manage a private PostgreSQL cluster in `backend/.postgres`,
using installed PostgreSQL binaries rather than Docker or a system service.
They only accept a local host in `DATABASE_URL`.

| Command | Behavior |
| --- | --- |
| `db:start` | Initializes the cluster if needed, starts PostgreSQL, and creates the configured database and login role if missing. Existing data is retained. |
| `db:stop` | Stops the private server and retains its data. |
| `db:status` | Reports whether the private server is running. Returns a nonzero exit code if it is stopped or uninitialized. |
| `db:cluster:reset` | **Deletes the entire private cluster**, including its databases and roles, then initializes and starts a new one. Does not apply the application schema or seed data. |

### Schema and seed data

| Command | Behavior |
| --- | --- |
| `db:generate` | Generates the Prisma client and types from `backend/prisma/schema.prisma`. Does not modify the database. Installation and backend builds also generate the client automatically. |
| `db:push` | Migrates legacy profile entries and account emails, synchronizes the database with the Prisma schema, marks the research administrator as a system account, and regenerates the client. Does not intentionally reset the database; Prisma can reject schema changes that would lose data. |
| `seed:validate` | Validates `backend/seed/amirl-site.json` and checks referenced avatar source files. Prints dataset counts without connecting to PostgreSQL. |
| `db:seed` | Imports the canonical dataset and creates the administrator. Refuses if the checked application tables contain records. Replaces the people, document-signature, and document-watermark folders under `UPLOAD_ROOT` (default: `backend/storage`). Imported profiles, papers, and projects await review; positions start as drafts. |
| `db:verify` | Checks the expected fresh seed state, including record counts, review statuses, contributor provenance, site settings, and avatar files. This is a seed verification command, not a general health check: later edits or approvals can make it fail. |
| `db:rebuild` | Starts private local PostgreSQL, generates the client, **force-resets the application database schema and deletes its data**, seeds it, then verifies the import. Use only when existing development data can be discarded. |

`db:rebuild` is the single command for a complete local rebuild. The former
`db:reset` and `db:setup` aliases were removed because they performed the same
destructive operation.

For first-time local setup or an intentional fresh start:

```bash
pnpm run seed:validate
pnpm run db:rebuild
```

For normal development with existing data:

```bash
pnpm run db:start
pnpm run dev
```

After changing the Prisma schema, use `pnpm run db:push` to update the database
and regenerate the client. Use `db:generate` alone when only the generated
client needs refreshing.

### Docker alternative

| Command | Behavior |
| --- | --- |
| `db:start:docker` | Starts the Compose PostgreSQL service in the background, creating it if needed. Data persists in the `amirl_postgres` volume. |
| `db:stop:docker` | Stops the Compose PostgreSQL service without deleting its volume. |
| `db:logs:docker` | Follows PostgreSQL container logs until interrupted. |

Docker exposes PostgreSQL on port `5433`; the private local server also uses
`5433` by default. Choose one server for that port and set `DATABASE_URL` to
match its credentials and database. `db:rebuild` starts the private server,
so it is not the setup command for Docker. To prepare an empty Docker database:

```bash
pnpm run db:start:docker
pnpm run db:push
pnpm run db:seed
pnpm run db:verify
```

Two additional commands are available only in the backend package:

| Command from the repository root | Behavior |
| --- | --- |
| `pnpm --dir backend run db:seed:if-empty` | Skips seeding if any users exist; otherwise runs the same guarded import as `db:seed`. Requires the administrator environment values even when the import is skipped. Used for deployment bootstrap. |
| `pnpm --dir backend run db:migrate:profile-entry-labels` | Converts legacy profile subsection entries into separate entry records. Already included in `db:push`; normally does not need to be run separately. |

## Deploy to a VPS

For Hostinger VPS deployment on Ubuntu, follow the production runbook in
[`backend/deploy/README.md`](backend/deploy/README.md). It covers PostgreSQL,
DNS, Caddy HTTPS, systemd services, production environment variables, uploads,
updates, and backups.

## Deploy to Fly.io

Fly deploys the API only. The Fly app uses `backend/` as its working directory,
where `fly.toml` and `Dockerfile` live. Keep `DATABASE_URL` as a Fly secret; it
points to the externally hosted PostgreSQL database. Enable Fly auto-deploys
from `main` in the app settings, or deploy manually from the repository root:

```bash
fly deploy ./backend --app "$FLY_API_APP"
```

The Fly release command applies the Prisma schema and seeds an empty database
from the supplied `ADMIN_*` and SMTP environment values. The machine entrypoint
starts the API after release succeeds. Do not create a Fly Postgres app. Deploy
the frontend separately to Vercel with Root Directory `frontend` and
`NEXT_PUBLIC_API_URL=https://<your-fly-app>.fly.dev/api`. Set `DATABASE_URL`, `FRONTEND_ORIGINS`,
`PUBLIC_SITE_URL`, `PUBLIC_SITE_EMAIL`, the `SMTP_*` values, and `ADMIN_EMAIL`,
`ADMIN_NAME`, and `ADMIN_PASSWORD` as Fly secrets; add `STORAGE_*` secrets when
using object storage. Do not put credentials in `fly.toml`, an env file
committed to the repository, or a Docker build argument. The API volume is
required because seeded and uploaded documents are stored under `UPLOAD_ROOT`.

## Browser push notifications

Generate the VAPID configuration in the gitignored `backend/.env`:

```bash
pnpm --dir backend run push:configure
```

The command reuses existing keys and does not print them. Keep
`VAPID_PRIVATE_KEY` backend-only. Configure `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` in the hosted API's secret store as
well, then restart the API. Reuse the same keys across restarts and deployments
so existing browser subscriptions remain valid.

In **Workspace → Settings → Account & devices → Browser notifications**, select
**Enable notifications**, allow browser permission, and select **Send test**.
Enable separately on each device. Hosted push requires HTTPS; on iPhone or iPad,
add AmirLab to the Home Screen and open the installed app first.

## Workspace

- `frontend` — Next.js public site and private workspace
- `backend` — NestJS API, Prisma schema, and PostgreSQL tooling
- `verification` — contracts that span both applications

Backend and frontend are independent pnpm projects with separate lockfiles and install directories. Add dependencies from the owning project:

```bash
pnpm --dir frontend add <package>
pnpm --dir backend add <package>
```

## Verify

Run checks from the repository root:

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run verify
pnpm run verify:production
```

Engineering and repository rules are in [`RULES.md`](RULES.md).
