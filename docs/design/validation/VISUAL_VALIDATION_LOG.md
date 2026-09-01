# TRACEFLOW Visual Validation Log

## Purpose

This log is the versioned authority for rendered visual-validation evidence. The
[UI Surface Inventory](../UI_SURFACE_INVENTORY.md) records each surface's current status; this log
records what was actually rendered and evaluated at a specific point in time.

`VISUALLY APPROVED` means that the surface passed the manual/rendered matrix stated in its entry. It
does not mean WCAG certification, exhaustive browser certification, or approval of states listed as
limitations. A later material change to layout or interaction requires the corresponding inventory
status to be reconsidered until that changed behavior is rendered again.

Screenshots are optional supporting artifacts, not a prerequisite for an entry. External workspaces,
chat histories, local prototype folders, and ignored files are not canonical evidence. Entries must
not contain credentials, tokens, cookies, personal data, fixture access URLs, or other secrets.

## Validation records

### Authenticated Shell and Theme Foundation

- **Date:** 2026-08-30
- **Scope:** Authenticated shell, expanded/collapsed sidebar, mobile drawer, quick projects, theme
  persistence, and essential keyboard/focus behavior.
- **Surface IDs:** `GLOBAL-AUTHENTICATED-SHELL`, `GLOBAL-SIDEBAR-EXPANDED`,
  `GLOBAL-SIDEBAR-COLLAPSED`, `GLOBAL-MOBILE-DRAWER`, `GLOBAL-QUICK-PROJECTS`,
  `GLOBAL-THEME-CONTROL`.
- **Themes:** Light and Dark.
- **Viewports:** 1440 x 900, 768 x 1024, and 390 x 844.
- **Validation type:** Rendered visual validation, responsive validation, and focused manual keyboard
  validation.
- **Result:** `VISUALLY APPROVED` for the shell and two resolved themes as implemented at that time.
- **Known limitations:** The validation predates the explicit System / Light / Dark preference and the
  skip link added later. The current three-state theme control and changed shell keyboard path remain
  `TECHNICALLY VERIFIED` until consolidated rendered revalidation.

### Projects, Overview, Edit, and Members

- **Date:** 2026-08-30
- **Scope:** Projects grid, Create/Join flows, Project Overview, Edit Project, Members Team and
  Invitations, Access Code, regeneration confirmation, responsive headers, focus transfer, and
  available auxiliary feedback/confirmations.
- **Surface IDs:** `PROJECTS-MAIN`, `PROJECTS-REQUEST-STATES`, `PROJECTS-INVITATION-CARD`,
  `PROJECTS-NEW-CHOOSER-DIALOG`, `PROJECTS-CREATE-DIALOG`, `PROJECTS-JOIN-DIALOG`,
  `PROJECT-OVERVIEW-MAIN`, `PROJECT-OVERVIEW-REQUEST-AND-SYNC`, `PROJECT-EDIT-PAGE`,
  `PROJECT-MEMBERS-PAGE`, `MEMBERS-TEAM-TAB`, `MEMBERS-INVITATIONS-TAB`, `MEMBERS-ACCESS-CODE`,
  `MEMBERS-ACCESS-REGENERATE-CONFIRM`, `PROJECTS-AUXILIARY-FEEDBACK`.
- **Themes:** Light and Dark.
- **Viewports:** 1440 x 900, 768 x 1024 with the sidebar collapsed, 768 x 1024 with the sidebar
  expanded, and 390 x 844.
- **Validation type:** Rendered visual validation, responsive validation, and focused manual keyboard
  validation.
- **Result:** `VISUALLY APPROVED` for the listed surfaces in the recorded matrix.
- **Known limitations:** Rare states that required a real invitation or additional user/ownership
  configuration were not promoted by inference. Members tab semantics and keyboard interaction were
  materially changed later and currently require rendered revalidation.

### Auth and Account Lifecycle

- **Date:** 2026-08-30
- **Scope:** Login, Register, Recovery, available Reset states, Verification, Email Verification
  Banner, Username Setup Banner, Bootstrap Error, `DEACTIVATED`, `DELETION_PENDING`, Email Change
  Confirmation, and Reactivation Confirmation.
- **Surface IDs:** `AUTH-LOGIN-PAGE`, `AUTH-LOGIN-VALIDATION-FEEDBACK`, `AUTH-GITHUB-OAUTH`,
  `AUTH-REGISTER-PAGE`, `AUTH-REGISTER-VALIDATION-FEEDBACK`, `AUTH-RECOVERY-REQUEST`,
  `AUTH-RESET-PASSWORD`, `AUTH-VERIFY-EMAIL`, `AUTH-EMAIL-VERIFICATION-BANNER`,
  `AUTH-USERNAME-SETUP-BANNER`, `AUTH-BOOTSTRAP-ERROR`, `ACCOUNT-RESTRICTED-DEACTIVATED`,
  `ACCOUNT-RESTRICTED-DELETION-PENDING`, `ACCOUNT-EMAIL-CHANGE-CONFIRMATION`,
  `ACCOUNT-REACTIVATION-CONFIRMATION`.
- **Themes:** Light and Dark.
- **Viewports:** 1440 x 900, 768 x 1024 where applicable, and 390 x 844.
- **Validation type:** Rendered visual validation and responsive validation.
- **Result:** `VISUALLY APPROVED` for the listed surfaces and states that were rendered with the local
  test-only fixtures described in the Auth validation runbook.
- **Known limitations:** Transient runtime loading remained `ENVIRONMENT LIMITATION` and was not
  promoted by inference. The Login recovery-link target changed after this record; the current Login
  surface therefore requires Light/Dark rendered revalidation. SMTP delivery and external GitHub
  behavior remain separate operational evidence.

### Settings

- **Date:** 2026-08-31
- **Scope:** Account, Security, Privacy, Integrations, SensitiveActionDialog, Sessions, password UX,
  and responsive Settings navigation. The final pass specifically included the mobile sensitive
  dialog and Security's container-aware responsive reflow.
- **Surface IDs:** `SETTINGS-SHELL`, `SETTINGS-ACCOUNT`, `SETTINGS-SENSITIVE-REAUTH`,
  `SETTINGS-DEACTIVATE-CONFIRM`, `SETTINGS-SECURITY`, `SETTINGS-SESSIONS`,
  `SETTINGS-SESSION-REVOKE-CONFIRM`, `SETTINGS-PRIVACY`, `SETTINGS-DATA-EXPORT`,
  `SETTINGS-DELETION-STATES`, `SETTINGS-DELETION-REQUEST-CONFIRM`,
  `SETTINGS-DELETION-CANCEL-CONFIRM`, `SETTINGS-INTEGRATIONS`, `SETTINGS-GITHUB-IDENTITY`,
  `SETTINGS-GITHUB-IDENTITY-UNLINK-CONFIRM`, `SETTINGS-GITHUB-APP`,
  `SETTINGS-GITHUB-APP-DISCONNECT-CONFIRM`, `SETTINGS-GLOBAL-FEEDBACK`.
- **Themes:** Light and Dark.
- **Viewports:** 1440 x 900, 768 x 1024 with the sidebar collapsed, 768 x 1024 with the sidebar
  expanded, and 390 x 844.
- **Validation type:** Rendered visual validation, responsive validation, and focused manual keyboard
  validation.
- **Result:** `VISUALLY APPROVED` for the listed surfaces in the recorded matrix.
- **Known limitations:** Account partial-save feedback, sensitive-dialog focus/success behavior,
  Integrations cooldown/impact feedback, and route-navigation semantics changed later. Those current
  surfaces remain `TECHNICALLY VERIFIED` until rendered revalidation. Initial fatal-error and loading
  states were not promoted without direct rendered evidence.

## Current revalidation queue

The following materially changed areas require a new rendered record before they can regain or gain
`VISUALLY APPROVED` for their current implementation:

- System / Light / Dark control and live System resolution;
- authenticated-shell skip link and its first-focus path;
- Members tabs, including roving focus and panel associations;
- Account partial-save and Integrations cooldown feedback;
- SensitiveActionDialog busy, error, cancel, Escape, and post-success focus;
- legacy Dark-compatible operational surfaces and Task Details modal layering.
