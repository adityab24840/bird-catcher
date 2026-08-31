# Phase 2: Pair Management - Context

**Gathered:** 2026-08-31
**Status:** Ready for planning
**Note:** Partial discuss-phase (Areas 1-2 partially covered; Areas 3-4 deferred to Claude's Discretion)

<domain>
## Phase Boundary

Two authenticated users connect into a private two-person space using a one-time 6-character invite code. User A creates a pair and receives a shareable code; User B enters the code and joins. Pair membership is capped at exactly 2 members, enforced server-side by a Cloud Function. After pairing, both users see a shared home screen that shows partner identity (placeholder until Phase 3 adds submissions).

</domain>

<decisions>
## Implementation Decisions

### Routing — Unpaired State
- **D-01:** Unpaired authenticated users land on `/pair-setup` instead of `/home`. App.tsx route guard: if `user` exists but `pairId === null`, redirect to `/pair-setup`. After pairing, redirect to `/home`.

### Pair Setup Screen Layout
- **D-02:** Single `/pair-setup` screen with two equal-weight CTAs: "Create a pair" and "Join with code". No hierarchy between the two paths. Follows the max-w-sm card pattern from Phase 1.

### Invite Code Display (User A — Create Path)
- **D-03:** After `createPair` Cloud Function resolves, display the 6-character code in a styled code box with a single "Copy code" button (`navigator.clipboard.writeText`). No share sheet, no QR code.
- User A stays on `/pair-setup` in a "waiting" state (code visible) until their `users/{uid}.pairId` becomes non-null (via onSnapshot listener), then auto-redirect to `/home`.

### Code Entry (User B — Join Path)
- **D-04:** 6-character uppercase input field. Auto-submit (call `joinPair` Cloud Function) when the 6th character is entered — no separate submit button.

### Paired Home Screen
- **D-05:** After pairing, `/home` shows partner's display name and photo (fetched via `users/{partnerId}` — read allowed because both are in the same pair) plus a brief "You're connected" message. Phase 3 replaces this content area with the submission UI. Sign-out button retained.

### Claude's Discretion
- Real-time pairing update strategy: use onSnapshot on `users/{uid}` to detect `pairId` becoming non-null; auto-redirect. Implementation detail for planner.
- App Check initialization (SEC-07): timing and debug-token config for emulator — follow Firebase App Check v2 patterns; debug token via env var.
- Error states for invalid/expired/already-used codes and already-paired users: standard inline error pattern below the input field.
- Firestore rules for `pairs/{pairId}` document: structure and read/write permissions are implementation decisions for the planner/researcher.
- Invite code generation algorithm (alphanumeric, 6 chars, nanoid or crypto.randomBytes): planner's choice.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Pairing — PAIR-01 through PAIR-06 (invite code, expiry, single-use, cap enforcement)
- `.planning/REQUIREMENTS.md` §Security — SEC-05 (joinPair transaction), SEC-07 (App Check)
- `.planning/ROADMAP.md` §Phase 2 — goal, success criteria, exact requirements list

### Project Constraints
- `CLAUDE.md` — full tech stack constraints (Firebase only, Cloud Functions v2, no other backend, Zod 4 validation, signInWithRedirect-only auth)

### Existing Code — Patterns to Follow
- `shared-reveal/src/types/index.ts` — `UserDoc` interface already has `pairId: string | null`; extend here if needed
- `shared-reveal/src/hooks/useAuth.ts` — hook pattern (useState + useEffect + onAuthStateChanged); follow for new hooks
- `shared-reveal/src/pages/HomePage.tsx` — onSnapshot listener pattern, async handler pattern, card UI (max-w-sm, rounded-2xl, shadow-md, purple-500)
- `shared-reveal/src/App.tsx` — routing pattern (auth guard via useAuth); add pairId guard here
- `shared-reveal/functions/src/index.ts` — Cloud Functions v2 onCall pattern; new functions go here

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useAuth` hook: exposes `user.uid` — use as the requester UID for all Cloud Function calls
- `onSnapshot` pattern from `HomePage.tsx`: copy for real-time `pairId` detection in pair-setup waiting state
- Card container styles (`max-w-sm rounded-2xl bg-white p-8 shadow-md`): reuse for pair-setup and paired-home screens
- Purple brand button styles from `LandingPage.tsx`: reuse for "Create a pair" CTA

### Established Patterns
- Hooks in `src/hooks/` as single source of truth for reactive state
- Pages in `src/pages/`, components in `src/components/`, services in `src/services/`
- Cloud Functions v2 `onCall` with Firestore transactions for state mutations
- `UserDoc` in `src/types/index.ts` — all new Firestore document types go there
- `functions/src/index.ts` — all Cloud Functions exported from this file

### Integration Points
- `App.tsx`: add third route guard — `pairId === null → /pair-setup`; update routing logic
- `users/{uid}` Firestore document: `pairId` field written by `joinPair` Cloud Function
- New `pairs/{pairId}` collection: stores invite code, members array, expiry timestamp

</code_context>

<specifics>
## Specific Ideas

- Code display: styled monospace box (e.g., letter-spacing: wide, large font) with single "Copy code" button
- Auto-submit on 6th character: `onChange` handler checks `value.length === 6` and fires Cloud Function call
- Waiting state: User A stays on `/pair-setup` — show the code + a spinner/status line "Waiting for your partner…"; onSnapshot handles the redirect

</specifics>

<deferred>
## Deferred Ideas

- QR code for invite sharing — mentioned but deferred; too heavy for Phase 2
- Native share sheet (navigator.share) — simpler copy button chosen instead
- App Check enforcement level details (debug vs enforce): leave to researcher/planner

</deferred>

---

*Phase: 02-pair-management*
*Context gathered: 2026-08-31 (partial discuss-phase)*
