---
phase: 1
phase_name: "Foundation"
date: 2026-08-30
---

# Phase 1 Validation Strategy

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.11 (unit) + Playwright 1.62.1 (E2E) |
| Config file | vite.config.ts (vitest block) + e2e/playwright.config.ts |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run && npx playwright test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | signInWithGoogle() triggers redirect flow | E2E (manual verification on real iOS) | `npx playwright test e2e/auth.spec.ts` | No — Wave 0 |
| AUTH-02 | User doc exists in Firestore after sign-in | E2E | `npx playwright test e2e/auth.spec.ts` | No — Wave 0 |
| AUTH-03 | Auth state persists across refresh | E2E | `npx playwright test e2e/auth.spec.ts` | No — Wave 0 |
| AUTH-04 | signOut() clears auth state | E2E | `npx playwright test e2e/auth.spec.ts` | No — Wave 0 |
| SEC-08 | authDomain is custom domain (not *.firebaseapp.com) | Unit | `npx vitest run src/lib/firebase.test.ts` | No — Wave 0 |
| PWA-01 | App passes Lighthouse PWA installability | Manual (Lighthouse) | n/a | — |
| PWA-02 | Manifest has required fields | Unit | `npx vitest run src/sw.test.ts` | No — Wave 0 |
| PWA-03 | Offline shell renders "You're offline" | E2E (network offline mode) | `npx playwright test e2e/offline.spec.ts` | No — Wave 0 |
| PWA-04 | One SW registers; no reload loop | Manual (DevTools Application panel) | n/a | — |
| PWA-05 | Storage requests not intercepted by SW | Unit / Integration | `npx vitest run src/sw.test.ts` | No — Wave 0 |
| TEST-05 | signInWithCustomToken fixture signs in | E2E | `npx playwright test e2e/auth.spec.ts` | No — Wave 0 |

### Wave 0 Gaps

- [ ] `e2e/auth.spec.ts` — covers AUTH-01–04, TEST-05
- [ ] `e2e/offline.spec.ts` — covers PWA-03
- [ ] `e2e/fixtures/auth.ts` — Playwright auth fixture (TEST-05)
- [ ] `src/lib/firebase.test.ts` — covers SEC-08 (authDomain assertion)
- [ ] `src/sw.test.ts` — covers PWA-02, PWA-05 (manifest fields, Storage exclusion)
- [ ] `vitest.config block in vite.config.ts` — test environment setup
- [ ] `src/test-setup.ts` — @testing-library/jest-dom import
