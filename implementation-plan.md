# Figma Page Template Plugin — LLM Implementation Plan

> Structured for Claude Code. Each task targets a single file or function and should be handed to Claude Code as its own coding session.

---

## Progress

| Epic | Status |
|---|---|
| 1 — Project Foundation | ✅ Complete |
| 2 — Auth & Org | ✅ Complete |
| 3 — Template Core | ✅ Complete |
| 4 — Cover Page | ✅ Complete |
| 5 — Export / Import & Polish | In Progress (Sprint 5.1 ✅, Sprint 5.2 ✅) |
| 6 — Testing | ✅ Complete |

> **Notes on deviations from plan:**
> - `@firebase` path alias renamed to `@backend` — conflicts with Firebase SDK's own `@firebase/*` npm scope
> - Build system is esbuild (not Vite) — `create-figma-plugin` v4 uses esbuild for both main and UI bundles; `import.meta.env` is injected via esbuild `define` in `build-figma-plugin.ui.js`
> - `moduleResolution` set to `"Bundler"` (overrides base tsconfig) — required for Firebase v11 subpath exports
> - Firebase emulator tests require Java; run `brew install --cask temurin` then `firebase emulators:start --only firestore && pnpm test`

---

## How to use this plan

Work through sprints in order — each one produces a working vertical slice before moving on. Tasks within a sprint can generally be completed in sequence as individual Claude Code sessions.

**Conventions:**
- `[FILE]` — the single file or function the task targets
- `[CONTEXT]` — what Claude Code needs to know going in
- `[OUTPUT]` — what done looks like

---

## Epic 1 — Project Foundation ✅

**Goal:** A compilable Figma plugin skeleton with typed message bus, strict TypeScript, and Firebase initialized. Nothing functional — just a base that opens in Figma and compiles clean.

---

### Sprint 1.1 — Repo & Shared Contracts ✅

#### Task 1.1.1 ✅ — Initialize plugin with create-figma-plugin
- `[FILE]` `package.json`, `vite.config.ts`, `tsconfig.json`
- `[CONTEXT]` Use `create-figma-plugin` with the React + TypeScript template. Enable strict mode. Configure path aliases: `@plugin`, `@ui`, `@shared`, `@firebase`.
- `[OUTPUT]` `pnpm dev` compiles without errors and the plugin opens in Figma desktop.

#### Task 1.1.2 ✅ — Configure manifest.json
- `[FILE]` `manifest.json`
- `[CONTEXT]` Plugin name: "Page Templates". Requires `"network"` permission for Firebase SDK and Figma REST API calls from the iframe. Placeholder icon path.
- `[OUTPUT]` Manifest is valid, plugin loads in Figma without permission errors.

#### Task 1.1.3 ✅ — Define shared types
- `[FILE]` `src/shared/types.ts`
- `[CONTEXT]` Define and export: `Template`, `TemplatePage`, `TemplateSection`, `CoverLibrary`, `CoverConfig`, `TextLayerOverride`, `OrgUser`. JSDoc on every field.
- `[OUTPUT]` All other files can import from `@shared/types` with no circular deps.

#### Task 1.1.4 ✅ — Define the message bus
- `[FILE]` `src/shared/messages.ts`
- `[CONTEXT]` Discriminated union `PluginMessage` (UI→plugin): `CAPTURE_STRUCTURE`, `APPLY_TEMPLATE`, `PLACE_COVER`, `GET_TEXT_LAYERS`, `SET_OVERRIDES`. Discriminated union `UIMessage` (plugin→UI): `STRUCTURE_CAPTURED`, `TEMPLATE_APPLIED`, `COVER_PLACED`, `TEXT_LAYERS_RESULT`, `ERROR`. Each variant is a typed object with a `type` field and payload.
- `[OUTPUT]` Both `code.ts` and UI components import message types with full type safety.

---

### Sprint 1.2 — Firebase Setup ✅

#### Task 1.2.1 ✅ — Firebase app initialization
- `[FILE]` `src/firebase/config.ts`
- `[CONTEXT]` Initialize Firebase app from Vite env vars (`import.meta.env.VITE_*`). Export the `app` singleton. Add `.env.example` listing all required keys.
- `[OUTPUT]` App initializes once; no duplicate app errors on hot reload.

#### Task 1.2.2 ✅ — Firestore and Auth instances
- `[FILE]` `src/firebase/db.ts`, `src/firebase/auth.ts`
- `[CONTEXT]` `db.ts` exports Firestore instance with `enableIndexedDbPersistence` for offline support. `auth.ts` exports the Auth instance and a configured `GoogleAuthProvider`.
- `[OUTPUT]` Both modules export instances; offline persistence enabled without throwing on multiple tabs.

#### Task 1.2.3 ✅ — Firebase Storage upload helper
- `[FILE]` `src/firebase/storage.ts`
- `[CONTEXT]` Export `uploadCoverImage(orgId, templateId, bytes: Uint8Array): Promise<string>`. Uploads to `covers/{orgId}/{templateId}`, returns download URL. Typed error handling.
- `[OUTPUT]` Function uploads and returns a usable URL; throws a typed error on failure.

---

### Sprint 1.3 — Plugin Main Thread Shell ✅

#### Task 1.3.1 ✅ — code.ts message dispatcher
- `[FILE]` `src/plugin/code.ts`
- `[CONTEXT]` Set up `figma.ui.onmessage` with a switch on `PluginMessage.type`. Each case calls a stub handler function (not yet implemented). Show the UI iframe at a fixed size on `figma.showUI`.
- `[OUTPUT]` Plugin opens a blank UI, receives messages without runtime errors, unknown message types log a warning.

#### Task 1.3.2 ✅ — UI App shell
- `[FILE]` `src/ui/App.tsx`
- `[CONTEXT]` Single root component. Renders a placeholder `<div>` for now. Imports and re-exports the `sendMessage` helper that wraps `parent.postMessage`. Sets up `window.onmessage` to receive `UIMessage` from `code.ts`.
- `[OUTPUT]` UI iframe renders, sends a `TEST` message on mount, `code.ts` logs receipt.

---

## Epic 2 — Auth & Org ✅

**Goal:** A user can sign in with Google inside the plugin, get auto-assigned to an org by email domain, and stay signed in across plugin opens. The org document is created in Firestore on first sign-in for a domain.

---

### Sprint 2.1 — Sign-in Flow ✅

#### Task 2.1.1 ✅ — Google sign-in function
- `[FILE]` `src/firebase/auth.ts`
- `[CONTEXT]` Add `signInWithGoogle(): Promise<OrgUser>`. Uses `signInWithPopup`. Extracts email domain, derives `orgId` as `'org_' + domain.replace(/\./g, '_')`. Returns a typed `OrgUser`. Falls back to `signInWithRedirect` if popup is blocked.
- `[OUTPUT]` Function resolves to `OrgUser` with `uid`, `email`, `orgId`, `displayName`.

#### Task 2.1.2 ✅ — Org bootstrap on first sign-in
- `[FILE]` `src/firebase/db.ts`
- `[CONTEXT]` Add `bootstrapOrg(orgId: string, domain: string): Promise<void>`. Uses `setDoc` with `{ merge: true }` so it's safe to call on every sign-in. Creates `orgs/{orgId}` with `name`, `domain`, `createdAt` only if it doesn't exist.
- `[OUTPUT]` First sign-in creates the org doc. Subsequent sign-ins from same domain are no-ops.

#### Task 2.1.3 ✅ — User record upsert
- `[FILE]` `src/firebase/db.ts`
- `[CONTEXT]` Add `upsertUser(user: OrgUser): Promise<void>`. Writes to `users/{uid}` with `merge: true`. Updates `email`, `orgId`, `displayName`, `lastSeenAt`.
- `[OUTPUT]` User doc exists in Firestore after sign-in; re-running updates `lastSeenAt` only.

#### Task 2.1.4 ✅ — Auth token cache in clientStorage
- `[FILE]` `src/plugin/storage.ts`
- `[CONTEXT]` Export `cacheAuthToken(token: string): Promise<void>` and `getCachedAuthToken(): Promise<string | null>` using `figma.clientStorage`. Token is the Firebase ID token. TTL check: discard if older than 55 minutes.
- `[OUTPUT]` Token survives plugin close/reopen; expired tokens return null.

#### Task 2.1.5 ✅ — Auth view component
- `[FILE]` `src/ui/views/AuthView.tsx`
- `[CONTEXT]` Renders a "Sign in with Google" button. On click, calls `signInWithGoogle()`, then `bootstrapOrg()`, `upsertUser()`, caches token, transitions app to `TemplateList` view. Shows a spinner during sign-in. Shows an error message on failure.
- `[OUTPUT]` Full sign-in flow completes, org doc exists in Firestore, user lands on (stub) template list.

---

### Sprint 2.2 — Firestore Security Rules ✅

#### Task 2.2.1 ✅ — Write security rules
- `[FILE]` `firestore.rules`
- `[CONTEXT]` Rules must enforce: users can only read/write templates in their own org (derived from verified token email domain). Users can only delete templates they created (`createdBy == request.auth.uid`). Unauthenticated access is fully blocked. Define a `belongsToOrg(orgId)` helper function inside the rules file.
- `[OUTPUT]` Rules file is valid and deployable with `firebase deploy --only firestore:rules`.

#### Task 2.2.2 ✅ — Security rules emulator tests
- `[FILE]` `tests/firestore.rules.test.ts`
- `[CONTEXT]` Use `@firebase/rules-unit-testing`. Write tests for: authenticated user reads own org templates (allow), authenticated user reads different org templates (deny), unauthenticated read (deny), user deletes own template (allow), user deletes another user's template (deny).
- `[OUTPUT]` All 5 tests pass against the Firebase emulator.

---

## Epic 3 — Template Core ✅

**Goal:** A user can capture the current Figma file's page and section structure, save it to Firestore, see all org templates in a live-updating list, and apply a template to the current file.

---

### Sprint 3.1 — Capture & Save ✅

#### Task 3.1.1 ✅ — capture.ts — serialize page structure
- `[FILE]` `src/plugin/capture.ts`
- `[CONTEXT]` Export `captureStructure(): TemplatePage[]`. Iterates `figma.root.children` (pages). For each page, filters top-level children to `FrameNode` only and maps to `TemplateSection` with `name`, `x`, `y`, `width`, `height`. Skips non-frame nodes silently.
- `[OUTPUT]` Returns a clean `TemplatePage[]` for any open Figma file.

#### Task 3.1.2 ✅ — Handle CAPTURE_STRUCTURE message in code.ts
- `[FILE]` `src/plugin/code.ts`
- `[CONTEXT]` Wire the `CAPTURE_STRUCTURE` case to call `captureStructure()` and post a `STRUCTURE_CAPTURED` UIMessage back with the result.
- `[OUTPUT]` UI receives a populated `TemplatePage[]` after sending `CAPTURE_STRUCTURE`.

#### Task 3.1.3 ✅ — saveTemplate Firestore helper
- `[FILE]` `src/firebase/db.ts`
- `[CONTEXT]` Export `saveTemplate(orgId: string, template: Omit<Template, 'id'>): Promise<string>`. Uses `addDoc` on `orgs/{orgId}/templates`. Returns the new document ID. Sets `createdAt` and `updatedAt` server timestamps.
- `[OUTPUT]` Template doc appears in Firestore after call; returns the new ID.

#### Task 3.1.4 ✅ — Save dialog component
- `[FILE]` `src/ui/views/SaveDialog.tsx`
- `[CONTEXT]` Form with `name` (required), `description` (optional), `coverLibrary.fileUrl` (optional). On open, sends `CAPTURE_STRUCTURE` to `code.ts` and displays a live preview list of detected pages and sections. On submit, calls `saveTemplate`. Validates name is non-empty before enabling submit.
- `[OUTPUT]` User fills form, submits, template appears in Firestore with correct structure.

---

### Sprint 3.2 — Template List ✅

#### Task 3.2.1 ✅ — useTemplates realtime hook
- `[FILE]` `src/ui/hooks/useTemplates.ts`
- `[CONTEXT]` Export `useTemplates(orgId: string)`. Sets up an `onSnapshot` listener on `orgs/{orgId}/templates` ordered by `updatedAt desc`. Returns `{ templates, loading, error }`. Cleans up listener on unmount. Caches last result in `clientStorage` as offline fallback via a `syncToLocalCache` side-effect.
- `[OUTPUT]` Hook returns live-updating template list; updating a doc in Firestore console reflects in the UI within 1 second.

#### Task 3.2.2 ✅ — TemplateCard component
- `[FILE]` `src/ui/components/TemplateCard.tsx`
- `[CONTEXT]` Displays: template name, description (truncated), page count, section count, creator email, relative timestamp. Action buttons: Apply, Delete (only if `createdBy === currentUser.uid`). Delete shows an inline confirmation before firing. Accepts `onApply` and `onDelete` callbacks as props.
- `[OUTPUT]` Card renders correctly for own and others' templates; delete button absent for others' templates.

#### Task 3.2.3 ✅ — TemplateList view
- `[FILE]` `src/ui/views/TemplateList.tsx`
- `[CONTEXT]` Uses `useTemplates`. Renders a list of `TemplateCard` components. Includes a search input that filters by name client-side. Shows a loading skeleton while `loading` is true. Shows an empty state with a "Save your first template" CTA when list is empty. "New Template" button transitions to `SaveDialog`.
- `[OUTPUT]` List renders, filters correctly, updates in real time.

#### Task 3.2.4 ✅ — deleteTemplate Firestore helper
- `[FILE]` `src/firebase/db.ts`
- `[CONTEXT]` Export `deleteTemplate(orgId: string, templateId: string): Promise<void>`. Uses `deleteDoc`. Security rules enforce ownership — the function doesn't need to check.
- `[OUTPUT]` Template is removed from Firestore and disappears from the list in real time.

---

### Sprint 3.3 — Apply Template ✅

#### Task 3.3.1 ✅ — apply.ts — recreate page structure
- `[FILE]` `src/plugin/apply.ts`
- `[CONTEXT]` Export `applyTemplate(pages: TemplatePage[]): void`. For each page in the template, check if a page with that name already exists in `figma.root.children` — skip if so, create otherwise. For each section, create a `FrameNode` with stored `name`, `x`, `y`, `width`, `height` and append to the page. Does not touch the Cover page.
- `[OUTPUT]` Running against an empty file recreates all pages and frames exactly.

#### Task 3.3.2 ✅ — Handle APPLY_TEMPLATE message in code.ts
- `[FILE]` `src/plugin/code.ts`
- `[CONTEXT]` Wire `APPLY_TEMPLATE` case to call `applyTemplate(message.pages)`. Post `TEMPLATE_APPLIED` on success, `ERROR` with message on failure.
- `[OUTPUT]` Sending `APPLY_TEMPLATE` from UI creates the correct structure in Figma.

#### Task 3.3.3 ✅ — Apply confirmation screen
- `[FILE]` `src/ui/views/ApplyConfirm.tsx`
- `[CONTEXT]` Shows a summary of pages and section counts from the selected template. "Apply" button sends `APPLY_TEMPLATE` to `code.ts`. Shows a spinner while in-flight. Shows success message with a "Done" button on `TEMPLATE_APPLIED`. Shows error message on `ERROR`. Warn if the current file already has pages matching the template.
- `[OUTPUT]` Full apply flow completes end-to-end with correct UI states.

---

## Epic 4 — Cover Page

**Goal:** When applying a template, the plugin creates a "Cover" page, lets the user pick a component from a linked Figma library, edits text fields, and optionally swaps a cover image.

**Recommendation updates:**
- Treat PAT entry as a first-class UX flow: explain local-only storage, provide a clear "forget token" action, and surface permission/publish failures immediately.
- Strengthen error handling for component import and font loading early in this epic so failures are visible (not silent no-ops).
- Add lightweight logging (console + UI toast) for `PLACE_COVER` and override steps to help debug library access issues.

---

### Sprint 4.1 — Library Linking & Component Picker

#### Task 4.1.1 ✅ — Parse Figma file URL to key
- `[FILE]` `src/shared/utils.ts`
- `[CONTEXT]` Export `parseFigmaFileKey(url: string): string | null`. Handles both `figma.com/file/:key/...` and `figma.com/design/:key/...` URL formats. Returns `null` for invalid input.
- `[OUTPUT]` Unit-tested against 4+ URL formats including invalid inputs.

#### Task 4.1.2 ✅ — useFigmaLibrary hook
- `[FILE]` `src/ui/hooks/useFigmaLibrary.ts`
- `[CONTEXT]` Export `useFigmaLibrary(fileKey: string | null, pat: string | null)`. Calls `GET https://api.figma.com/v1/files/:key/components` with `X-Figma-Token` header when both args are non-null. Returns `{ components, loading, error }`. Caches result in `clientStorage` keyed by `fileKey`. Returns cached result immediately while re-fetching.
- `[OUTPUT]` Hook returns component list; second call for same key returns from cache instantly.

#### Task 4.1.3 ✅ — PAT storage helper
- `[FILE]` `src/plugin/storage.ts`
- `[CONTEXT]` Add `savePAT(pat: string): Promise<void>` and `getPAT(): Promise<string | null>` using `figma.clientStorage`. PAT is never sent to Firebase or included in any Firestore write.
- `[OUTPUT]` PAT survives plugin close/reopen; confirmed absent from all Firestore writes.

#### Task 4.1.4 ✅ — ComponentPicker component
- `[FILE]` `src/ui/components/ComponentPicker.tsx`
- `[CONTEXT]` Accepts `components[]` and `onSelect(componentKey: string)`. Renders a grid of thumbnail images with component names. Includes a search input filtering by name. Shows a loading skeleton. Shows an empty state if no components found. Highlights the currently selected component.
- `[OUTPUT]` User can search, browse, and select a component; `onSelect` fires with the correct key.

#### Task 4.1.5 ✅ — CoverSetup view
- `[FILE]` `src/ui/views/CoverSetup.tsx`
- `[CONTEXT]` Step 1: text input for Figma file URL, text input for PAT (password type), "Load Library" button that calls `useFigmaLibrary`. Step 2 (after load): renders `ComponentPicker`. Step 3 (after selection): renders `CoverFieldEditor` (stub for now). "Skip Cover" button bypasses the whole flow. Saves PAT via storage helper on successful load.
- `[OUTPUT]` User can paste a URL and PAT, load components, and select one.

---

### Sprint 4.2 — Cover Placement & Overrides

#### Task 4.2.1 ✅ — cover.ts — create Cover page
- `[FILE]` `src/plugin/cover.ts`
- `[CONTEXT]` Export `createCoverPage(): PageNode`. Checks if a page named `"Cover"` already exists — if so, returns it. Otherwise creates a new page, names it `"Cover"`, inserts at index 0 with `figma.root.insertChild(0, page)`. Returns the page node.
- `[OUTPUT]` Cover page is always first in the file; calling twice is idempotent.

#### Task 4.2.2 ✅ — cover.ts — place component instance
- `[FILE]` `src/plugin/cover.ts`
- `[CONTEXT]` Export `placeCoverComponent(page: PageNode, componentKey: string): Promise<InstanceNode>`. Calls `figma.importComponentByKeyAsync(componentKey)`. Creates an instance, appends to `page`, centers it. Returns the instance. Throws a typed error if import fails (e.g. component not in published library).
- `[OUTPUT]` Component instance appears centered on the Cover page.

#### Task 4.2.3 ✅ — cover.ts — get text layers
- `[FILE]` `src/plugin/cover.ts`
- `[CONTEXT]` Export `getTextLayers(instance: InstanceNode): TextLayerOverride[]`. Traverses all descendants, collects `TextNode` items. Returns array of `{ nodeId, layerName, currentValue }`.
- `[OUTPUT]` Returns correct text layer list for any component instance.

#### Task 4.2.4 ✅ — cover.ts — apply text overrides
- `[FILE]` `src/plugin/cover.ts`
- `[CONTEXT]` Export `applyTextOverrides(instance: InstanceNode, overrides: TextLayerOverride[]): Promise<void>`. For each override, finds node by ID, calls `figma.loadFontAsync` for its `fontName`, sets `node.characters`. Skips nodes not found without throwing.
- `[OUTPUT]` Text layers update correctly; missing node IDs are skipped gracefully.

#### Task 4.2.5 ✅ — cover.ts — swap cover image
- `[FILE]` `src/plugin/cover.ts`
- `[CONTEXT]` Export `swapCoverImage(instance: InstanceNode, imageBytes: Uint8Array): void`. Finds the first descendant `RectangleNode` or `FrameNode` whose name matches `"Cover Image"` (case-insensitive). Creates image with `figma.createImage(imageBytes)`, sets `fills` to a single `IMAGE` fill with `scaleMode: 'FILL'`. No-op if layer not found.
- `[OUTPUT]` Image fill updates on the correct layer; missing layer is a silent no-op.

#### Task 4.2.6 ✅ — Wire cover messages in code.ts
- `[FILE]` `src/plugin/code.ts`
- `[CONTEXT]` Wire `PLACE_COVER` → `createCoverPage()` then `placeCoverComponent()` then `getTextLayers()`, post `TEXT_LAYERS_RESULT`. Wire `SET_OVERRIDES` → `applyTextOverrides()` + optional `swapCoverImage()`, post `COVER_PLACED`. Wire `GET_TEXT_LAYERS` → `getTextLayers()`, post `TEXT_LAYERS_RESULT`.
- `[OUTPUT]` Full cover placement and override flow works end-to-end via messages.

#### Task 4.2.7 ✅ — CoverFieldEditor component
- `[FILE]` `src/ui/components/CoverFieldEditor.tsx`
- `[CONTEXT]` Accepts `layers: TextLayerOverride[]` and `onSubmit(overrides, imageFile?)`. Renders one text input per layer, labelled with `layerName`, pre-filled with `currentValue`. Optional image upload input (shown only if a layer named `"Cover Image"` is in the list). "Apply" button calls `onSubmit`. "Skip" button calls `onSubmit` with empty overrides.
- `[OUTPUT]` Form renders correctly for 0–10 text layers; submit fires with correct payload.

---

## Epic 5 — Export / Import & Polish

**Goal:** Templates can be exported as JSON and re-imported. The plugin handles all error states gracefully. The UI is accessible and keyboard-navigable.

**Recommendation updates:**
- Add a `schemaVersion` field to serialized templates and handle it in `validateTemplateJSON` to enable future migrations without breaking imports.
- Define explicit cache invalidation for the offline template list (e.g., TTL or version bump) to avoid stale UI.

---

### Sprint 5.1 — Export & Import

#### Task 5.1.1 ✅ — Template serializer
- `[FILE]` `src/shared/utils.ts`
- `[CONTEXT]` Export `serializeTemplate(template: Template): string`. Produces a JSON string. Strips `id`, `createdBy`, `createdByEmail`, `createdAt`, `updatedAt` — these are re-generated on import. Strips `coverLibrary.fileUrl` but keeps `coverLibrary.fileKey` for reference. Does not include any auth tokens.
- `[OUTPUT]` Output JSON contains no sensitive or environment-specific fields.

#### Task 5.1.2 ✅ — Template validator
- `[FILE]` `src/shared/utils.ts`
- `[CONTEXT]` Export `validateTemplateJSON(json: unknown): Template | null`. Checks for required fields: `name` (string), `pages` (array of objects with `name` and `sections`). Returns `null` for any schema violation instead of throwing.
- `[OUTPUT]` Returns valid `Template` for correct JSON, `null` for all malformed inputs.

#### Task 5.1.3 ✅ — Export button in TemplateCard
- `[FILE]` `src/ui/components/TemplateCard.tsx`
- `[CONTEXT]` Add an Export button. On click, calls `serializeTemplate`, creates a `Blob`, triggers a download via a temporary anchor element with `download="template-name.json"`.
- `[OUTPUT]` Clicking export downloads a valid JSON file named after the template.

#### Task 5.1.4 ✅ — Import flow in TemplateList
- `[FILE]` `src/ui/views/TemplateList.tsx`
- `[CONTEXT]` Add an "Import JSON" button. Opens a hidden `<input type="file" accept=".json">`. On file selection, reads content, calls `validateTemplateJSON`. If valid, calls `saveTemplate` to write to Firestore under current org. Shows success/error toast. If invalid, shows specific error message.
- `[OUTPUT]` Valid JSON imports and appears in list; invalid JSON shows a clear error without crashing.

---

### Sprint 5.2 — Error Handling & Edge Cases

**Notes:** Added a lightweight toast system (`ToastContainer` + `pushToast`) and a centralized `useMessages` hook to surface `ERROR` messages consistently.

#### Task 5.2.1 ✅ — Global error boundary
- `[FILE]` `src/ui/components/ErrorBoundary.tsx`
- `[CONTEXT]` React class component error boundary. Catches render errors and displays a plain "Something went wrong — please restart the plugin" message with a reload button that calls `parent.postMessage({ type: 'RELOAD' })`.
- `[OUTPUT]` Render errors show the fallback UI instead of a blank plugin.

#### Task 5.2.2 ✅ — ERROR message handler in UI
- `[FILE]` `src/ui/hooks/useMessages.ts`
- `[CONTEXT]` Extend the `UIMessage` handler to catch `ERROR` messages from `code.ts`. Map known error codes to human-readable strings: `COMPONENT_NOT_PUBLISHED`, `FONT_LOAD_FAILED`, `PAGE_EXISTS`, `APPLY_FAILED`. Display via a toast notification component. Unknown error codes show a generic message.
- `[OUTPUT]` Every `ERROR` message from `code.ts` results in a visible, readable notification.

#### Task 5.2.3 ✅ — Auth token refresh
- `[FILE]` `src/firebase/auth.ts`
- `[CONTEXT]` Export `getValidToken(): Promise<string>`. Checks cached token age from `clientStorage`. If older than 55 minutes or absent, calls `currentUser.getIdToken(true)` to force refresh and re-caches. Returns a valid token or throws `AUTH_EXPIRED` if no user is signed in.
- `[OUTPUT]` Long plugin sessions never fail with a 401; expired tokens are transparently refreshed.

---

### Sprint 5.3 — Accessibility & Final Polish

#### Task 5.3.1 — Keyboard navigation audit
- `[FILE]` `src/ui/views/TemplateList.tsx`, `src/ui/views/SaveDialog.tsx`, `src/ui/views/CoverSetup.tsx`
- `[CONTEXT]` Ensure all interactive elements are reachable by Tab. Dialogs trap focus (use a `useFocusTrap` hook). Escape closes dialogs. Enter submits forms. Delete confirmation requires explicit keyboard confirmation.
- `[OUTPUT]` Full plugin flow completable without a mouse.

#### Task 5.3.2 — ARIA labels and roles
- `[FILE]` `src/ui/components/TemplateCard.tsx`, `src/ui/components/ComponentPicker.tsx`, `src/ui/components/CoverFieldEditor.tsx`
- `[CONTEXT]` Add `aria-label` to all icon-only buttons. Add `role="list"` / `role="listitem"` to template and component lists. Add `aria-busy` to loading states. Add `aria-live="polite"` to the toast notification container.
- `[OUTPUT]` No missing label warnings in axe or Figma's accessibility checker.

#### Task 5.3.3 — Loading skeletons
- `[FILE]` `src/ui/components/Skeleton.tsx`
- `[CONTEXT]` Create a reusable `<Skeleton width height />` component using a CSS shimmer animation. Use it in `TemplateList` (while `loading` is true), `ComponentPicker` (while fetching library), and `CoverSetup` (while loading PAT from storage).
- `[OUTPUT]` No layout shift between loading and loaded states in any view.

---

## Epic 6 — Testing

**Goal:** Core logic is covered by unit tests. Security rules are verified by emulator tests. No regressions on apply, cover, or auth flows.

**Recommendation updates:**
- Pull unit tests for `capture.ts` and `apply.ts` forward (as soon as those files are stable) to reduce regression risk while Epic 4 is underway.

---

### Sprint 6.1 — Unit Tests

#### Task 6.1.1 ✅ — Tests for capture.ts
- `[FILE]` `tests/capture.test.ts`
- `[CONTEXT]` Mock `figma.root.children` with a mix of `PageNode` and non-page nodes. Each page has a mix of `FrameNode` and non-frame children. Assert: only frames are captured as sections, non-frame nodes skipped, geometry values are correct.
- `[OUTPUT]` 6+ test cases, all passing.

#### Task 6.1.2 ✅ — Tests for apply.ts
- `[FILE]` `tests/apply.test.ts`
- `[CONTEXT]` Mock `figma.createPage`, `figma.createFrame`, `figma.root`. Test: pages created with correct names, frames created with correct geometry, existing page names are skipped, empty template is a no-op.
- `[OUTPUT]` 6+ test cases, all passing.

#### Task 6.1.3 ✅ — Tests for cover.ts
- `[FILE]` `tests/cover.test.ts`
- `[CONTEXT]` Mock `figma.importComponentByKeyAsync`, `figma.loadFontAsync`, `figma.createImage`. Test: cover page created at index 0, existing Cover page reused, text overrides applied, missing node IDs skipped, image swap targets correct layer, missing image layer is no-op.
- `[OUTPUT]` 8+ test cases, all passing.

#### Task 6.1.4 ✅ — Tests for utils.ts
- `[FILE]` `tests/utils.test.ts`
- `[CONTEXT]` Test `parseFigmaFileKey` against 5+ URL formats. Test `validateTemplateJSON` against valid input, missing `name`, missing `pages`, malformed sections, completely invalid input.
- `[OUTPUT]` 10+ test cases, all passing.

---

### Sprint 6.2 — Security Rules Tests

#### Task 6.2.1 ✅ — Firestore rules emulator suite
- `[FILE]` `tests/firestore.rules.test.ts`
- `[CONTEXT]` Use `@firebase/rules-unit-testing`. Cover: authenticated user reads own org (allow), reads other org (deny), unauthenticated read (deny), creates template in own org (allow), deletes own template (allow), deletes other user's template (deny), updates own template (allow), updates other user's template (deny).
- `[OUTPUT]` 8 tests, all passing against Firebase emulator.

---

## Dependency Order

```
Epic 1 (Foundation)
  └── Epic 2 (Auth & Org)
        └── Epic 3 (Template Core)
              └── Epic 4 (Cover Page)
                    └── Epic 5 (Export / Import & Polish)
                          └── Epic 6 (Testing) ← can run in parallel from Epic 3 onward
```

---

## Task Count Summary

| Epic | Sprints | Tasks |
|---|---|---|
| 1 — Foundation | 3 | 9 |
| 2 — Auth & Org | 2 | 7 |
| 3 — Template Core | 3 | 11 |
| 4 — Cover Page | 2 | 12 |
| 5 — Export / Import & Polish | 3 | 10 |
| 6 — Testing | 2 | 5 |
| **Total** | **15** | **54** |
