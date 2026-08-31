---
phase: 2
slug: pair-management
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-31
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 + Playwright 1.62.1 |
| **Config file** | None — Vitest uses vite.config.ts auto-discovery |
| **Quick run command** | `cd shared-reveal && npm test` |
| **Full suite command** | `cd shared-reveal && npm test && npm run test:e2e` |
| **Estimated runtime** | ~15 seconds (unit); ~60 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `cd shared-reveal && npm test`
- **After every plan wave:** Run `cd shared-reveal && npm test && npm run test:e2e`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds (unit only)

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| PAIR-01 | createPair returns 6-char uppercase invite code | unit | `vitest run tests/unit/pair.test.ts` | ❌ Wave 0 | ⬜ pending |
| PAIR-02 | Expired invite codes rejected | unit | `vitest run tests/unit/pair.test.ts` | ❌ Wave 0 | ⬜ pending |
| PAIR-03 | joinPair with valid code succeeds | E2E (emulator) | `playwright test tests/e2e/pair.spec.ts` | ❌ Wave 0 | ⬜ pending |
| PAIR-04 | Third user joining is rejected | unit | `vitest run tests/unit/pair.test.ts` | ❌ Wave 0 | ⬜ pending |
| PAIR-05 | Invite code unusable after one join | E2E (emulator) | `playwright test tests/e2e/pair.spec.ts` | ❌ Wave 0 | ⬜ pending |
| PAIR-06 | Already-paired user cannot create or join | unit | `vitest run tests/unit/pair.test.ts` | ❌ Wave 0 | ⬜ pending |
| SEC-05 | All 5 validations in single transaction | unit (mock tx) | `vitest run tests/unit/pair.test.ts` | ❌ Wave 0 | ⬜ pending |
| SEC-07 | Functions reject requests without App Check token | manual | emulator + enforceAppCheck flag | ❌ manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `shared-reveal/tests/unit/pair.test.ts` — stubs for PAIR-01 through PAIR-06, SEC-05 validation logic
- [ ] `shared-reveal/tests/e2e/pair.spec.ts` — two-user happy path and rejection flows
- [ ] Second E2E test user fixture (`TEST_UID_02`) in `shared-reveal/tests/e2e/fixtures/auth.ts`

*Existing infrastructure: Vitest installed, `npm test` runs. Playwright config targets `tests/e2e/`. Auth fixture already supports custom token — extend for second user.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| App Check rejects unauthenticated Cloud Function calls | SEC-07 | Firebase emulator does not enforce App Check by default | Set `enforceAppCheck: true` in function options; test with and without debug token |
