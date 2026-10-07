# AMIRLab VPS deployment

This deployment uses one Ubuntu VPS, native PostgreSQL, systemd for the two
Node processes, and Caddy for HTTPS. PostgreSQL and the Node processes listen
only on localhost; only ports 80 and 443 need to be public.

## 1. DNS and server prerequisites

Create these DNS records, pointing to the VPS address:

```text
amirl.org       A       <VPS_IP>
www.amirl.org   A       <VPS_IP>
api.amirl.org   A       <VPS_IP>
```

On a fresh Ubuntu VPS:

```bash
sudo apt update
sudo apt install -y git curl postgresql postgresql-contrib caddy
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
sudo corepack prepare pnpm@10.34.5 --activate
sudo useradd --system --create-home --shell /usr/sbin/nologin amirl
sudo install -d -o amirl -g amirl -m 0750 /opt/amirl /var/lib/amirl/uploads
```

If UFW is enabled, allow only SSH and web traffic:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

## 2. PostgreSQL

Create a role and database. Use a long random password and use the same value
in `DATABASE_URL`:

```bash
sudo -u postgres createuser --pwprompt amirl
sudo -u postgres createdb --owner=amirl amirl
```

Do not expose PostgreSQL publicly. Ubuntu’s default localhost binding is
suitable for this layout.

## 3. Install the application and secrets

```bash
sudo -u amirl git clone <REPOSITORY_URL> /opt/amirl
cd /opt/amirl
sudo -u amirl pnpm --dir /opt/amirl/backend install --frozen-lockfile
sudo -u amirl pnpm --dir /opt/amirl/frontend install --frozen-lockfile
sudo install -d -o root -g amirl -m 0750 /etc/amirl
sudo install -o root -g amirl -m 0640 backend/deploy/api.env.example /etc/amirl/api.env
sudoedit /etc/amirl/api.env
```

Replace every placeholder in `api.env`. Keep it owned by root with mode 0640.
`DATABASE_URL`,
`FRONTEND_ORIGINS`, SMTP settings, and `UPLOAD_ROOT` are mandatory in
production. The populated file must remain outside Git.

The Prisma commands need the service environment loaded in the shell:

```bash
cd /opt/amirl
set -a; . /etc/amirl/api.env; set +a
sudo -u amirl --preserve-env=DATABASE_URL,UPLOAD_ROOT pnpm --dir /opt/amirl/backend run db:push
```

On an empty first install only, seed the database and create the administrator.
Never run `db:rebuild` on production data because it resets the database:

`db:push` updates the schema and runs the compatibility migrations; it does not
seed records. `db:seed` imports the canonical dataset into an empty application
database and refuses if the checked application tables contain records. It also
replaces the people, document-signature, and document-watermark folders under
`UPLOAD_ROOT`. `db:verify` checks the fresh seed state and is not a production
health check after users have edited or approved records.

The local `db:start`, `db:stop`, `db:status`, and `db:cluster:reset` commands
manage `backend/.postgres`; they do not manage the production PostgreSQL
system service. See the [database command reference](../../README.md#database-commands)
for the complete list.

```bash
sudo -u amirl --preserve-env=DATABASE_URL,UPLOAD_ROOT pnpm --dir /opt/amirl/backend run db:seed
sudo -u amirl --preserve-env=DATABASE_URL pnpm --dir /opt/amirl/backend run admin:create
```

Before seeding production, also export `ADMIN_EMAIL`, `ADMIN_NAME`, and a
unique `ADMIN_PASSWORD` from the protected environment. The seed refuses the
sample password and known placeholder values. It creates no login, reset, CSRF,
or invitation tokens; those are generated only by the corresponding live flow.

## 4. Build

`NEXT_PUBLIC_API_URL` is embedded into the browser bundle at build time. Build
and start the API first, then build the web app. This ordering also prevents
machines with limited memory from compiling both applications at once.

```bash
cd /opt/amirl
sudo -u amirl pnpm --dir /opt/amirl/backend run build
sudo install -o root -g root -m 0644 backend/deploy/amirl-api.service /etc/systemd/system/amirl-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now amirl-api.service
curl --fail http://127.0.0.1:3001/api/health
sudo -u amirl env NEXT_PUBLIC_API_URL=https://api.amirl.org/api pnpm --dir /opt/amirl/frontend run build
```

## 5. Enable systemd and Caddy

```bash
sudo install -o root -g root -m 0644 backend/deploy/amirl-web.service /etc/systemd/system/amirl-web.service
sudo install -o root -g root -m 0644 backend/deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl daemon-reload
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now amirl-web.service caddy
sudo systemctl reload caddy
```

Caddy obtains and renews certificates automatically after DNS resolves. The
service templates proxy Socket.IO WebSockets and keep uploads outside the
repository at `/var/lib/amirl/uploads`.

## 6. Verify and update

```bash
curl --fail https://api.amirl.org/api/health
curl --fail https://amirl.org
sudo systemctl --no-pager --full status amirl-api amirl-web caddy
sudo journalctl -u amirl-api -u amirl-web -n 100 --no-pager
```

For updates, pull fast-forward-only, apply the schema, build the API, restart
and health-check it, then build the web app and restart both services:

```bash
cd /opt/amirl
sudo -u amirl git pull --ff-only
sudo -u amirl pnpm --dir /opt/amirl/backend install --frozen-lockfile
sudo -u amirl pnpm --dir /opt/amirl/frontend install --frozen-lockfile
set -a; . /etc/amirl/api.env; set +a
sudo -u amirl --preserve-env=DATABASE_URL,UPLOAD_ROOT pnpm --dir /opt/amirl/backend run db:push
sudo -u amirl pnpm --dir /opt/amirl/backend run build
sudo systemctl restart amirl-api
curl --fail http://127.0.0.1:3001/api/health
sudo -u amirl env NEXT_PUBLIC_API_URL=https://api.amirl.org/api pnpm --dir /opt/amirl/frontend run build
sudo systemctl restart amirl-web
```

Back up PostgreSQL and uploads together before updates:

```bash
sudo install -d -m 0700 /var/backups/amirl
sudo -u postgres pg_dump --format=custom amirl > /var/backups/amirl/amirl-$(date +%F).dump
sudo tar -C /var/lib/amirl -czf /var/backups/amirl/uploads-$(date +%F).tar.gz uploads
```

The root `docker-compose.yml` is a local-development PostgreSQL helper, not
the production process manager.
