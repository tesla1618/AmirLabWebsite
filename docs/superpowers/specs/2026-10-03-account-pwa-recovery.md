# Account devices, PWA, push, and recovery

User approved the preceding read-only design with “do it”. Implement all five features, preserve __agent__, do not commit, push, deploy, restore production, or mutate the hosted database without further instructions.

## Sessions
Reuse Session as the source of truth. Authenticated GET /auth/sessions returns active unexpired owned sessions with id, browser userAgent, ipAddress, createdAt, lastSeenAt, expiresAt, current boolean; never secrets. DELETE /auth/sessions/:id revokes an owned session; POST /auth/sessions/logout-others revokes every owned session except current. Record safe audit events. Bind request.currentSessionId in SessionAuthGuard. Throttle activity writes to five minutes. Revocation applies to HTTP, existing SSE, chat connections and push delivery. Browser labels are approximate; no fingerprinting.

## PWA and account UI
Add a workspace account settings page linked in workspace navigation. It lists sessions with “This session”, individual revoke and all-other revoke, browser push enable/disable/test and installation guidance. Existing shared controls, Tailwind and native loading structures only. Installable manifest /manifest.webmanifest, branded 192/512 icons and Apple icon, standalone start /workspace. Extend /push-worker.js; register globally. Cache only versioned offline fallback/static branding; no private API, HTML, RSC or mutation caching. Show useful offline fallback and update prompts. Validate notification URLs to same-origin workspace paths. Support unsupported/denied permissions and iOS Home Screen guidance.

## Push
Extend existing PushService/web-push and JobsService. Central PushModule may be shared with collaboration and notifications without cycles. Add optional sessionId relation to PushSubscription; old unbound subscriptions are not eligible for delivery. Session ownership passed to subscription endpoints. Delivery eligibility rechecked at send time and for retries. Central inbox notifications enqueue push jobs after database persistence; dedupe per notification, retry transient failures, discard 404/410. Settings controls use GET /collaboration/push/public-key, POST/DELETE /collaboration/push/subscription plus POST /collaboration/push/test. Validate DTO endpoint/key fields and public destination to avoid SSRF. Private key remains backend-only. Generic lock-screen text unless explicitly permitted.

## Backup and restore — interfaces only
User clarified that actual backup storage is undecided and asked to keep only interfaces. Ship an administrator-only Backup & restore screen and protected GET /backups/status contract with configured:false and canBackup/canRestore:false. Create and restore controls remain disabled with clear explanation. Provide provider-neutral storage/capture/restore contract documentation for later implementation. No provider adapter, automated backup schedule, production capture or restore is activated in this change. Daily/30-day encrypted off-host recovery remains proposed future work after provider selection.

## Validation
Strict frontend/backend production checks, meaningful session revocation and ownership tests, push ownership/retry tests, PWA worker navigation/offline tests, backup interface checks. Use Webpack if local Turbopack is sandbox blocked and disclose this.
