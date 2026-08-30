# Requirements: Reveal

**Defined:** 2026-08-30
**Core Value:** Submission privacy enforced at the database layer — neither person can read the other's entry until the reveal condition is satisfied

## v1 Requirements

### Authentication

- [ ] **AUTH-01**: User can sign in with Google Sign-In only (no email/password, no other OAuth)
- [ ] **AUTH-02**: User document auto-created server-side via Auth `onCreate` Cloud Function (eliminates client-side race with Firestore rules)
- [ ] **AUTH-03**: Auth session persists across browser refresh and PWA reinstall (same Google UID restores pair and timeline)
- [ ] **AUTH-04**: User can sign out from any screen
- [ ] **AUTH-05**: User can delete their account and all associated data (pair, submissions, storage)

### Pairing

- [ ] **PAIR-01**: User can create a private two-person space and receive a 6-character alphanumeric invite code
- [ ] **PAIR-02**: Invite code expires after 24 hours (configurable in Cloud Function env)
- [ ] **PAIR-03**: Second user can join pair by entering invite code
- [ ] **PAIR-04**: Pair membership capped at exactly 2 members — enforced server-side by `joinPair` Cloud Function (not frontend validation)
- [ ] **PAIR-05**: Invite code is single-use — invalidated immediately after successful join
- [ ] **PAIR-06**: User already in a pair cannot join or create another pair

### Submissions

- [ ] **SUBM-01**: User can upload a photo for today's entry (client-side compressed before upload; HEIC format detected and converted)
- [ ] **SUBM-02**: User can submit text for today's entry (max 500 chars)
- [ ] **SUBM-03**: Submission requires at least one of photo or text
- [ ] **SUBM-04**: User can submit at most once per day entry (idempotent — not once per calendar day globally)
- [ ] **SUBM-05**: User's submission is inaccessible to partner until entry is revealed — enforced by Firestore Security Rules on the `submissions/{uid}` subcollection, not by frontend logic
- [ ] **SUBM-06**: Partner's submission status (submitted / waiting) is visible to user without exposing content
- [ ] **SUBM-07**: "Today" is determined by the user's local device midnight (not UTC)

### Reveal

- [ ] **REVL-01**: Entry auto-reveals when both members have submitted — implemented as a Firestore transaction in `submitEntry` Cloud Function (race-safe for simultaneous submissions)
- [ ] **REVL-02**: User who has submitted can trigger "Reveal Anyway" before partner submits
- [ ] **REVL-03**: After "Reveal Anyway": submitter's content is immediately visible to both; partner's slot displays empty placeholder
- [ ] **REVL-04**: Reveal metadata recorded on entry document: `revealedBy`, `revealReason` ("auto" | "manual"), `revealedAt`
- [ ] **REVL-05**: Entry `status` field transitions only via Cloud Functions (`pending` → `one_submitted` → `revealed`); Firestore rules block direct client writes to `status`
- [ ] **REVL-06**: Confirm dialog before "Reveal Anyway" — "They haven't shared yet. Reveal yours anyway?"

### Timeline

- [ ] **TIME-01**: User can view shared chronological timeline of all revealed entries (newest first)
- [ ] **TIME-02**: Each timeline card shows both members' submissions (photo + text) side by side or stacked
- [ ] **TIME-03**: Each timeline card shows reveal date and how it was revealed (auto vs "you revealed" vs "they revealed")
- [ ] **TIME-04**: Timeline entry date header uses the entry's date string (not the reveal date)
- [ ] **TIME-05**: Timeline shows appropriate empty state when no revealed entries exist

### Notifications

- [ ] **NOTF-01**: User receives push notification when partner submits: "💌 Someone left something for you."
- [ ] **NOTF-02**: User receives push notification when entry auto-reveals (both submitted): "🔓 Your reveal is ready!"
- [ ] **NOTF-03**: User receives push notification when partner triggers Reveal Anyway: "✨ They revealed something they found for you."
- [ ] **NOTF-04**: Notifications never expose submission content (title/body contain no submission data)
- [ ] **NOTF-05**: FCM token stored per-device with `lastSeen` timestamp; stale tokens cleaned up on `registration-token-not-registered` FCM error
- [ ] **NOTF-06**: Push notification gracefully degrades — in-app status indicator (dot/badge) shown if push permission denied or unavailable (EU iOS 17.4+)

### PWA

- [ ] **PWA-01**: App installable as PWA on Android Chrome, iOS Safari (16.4+), desktop Chrome/Edge/Safari
- [ ] **PWA-02**: Web App Manifest configured: name, short_name, icons (192×192, 512×512), theme_color, background_color, display: standalone, start_url
- [ ] **PWA-03**: Service worker provides offline shell — app loads without network, shows "You're offline" state gracefully
- [ ] **PWA-04**: vite-plugin-pwa uses `injectManifest` strategy with a single unified service worker (handles both Workbox precaching and FCM background messages — required to avoid dual-SW infinite reload loop)
- [ ] **PWA-05**: Firebase Storage fetch handler explicitly excluded from service worker interception (prevents upload stall on iOS Safari)

### Security

- [ ] **SEC-01**: Firestore Security Rules deny partner reads on unrevealed `submissions/{uid}` documents; allow both after `entry.status == "revealed"` — all field accesses guarded with `in` checks
- [ ] **SEC-02**: Firestore Security Rules block direct client writes to `entry.status`, `entry.revealedBy`, `entry.revealReason`, `entry.revealedAt`
- [ ] **SEC-03**: Storage Security Rules: user can write only to `pairs/{pairId}/entries/{entryId}/{uid}/` path; user can read their own path unrevealed or any path after reveal (via `firestore.get()`)
- [ ] **SEC-04**: Firebase Emulator tests cover: A cannot read B unrevealed; B cannot read A unrevealed; A can read B after reveal; B can read A after reveal; non-member cannot access pair; non-member cannot read any submission
- [ ] **SEC-05**: `joinPair` Cloud Function validates: invite exists, not expired, not used, pair has < 2 members, requester not already in a pair — inside a single Firestore transaction
- [ ] **SEC-06**: Firebase Admin SDK credentials never shipped to client bundle (verified by bundle inspection before production deploy)
- [ ] **SEC-07**: Firebase App Check enabled on Cloud Functions to mitigate invite code brute-force
- [ ] **SEC-08**: Firebase Auth uses custom `authDomain` (Firebase Hosting domain, not `*.firebaseapp.com`) — required for iOS Safari Sign-In to work in standalone PWA mode

### Testing

- [ ] **TEST-01**: Unit tests cover: pair validation, invite expiration logic, submission validation (at-least-one), reveal state transitions
- [ ] **TEST-02**: Firebase Emulator security rule tests cover all SEC-04 scenarios
- [ ] **TEST-03**: Playwright E2E covers full happy path (two-user pair → submit → auto-reveal → timeline)
- [ ] **TEST-04**: Playwright E2E covers Reveal Anyway flow (A submits → A reveals → B notified → B sees A's content + empty slot)
- [ ] **TEST-05**: Playwright uses `signInWithCustomToken()` for Google auth bypass (real OAuth is blocked by headless browser detection)
- [ ] **TEST-06**: Concurrent submission test — both users submit simultaneously via `Promise.all()` — verify auto-reveal triggers exactly once

## v2 Requirements

### UX Enhancements

- **UX-01**: iOS-specific PWA install education screen ("Tap Share → Add to Home Screen")
- **UX-02**: Notification permission request at the right moment (after pair is created, before first submit)
- **UX-03**: Multiple daily prompts / prompt rotation

### Social

- **SOCL-01**: Reactions on timeline entries
- **SOCL-02**: Comments on timeline entries

### Personalization

- **PERS-01**: Pair timezone configuration (shared, for consistent day boundaries)
- **PERS-02**: Custom app icon / avatar per pair

### Media

- **MDIA-01**: Video submissions
- **MDIA-02**: Voice note submissions

## Out of Scope

| Feature | Reason |
|---------|--------|
| AI / recommendation systems | Explicitly excluded; product is human-only by design |
| Social graph / discovery | Private two-person product; no public surface |
| Native Android / iOS app | PWA covers mobile sufficiently for MVP |
| Multiple pairs per user | Single pair enforces intimacy of the product; multi-pair adds complexity with no MVP value |
| Gamification / streaks | Excluded by design — not part of the reveal loop |
| Content moderation | Private sealed-submission app with no public surface; moderation has no role |
| Date planning / calendar | Out of product scope entirely |
| Email/password auth | Google Sign-In only; eliminates password management complexity |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| AUTH-05 | Phase 6 | Pending |
| SEC-08 | Phase 1 | Pending |
| PWA-01 | Phase 1 | Pending |
| PWA-02 | Phase 1 | Pending |
| PWA-03 | Phase 1 | Pending |
| PWA-04 | Phase 1 | Pending |
| PWA-05 | Phase 1 | Pending |
| PAIR-01 | Phase 2 | Pending |
| PAIR-02 | Phase 2 | Pending |
| PAIR-03 | Phase 2 | Pending |
| PAIR-04 | Phase 2 | Pending |
| PAIR-05 | Phase 2 | Pending |
| PAIR-06 | Phase 2 | Pending |
| SEC-05 | Phase 2 | Pending |
| SEC-07 | Phase 2 | Pending |
| SUBM-01 | Phase 3 | Pending |
| SUBM-02 | Phase 3 | Pending |
| SUBM-03 | Phase 3 | Pending |
| SUBM-04 | Phase 3 | Pending |
| SUBM-05 | Phase 3 | Pending |
| SUBM-06 | Phase 3 | Pending |
| SUBM-07 | Phase 3 | Pending |
| SEC-01 | Phase 3 | Pending |
| SEC-02 | Phase 3 | Pending |
| SEC-03 | Phase 3 | Pending |
| SEC-04 | Phase 3 | Pending |
| SEC-06 | Phase 6 | Pending |
| REVL-01 | Phase 4 | Pending |
| REVL-02 | Phase 4 | Pending |
| REVL-03 | Phase 4 | Pending |
| REVL-04 | Phase 4 | Pending |
| REVL-05 | Phase 4 | Pending |
| REVL-06 | Phase 4 | Pending |
| TIME-01 | Phase 5 | Pending |
| TIME-02 | Phase 5 | Pending |
| TIME-03 | Phase 5 | Pending |
| TIME-04 | Phase 5 | Pending |
| TIME-05 | Phase 5 | Pending |
| NOTF-01 | Phase 5 | Pending |
| NOTF-02 | Phase 5 | Pending |
| NOTF-03 | Phase 5 | Pending |
| NOTF-04 | Phase 5 | Pending |
| NOTF-05 | Phase 5 | Pending |
| NOTF-06 | Phase 5 | Pending |
| TEST-01 | Phase 3 | Pending |
| TEST-02 | Phase 3 | Pending |
| TEST-03 | Phase 4 | Pending |
| TEST-04 | Phase 4 | Pending |
| TEST-05 | Phase 1 | Pending |
| TEST-06 | Phase 4 | Pending |
| AUTH-05 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 46 total
- Mapped to phases: 46
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-30*
*Last updated: 2026-08-30 after initial definition*
