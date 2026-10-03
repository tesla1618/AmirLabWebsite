# Backup and recovery integration contract

The backup destination is intentionally undecided. The current product provides an administrator status interface and disabled backup/restore controls until storage is selected. No backup adapter, destination credentials, CLI, scheduler, retention job or restore operation is implemented or enabled.

## Current status interface

Authenticated administrators may read `GET /backups/status`. Before a destination is configured it returns:

```json
{
  "configured": false,
  "provider": null,
  "canBackup": false,
  "canRestore": false,
  "lastBackup": null,
  "reason": "STORAGE_NOT_CONFIGURED"
}
```

This is configuration status, not evidence of existing backups. There are no mutation endpoints. Provider selection and activation require a separate implementation decision.

## Future provider contract

The selected destination adapter should support these operations:

- Publish an immutable encrypted database/file artifact and descriptor. Read it back and validate ciphertext byte length and SHA-256 before publishing an atomic completion marker. Interrupted uploads must never appear as completed backups.
- Fetch a completed artifact and descriptor, validating byte length/checksum before returning it for authenticated decryption and manifest verification.
- List completed artifacts with backup ID and creation time. Operational status must expose newest verified completion and failures without credentials.
- Prune artifacts after a configurable retention period, default 30 days. Remove completion markers before ciphertext and clean abandoned uploads according to the provider's object-lock policy.

The destination must be off-host and separate from live asset storage. The selected integration needs encrypted transport, scoped credentials, authenticated artifact encryption, checksummed versioned manifests, a daily configurable scheduler, monitoring for missed/failed backups and an operator-run upload/download/restore drill. Provider credential fields and scheduling configuration remain pending storage selection. Hosting provider, live asset provider and platform backup entitlement also remain to be verified.

## Capture requirements

A complete backup must include the full PostgreSQL application database and all assets, including orphan files. Database roles, hosting configuration and SMTP/OAuth/VAPID secrets require separate secret-manager recovery. The canonical seed is not an account backup.

Database/file capture must require a deployment-enforced maintenance write freeze for every API instance, job runner and other database/file writer, or a validated immutable/versioned-asset strategy that guarantees consistency. An unchecked boolean or marker is insufficient. The future tooling must refuse unsafe live snapshots, validate Asset references against file checksums and byte sizes, and validate the artifact before publication.

## Restore requirements

Verification must be the default and execute no dump SQL. It must authenticate/decrypt the artifact, reject unsafe archive paths and links, check the entire manifest inventory and validate the database dump format before any target writes.

An applied restore must require an explicit isolated/offline target and acknowledgement, refuse source/production targets and fail closed. Validate target identity independently of credentials and connection aliases. Keep recovery processes stopped and outbound SMTP/push traffic disabled during the drill. Before the target can run, revoke restored sessions and reset/setup/email-change tokens, disable push subscriptions and suppress queued jobs. Validate database records, file integrity and a controlled application smoke check after import.

A failed restore must leave the target offline. Partial disposable targets should be discarded and recreated before retry. Production cutover is a separate operator action; interface availability must never imply approval to restore hosted data.

## Activation prerequisites

After a provider is chosen, implement the adapter, deployment-specific capture freeze, encrypted backup/retention operations and meaningful isolated database/file roundtrip tests. Verify corruption detection, unsafe-target refusal, side-effect suppression and complete application recovery. Configure production credentials and scheduling only after a supervised backup and isolated restore drill succeed. Until then the administrator UI correctly reports storage as unconfigured and keeps backup/restore actions unavailable.
