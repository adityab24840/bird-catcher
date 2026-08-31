# Phase 3: Submissions + Privacy Layer - Context

**Gathered:** 2026-08-31
**Status:** Ready for planning
**Note:** Auto discuss-phase (caveman mode, full coverage from requirements + prior phase context)

<domain>
## Phase Boundary

Each authenticated paired user can submit today's entry — a photo and/or text — through the home screen form. The submission is stored privately; the partner cannot read the content until the entry is revealed (Phase 4). Privacy is enforced at the Firestore Security Rules layer, not frontend state. This phase delivers: submission form UI, photo upload to Firebase Storage with client-side HEIC→JPEG conversion and compression, `submitEntry` Cloud Function (validates, writes, updates entry status), Firestore + Storage rules, partner submission-status indicator (submitted vs waiting — no content), and emulator rule tests for all SEC-04 deny/allow scenarios.

Auto-reveal (status → "revealed") is NOT implemented in Phase 3 — that is Phase 4's `revealEntry` Cloud Function. Phase 3's `submitEntry` updates `status: "one_submitted"` and `submittedMembers` but does not transition to "revealed" even if both have submitted.

</domain>

<decisions>
## Implementation Decisions

### D-01: Firestore Data Model
- Entry document path: `pairs/{pairId}/entries/{entryDate}` where `entryDate` is a `YYYY-MM-DD` string in the submitting user's local timezone (passed from client; not security-critical for a private two-person app).
- Entry doc fields: `pairId: string`, `date: string` (YYYY-MM-DD), `status: "pending" | "one_submitted"`, `submittedMembers: string[]` (UIDs who have submitted), `createdAt`, `updatedAt`.
- Submission document path: `pairs/{pairId}/entries/{entryDate}/submissions/{uid}` — subcollection so Firestore rules can deny cross-reads cleanly.
- Submission doc fields: `uid: string`, `photoURL: string | null` (Firebase Storage download URL), `text: string | null`, `submittedAt`.

### D-02: Entry Date Key (SUBM-07)
- Client computes `entryDate` as `new Date().toLocaleDateString('en-CA')` — produces `YYYY-MM-DD` format in device local timezone.
- Sent to `submitEntry` Cloud Function as part of the request payload.
- CF uses this string as the Firestore document ID; does not reinterpret or convert timezone.

### D-03: Photo Upload Flow (SUBM-01)
1. User selects photo via `<input type="file" accept="image/*">`.
2. Client detects HEIC/HEIF MIME type (`image/heic` or `image/heif`) and converts to JPEG using `heic2any` (browser-side, no server round-trip).
3. Client compresses the resulting JPEG/PNG to ≤ 1 MB using `browser-image-compression`.
4. Client uploads compressed file to Firebase Storage at path: `pairs/{pairId}/entries/{entryDate}/{uid}/photo.jpg`.
5. Client calls `getDownloadURL()` to get the CDN URL.
6. Client passes `photoURL` (or `null` if no photo) to `submitEntry` Cloud Function.

### D-04: submitEntry Cloud Function Scope (Phase 3)
- Callable v2 `onCall` function, same `callableOptions` App Check guard as Phase 2.
- Input schema (Zod 4): `{ entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), text: z.string().max(500).nullable(), photoURL: z.string().url().nullable() }` — validated with `.superRefine()` to enforce at-least-one.
- Transaction: (1) read user doc → validate pairId non-null; (2) read entry doc (create if missing, create with `status: "pending"`); (3) check `submittedMembers` does not already include `uid` (idempotent guard per SUBM-04); (4) write `submissions/{uid}` doc; (5) update entry doc: add uid to `submittedMembers`, set `updatedAt`; (6) if `submittedMembers.length === 1` after add → set `status: "one_submitted"`; (7) if `submittedMembers.length === 2` → leave status as "one_submitted" (Phase 4 auto-reveal).
- Returns `{ entryDate, alreadySubmitted: boolean }`.

### D-05: Submission UI Location
- Replace the partner identity card body in `HomePage.tsx` with the submission section for Phase 3.
- `HomePage` state machine (client-side, driven by Firestore real-time listeners):
  - `status === not-found OR "pending"` AND user not in `submittedMembers` → show **SubmitForm** component
  - User IS in `submittedMembers` → show **SubmittedState** component ("You've shared something today ✓")
  - `submittedMembers` includes partner uid → also show **PartnerStatus** "They've shared something too!" badge (no content) — per SUBM-06
  - Revealed state handled in Phase 4.
- Sign-out button stays below the submission section.

### D-06: Partner Status Indicator (SUBM-06)
- Subscribe to `pairs/{pairId}/entries/{entryDate}` entry doc via `onSnapshot`.
- Check if partner uid (from pair doc `members`) is in `submittedMembers`.
- If yes (and not yet revealed): show status badge "They've shared something for today ✓" — no content, no photo, no text.
- If no: show "Waiting for them to share..." — neutral, no pressure.
- Indicator lives in the submission area of `HomePage`.

### D-07: At-Least-One Validation (SUBM-03)
- Client enforces with Zod before calling CF: `if (!photoURL && !text?.trim()) → inline error "Please add a photo or text before submitting."`.
- CF re-validates with the same Zod schema (`.superRefine()`) — CF is the authority.
- Error displayed inline below the form, not as a toast.

### D-08: Already-Submitted Guard (SUBM-04)
- CF checks `submittedMembers.includes(uid)` inside the transaction. If already submitted → throw `HttpsError('already-exists', 'You have already submitted today.')`.
- Client shows this as an inline error, but also the UI should transition to "SubmittedState" on mount if the user already has a submission — driven by the `onSnapshot` listener, not just CF response.

### D-09: Storage Path + Rules (SEC-03)
- Storage write rule: `match /pairs/{pairId}/entries/{entryDate}/{uid}/{filename}` — allow write if `request.auth.uid == uid` AND user is a member of `pairs/{pairId}` (via `firestore.get()`).
- Storage read rule: allow if `request.auth.uid == uid` (own photo, any time) OR entry `status == "revealed"` (both after reveal — via `firestore.get()` on the entry doc).

### D-10: Firestore Security Rules (SEC-01, SEC-02)
- Entry doc (`/pairs/{pairId}/entries/{entryDate}`): readable by both pair members at all times (contains only status, submittedMembers — no content). Not writable by clients (only CF Admin SDK).
- Submission doc (`/submissions/{uid}` subcollection): readable by owner always; readable by partner ONLY when entry `status == "revealed"` (checked via `get()` on parent entry doc); writable by nobody from client (only CF Admin SDK writes it).
- Status field: clients cannot write any field on entry docs or submission docs — all writes go through CF (SEC-02).

### Claude's Discretion
- `heic2any` version pinning and import pattern — researcher/planner pick.
- `browser-image-compression` options (`maxSizeMB: 1, maxWidthOrHeight: 1920`) — implementation detail.
- Emulator test file location: `shared-reveal/tests/rules/submissions.test.ts` following `@firebase/rules-unit-testing` v3 pattern.
- Exact Tailwind classes for SubmitForm, SubmittedState, PartnerStatus components — follow existing card pattern from `HomePage.tsx` and `PairSetupPage.tsx`.
- Storage emulator configuration in `firebase.json` — add if not already present.
- Unit test file: `shared-reveal/tests/unit/submissions.test.ts` — covers Zod schema, at-least-one, entryDate regex.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Submissions — SUBM-01 through SUBM-07
- `.planning/REQUIREMENTS.md` §Security — SEC-01, SEC-02, SEC-03, SEC-04
- `.planning/REQUIREMENTS.md` §Testing — TEST-01, TEST-02
- `.planning/ROADMAP.md` §Phase 3 — goal, success criteria, exact requirements list

### Project Constraints
- `CLAUDE.md` — full tech stack (Firebase only, Cloud Functions v2, Zod 4, no other backend)
- `CLAUDE.md` §Conflicts — Pitfall 5 (Zod 4 requires TS 5.5+)

### Existing Code — Patterns to Follow
- `shared-reveal/functions/src/index.ts` — `createPair`/`joinPair` pattern: Zod 4 schema, `callableOptions` guard, Admin SDK Firestore transaction, `HttpsError` throws; `submitEntry` must follow the same pattern
- `shared-reveal/src/types/index.ts` — `UserDoc`, `PairDoc` interfaces; add `EntryDoc`, `SubmissionDoc` here
- `shared-reveal/src/hooks/usePair.ts` — `onSnapshot` hook pattern; create analogous `useEntry` hook for entry status
- `shared-reveal/src/pages/HomePage.tsx` — replace partner card section with submission UI; re-use `onSnapshot` pattern already in this file
- `shared-reveal/firestore.rules` — existing `users/{uid}` and `pairs/{pairId}` rules; extend for `entries/{entryDate}` and `submissions/{uid}` subcollection
- `shared-reveal/tests/unit/pair.test.ts` — Vitest unit test pattern; mirror for submission Zod schema tests
- `shared-reveal/.planning/phases/02-pair-management/02-PATTERNS.md` — code patterns extracted from Phase 2; read for consistent style

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `callableOptions` pattern in `functions/src/index.ts` — copy verbatim for `submitEntry`
- `JoinPairSchema` Zod pattern — copy and adapt for submission input schema
- `usePairId` hook structure — copy for `useEntry(pairId, entryDate)` hook returning `{entryDoc, entryLoading}`
- Card container styles (`max-w-sm rounded-2xl bg-white p-8 shadow-md`) — reuse for submission form
- Purple brand button pattern from existing pages — reuse for "Submit" CTA
- `signOutUser` service pattern — analogous pattern for `submitEntry` service wrapper

### Established Patterns
- All Firestore document types exported from `src/types/index.ts`
- All hooks in `src/hooks/` with `onSnapshot` cleanup in `useEffect` return
- All Cloud Functions v2 `onCall` exported from `functions/src/index.ts`
- Services in `src/services/` as thin `httpsCallable` wrappers
- `tests/unit/` for Vitest unit tests; `tests/rules/` for Firebase emulator rule tests
- `tests/e2e/` for Playwright (E2E submission flow is Phase 4/TEST-03, not Phase 3)

### Integration Points
- `HomePage.tsx` v phase 2: has onSnapshot for pair doc to find partner uid — `useEntry` hook can reuse same pairId from usePairId
- `firebase.json`: may need `"storage": {}` emulator config if not present
- `firestore.rules` update: add `entries` collection group and `submissions` subcollection rules
- `storage.rules` update: add pair storage paths (currently may be placeholder rules)
- `functions/src/index.ts`: add `submitEntry` export

</code_context>

<specifics>
## Specific Ideas

- Submission form: photo thumbnail preview after selection; "×" to remove; text textarea with char counter (e.g., "247/500"); single "Share today's something" submit button (purple, full-width)
- "Submitted" state: replace form with a quiet confirmation card — icon (✓), "You've shared something for today" headline, partner status below it
- HEIC detection: check `file.type === 'image/heic' || file.type === 'image/heif'` before attempting `heic2any`
- `entryDate` computation: `new Date().toLocaleDateString('en-CA')` reliably produces `YYYY-MM-DD` in local TZ across browsers

</specifics>

<deferred>
## Deferred Ideas

- Auto-reveal transition (status → "revealed") — Phase 4's `revealEntry` CF / `submitEntry` enhancement
- "Reveal Anyway" button — Phase 4
- Timeline of past entries — Phase 5
- Notification on partner submission (NOTF-01) — Phase 5
- Multiple submissions per day / editing submitted content — explicitly out of scope per SUBM-04

</deferred>

---

*Phase: 03-submissions-privacy-layer*
*Context gathered: 2026-08-31 (auto discuss-phase)*
