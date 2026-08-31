---
phase: 4
status: draft
---

# Phase 4 — Validation

## Scenarios

| ID | Behavior | Type | Status |
|----|----------|------|--------|
| AUTO-01 | Auto-reveal fires when 2nd submission lands | CF trigger | ⬜ |
| AUTO-02 | Auto-reveal does not double-fire if already revealed | CF trigger guard | ⬜ |
| MANUAL-01 | revealAnyway succeeds for submitter before partner submits | CF unit | ⬜ |
| MANUAL-02 | revealAnyway fails if uid not in submittedMembers | CF unit | ⬜ |
| MANUAL-03 | revealAnyway fails if entry already revealed | CF unit | ⬜ |
| TIMELINE-01 | Timeline shows only revealed entries | client | ⬜ |
| TIMELINE-02 | Both submissions readable in timeline card post-reveal | rules (Phase 3 verified) | ✅ |
