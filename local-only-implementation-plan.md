# Local-Only Template Editor Implementation Plan

This plan introduces a "local-only" mode that completely bypasses Firebase Auth and Firestore. When skipped, users can capture, save, and apply templates using Figma's `clientStorage`.

## User Review Required

> [!CAUTION]
> As per your rules, **no automated tests will be updated/created** unless explicitly requested. I will only perform code modifications as outlined below.

> [!NOTE]
> Are you okay with adding new message types (`GET_LOCAL_TEMPLATES`, `SAVE_LOCAL_TEMPLATE`, `DELETE_LOCAL_TEMPLATE`) to `src/shared/messages.ts` and handling local templates via `figma.clientStorage`? This keeps local data persistent across different Figma files for the user.

## Proposed Changes

---

### Shared & Messages

#### [MODIFY] `src/shared/messages.ts`
- Add `GET_LOCAL_TEMPLATES`, `SAVE_LOCAL_TEMPLATE`, `DELETE_LOCAL_TEMPLATE` to `PluginMessage` union.
- Add `LOCAL_TEMPLATES_RESULT` and `LOCAL_TEMPLATE_SAVED` to `UIMessage` union.

---

### Plugin Main Thread

#### [MODIFY] `src/plugin/storage.ts`
- Export `getLocalTemplates(): Promise<Template[]>` using `figma.clientStorage`.
- Export `saveLocalTemplate(template: Omit<Template, 'id'>): Promise<Template>` to append to the cached array and save.
- Export `deleteLocalTemplate(id: string): Promise<void>` to cull from the stored array.

#### [MODIFY] `src/plugin/code.ts`
- Add message handlers for `GET_LOCAL_TEMPLATES`, `SAVE_LOCAL_TEMPLATE`, and `DELETE_LOCAL_TEMPLATE`, routing to the new storage functions and posting results back via `postToUI`.

---

### UI Components & State

#### [MODIFY] `src/ui/App.tsx`
- Add an `isLocalMode` boolean state (default `false`).
- Make `currentUser` optional or explicitly `null` when navigating to local mode.
- Update `AuthView` props to accept an `onSkipSignIn` callback that transitions to `template-list` and sets `isLocalMode` to `true`.
- Pass `isLocalMode` (or a mock local user) to `TemplateList` and `SaveDialog`.

#### [MODIFY] `src/ui/views/AuthView.tsx`
- Add a secondary button below the Google Sign-in: `Use Locally (Skip Sign-in)`.
- Clicking this triggers the new `onSkipSignIn` prop.

#### [MODIFY] `src/ui/hooks/useTemplates.ts`
- Update the hook signature to accept a `mode: 'firestore' | 'local'`.
- If `mode === 'local'`, bypass `onSnapshot`. Instead, dispatch `GET_LOCAL_TEMPLATES` to the plugin and listen for `LOCAL_TEMPLATES_RESULT` in `useMessages` (or a local `useEffect` subscribing to UI messages).

#### [MODIFY] `src/ui/views/TemplateList.tsx`
- Update component props to accept `isLocalMode`.
- Pass `mode` to `useTemplates`.
- If `isLocalMode`, bypass `deleteTemplate` (Firebase) and send `DELETE_LOCAL_TEMPLATE` to the plugin thread. Trigger a refresh of the list afterward.
- Hide "creator email" from the TemplateCard if running locally.

#### [MODIFY] `src/ui/views/SaveDialog.tsx`
- If `isLocalMode`, bypass `saveTemplate` (Firebase) and send `SAVE_LOCAL_TEMPLATE` to the plugin thread.

## Verification Plan

### Manual Verification
1. Launch the plugin using `pnpm dev`.
2. Observe the Auth view. Click "Use Locally (Skip Sign-in)".
3. Verify the app navigates to the empty Template List.
4. Capture a new template structure and save. Verify it saves successfully and appears in the list.
5. Apply the local template and ensure it works.
6. Refresh the plugin (close and reopen). Go to local mode and verify the saved template still exists in the local list.
