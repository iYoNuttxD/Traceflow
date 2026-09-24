# TRACEFLOW — PROJECT DELETION RETENTION IMPLEMENTATION REPORT

Date: 2026-09-21  
Branch: `daniel-dev`  
Baseline HEAD: `91c6e6131f19a922de913f3035a81f2ba908f746`  
Result: **PROJECT DELETION + 30-DAY RECOVERY — PASS LOCAL**

## 1. Baseline and scope

The implementation was made directly in the TraceFlow checkout from a clean
working tree. Baseline checks recorded the branch, HEAD, status and
`git diff --check` before changes. No commit, push, merge, rebase, reset or stash was
performed.

The audit covered the Project model and its relations, membership and invitation
authorization, normal and quick project catalogs, GitHub creation/synchronization/
webhooks, private test-evidence storage, audit events, retention jobs and the five
canonical documents listed in the request.

## 2. Schema and incremental migration

`Project` now records `deletedAt`, `deletionScheduledFor`, `deletedById` and the
`deletedBy` relation with `onDelete: SetNull`. `purgeStartedAt` is an internal,
nullable claim timestamp; the incremental follow-up migration
`20260922010000_project_purge_fencing` adds `purgeClaimId` and journal
`claimToken`/`claimedAt` for worker fencing. Indexes cover the active/
deleted boundary and due-deletion scan.

Migration `20260921010000_project_deletion_retention` is additive. It also creates
`ProjectPurgeStorageCleanup`, a durable cleanup journal whose storage keys and purge
keys are unique. The journal deliberately has no Project foreign key: retry evidence
must survive after the Project row has been removed.

The complete migration chain passed on an empty temporary database. A representative
upgrade was exercised by the API integration suite without resetting the development
database. Nullable defaults and indexes are defined by the migration and Prisma
schema.

## 3. Soft deletion and authorization boundary

`DELETE /api/projects/:projectId` is session/CSRF protected and accepts only an
active historical `OWNER`. In one transaction it records an exact `30 * 24h` UTC
deadline, the actor and deletion timestamp, and revokes pending invitations. It does
not alter memberships, roles, children or evidence bytes.

The active-project predicate is centralized in project membership/resource
authorization. Normal project-scoped routes therefore return opaque `404` responses
before membership can grant access. Active lists, quick projects, access codes,
invitations and regular project lookup use the same boundary. Lifecycle routes are
the only explicit bypass and re-authorize against preserved historical membership.

The API distinguishes authenticated insufficient roles (`403`), non-members (`404`),
unauthenticated calls (`401`), CSRF failures and already-deleted conflicts with stable
error codes. No controller-by-controller `deletedAt` patchwork was introduced.

## 4. Repository reservation, synchronization and webhooks

A GitHub repository remains reserved while its Project is recoverable. Discovery
returns a minimal `PROJECT_PENDING_DELETION` state to the historical owner—project ID,
name, deadline and repository identity—and a neutral unavailable state to other
GitHub users. The non-owner response exposes neither recovery nor destructive actions.

Create-from-repository rechecks availability at mutation time. A unique-race is
translated after a fresh lookup instead of silently creating a duplicate. Restore
also verifies that the repository has not become associated with another Project.

Repository sync entrypoints and every paginated importer revalidate the active
Project. Webhook writes are constrained to active Projects. A deletion that races a
running sync stops subsequent pages/writes with a controlled unavailable state;
existing imported artifacts remain intact during the recovery window.

## 5. Restore and permanent deletion

`POST /api/projects/:projectId/restore` is available only to a preserved historical
`OWNER`. It atomically clears all deletion fields and leaves memberships, roles,
children and history untouched. Invitations revoked by the deletion request stay
revoked.

`DELETE /api/projects/:projectId/permanent` requires the exact Project name and the
same owner authorization. Automatic deletion uses the same service after the UTC
deadline. `backend/scripts/process-project-deletions.js` is idempotent, dry-run by
default and is intended for scheduling by cron/CI/infra; `--apply` performs the due
work. No scheduler infrastructure was invented in the application process.

An atomic token claim fences concurrent purge workers. Restore rejects a Project already
claimed for purge, stale claims can be retried with a new token, and repeated purge calls become a
controlled no-op. Explicit repository deletion order covers restrictive test,
execution, defect, task and history relations before the Project row; cascade-backed
relations were audited rather than assumed.

## 6. Evidence storage and partial-failure recovery

Soft deletion never changes evidence files. Permanent deletion first moves each
private evidence object to a deterministic `.purge` staging key. If the database
transaction fails, staged bytes are restored. After database success, staged bytes
are removed and the durable cleanup journal is marked complete.

If final filesystem removal fails after the database commit, the READY journal keeps the
explicit storage key and error for an idempotent retry. Reconciliation handles only
claimable READY entries, never active staging from another worker. Physical deletion and journal
removal are serialized under the journal-row lock. Storage methods accept only validated UUID-based keys and never
use a broad directory or unresolved path. This design does not claim transactionality
between MySQL and the filesystem.

## 7. Audit, privacy and retention

The lifecycle records `PROJECT_DELETE_REQUESTED`, `PROJECT_RESTORED` and
`PROJECT_PURGED` through the audit repository. Metadata is limited to Project ID and
deadline where applicable. The purge event is retained with a nullable Project
relation according to the existing audit policy.

API, authorization, architecture, retention and personal-data documentation now
describe the 30-day window, central access boundary, repository reservation, restore,
manual/automatic purge, storage retry journal and backup limitation. They do not make
an absolute legal-compliance claim.

## 8. Frontend flows

Project settings has a C2 danger zone for owners. Soft deletion uses the shared
confirmation dialog, requires the exact Project name, redirects to `/projects` and
shows the recovery-window feedback. `/projects` has a separate “Projetos excluídos
recentemente” area visible only for recoverable projects owned by the current user.

GitHub creation renders recovery and “start again” actions only for the owner. The
permanent-deletion dialog enumerates requirements, tasks, Sprints, milestones,
comments, effort history, test cases, executions, evidence, defects, imported
artifacts and histories, and requires the exact Project name. A non-owner sees only
neutral guidance.

The shared dialog preserves `aria` semantics, focus trap, Escape behavior and focus
return. The confirmation input receives initial focus; Cancel remains the initial
focus only for dialogs without typed confirmation.

## 9. Automated validation

All commands used Node 22.23.2 with
`NODE_OPTIONS=--no-experimental-webstorage` where applicable.

| Suite / gate                         | Local result                                                              |
| ------------------------------------ | ------------------------------------------------------------------------- |
| Backend focused unit                 | 85 PASS, 3 files                                                          |
| Backend project-deletion API         | 7 PASS                                                                    |
| Backend corrected regression files   | 75 PASS, 3 files                                                          |
| Backend full                         | 1,309 PASS; 5 pre-existing skips, 102 files; 2 files skipped              |
| Backend coverage                     | PASS — 90.90% statements, 82.48% branches, 94.42% functions, 93.37% lines |
| Frontend focused                     | 34 PASS, 3 files                                                          |
| Frontend full                        | 1,208 PASS, 98 files                                                      |
| Frontend coverage                    | PASS — 83.63% statements, 78.17% branches, 78.65% functions, 86.11% lines |
| Empty-database migration             | PASS                                                                      |
| Representative upgrade/API migration | PASS                                                                      |
| Backend/frontend lint                | PASS                                                                      |
| Backend/frontend format              | PASS                                                                      |
| Frontend build                       | PASS                                                                      |
| Architecture                         | PASS                                                                      |
| Secrets                              | PASS                                                                      |
| Dependency audit policy              | PASS                                                                      |
| `git diff --check`                   | PASS                                                                      |

No skip, retry, sleep, timeout increase or relaxed assertion was added. Time behavior
uses injected/explicit timestamps. Integration tests cover role and CSRF matrices,
opaque resource denial, preserved children/memberships/evidence, invitation revocation,
restore, repository conflicts, manual purge, automatic due selection, concurrency,
idempotency and storage compensation.

## 10. Rendered visual QA

The real frontend and backend were rendered in Chrome against the isolated test
schema. Project catalog, recent-deletion card, recovery, danger zone and typed
confirmation passed in Light and Dark at 1440, 1280, 768 and 390px. Measurements
confirmed no horizontal page overflow. The actual recovery action was completed and
observed; temporary visual projects were then removed by exact ID/name checks.

The rare GitHub pending-deletion states used the real frontend components with an
explicit ephemeral HTTP fixture and no persistence: owner warning/actions, strong
permanent-deletion confirmation and neutral non-owner state were rendered in Light/
Dark at the required widths. This is visual evidence, not an integration claim;
backend authorization and lifecycle mutation are covered by the real API tests.

Keyboard checks confirmed Tab/Shift+Tab loop, Enter/exact-name enablement, Escape
closing only the top dialog and focus returning to the trigger. Danger actions use
explicit text and styling, not color alone. The full matrix is also recorded in the
visual validation log.

## 11. Operational notes and remaining risks

- The recurring purge script must be scheduled by deployment infrastructure; this
  repository intentionally does not provide a resident scheduler.
- Backups can outlive the application row according to the separate backup policy;
  purge removes the live database and private evidence storage, not independent
  backup media.
- The first local visual-server attempt set only `NODE_ENV=test`; because Prisma
  consumes `DATABASE_URL` directly, it was stopped immediately after read-only
  catalog/auth checks and a logout. No Project or business-data mutation occurred.
  The validated run explicitly mapped `TEST_DATABASE_URL` to `DATABASE_URL` before
  importing the server. The existing development browser session may have been
  invalidated by that logout.
- Local validation does not substitute for remote CI, deployment scheduler
  configuration, production backup expiry, physical-device QA or a complete WCAG
  audit.

## 12. Closure

The local acceptance matrix is satisfied: recoverable deletion is a Project-level
boundary, only owners can operate the lifecycle, data and bytes remain intact for 30
exact days, repository reuse is safe, permanent deletion is explicit and retryable,
and normal access cannot bypass the deleted Project. Working tree changes remain
uncommitted for review.
