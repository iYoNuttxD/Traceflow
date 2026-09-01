# design-sync notes — Traceflow

Repo-specific gotchas for future syncs. Read this before re-running the sync.

## Shape and entry

- Traceflow is a **Vite application**, not a published component library: there is
  no `dist/` library build and no Storybook. The sync therefore runs the
  **package shape in entry-override mode** against a hand-written barrel,
  `.design-sync/entry.js`, which re-exports exactly the reusable kit.
  Do **not** let the converter fall back to synth-entry mode (`export * from`
  every `.jsx` under `frontend/src`) — it would drag pages, feature components,
  axios and `@xyflow/react` into the bundle.
- `--entry ./.design-sync/entry.js` makes `PKG_DIR` the **repo root** (the first
  ancestor with a named `package.json`), so every path in the config
  (`srcDir`, `cssEntry`, `docsDir`, `componentSrcMap`) is **repo-root-relative**,
  not `frontend/`-relative.
- `--node-modules ./frontend/node_modules` — that is where `react` lives. The
  repo root has no `node_modules`.
- The build command is the converter itself; there is no `cfg.buildCmd`, because
  there is nothing to pre-build. `npm run build` in `frontend/` builds the *app*
  and produces nothing this sync can consume.
- `entry.js` also re-exports `MemoryRouter` from `react-router`. That is not part
  of the design system — it exists so `cfg.provider` has a router to wrap
  previews in (`Navbar`/`Layout` render `<Link>`). It is a bundle export but not
  a synced component, so it never shows up as a card.

## Component list and grouping

- The component list comes **entirely from `cfg.componentSrcMap`**. There are no
  `.d.ts` files in this repo, so `exportedNames()` returns nothing and, with an
  explicit `--entry`, the src-derivation fallback does not run. **A component
  added to `entry.js` but not to `componentSrcMap` will silently not be synced.**
- Five components (`LoadingState`, `EmptyState`, `ErrorState`, `ForbiddenState`,
  `RequestState`) all live in one file, `AsyncState.jsx`. The fuzzy source-finder
  cannot match those names to that filename — the `componentSrcMap` pins are what
  makes them resolve. Same for `ConfirmProvider` living in `ConfirmDialog.jsx`.
- `cfg.srcDir` is deliberately narrowed to `frontend/src/shared/components`.
  This is **not** where all the components are — it is what makes every
  component's source-derived group come out `general`, which is the precondition
  for the `category:` frontmatter in `.design-sync/docs/*.md` to take effect
  (see `package-build.mjs`, the `uniformNamed` block). Widen it and the groups
  collapse back to `shared/` + `layout/`. The pinned `componentSrcMap` paths
  still resolve outside `srcDir`, so source hashes stay intact for all 12.

## Props contracts

- This is plain JS with no types, so prop extraction yields
  `[key: string]: unknown` for every component. All 12 contracts are
  hand-written in `cfg.dtsPropsFor`, derived from the actual destructuring in
  each source file. **When a component's props change, `dtsPropsFor` must be
  updated by hand** — nothing will warn you.
- `[DTS_REACT] @types/react not found` is expected and harmless here: every
  component's props body is supplied by `dtsPropsFor`, so no extraction happens.
  Installing `@types/react` into `frontend/node_modules` would silence the
  warning and change nothing else.

## Known render warns (triaged — a warn NOT in this list is new)

- `[FONT_MISSING] "Inter"` — **accepted, decided 2026-08-21.** `global.css`
  declares `font-family: Inter, ui-sans-serif, system-ui, …` but the repo ships
  no `@font-face`, no font files, and `frontend/index.html` has no font link:
  the real app has always fallen back to the system UI font. Shipping Inter with
  the design system was declined on purpose, so that designs built in Claude
  Design render in the same font as production. Revisit only together with
  actually loading Inter in the app.

## Repo findings surfaced by the sync (not sync bugs)

- **`.spinner` is undefined.** `AsyncState.jsx`'s `LoadingState` renders
  `<span className="spinner" aria-hidden="true" />`, but no `.spinner` rule
  exists anywhere in `frontend/src/styles/global.css`. The spinner is an
  invisible empty span in production today. Left as-is by the sync.
- **`Navbar`'s signed-in state cannot be previewed.** `useAuth()` reads a context
  whose provider (`AuthProvider`) fires `authApi.me()`/`csrf()` on mount, and
  `AuthContext` itself is module-private, so a session cannot be injected.
  `useAuth()` returns `null` without a provider and `Navbar` guards on
  `auth?.user`, so previews render the **signed-out** variant. That is a real
  state, not a broken render — the signed-in variant is documented in
  `Navbar.md` instead of being shown.

## Preview authoring (what cost time — read before re-authoring)

- **`FormInput` is styled only under `.schedule-form`.** Every `.form-field`
  rule in `global.css` is scoped to that ancestor (lines ~2478-2534). The first
  preview pass rendered it with browser defaults — inline label, bare input —
  and looked broken. Every `FormInput` preview cell now wraps in
  `<form className="schedule-form">`, and the constraint is documented in
  `docs/FormInput.md` and `conventions.md` because the design agent would
  otherwise place the component anywhere and get unstyled output.
- **`.async-state` is a centred flex ROW**, not a column. `EmptyState`'s title
  and description therefore sit side by side, and `ErrorBoundary`'s full-page
  fallback squeezes heading, text and buttons onto one line. This is what the
  app renders — do not "fix" it in the previews. `ErrorBoundary` is set to
  `cardMode: column` so the card gives it full width.
- **`ConfirmProvider` needs `cardMode: single`** (`viewport: 760x460`). The
  dialog is `position: fixed`, so in a normal grid cell it escapes the card.
  The dialog also has no standalone export — it exists only while a
  `useConfirm()` promise is pending, so the preview opens it from a child's
  `useEffect` on mount. That is the only way to render it statically.
- Previews are grounded in real usage: `ProjectsScreen` (Card + list + states),
  `SprintForm`/`MilestoneForm` (FormInput), `MilestoneList`/`SprintList`
  (EmptyState copy). Prefer porting from the pages over inventing.

## More repo findings (not sync bugs)

- **Disabled inputs have no styling.** `global.css` defines
  `.schedule-form .form-field select:disabled` but no matching `input:disabled`
  rule, so a disabled `FormInput` is visually identical to an enabled one. The
  `Disabled` preview cell reproduces this faithfully.
- **`RequestState` and `ForbiddenState` are exported but never used.** The pages
  hand-roll the `loading ? … : error ? … : empty ? …` chain instead
  (`ProjectsScreen`, `RepositoryInfoScreen`). `RequestState` is the intended
  abstraction and is documented as the preferred approach.
- **`ErrorState`'s retry button is unstyled.** The component renders a bare
  `<button type="button">` with no `.button` class, so it gets browser defaults
  wherever it appears.
- **Traceflow has no design tokens.** Zero CSS custom properties, zero `var(--)`
  usage — the whole system is semantic class names with hard-coded hex. Any
  future tokenisation would change `conventions.md` substantially.

## Toolchain

- Playwright + chromium were installed into `.ds-sync/node_modules` (gitignored,
  ~200MB). A fresh clone must re-run `npm i playwright && npx playwright install
  chromium` in `.ds-sync/` before the render check will run.
- Serve the local review page with
  `node .ds-sync/storybook/http-serve.mjs ./ds-bundle` then open
  `/.review.html`.

## Re-sync risks

- `.design-sync/entry.js`, `componentSrcMap` and `dtsPropsFor` are three places
  that must agree. Adding or renaming a shared component requires editing all
  three; nothing cross-checks them.
- `cfg.dtsPropsFor` is a **hand-maintained copy** of prop signatures that live in
  untyped JS. It will silently rot as the components evolve. Re-check it against
  the sources on every sync — that is the single most likely thing to be stale.
- `cfg.srcDir` looks wrong and is not (see above). Do not "fix" it.
- The converter shims `import.meta.env` for IIFE output
  (`lib/common.mjs`, `IIFE_IMPORT_META_DEFINE`), which is what keeps
  `api/http-client.js` — pulled in transitively via `Navbar` →
  `features/auth/index.js` → `authApi` — from throwing at bundle load. If a
  future converter drops that shim, the whole bundle breaks at init, not just
  one preview.
- Toolchain at import time: node v22.18.0, npm 10.9.3, react 19.2.7,
  react-router 8.3.0, playwright + chromium installed into `.ds-sync/`.
- `cfg.overrides` (`ConfirmProvider: single`, `ErrorBoundary: column`) are
  presentation choices tied to how those components render today. If the dialog
  stops being `position: fixed`, or the fallback layout changes, re-check them.
- The 12 authored previews in `.design-sync/previews/` import real app markup
  (`.project-item`, `.status-ativo`, `.schedule-form`). If those class names are
  renamed in `global.css`, the previews keep compiling but render unstyled —
  nothing will fail, so check the contact sheet after any CSS refactor.
- Grades live in the gitignored `.design-sync/.cache/review/`. Cross-machine
  carry-forward comes from the uploaded `_ds_sync.json`, not from git.
