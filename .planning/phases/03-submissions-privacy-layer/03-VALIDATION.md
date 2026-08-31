---
phase: 3
slug: submissions-privacy-layer
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-31
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 + @firebase/rules-unit-testing 5.0.2 + Playwright 1.62.1 |
| **Config file** | `shared-reveal/vite.config.ts` (unit only: `tests/unit/**/*.{test,spec}.{ts,tsx}`) |
| **Unit run command** | `cd shared-reveal && npm test` |
| **Rules test command** | `cd shared-reveal && npx vitest run tests/rules/submissions.test.ts` (requires emulators running) |
| **Full suite command** | `cd shared-reveal && npm test && npm run test:e2e` |
| **Estimated runtime** | ~20 seconds (unit); ~90 seconds (with rules tests) |

---

## Sampling Rate

- **After every task commit:** Run `cd shared-reveal && npm test`
- **After security rules tasks:** Run `cd shared-reveal && npx vitest run tests/rules/submissions.test.ts` (emulators must be running)
- **After every plan wave:** Run `cd shared-reveal && npm test && npm run test:e2e`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds (unit only)

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| SUBM-01 | Photo upload: HEIC detected + converted to JPEG before upload | unit | `vitest run tests/unit/submissions.test.ts` | ❌ Wave 0 | ⬜ pending |
| SUBM-02 | Text max 500 chars enforced by Zod schema | unit | `vitest run tests/unit/submissions.test.ts` | ❌ Wave 0 | ⬜ pending |
| SUBM-03 | At-least-one (photo or text) required — empty rejected | unit | `vitest run tests/unit/submissions.test.ts` | ❌ Wave 0 | ⬜ pending |
| SUBM-04 | Duplicate submission for same day rejected (idempotent) | unit (CF logic) | `vitest run tests/unit/submissions.test.ts` | ❌ Wave 0 | ⬜ pending |
| SUBM-05 | Partner cannot read submission before reveal (Firestore rules) | rules emulator | `vitest run tests/rules/submissions.test.ts` | ❌ Wave 1 | ⬜ pending |
| SUBM-06 | Partner status visible without content (entry doc readable) | rules emulator | `vitest run tests/rules/submissions.test.ts` | ❌ Wave 1 | ⬜ pending |
| SUBM-07 | entryDate as YYYY-MM-DD local TZ from en-CA locale | unit | `vitest run tests/unit/submissions.test.ts` | ❌ Wave 0 | ⬜ pending |
| SEC-01 | A cannot read B's unrevealed submission | rules emulator | `vitest run tests/rules/submissions.test.ts` | ❌ Wave 1 | ⬜ pending |
| SEC-02 | Client cannot write entry status field directly | rules emulator | `vitest run tests/rules/submissions.test.ts` | ❌ Wave 1 | ⬜ pending |
| SEC-03 | Storage: user can write only own path; read restricted pre-reveal | rules emulator (storage) | `vitest run tests/rules/storage.test.ts` | ❌ Wave 1 | ⬜ pending |
| SEC-04 | Non-pair-member denied all access | rules emulator | `vitest run tests/rules/submissions.test.ts` | ❌ Wave 1 | ⬜ pending |
| TEST-01 | All Zod schema + submission validation unit tests pass | unit | `vitest run tests/unit/submissions.test.ts` | ❌ Wave 0 | ⬜ pending |
| TEST-02 | All SEC-04 deny/allow scenarios pass in emulator | rules emulator | `vitest run tests/rules/submissions.test.ts` | ❌ Wave 1 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `shared-reveal/tests/unit/submissions.test.ts` — Zod schema tests, at-least-one validation, entryDate regex, idempotency guard logic, text max-length
- [ ] `shared-reveal/src/types/index.ts` — `EntryDoc` and `SubmissionDoc` interfaces

*Existing infrastructure: Vitest installed, `npm test` runs with `tests/unit/**` glob. No rules test runner in package.json yet — may need `vitest run` script for rules.*

---

## Wave 1 Requirements (Firestore + Storage Rules Tests)

- [ ] `shared-reveal/tests/rules/submissions.test.ts` — `initializeTestEnvironment` with both `firestore` and `storage` keys for `firestore.get()` support
  - **SEC-01 / SUBM-05:** `assertFails(readSubmissionAsPartner())` — A reads B's doc when status === "pending"
  - **SUBM-05 (allow):** `assertSucceeds(readSubmissionAsPartner())` — A reads B's doc when status === "revealed" (set via `withSecurityRulesDisabled`)
  - **SEC-02:** `assertFails(writeEntryStatusFromClient())` — client writes `{ status: "revealed" }` directly
  - **SEC-04:** `assertFails(readSubmissionAsNonMember())` — user with no pairId reads pair's submission
  - **SUBM-06:** `assertSucceeds(readEntryDocAsPartner())` — B reads entry doc (metadata only, always allowed)
- [ ] `shared-reveal/tests/rules/storage.test.ts` — Storage rules tests
  - **SEC-03 (write):** `assertSucceeds(uploadToOwnPath())` — user uploads to `pairs/{pairId}/entries/{date}/{uid}/photo.jpg`
  - **SEC-03 (deny write):** `assertFails(uploadToPartnerPath())` — user uploads to partner's path
  - **SEC-03 (read pre-reveal):** `assertFails(readPartnerPhoto())` — when entry status !== "revealed"
  - **SEC-03 (read post-reveal):** `assertSucceeds(readPartnerPhoto())` — when entry status === "revealed"

---

## Validation Architecture (from RESEARCH.md)

### Firestore Rules — Deny Scenarios
1. User A reads `submissions/uid_B` when entry `status === "pending"` → DENY
2. User A reads `submissions/uid_B` when entry `status === "one_submitted"` → DENY
3. User A writes `{ status: "revealed" }` to entry doc → DENY (no client writes to entry)
4. User A writes to `submissions/uid_B` → DENY (only owner can write, via CF)
5. Non-member user C reads entry doc → DENY
6. Non-member user C reads `submissions/uid_A` → DENY

### Firestore Rules — Allow Scenarios
7. User A reads own `submissions/uid_A` (any status) → ALLOW
8. User A reads entry doc (metadata, any status) → ALLOW
9. User A reads `submissions/uid_B` when entry `status === "revealed"` → ALLOW

### Storage Rules — Deny Scenarios
10. User A uploads to `uid_B/photo.jpg` path → DENY
11. User A reads `uid_B/photo.jpg` when entry `status !== "revealed"` → DENY
12. Non-member reads any path in the pair → DENY

### Storage Rules — Allow Scenarios
13. User A uploads to own `uid_A/photo.jpg` path → ALLOW
14. User A reads own `uid_A/photo.jpg` (any status) → ALLOW
15. User A reads `uid_B/photo.jpg` when entry `status === "revealed"` → ALLOW

### CF Validation — Unit Scenarios
16. `{ text: null, photoURL: null }` → `HttpsError('invalid-argument')` (at-least-one)
17. `{ text: 'a'.repeat(501), photoURL: null }` → `HttpsError('invalid-argument')` (text max 500)
18. `{ entryDate: '2026-13-01', text: 'hi', photoURL: null }` → `HttpsError('invalid-argument')` (bad date)
19. Valid first submission → `{ entryDate, alreadySubmitted: false }`
20. Second call with same uid same day → `HttpsError('already-exists')` (idempotent guard)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| HEIC from iPhone camera roll converts correctly | SUBM-01 | Requires real iOS device or HEIC file | Test with actual HEIC file from iPhone Photos; verify upload shows correct thumbnail |
| App Check enforcement on submitEntry | SEC-07 | Firebase emulator does not enforce App Check | Test in production Firebase project with enforceAppCheck=true |
| No Admin SDK credentials in client bundle | SEC-06 (Phase 6) | Bundle inspection required | `npm run build && grep -r "service_account" dist/` |
