---
phase: 4
slug: reveal-timeline
status: draft
created: 2026-09-01
---

# Phase 4 — Context

## Design Decisions

**D-01** `EntryDoc.status` widens to `'pending' | 'one_submitted' | 'revealed'`. Add optional fields: `revealedBy?: string`, `revealReason?: 'auto' | 'manual'`, `revealedAt?: Timestamp`.

**D-02** Auto-reveal trigger: `onDocumentWritten` v2 on `pairs/{pairId}/entries/{entryDate}/submissions/{uid}`. Guard: event is not a delete + entryDoc.submittedMembers.length === 2 + entryDoc.status !== 'revealed'. Runs a Firestore transaction to set status 'revealed'.

**D-03** `revealAnyway` onCall v2: auth guard → read userDoc (server-side pairId) → read entryDoc → validate uid in submittedMembers and status !== 'revealed' → update entry.

**D-04** Timeline query requires a composite Firestore index: `status ASC` + `date DESC`. Must be created in Firebase Console or via `firestore.indexes.json` before timeline works in production.

**D-05** Timeline card: for each revealed entry, fetch both submissions via `getDocs(collection(db, 'pairs/{pairId}/entries/{entryDate}/submissions'))`. Phase 3 rules already allow partner read when status === 'revealed'.

**D-06** HomePage state machine gains two new branches:
- `status === 'revealed'`: show both submissions inline + link to /timeline
- `status === 'one_submitted'` + uid in submittedMembers: show "Reveal Anyway" button

**D-07** No Firestore security rule changes needed — Phase 3 rules already permit partner reads post-reveal.

**D-08** `onDocumentWritten` import path: `firebase-functions/v2/firestore`. Trigger path string: `'pairs/{pairId}/entries/{entryDate}/submissions/{uid}'`.
