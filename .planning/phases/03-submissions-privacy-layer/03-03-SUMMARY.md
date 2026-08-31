---
plan: "03-03"
status: complete
commit: f17b89d
build: pass
---

# Plan 03-03 Summary — Client Layer (Service + Hook + UI)

## What shipped

- **src/services/submissions.ts**: `submitEntryFn` typed callable wrapper; `uploadSubmissionPhoto` with lazy `heic2any` import (keeps 1.35 MB WASM chunk out of initial bundle), `Array.isArray` guard for burst/Live Photo, `new File([blob],...)` wrap for `browser-image-compression`, `uploadBytes` + `getDownloadURL`.
- **src/firebase/config.ts**: Added `storage` export (`getStorage`), emulator wired at `127.0.0.1:9199` inside existing DEV guard.
- **src/hooks/useEntry.ts**: `useEntry(pairId, entryDate)` — `onSnapshot` on `pairs/{pairId}/entries/{entryDate}`, returns `{ entryDoc, entryLoading }`.
- **src/pages/HomePage.tsx**: Partner card replaced with 3-branch state machine — loading / SubmittedState+partner badge / SubmitForm (photo input, 500-char textarea, upload progress labels, error display).

## Build

TypeScript clean. `heic2any` correctly code-split to async chunk.
