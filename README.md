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
