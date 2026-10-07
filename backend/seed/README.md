# Canonical AMIR Lab seed

`amirl-site.json` is the only public-content rebuild input for the backend.

It is intentionally **schema-shaped**, not a dump of the live HTML. AMIRL's current site represents many person fields as prose/tabs/tables, while this backend stores explicit `Person`, `PersonLink`, `PersonProfileSection`, `Department`, `ResearchItem`, `Paper`, `Project`, `Position`, and `SiteSetting` records.

## Provenance

- Current public roster and organization facts were checked against `https://amirl.org/` on 2026-08-14.
- Detailed profile text, links, profile sections and publication evidence are normalized from the AMIR Lab source material supplied with this project.
- Each person, department, paper and project retains neutral `sourceId` / `sourceUrl` provenance in this JSON. During import these map to the original backend’s `legacySourceId` / `legacyUrl` Prisma fields so existing API consumers remain compatible.
- `assets/people/` contains the preserved original people images supplied with the project. These files are source material only.

## Runtime images

Do not link the source images directly from the application. Seeding processes available originals through Sharp and creates WebP `Asset` files under `storage/peoples/` (or the configured `UPLOAD_ROOT`). These assets are staged on profile review requests; they are not published on imported `Person` records before approval.

Three current people do not have an image in the supplied source set, so they intentionally rebuild with `avatarId = null`.

## Validation

Run these commands from the repository root or `backend/`:

```bash
pnpm run seed:validate
pnpm run db:rebuild
pnpm run db:verify
```

- `seed:validate` checks the JSON structure, references, and avatar source files without accessing the database.
- `db:rebuild` **deletes existing application database data**, imports the canonical seed, and runs `db:verify` automatically. It also starts the private local PostgreSQL server.
- `db:verify` can be run separately to check the fresh import, including pending reviews, draft positions, contributor provenance, and stored avatars. It can fail after normal edits or approvals because it expects the original seed state.

To import into an already prepared empty database, use `db:seed` instead of
`db:rebuild`. It does not reset the schema and refuses if the checked
application tables contain records. It replaces the people, document-signature,
and document-watermark storage folders before importing assets.

See the [database command reference](../../README.md#database-commands) for
schema updates, cluster management, and the Docker workflow.

## Credentials and tokens

The seed creates exactly one active administrator. It requires
`ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_PASSWORD`; it never falls back to a
sample password. Imported people receive pending accounts with no password and
no setup token. Setup, password-reset, session, CSRF, and invitation tokens are
created only by their live flows using cryptographically random values, stored
as hashes, and delivered only when the corresponding action is requested.

For an empty production database, load the API environment, change to the
`backend/` directory, and run the seed once:

```bash
pnpm run db:seed
```

Do not put raw tokens or admin passwords in the seed JSON or commit them to the
repository.

## Normalization decisions

- The public team page supplies current roster/category/affiliation facts; detailed profile tabs are converted into `profileSections` rather than stored as raw HTML.
- Source positions are converted into `Position` records with schema rank/type values and `DRAFT` status. Opening a position requires a manual decision after import.
- The Volunteer Internship Program and the image-only Achievement page are preserved as reviewed `SiteSetting` content (`site.training-programs` and `site.achievement`).
- The older Founder Message page contains role/publication counts that conflict with the newer founder profile. It is retained in source provenance but is **not** allowed to overwrite the newer person record.
- The home page currently shows three "Collaborated Universities" as unlabeled images. No `University` records are invented from those images because the live HTML does not provide reliable names or identifiers.
