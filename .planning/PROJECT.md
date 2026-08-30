# Reveal

## What This Is

Reveal is a private PWA for exactly two people. Each person independently submits something — a photo, text, or both — that reminded them of the other person that day. Their submission stays private until both have submitted (auto-reveal) or one person triggers "Reveal Anyway." Revealed entries form a permanent shared timeline they can browse together.

## Core Value

Submission privacy enforced at the database layer — neither person can read the other's entry until the reveal condition is satisfied, regardless of frontend state.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Google Sign-In only (no email/password, no other OAuth)
- [ ] User document auto-created on first sign-in; restored on reinstall
- [ ] Private two-person pair via invite code (6-char, 24h expiry)
- [ ] Pair membership capped at exactly 2 — enforced by Cloud Functions, not frontend
- [ ] Daily entry with daily prompt per pair
- [ ] Each user submits: photo + optional text (both optional, at least one required)
- [ ] Submission inaccessible to partner until entry is revealed
- [ ] Auto-reveal when both members have submitted
- [ ] "Reveal Anyway" — submitter can reveal their entry before partner submits; partner notified
- [ ] Reveal metadata recorded (revealedBy, revealReason, revealedAt)
- [ ] Shared chronological timeline of revealed entries (newest first)
- [ ] FCM push notifications: partner submitted, both submitted (reveal ready), reveal anyway
- [ ] PWA installable on Android Chrome, iOS Safari, desktop Chrome/Edge/Safari
- [ ] Offline shell (service worker + web app manifest)
- [ ] Firestore Security Rules enforce all privacy constraints (not just frontend)
- [ ] Storage Security Rules mirror Firestore privacy model
- [ ] Firebase Emulator tests for all critical security rules

### Out of Scope

- AI / recommendation systems — explicitly excluded; product is intentionally human-only
- Streaks, reactions, comments — deferred; not part of core reveal loop
- Voice notes, video — media complexity; MVP is photo + text only
- Date planning, shared calendar — out of product scope entirely
- Social graph (followers, discovery) — intentionally private two-person only
- Native Android / iOS app — PWA targets mobile sufficiently for MVP
- Multiple pairs per user — single pair per user for MVP
- Gamification — excluded by design

## Context

- **Audience:** Two specific people in a relationship (romantic, close friendship, etc.)
- **Privacy model:** Submission A is invisible to Person B (and vice versa) until the entry status is "revealed". This is a security property, not a UI toggle.
- **Reinstall behavior:** Cloud data persists; reinstalling and signing in with the same Google account restores the existing pair and timeline.
- **Media:** Images compressed client-side before upload. Storage path: `pairs/{pairId}/entries/{entryId}/{uid}/image.jpg`
- **Daily prompt:** Static prompt for MVP ("Find something today that reminded you of them.") — no prompt rotation in v1.

## Constraints

- **Tech Stack**: React + TypeScript + Vite + Tailwind CSS + React Router + vite-plugin-pwa — decided upfront; no deviation
- **Backend**: Firebase only (Auth, Firestore, Storage, Functions, FCM, Hosting) — no other backend
- **Auth**: Google Sign-In only — no email/password, no other providers
- **Validation**: Zod for all schema validation
- **Testing**: Vitest + React Testing Library (unit), Playwright (E2E), Firebase Emulator (security rules)
- **Package manager**: npm
- **Privacy enforcement**: Firestore/Storage Security Rules are the authority — never rely on frontend to hide submissions
- **Pair size**: Exactly 2 members, enforced server-side via Cloud Functions

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Firebase-only backend | Reduces operational complexity; all services integrate natively | — Pending |
| Google Sign-In only | Eliminates password management; Google account is stable identity for restore-on-reinstall | — Pending |
| Submission privacy as security rule, not UI feature | Core product promise — one person cheating ruins the experience; Firestore rules are the guarantee | — Pending |
| Cloud Functions for pair join/reveal ops | Privileged operations (pair membership cap, reveal state transitions) must not be client-callable | — Pending |
| Client-side image compression | Keeps storage costs low without a resize function | — Pending |
| No reactions in MVP | Avoids feature creep; core loop is submit → reveal → timeline | — Pending |

---
*Last updated: 2026-08-30 after initialization*

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state
