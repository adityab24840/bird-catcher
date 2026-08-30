# Roadmap: Reveal

## Overview

Reveal ships as six vertical-slice phases, each delivering an end-to-end user capability. The ordering is constraint-driven: Google Auth with the iOS custom-authDomain fix must land in Phase 1 because it is a day-zero blocker, not polish. Pair membership is the foreign key for all entry data, so pairing must exist before any submission can be scoped. Submission privacy rules must be complete and emulator-tested before reveal logic is layered on top — the reveal mechanic depends on correctly restrictive rules. The timeline can only show revealed entries, so it comes after reveal. Every phase is testable independently against observable user behavior, and the privacy guarantee is validated by Firestore emulator tests in Phase 3 before the reveal mechanic in Phase 4 relies on it.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Auth + PWA shell + iOS auth fix (custom authDomain); app installable and sign-in works on all platforms including iOS standalone
- [ ] **Phase 2: Pair Management** - Two people connect into a private space via one-time invite code; pair cap enforced server-side
- [ ] **Phase 3: Submissions + Privacy Layer** - Each person submits photo and/or text for the day; partner cannot read it — enforced at Firestore rules layer, emulator-verified
- [ ] **Phase 4: Reveal Mechanic** - Entry auto-reveals when both submit (race-safe transaction); "Reveal Anyway" available with confirm dialog; reveal metadata recorded
- [ ] **Phase 5: Timeline + Notifications** - Shared chronological timeline of all revealed entries; FCM push notifications for all three reveal-loop events with in-app badge fallback
- [ ] **Phase 6: Hardening + Production Deploy** - Account deletion, bundle secrets audit, cross-platform PWA install verification, and full security rule test coverage

## Phase Details

### Phase 1: Foundation
**Goal**: User can sign in with Google on any supported platform — including iOS Safari standalone mode — and access the app as an installable PWA with an offline shell
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, SEC-08, PWA-01, PWA-02, PWA-03, PWA-04, PWA-05, TEST-05
**Success Criteria** (what must be TRUE):
  1. User taps "Sign in with Google" on iOS Safari standalone, Android Chrome, and desktop Chrome/Edge/Safari — sign-in completes and lands on the authenticated home screen without silently failing or looping
  2. User signs out then back in with the same Google account — the app recognizes the user and their pair/timeline data without any loss
  3. iOS user who has not installed the app sees an in-app visual guide (Share → Add to Home Screen) on first visit; the guide does not appear after the app is installed
  4. App loads from the home screen icon with no network connection and shows a graceful "You're offline" state rather than a blank screen
  5. Service worker registers exactly once — no infinite reload loop; FCM background messages and Workbox precaching coexist in the unified service worker
**Plans**: TBD
**UI hint**: yes

### Phase 2: Pair Management
**Goal**: Two people can connect into a private two-person space using a one-time invite code; pair membership cap is enforced server-side so no frontend manipulation can add a third member
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: PAIR-01, PAIR-02, PAIR-03, PAIR-04, PAIR-05, PAIR-06, SEC-05, SEC-07
**Success Criteria** (what must be TRUE):
  1. User A generates a 6-character invite code on the invite screen; the code is shareable and remains valid for 24 hours
  2. User B enters the code on the join screen and is immediately placed into User A's pair; both users see the shared pair home screen without a page reload
  3. A third person entering a valid code is rejected with a clear error; the pair remains capped at two members
  4. A user who is already in a pair cannot create a new pair or join another one — the UI reflects this state and Cloud Function enforces it
**Plans**: TBD
**UI hint**: yes

### Phase 3: Submissions + Privacy Layer
**Goal**: Each person can submit today's entry (photo and/or text) and be guaranteed their partner cannot see the content until the entry is revealed — the privacy is a Firestore security rule, not a frontend toggle
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: SUBM-01, SUBM-02, SUBM-03, SUBM-04, SUBM-05, SUBM-06, SUBM-07, SEC-01, SEC-02, SEC-03, SEC-04, TEST-01, TEST-02
**Success Criteria** (what must be TRUE):
  1. User uploads a photo (including HEIC from iPhone camera roll) and/or writes text up to 500 characters; attempting to submit with neither is rejected with an inline error
  2. After submission, the app shows an unambiguous "Submitted" confirmation state — the form is replaced with a status indicator; submitting again for the same day is blocked
  3. User sees their partner's submission status (submitted or still waiting) on the home screen without any content being revealed — the status dot or badge is the only information shown
  4. Firebase Emulator security rule tests confirm: User A's read of User B's unrevealed submission is denied at the rules layer; User A's write to their own submission succeeds; a non-pair-member is denied all access
  5. No Firebase Admin SDK credentials appear in the client bundle (verified by bundle inspection before closing the phase)
**Plans**: TBD
**UI hint**: yes

### Phase 4: Reveal Mechanic
**Goal**: The reveal event fires correctly and exactly once — automatically when both members submit, or manually via "Reveal Anyway" — and both participants immediately see each other's full submission after reveal
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: REVL-01, REVL-02, REVL-03, REVL-04, REVL-05, REVL-06, TEST-03, TEST-04, TEST-06
**Success Criteria** (what must be TRUE):
  1. When both users submit (including simultaneously via concurrent requests), the entry auto-reveals exactly once — both see each other's photo and text without a manual refresh and without a duplicate reveal
  2. A user who has submitted can trigger "Reveal Anyway"; a confirm dialog ("They haven't shared yet. Reveal yours anyway?") appears first; after confirmation, the submitter's content is immediately visible to both while the partner's slot shows an empty placeholder
  3. Every revealed entry displays who revealed it, whether it was auto or manual, and when — this metadata is readable by both pair members on the reveal view
  4. Attempting to write directly to the entry status field from the client (e.g., via browser console) is rejected by Firestore Security Rules; status transitions only succeed via Cloud Functions
**Plans**: TBD
**UI hint**: yes

### Phase 5: Timeline + Notifications
**Goal**: Users can browse all past reveals in a shared chronological timeline and receive timely push notifications for every key event in the reveal loop, with an in-app badge fallback for users who cannot receive push
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: TIME-01, TIME-02, TIME-03, TIME-04, TIME-05, NOTF-01, NOTF-02, NOTF-03, NOTF-04, NOTF-05, NOTF-06
**Success Criteria** (what must be TRUE):
  1. User scrolls the timeline and sees all revealed entries in chronological order (newest first); each card shows both members' photo and text side by side, the entry date (not reveal date), and whether it was auto-revealed or revealed by one member
  2. Timeline shows a purposeful empty state when no reveals have happened yet; it does not show blank cards or entries in progress
  3. User receives a push notification when their partner submits, when an entry auto-reveals, and when their partner triggers Reveal Anyway — none of the notification titles or bodies contain any submission content
  4. A user whose device cannot receive push notifications (non-installed iOS PWA, EU iOS 17.4+ restriction, or denied permission) sees an in-app badge or dot indicating their partner has submitted — core UX never blocks on push permission
**Plans**: TBD
**UI hint**: yes

### Phase 6: Hardening + Production Deploy
**Goal**: The product is ready for real use — account deletion works cleanly, no secrets are in the client bundle, every security rule allow/deny branch is covered by emulator tests, and PWA installability is verified on all target platforms
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: AUTH-05, SEC-06
**Success Criteria** (what must be TRUE):
  1. User can delete their account from the settings screen; after deletion their user document, pair membership, submissions, and Storage files are removed and the app returns to the signed-out state
  2. Bundle inspection (`vite-bundle-visualizer`) shows no Firebase Admin SDK credentials, service account keys, or environment secrets in the production client bundle
  3. Firebase Emulator security rule test suite covers all critical allow/deny branches: unrevealed partner read denied, revealed partner read allowed, non-member denied, own submission read/write allowed, status field client-write denied
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | TBD | Not started | - |
| 2. Pair Management | TBD | Not started | - |
| 3. Submissions + Privacy Layer | TBD | Not started | - |
| 4. Reveal Mechanic | TBD | Not started | - |
| 5. Timeline + Notifications | TBD | Not started | - |
| 6. Hardening + Production Deploy | TBD | Not started | - |

---
*Roadmap created: 2026-08-30*
*Mode: mvp (vertical slices — each phase delivers an end-to-end user capability)*
*Coverage: 54 v1 requirements mapped across 6 phases*
