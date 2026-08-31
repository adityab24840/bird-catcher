---
plan: "03-02"
status: complete
commit: d67bbce
---

# Plan 03-02 Summary — Security Rules + Emulator Tests

## What shipped

- **firestore.rules**: Added `match /pairs/{pairId}/entries/{entryDate}` (member-only read, `allow write: if false`) with nested `match /submissions/{uid}` — owner reads unconditionally; partner reads only when entry `status == 'revealed'` with null-guard. Uses `$(database)` variable throughout.
- **storage.rules**: Replaced placeholder with pair-scoped rules under `match /pairs/{pairId}/entries/{entryDate}/{uid}/{filename}`. Write gated on uid match + `firestore.exists()` membership. Read allows owner always, partner post-reveal only. Uses literal `(default)` in `firestore.get()` paths.
- **tests/rules/submissions.test.ts**: 10 Firestore rule scenarios (6 deny, 4 allow) covering SEC-01, SEC-02, SEC-04, SUBM-05, SUBM-06. Uses `initializeTestEnvironment` with both `firestore` and `storage` keys.
- **tests/rules/storage.test.ts**: 6 Storage rule scenarios (3 deny, 3 allow) covering SEC-03.

## Key constraint enforced

Storage rules use literal `(default)` in `firestore.get()`; Firestore rules use `$(database)` — not interchangeable.
