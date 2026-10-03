# Bugfix: research workflow

Source report: the five correctness findings in the conversation's review of the working tree against `8ffc46bc`, followed by the approved fix suggestions.
Date: 2026-10-03
Mode: applied directly

## Results

1. Accountable-person profile outputs — **Fixed**
   Query published research items directly through either authorship or accountable submission. Return one output per item without creating contributor rows. Normalize duplicate manual paper/dataset entries for accountable people as well as authors. Retain the public-project visibility filter.
2. Contributor mutations strand discovery — **Fixed**
   The parent revision update atomically excludes QUEUED/RUNNING discovery states before claims, links or match reviews write relationships. UI actions are disabled during verification. Documented the parent-lock/lease invariant.
3. Unsupported submitted authors auto-publish — **Fixed**
   Preserve unmatched contributors for manual review, record source-author discrepancies in snapshot metadata, expose a review warning, and block automatic publication until those discrepancies are resolved. Explicit moderator publication remains available after manual verification.
4. Same-name source authors collapse identities — **Fixed**
   Preserve distinct ORCIDs during metadata parsing and use source position when matching synchronized contributors. Repeated names without identifying evidence are not automatically bound. Ambiguous JSON-LD name lookups do not supply an ORCID.
5. Stale research edits and decisions — **Fixed**
   Require viewed revisions for edits, individual review and bulk review. Bulk revisions correspond to IDs by index and must have equal lengths. Preserve the editor's opening snapshot across live updates; conflicts retain the user's draft. Existing transactional revision checks protect the interval after reading.
6. Bulk-review SQL revision type mismatch — **Fixed**
   Authenticated PostgreSQL smoke testing exposed an integer/text comparison in the VALUES table. Cast revision parameters to integer so current bulk decisions succeed.
7. Generic staff ownership and single-reviewer deadlock — **Fixed**
   Added `User.isSystemAccount`. Generic operating accounts cannot be selected as research owners; staff must select a real registered person, while authorized moderators/admins may approve records they entered. Existing canonical imports with unknown owners were cleared to `submittedById = NULL` on Supabase for correction in the review UI.
8. Redundant edit/review coupling and stalled source checks — **Fixed**
   Added change-aware editor saves, owner editing, dirty-form discard confirmation, manual source verification, stale retry recovery, and source evidence timestamps. Cosmetic edits preserve review/publication state; title/URL/DOI/author changes restart verification.

## Verification

- Backend unit suites: 32 suites, 183 tests passed.
- Frontend unit suites: 6 files, 11 tests passed, including live-refresh/stale-edit draft preservation.
- Local authenticated PostgreSQL smoke test: paper/dataset approval; accountable paper/dataset/project visibility; no fabricated authorship; duplicate manual-output normalization; output deduplication; private-project exclusion; discovery mutation guards; stale edit/review/bulk conflicts; successful current bulk publication.
- Hosted Supabase migration `20261003000000_research_system_accounts` applied successfully. Hosted migration status is current and schema diff is empty. A dry-run owner audit found 25 canonical imports with no known owner; the explicit apply pass cleared their generic administrator attribution rather than guessing an owner.
- The project smoke fixture starts published; project approval itself is not exercised by this test.
- Smoke fixtures are UUID-scoped and cleaned up in `finally`. No hosted database is used.
- Both typechecks/lints, both production-safety checks, backend build, backend API/recovery contracts, frontend architecture/workflow checks, seed validation, and whitespace checks passed. Frontend lint retains two pre-existing image warnings.
- Frontend production build compiled and typechecked, then stopped during page-data collection because its production API guard rejects the localhost API URL in `.env.local`. No deployed endpoint was substituted.

## Files changed in this fix pass

- `backend/src/research/research.service.ts`
- `backend/src/research/research.service.spec.ts`
- `backend/src/research/research-profile-sync.service.ts`
- `backend/src/research/research-relationships.service.ts`
- `backend/src/research/research-relationships.service.spec.ts`
- `backend/src/research/research-discovery.service.ts`
- `backend/src/research/research-discovery-queue.spec.ts`
- `backend/src/research/source-metadata.ts`
- `backend/src/research/dto/research.dto.ts`
- `backend/src/research/research.controller.ts`
- `backend/test/research-workflow-smoke.ts`
- `frontend/src/components/research-review-queue.tsx`
- `frontend/src/components/research-review-queue.test.tsx`
- `frontend/src/components/research-connections-panel.tsx`

## Local smoke invocation

Start the backend on port 3001 with the explicit private local `DATABASE_URL` override (127.0.0.1:5433), then run from `backend`:

```sh
pnpm exec tsx test/research-workflow-smoke.ts
```

The test requires that same database override in its environment and refuses non-local database hosts/ports. The normal backend environment may point to a hosted database; do not use it for this smoke test.
