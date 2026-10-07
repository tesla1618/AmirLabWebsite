# VPS public caching

The database and NestJS API stay authoritative. Only public server reads use Next's native tagged fetch cache. HTML is rendered per request from cached public data, avoiding stale static output across restarts. Cache Components remains off; existing components, loading UI, auth and database schema are unchanged.

## Configure production

Caching defaults **off**. Leave Vercel previews at the default; they read fresh public data without the VPS invalidation endpoint.

Create `/etc/amirl/web.env` on the VPS (readable by systemd, protected from other users):

```env
NEXT_PUBLIC_API_URL=https://api.amirl.org/api
NEXT_PUBLIC_SITE_URL=https://amirl.org
NEXT_PUBLIC_SITE_EMAIL=your-existing-site-email
PUBLIC_CACHE_ENABLED=true
PUBLIC_CACHE_TTL_SECONDS=3600
PUBLIC_CACHE_NAMESPACE=amirlab-public-v1
PUBLIC_CACHE_REVALIDATION_SECRET=<one-random-secret-at-least-32-characters>
```

Add to the existing backend `/etc/amirl/api.env`:

```env
PUBLIC_CACHE_REVALIDATION_URL=http://127.0.0.1:3000/api/revalidate
PUBLIC_CACHE_REVALIDATION_SECRET=<the-same-secret>
```

The webhook target comes from server configuration, never a browser payload. It does not follow redirects. Do not prefix secrets with NEXT_PUBLIC_. No Vercel URL is notified.

Use the same frontend settings during **build and start**. Source `web.env` in the protected build environment and pass these variables to the frontend build as the existing runbook passes NEXT_PUBLIC_API_URL. Reinstall the updated `backend/deploy/amirl-web.service`, reload systemd and restart the API and web services after the build. Cache setting changes require rebuilding/restarting; API URL and cached deployment configuration must match the build.

The updated service loads `/etc/amirl/web.env` and allows writes to `.next/cache` for the data cache. Preserve ownership for the `amirl` service user. Do not mount an empty directory over the whole `.next` build.

## Freshness

- Public home/about content, published people and research, departments and universities use the configured TTL (integer 1–604800 seconds; default 3600).
- Stats use the smaller of that TTL and 60 seconds.
- Positions remain uncached because opening/closing dates change visibility without a write.
- TTL expiry is lazy stale-while-revalidate, not an hourly scheduled database refresh. Warm public requests reuse data. The systemd pre-start script clears only this namespace’s tagged public fetch entries on each restart; private entries, build output and image caches remain untouched. Restart/redeploy therefore causes safe cold reads. Run `node --experimental-strip-types scripts/prepare-public-cache.mjs` from frontend before starting if not using the provided service. This startup step requires Node 22.6+ (current local Node is 22.23.1).
- Public writer controllers trigger immediate tag expiry after completion, including failures that may follow partial commits. Draft-only writes can conservatively expire public entries too. Chat, notification reads and unrelated jobs do not expire this cache.
- Source discovery, Scholar/rank recalculation jobs, and deleted-account purges also expire after completion/failure.
- Backend first tries the local web endpoint (3-second timeout). Failure creates an existing durable Job, which uses the worker's existing retry/backoff policy. Final failure is logged and stored as a failed job; TTL is eventual recovery, not a guarantee of seconds-level freshness during outages.
- Revalidation never changes the result of an already committed editor operation. Successful delivery expires the public tag using `revalidateTag(tag, {expire: 0})`; subsequent server requests fetch fresh content. Already-open tabs are not pushed updates automatically.
- API reads time out after five seconds and retain existing finite default/empty/error behavior. An API error opts the rendering request out of prerendering so a transient outage fallback is not stored as static HTML. No outage snapshot has been added.

## Coverage and limits

HTTP mutations in site content, profiles/reviews, research/reviews/positions, project workflows, department/member administration, universities, users, settings and applications and verified/reverted account email changes are covered by the authenticated request pipeline. Guards still run first. The automatic research/Scholar/ranking job types are covered by the durable worker's settled listener.

Manual SQL, seed/rebuild/restore scripts and other out-of-process maintenance bypass the application pipeline. After authorized maintenance, call the local endpoint with the shared bearer secret or restart/rebuild with cleared caches. The current backups controller does not implement restore.

Single `next start` VPS process is supported. Separate processes or replicas do not share native local caches; configure coordinated shared storage or leave caching disabled if scaling out. Caddy config remains unchanged; do not add blanket private HTML caching. Losing cache files affects speed, not authoritative data.

The home page still waits for live positions inside its existing whole-page Suspense boundary. Cache hits do not guarantee a skeleton-free first paint. Every original skeleton and animation is retained.

## Verification

```bash
node frontend/scripts/test-public-cache.mjs
# Backend Jest currently needs Node 24 + --experimental-vm-modules
# for the installed NestJS ESM dependencies; normal app runtime is separate.
cd backend
node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand src/public-cache/public-cache.spec.ts src/jobs/jobs.service.spec.ts src/config/environment.spec.ts
cd ..
pnpm --dir frontend run verify
pnpm --dir frontend run typecheck
```

Before production rollout: test warm read avoidance, authenticated save and automatic publication, both enabled/disabled builds, restart, existing skeleton/layout behavior and matched Lighthouse baseline/after measurements. Hosted admin edits and production performance are separate from isolated test fixtures.
