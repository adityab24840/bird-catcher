# Project Research Summary

**Project:** Reveal
**Domain:** Private two-person Firebase PWA with database-layer submission privacy
**Researched:** 2026-08-30
**Confidence:** HIGH (all core technical claims verified against official Firebase docs; feature patterns verified against peer apps)

---

## Executive Summary

Reveal is a private two-person PWA where submission privacy is enforced at the Firestore Security Rules layer — not the frontend. This is simultaneously the product's core differentiator and its primary technical constraint. The data model must be designed around this constraint from day one: submissions must live in subcollections with their own rule scope, not as embedded fields in an entry document. All state transitions (reveal, pair-join) must flow through Cloud Functions with Firestore transactions — the client is never trusted to change reveal status. These two decisions constrain every subsequent implementation choice.

The stack is well-defined and internally coherent but has two non-obvious mandatory constraints that will break the product if ignored. First, `vite-plugin-pwa` must use `injectManifest` strategy (not the default `generateSW`) because FCM requires its own service worker — two competing service workers cause an infinite reload loop. Second, Firebase Auth must be configured with a custom `authDomain` (not the default `.firebaseapp.com`) because `signInWithRedirect` silently fails on iOS Safari standalone mode with the default domain. Both are configuration choices, not code complexity, but neither is documented prominently and both are commonly discovered only after user-facing breakage.

iOS is the hardest platform and requires explicit design work on three fronts: (1) Google Sign-In in standalone mode requires the custom authDomain fix plus user education that they must sign in inside the installed PWA, not via Safari; (2) push notifications only function for users on iOS 16.4+ with the PWA installed to the home screen — EU users on iOS 17.4+ are blocked by Apple DMA compliance with no workaround; (3) iOS has no `beforeinstallprompt` event, so install conversion requires a purpose-built in-app instruction screen with a visual guide to the Share menu. These are not enhancements — they are required for the product to work on the dominant mobile platform.

---

## Key Findings

### Recommended Stack

All major dependencies have hard version floors set by cross-dependency constraints. The critical chain is: `vite-plugin-pwa@1.x` requires `Vite@6`, and `Zod@4` requires `TypeScript@5.5+`. Starting below these floors triggers incompatibilities that cannot be patched without major version changes mid-build.

**Core technologies with versions:**

| Layer | Package | Version | Constraint |
|-------|---------|---------|-----------|
| UI Framework | react, react-dom | 19.x | No conflicts with this stack |
| Build | vite | 6.x | Required by vite-plugin-pwa 1.x |
| Language | typescript | 5.5+ | Hard floor — Zod 4 breaks below 5.5 |
| Styling | tailwindcss + @tailwindcss/vite | 4.x | Use Vite plugin only — do NOT also install @tailwindcss/postcss (conflict) |
| Routing | react-router-dom | 7.x | Data router; stable with React 19 |
| PWA | vite-plugin-pwa | 1.3.0 | Must use `injectManifest` strategy — see Service Worker constraint |
| Firebase SDK | firebase | 12.18.0 | Modular imports only — compat layer removed in v10 |
| Validation | zod | 4.x | 14x faster than v3; breaking API changes from v3 |
| Unit testing | vitest + @testing-library/react | latest | Native to Vite; Jest-compatible API |
| E2E testing | playwright + @playwright/test | latest | Firebase Emulator + custom token auth (no real OAuth) |
| Rules testing | @firebase/rules-unit-testing | latest | Against local emulator; not mocks |
| Functions | firebase-functions/v2 | — | Cloud Run-backed; use for all new functions |
| Image conversion | heic2any | latest | Required for iOS HEIC photo handling |

**Critical service worker setup:** One unified service worker (`src/sw.ts`) handles both Workbox precaching and FCM background messages. Firebase config must be injected at build time via Vite `define` — `import.meta.env` is unavailable in service worker context.

---

### Table Stakes

Features whose absence causes immediate abandonment. All must ship at launch.

**Must have:**
- Push notifications for 3 events: partner submitted, both submitted (auto-reveal ready), Reveal Anyway triggered — users are on different schedules; without this the loop breaks silently
- Unambiguous submission status indicator on the home screen — the single most important ambient display ("you've submitted / partner has submitted / reveal ready")
- Submission confirmation feedback — users need certainty their entry was received before closing the app
- Offline shell with "you're offline" indicator — blank screen on poor connection causes rage-quit
- PWA installability with iOS install education screen — iOS has no `beforeinstallprompt`; without an explicit instruction UI, iOS users never install
- Reliable media upload with progress feedback — silent upload failures are the top complaint in photo-sharing apps
- Persistent cloud data (restore on reinstall) — emotional investment in the timeline; any loss is trust-catastrophic
- Clear pair invite flow — first-use friction is the #1 drop-off point in two-person apps

**Differentiators (what makes Reveal memorable):**
- Privacy-enforced blind submission — this is a security rule, not a UI toggle; structurally unique among consumer apps
- Auto-reveal as a micro-event with reveal transition animation — the moment of reveal is emotionally resonant; must not be a silent data load
- "Reveal Anyway" with asymmetric state — prevents the mechanic from being a hostage situation; initiator bears the asymmetry consciously
- Waiting state as designed experience — the period between "I submitted" and "reveal" is anticipation, not dead time
- Permanent immutable timeline — explicit product promise; no gating, no paywall, no deletion

**Explicitly out of scope (anti-features that harm the product):**
- Reactions and comments — shift dynamic from shared discovery to performance anxiety
- Streaks — guilt/pressure in intimate context; hostile UX
- Read receipts on the waiting state — dark pattern; creates pressure before reveal
- "You haven't submitted today" notifications — guilt-nudge; trust-breaking
- Entry editing after submission — undermines authenticity premise
- Multiple pairs per user

**Defer to v2:**
- Calendar grid timeline view
- "On This Day" memories feature
- Offline compose + submission queue
- Video/voice entries
- Prompt rotation

---

### Architecture Approach

The architecture is shaped entirely by the privacy constraint. Firestore Security Rules are declarative (allow/deny only) and cannot initiate writes or sequence operations — so Cloud Functions handle all state transitions. Rules validate; Functions execute. The data model places each submission in its own subcollection document (`pairs/{pairId}/entries/{entryId}/submissions/{uid}`) because Firestore does not support partial field-level reads: if both submissions were fields on the entry document, there is no rule that hides specific fields from a client who can read the document.

**Major components:**

1. **Firebase Auth + `AuthProvider`** — Google Sign-In with custom `authDomain` (not `.firebaseapp.com`); `onAuthStateChanged` drives app state; user document auto-created via Cloud Functions Auth `onCreate` trigger (not client-side, to avoid token timing race)
2. **`PairProvider`** — real-time listener on the pair document; makes `pairId` and `members` available app-wide
3. **Cloud Functions (v2)** — `generateInvite`, `joinPair` (transactional, cap=2), `revealEntry` (manual reveal), `onSubmissionCreated` (Firestore trigger: auto-reveal check + FCM notify)
4. **Firestore Security Rules** — submission read rule uses `get()` on parent entry to check `status === "revealed"` before allowing partner read; 2 cross-document reads of allowed 10
5. **Storage Security Rules** — mirrors Firestore model using `firestore.get()` for cross-service rules; exactly 2 reads of allowed 2 (no headroom for additional checks)
6. **`useEntryListeners` hook** — three-layer conditional listener: always listens to entry metadata and own submission; starts partner submission listener only when `entry.status === "revealed"` (a denied `onSnapshot` does not auto-recover when rules change)
7. **Service Worker (`src/sw.ts`)** — unified: Workbox precaching + FCM background messages; excludes `firebasestorage.googleapis.com` from interception to prevent iOS upload stall bug
8. **`SubmissionForm`** — `heic2any` HEIC pre-conversion then Canvas compression then `uploadBytesResumable` to Storage then Firestore submission document write

**Key Firestore data model:**
```
/users/{uid}                                          — displayName, email, pairId, fcmToken, createdAt
/pairs/{pairId}                                       — members: [uid1, uid2], createdAt, createdBy
/invites/{code}                                       — creatorUid, expiresAt, used
/pairs/{pairId}/entries/{entryId}                     — date (YYYY-MM-DD), status, submittedMembers[], revealedBy, revealReason, revealedAt
/pairs/{pairId}/entries/{entryId}/submissions/{uid}   — uid, text, imageRef, submittedAt
```

---

### Top 5 Watch-Outs

**1. iOS Google Sign-In broken in standalone mode (Pitfall 8 + 9) — Phase 1 blocker**
`signInWithPopup` is blocked unconditionally in iOS standalone PWA mode. `signInWithRedirect` completes in an external Safari tab and never returns to the PWA. Fix: set `authDomain` in `firebaseConfig` to the custom domain (e.g., `app.yoursite.com`) and add `https://app.yoursite.com/__/auth/handler` to Google OAuth redirect URIs. Additionally, iOS standalone mode has isolated storage from Safari — users who sign in via Safari must sign in again inside the PWA. Accept this and design onboarding to make it clear. Test on a real iPhone in standalone mode before closing the auth milestone.

**2. Two service workers cause infinite reload loop (STACK.md Conflict 1) — Phase 1 blocker**
`vite-plugin-pwa` default `generateSW` creates a service worker. FCM requires a service worker at `firebase-messaging-sw.js`. Two service workers on the same scope cause continuous update loops. Fix: use `strategies: 'injectManifest'` and write one unified `src/sw.ts` that handles both Workbox precaching and FCM `onBackgroundMessage`. This is non-negotiable.

**3. Reveal race condition — both users submit simultaneously (Pitfall 3 + 4) — Phase 4**
If both users submit within milliseconds, two `onSubmissionCreated` triggers fire. Without a Firestore transaction, both reads see only one submission present and neither triggers auto-reveal — the reveal mechanic silently breaks. The `revealAnyway` function also races with a simultaneous submission. Fix: both Cloud Functions use Firestore transactions and treat `entry.status` as a finite state machine — check current status before any write. Validate with a concurrent test: `Promise.all([submitEntry(alice), submitEntry(bob)])` and assert `status === "revealed"` exactly once.

**4. FCM notification sent before Firestore write commits (Pitfall 5) — Phase 5**
If FCM send and Firestore write are in a `Promise.all()`, the notification arrives before the entry status updates. The user taps the notification, opens the app, and sees "still waiting" — a trust-breaking experience. Fix: always sequence `await firestoreWrite` then `await sendFCM`. Never concurrent.

**5. iOS push notifications only work for installed PWA on iOS 16.4+; EU users on iOS 17.4+ blocked entirely (Pitfall 11) — Phase 5**
`Notification` API is unavailable in iOS Safari tabs — only in installed PWAs. EU users on iOS 17.4+ cannot receive PWA push notifications at all (Apple DMA compliance). Fix: detect `'Notification' in window && navigator.standalone === true` before requesting permission. For ineligible users, show an in-app badge/dot as a fallback. Never block core UX on push permission.

**Also high severity (6-10):**
- Firestore rule field access throws (not false) on missing fields — use `'field' in resource.data` guards on every field reference; write emulator tests for documents with missing fields (Pitfall 1)
- Firebase Auth token not ready at first Firestore write — create user document via Auth `onCreate` Cloud Function trigger, not client-side (Pitfall 2)
- FCM token stale/accumulation — upsert token per device per app load; handle `UNREGISTERED` 404 in Cloud Function by deleting stale token (Pitfall 7)
- iOS HEIC image upload — detect HEIC MIME type and pre-convert with `heic2any` before Canvas compression; test on real iOS device (Pitfall 15)
- Service worker intercepts Firebase Storage uploads on iOS, stalling them silently — exclude `firebasestorage.googleapis.com` from all SW fetch interception (Pitfall 10)

---

## Spec Gaps Identified

The following are underspecified in PROJECT.md and must be explicitly resolved before or during implementation. All are confirmed by feature and architecture research.

| # | Gap | Severity | Resolution Needed |
|---|-----|----------|------------------|
| 1 | **iOS auth flow** — PROJECT.md requires Google Sign-In and iOS PWA installability, but the combination requires custom `authDomain` configuration to work. Not mentioned in spec. | Critical | Add to Phase 1 requirements: set `authDomain` to custom hosting domain; configure Google OAuth redirect URI; document that iOS users must sign in inside PWA, not Safari |
| 2 | **Partial-reveal UX state** — "Reveal Anyway" creates an asymmetric state (Person A's entry visible, Person B's still sealed). This state is completely unspecified as a UX design. What does Person B's screen show after receiving the notification? What does the timeline card look like until Person B submits? | High | Requires explicit design before Phase 4 implementation: define timeline card state ("partial reveal"), define Person B's today-entry screen copy, define what the notification deep-links to |
| 3 | **iOS install education screen** — PROJECT.md says "PWA installable on iOS Safari" but iOS has no `beforeinstallprompt` event. Without a purpose-built instruction screen (showing Share button visually), iOS users never install the app. The spec has no owner for this artifact. | High | Must be a designed artifact shipped in Phase 1 alongside the PWA manifest; condition: show only when `isIOS && !isStandalone` |
| 4 | **FCM degradation for EU/iOS users** — iOS 17.4+ EU users cannot receive push notifications from PWAs (Apple DMA). The spec requires FCM notifications with no mention of fallback behavior. | High | Define graceful degradation: in-app badge/dot on the today-entry section showing partner has submitted, discoverable on next app open. Notification permission request must be gated on `navigator.standalone && 'Notification' in window` |
| 5 | **Day boundary definition** — The spec does not define what "today" means. Is a new day UTC midnight or the user's local timezone? Two users in different timezones may see different "today" values. | Medium | Decision: use the submitting user's local date (`new Date().toLocaleDateString('en-CA')`) captured at submission time and stored as `date: "YYYY-MM-DD"` on the submission document; accept that partners in different timezones may submit to different date-keyed entries |
| 6 | **Submission confirmation feedback** — The spec implies submission works, but does not specify a "submitted" state screen, badge, or indicator. Users need unambiguous confirmation before closing the app. | Medium | Add to Phase 3 requirements: after successful submission write, show a distinct "Submitted" screen or replace the form with a status indicator before transitioning to the waiting state |
| 7 | **Missing day behavior** — The spec does not say what happens to days when neither person submits. Do empty days appear in the timeline? Are they tracked? | Low | Confirmed answer: days with no submissions should not appear in the timeline. No "missed day" entry. No streak tracking. Spec should explicitly confirm this to prevent ambiguity during timeline implementation |
| 8 | **Notification permission timing** — Spec requires FCM notifications but does not define when to request permission. Research shows early requests tank opt-in rates. | Low | Request on Android: immediately after pair join completes. Request on iOS: after first successful reveal cycle (user has experienced the value). Never on first launch. |

---

## Implications for Roadmap

The architecture research prescribes a strict dependency ordering. Security rules cannot be tested without the data model. The reveal mechanic cannot be built without the privacy rules. FCM cannot be wired without the reveal mechanic. This forces a sequential build where each phase validates the privacy property before the next adds features on top of it.

### Phase 1: Foundation — Auth + PWA Shell + iOS Auth Fix

**Rationale:** Auth is a foreign key for everything. Pair membership is indexed by UID. The user document pattern must exist before invite flow. The iOS auth fix (custom `authDomain`) must be in place before any iOS testing is possible — it is cheaper to do it at day zero than to retrofit after iOS testing reveals breakage. The PWA shell (manifest, service worker, iOS install education screen) belongs here because it has no backend dependencies.

**Delivers:**
- Firebase project, emulator config, `firebase.json`
- Google Sign-In with custom `authDomain` (not `.firebaseapp.com`)
- User document auto-created via Auth `onCreate` Cloud Function (not client-side — avoids token timing race)
- Firestore rules for `/users/{uid}` (own-read, own-create, pairId not client-writable)
- PWA manifest + unified service worker (`injectManifest` strategy, FCM-compatible)
- iOS install education screen (`isIOS && !isStandalone` detection)
- Playwright E2E fixture: `signInWithCustomToken` via Admin SDK (built now — every subsequent E2E test depends on it)

**Must avoid:** iOS popup blocked (Pitfall 8), iOS storage isolation (Pitfall 9), token timing race (Pitfall 2), dual-service-worker reload loop, E2E cannot automate real OAuth (Pitfall 17)

**Research flag:** Well-documented patterns. Skip phase research. Custom authDomain setup requires following STACK.md exactly.

---

### Phase 2: Pair Management — Invite + Join

**Rationale:** Pair membership (`pairId` on the user document) is the foreign key for all entry data. No entry can be scoped to a pair until the pair exists. The `joinPair` transaction enforces the cap-of-2 constraint that is central to the product's privacy model.

**Delivers:**
- `generateInvite` onCall Cloud Function
- `joinPair` onCall Cloud Function — transactional, validates cap=2, marks invite used atomically
- Firestore rules for `/invites/{code}` and `/pairs/{pairId}`
- Invite page (display 6-char code + share mechanism)
- Join page (enter code, call joinPair, navigate to today-entry on success)
- `minInstances: 1` on `joinPair` to prevent cold-start on first-use UX (Pitfall 6)
- Firebase App Check enabled (Pitfall 14 — invite code brute-force)
- Emulator tests: successful join, cap enforcement (third join rejected), own-invite rejection, expired invite rejection

**Must avoid:** Cold start on joinPair (Pitfall 6), invite brute-force (Pitfall 14)

**Research flag:** Standard patterns. Cloud Function transaction scaffolding from ARCHITECTURE.md is directly usable.

---

### Phase 3: Submission + Privacy Layer

**Rationale:** This phase establishes the privacy property. The partner will be able to see that the other has submitted (via `submittedMembers` on the entry document) but not read the submission content. This is the phase where the privacy claim is first testable. Storage rules and HEIC handling belong here.

**Delivers:**
- `SubmissionForm`: HEIC detection + `heic2any` conversion then Canvas compression then `uploadBytesResumable` to Storage then Firestore submission document write
- Entry auto-creation on first submission of the day (client creates entry document with `status: "pending"` and `submittedMembers: []`; Cloud Function owns all subsequent state transitions)
- Firestore rules for `/entries/{entryId}`: metadata readable by pair members; `status` field not client-writable
- Firestore rules for `/submissions/{uid}`: own-write, own-read — partner read blocked
- Storage rules: pair membership check + own-path write restriction (NOT cross-service yet — emulator cross-service bug)
- Submission confirmation screen after successful write
- `hasPendingWrites` offline indicator
- LocalStorage draft persistence (prevents content loss if user closes app before upload completes)
- Storage CORS configuration for production domain
- Emulator tests: own submission write succeeds; partner read of submission fails; missing-field guards in rules

**Must avoid:** Missing field in rules (Pitfall 1), SW blocks Storage uploads (Pitfall 10), HEIC images (Pitfall 15), Storage CORS (Pitfall 19), secrets in bundle (Pitfall 16)

**Research flag:** Privacy rule pattern is verified and documented in ARCHITECTURE.md. HEIC handling requires `heic2any` integration — follow PITFALLS.md Pitfall 15 exactly.

---

### Phase 4: Reveal Mechanic

**Rationale:** This is where the core product promise is validated end-to-end. All previous phases are scaffolding for this one. The reveal mechanic requires Firestore transactions in Cloud Functions (to prevent race conditions), conditional real-time listeners on the client (a denied `onSnapshot` does not auto-recover), and Storage cross-service rules for image access after reveal.

**Delivers:**
- `onSubmissionCreated` Firestore trigger: reads `submittedMembers`, atomically sets `status: "revealed"` if both submitted (auto-reveal), sets `status: "partial"` otherwise
- `revealEntry` onCall Cloud Function: manual "Reveal Anyway" — checks caller has submitted, atomically sets `status: "revealed"` with `revealReason: "manual"` and `revealedBy: callerUid`
- Both functions implement status FSM check (`if data.status === 'revealed' return`) to handle race with simultaneous operations
- FCM send is always sequenced AFTER Firestore write commit — never concurrent (Pitfall 5)
- Full Firestore rules for `/submissions/{uid}`: partner read allowed when `entryIsRevealed()` returns true
- Storage cross-service rules: `firestore.get()` on entry document to check `status === "revealed"` for partner image reads (validate manually against staging — emulator cross-service bug)
- `useEntryListeners` hook: 3-layer conditional listener — entry metadata (always), own submission (always), partner submission (only when `entry.status === "revealed"`)
- `RevealView` component: both submissions side-by-side, reveal metadata display
- Partial-reveal state design: Person B's today-entry screen when `status === "partial"` and `revealedBy !== null`
- Emulator tests: auto-reveal fires on second submission; partner read succeeds after reveal; `revealEntry` callable; concurrent submission test with `Promise.all`

**Must avoid:** Both-submit race (Pitfall 3), revealAnyway + submit race (Pitfall 4), FCM before write (Pitfall 5), cache serving stale pre-reveal data (Pitfall 20)

**Research flag:** This phase is the most complex. Use ARCHITECTURE.md `onSubmissionCreated` and `revealEntry` implementations as the starting implementation. The concurrent test pattern in Pitfall 3 is mandatory. Cross-service Storage rules must be validated against staging Firebase project, not just the emulator.

---

### Phase 5: Timeline + FCM Notifications

**Rationale:** Timeline is additive — it requires revealed entries (Phase 4) but does not change any privacy logic. FCM token management belongs here alongside notification sends in the Cloud Functions from Phase 4.

**Delivers:**
- `useTimeline` hook: `onSnapshot` query on `status === "revealed"` entries, ordered by `date` desc, with proper cleanup (Pitfall 13)
- `TimelinePage` and `TimelineEntry` components: dated card list, reveal metadata displayed, photo + text side-by-side
- `useFCM` hook: FCM token registration with per-device upsert to Firestore (`users/{uid}/fcmTokens` map), token rotation handling
- FCM sends in Cloud Functions: "partner submitted", "auto-reveal ready", "Reveal Anyway triggered" — content-free notification copy (never include submission content in notification body)
- Notification permission opt-in: post-pair on Android, post-first-reveal on iOS; gated on `navigator.standalone && 'Notification' in window`
- In-app badge fallback for users ineligible for push (iOS < 16.4, EU iOS 17.4+, non-installed)
- `UNREGISTERED` token cleanup in Cloud Functions (Pitfall 7)
- Emulator tests: timeline query returns only revealed entries; non-pair-member denied

**Must avoid:** FCM before write (already fixed in Phase 4), stale FCM token (Pitfall 7), iOS push gating (Pitfall 11), listener memory leak (Pitfall 13)

**Research flag:** Standard patterns. FCM token management pattern in Pitfall 7 is the most commonly skipped step — do not defer it.

---

### Phase 6: PWA Hardening + Security Audit + Cross-Platform Testing

**Rationale:** All product features are complete after Phase 5. This phase makes the product shippable: comprehensive rule test coverage, cross-browser PWA testing, and the offline experience.

**Delivers:**
- Complete Firestore rule test suite in emulator: all allow/deny branches including missing-field documents, pre-reveal/post-reveal states, non-member access, own vs. partner reads
- Storage rule test suite: own-write, partner-read pre-reveal (should fail) and post-reveal (should succeed) — cross-service behavior validated against staging project
- Offline shell caching strategy: cache-first for app shell; network-first for Firestore (SDK handles automatically via `persistentLocalCache`)
- Service worker 7-day cache graceful degradation: app shows "You're offline" state rather than blank screen when cache is evicted
- Cross-browser PWA install testing: Android Chrome (`beforeinstallprompt` deferred), iOS Safari (install education screen flow), desktop Chrome/Edge/Safari
- Bundle inspection (`npx vite-bundle-visualizer`) to confirm no secrets bundled
- `minInstances` confirmed on `joinPair` and `revealEntry` Cloud Functions

**Must avoid:** Missing-field rules (Pitfall 1), secrets in bundle (Pitfall 16), iOS install prompt already handled in Phase 1 but validated here (Pitfall 12)

**Research flag:** Standard hardening patterns. Cross-service Storage rules emulator bug (firebase-js-sdk#6803) means cross-service Storage rule tests must be validated manually against a staging Firebase project.

---

### Phase Ordering Rationale

- Auth before everything: `uid` is the foreign key for all data
- Custom `authDomain` fix belongs in Phase 1 not Phase 6 — it is a day-zero blocker for iOS, not a polish item
- Pairs before entries: `pairId` is the scope for all entry data
- Submission privacy rules must be complete and tested before reveal logic is layered on top — the reveal mechanic depends on rules being correctly restrictive
- Reveal before timeline: the timeline only shows revealed entries
- FCM token management belongs in Phase 5 alongside the first notification sends — building it as a "single token field" shortcut and retrofitting proper multi-device management is harder than doing it right the first time
- Phase 6 is last: requires all features to exist before testing them cross-platform

### Research Flags

**Phases needing careful implementation (follow research exactly):**
- **Phase 1:** iOS auth flow — the custom `authDomain` + OAuth redirect URI setup is finicky; follow STACK.md Firebase Auth section exactly; test on real iPhone
- **Phase 3:** HEIC image handling — test on real iOS device; simulator may not reproduce HEIC behavior
- **Phase 4:** Concurrent submission test is mandatory — this is the most common place the core mechanic silently breaks
- **Phase 4:** Storage cross-service rules cannot be fully emulator-tested due to firebase-js-sdk#6803 — must validate against staging Firebase project before shipping

**Phases with well-documented standard patterns (low risk):**
- **Phase 2:** Pair join transaction — ARCHITECTURE.md provides the exact implementation
- **Phase 5:** Timeline query — standard `onSnapshot` query pattern
- **Phase 6:** Bundle inspection and CORS configuration — checklist items

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against official docs and npm; version constraints cross-verified |
| Features | MEDIUM-HIGH | Peer apps (Between, Couple, Paired) analyzed; reveal mechanic novelty means limited direct precedent for some UX states |
| Architecture | HIGH | All Firestore rule patterns, transaction patterns, and Storage cross-service rules verified against official Firebase docs; security rule read budget confirmed |
| Pitfalls | HIGH | iOS pitfalls verified against Apple developer forums and filed SDK issues with issue numbers; race conditions verified against Firebase transaction docs |

**Overall confidence:** HIGH

### Gaps to Address

- **Partial-reveal UX state design** — the screens for `status === "partial"` require product design decisions (what copy, what layout) that research cannot answer. Must be resolved in Phase 4 planning before implementation begins.
- **Day boundary decision** — UTC vs. local timezone for `date` field on entries. Recommend local date at submission time (`new Date().toLocaleDateString('en-CA')`), but this decision should be confirmed before Phase 3 implementation since it affects the entry document key.
- **Storage cross-service rules in emulator** — firebase-js-sdk#6803 means these cannot be tested against the emulator. The workaround is a staging Firebase project for this specific test. This gap should be tracked as a known limitation in the Phase 4 test plan.
- **iOS EU push notification fallback UX** — the in-app badge pattern for EU iOS 17.4+ users needs a UX decision on placement and behavior. Research confirms the platform constraint; the UX response needs product input.

---

## Sources

### Primary (HIGH confidence — official docs, filed issues)
- [Firebase Auth: Redirect Best Practices](https://firebase.google.com/docs/auth/web/redirect-best-practices) — authDomain/iOS fix
- [Firebase Cloud Functions v2 docs](https://firebase.google.com/docs/functions/version-comparison) — v2 recommendation
- [Firestore Security Rules: Writing Conditions](https://firebase.google.com/docs/firestore/security/rules-conditions) — get() cross-doc reads, field access behavior
- [Firebase Storage: Cross-service Security Rules](https://firebase.blog/posts/2022/09/announcing-cross-service-security-rules/) — firestore.get() in Storage rules
- [Firestore Transactions docs](https://firebase.google.com/docs/firestore/manage-data/transactions) — transaction patterns
- [vite-plugin-pwa npm, v1.3.0](https://www.npmjs.com/package/vite-plugin-pwa) — injectManifest requirement
- [Tailwind CSS v4 Vite Installation](https://tailwindcss.com/docs/installation/using-vite) — @tailwindcss/vite plugin
- [Zod v4 Release Notes](https://zod.dev/v4) — TS 5.5 requirement, breaking changes
- [firebase-js-sdk#6803](https://github.com/firebase/firebase-js-sdk/issues/6803) — cross-service Storage rules emulator bug
- [firebaseui-web#139](https://github.com/firebase/firebaseui-web/issues/139) — iOS standalone OAuth issue
- [firebase-js-sdk#2536](https://github.com/firebase/firebase-js-sdk/issues/2536) — auth token timing issue
- [firebase-js-sdk#2783](https://github.com/firebase/firebase-js-sdk/issues/2783) — Storage upload stall on iOS PWA

### Secondary (MEDIUM confidence — peer analysis, documented patterns)
- [PWA iOS Limitations 2026 (MagicBell)](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) — 7-day cache, 50MB limit, EU push restriction
- [FCM Best Practices: Token Management](https://firebase.google.com/docs/cloud-messaging/manage-tokens) — token upsert pattern
- [BeReal product lessons (Medium)](https://tearthemdown.medium.com/6-product-lessons-from-bereal-including-user-education-36564408b9c6) — reveal UX analogues
- [Appbot 2026 Push Notification Best Practices](https://appbot.co/blog/app-push-notifications-2026-best-practices/) — notification timing and frequency
- [heic2any GitHub](https://github.com/alexcorvi/heic2any) — iOS HEIC conversion
- [nearform/playwright-firebase](https://github.com/nearform/playwright-firebase) — E2E auth with custom token
- [CDT Report: E2EE and Content Moderation](https://cdt.org/insights/report-outside-looking-in-approaches-to-content-moderation-in-end-to-end-encrypted-systems/) — rationale for no moderation infrastructure

---

*Research completed: 2026-08-30*
*Ready for roadmap: yes*
