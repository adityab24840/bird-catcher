# Feature Landscape: Reveal

**Domain:** Private two-person intimate sharing app with delayed-reveal mechanic
**Researched:** 2026-08-30
**Overall confidence:** MEDIUM-HIGH (peer apps verified via multiple sources; reveal mechanic novelty means limited direct precedent)

---

## Table Stakes

Features users of private two-person apps consider baseline expectations. Absence makes the product feel incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Push notifications for core events | Partners are on different schedules; without notifications the loop breaks silently | Low-Med | 3 natural notification points in Reveal; see Notifications section |
| Clear submission status indicator | Users need to know: have I submitted? Has my partner? What state are we in? | Low | This is the single most important ambient display in the app — the "waiting screen" |
| Offline shell with meaningful error state | PWA convention; users rage-quit when the app goes blank instead of showing something | Med | Minimum: cached app shell + last-loaded timeline; offline compose is deferred |
| Persistent cloud data across reinstalls | Between and Couple both burn users who lose memories on reinstall; it is a known complaint | Low | Spec already handles this via Google account restore |
| Browsable chronological timeline | Every app in this space has one; users expect to scroll back through shared history | Low | Spec has this; see Timeline section for UX pattern choice |
| Reliable media upload with progress feedback | Silent upload failures are one of the top complaints in photo-sharing apps | Med | Spec has client-side compression; progress feedback is the UX piece |
| Pair setup with clear invite flow | First-use friction is the #1 drop-off point in two-person apps | Low | Spec has 6-char code; on-screen clarity of "share this code with one person" matters |
| Submission confirmation feedback | Users need unambiguous confirmation their entry was received before they close the app | Low | A "submitted" state screen or badge is table stakes — don't let users second-guess |
| PWA installability (Android + iOS) | Users of intimate apps use them daily on mobile; browser UI creates friction and distance | Med | Platform differences are significant; see PWA Install section |
| Data persistence / no silent loss | Partners build emotional investment in the timeline; any entry loss is catastrophic trust damage | Low | Firebase Storage + Firestore durability handles this; client feedback handles perception |

---

## Differentiators

Features that give Reveal a distinct value proposition over existing apps. These are not expected — they are what makes the product memorable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Privacy-enforced blind submission | The reveal condition is a security rule, not a UI toggle — this is structurally unique among consumer apps | High | Spec's core value; Firestore rules are the guarantee |
| Auto-reveal on mutual submission | No coordination needed; the reveal "happens" when the second person submits — creates a natural micro-event | Med | BeReal's core mechanic analogue; the moment of reveal is emotionally resonant |
| "Reveal Anyway" escape hatch | Prevents the mechanic from becoming a hostage situation; the initiator bears the asymmetry consciously | Med | One-sided reveal: Person A visible to B, but B's entry stays private; spec is correct |
| Reveal metadata in timeline | Knowing who revealed and why is a story element — it adds context to each memory | Low | revealedBy / revealReason / revealedAt already in spec |
| Permanent immutable shared timeline | Between users complain that photo storage is gated/paywalled; permanence is a promise | Low | Spec commits to permanent timeline; enforce this as a product promise |
| Daily prompt as shared ritual | Gratitude/shared-journal research shows that a consistent daily prompt drives habit better than open-ended submission | Low | Static prompt for MVP is fine; the ritual framing matters more than prompt variety |
| Waiting state as designed experience | The period between "I submitted" and "reveal" is anticipation, not dead time — design it as such | Low | See Reveal Mechanic section |

---

## Anti-Features

Features to explicitly not build, with rationale.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Reactions and comments | Between/Couple users ask for them; every app adds them; they shift the dynamic from shared discovery to performance and response anxiety | The timeline itself is the response — seeing what each person submitted is the conversation |
| Streaks and streak-break anxiety | Duolingo-style streaks are explicitly hostile UX in an intimate context; they manufacture guilt and pressure | The daily prompt creates natural rhythm without punishing missed days |
| Read receipts on the waiting state | Showing "partner has seen your submission" before reveal is a dark pattern that creates pressure | The reveal event is the only meaningful signal |
| Notification for "you haven't submitted today" | Guilt-nudge notifications break trust in relationship apps faster than any other pattern | If needed later, make it opt-in with warm copy — never automated pressure |
| Entry editing after submission | Retroactive editing undermines the authenticity premise; if you could revise after seeing partner's entry it breaks the mechanic | Submission is final; communicate this clearly in the UI |
| Multiple pairs per user | Between learned this creates "main relationship vs. others" social dynamics; the product is explicitly for one pair | Single pair per user is spec-correct |
| Content moderation infrastructure | This is a sealed private two-person space; neither party can access the other's submission until revealed; no third party has any view into content | No moderation needed; see Content Moderation section |
| Social discovery or public profiles | Antithetical to the privacy model; no graph, no explore, no sharing outside the pair | — |
| Video and voice notes | Photo + text is sufficient for MVP; video introduces upload/storage complexity and codec handling that is not worth it at this stage | Defer to v2 if users request it |
| AI-generated prompts or caption suggestions | Spec explicitly excludes AI; the product is intentionally human-only | — |

---

## Reveal Mechanic: UX Precedents and Patterns

The blind-submission-then-reveal mechanic is the product's core differentiator. There are no direct app precedents for a private two-person version, but useful analogues exist.

### Closest Precedent: BeReal

BeReal's mechanic — you cannot see friends' posts until you have posted your own — is structurally similar. Key lessons from BeReal:

1. **The waiting state is the tension, not an obstacle.** BeReal's "X friends have already posted" counter creates anticipation, not frustration. Design Reveal's waiting screen to communicate excitement ("they've submitted — you can reveal when you're ready") rather than absence ("nothing here yet").
2. **"Late" is a behavioral signal, not a punishment.** BeReal marks late posts visually but does not block them. For Reveal, a partner who submits late is still participating — do not punish lateness. If anything, show the streak of days with mutual submissions as a positive signal.
3. **The moment of reveal must be an event.** BeReal users describe the notification "your friend posted" as one of the app's best moments. Reveal's equivalent is the dual-submitted auto-reveal — it should be accompanied by a distinct reveal transition, not a silent data load.
4. **Forced authenticity through constraint.** BeReal's two-camera requirement prevents curation. Reveal's blind mechanic similarly prevents coordination ("wait, what are you going to submit? I'll do something similar"). The constraint is the integrity.

### Board Game Analogue: Sealed Bid / Simultaneous Reveal

In sealed-bid auction games (Revolution!, Modern Art), players secretly commit, then all reveal simultaneously. The emotional experience is: "I committed, now I face the consequences." Relevant UX insight: the reveal should feel final and shared, not gradual. A phased reveal (first text, then photo) undermines the moment; show both submissions side-by-side or in quick sequence.

### Asymmetric State: "Reveal Anyway"

When only one person has revealed, the app enters an asymmetric state:
- Person A's submission is visible to both
- Person B's submission remains sealed
- Person B is notified that Person A has revealed

This is underspecified in the current spec. The UX question is: what does Person B see after receiving the notification? They see Person A's entry, with a clear prompt to submit their own. The timeline entry for that day should show as "partial reveal" until Person B submits. This state must be designed explicitly — it is not a common pattern in existing apps and will require user testing.

---

## Push Notifications: What's Useful vs. Annoying

The spec defines three notification types. This is the correct set — do not add more without strong justification.

### The Three Valid Notifications

| Event | Trigger | Copy Principle | Avoid |
|-------|---------|---------------|-------|
| Partner submitted | Person B submits for a given day | Warm, no spoilers ("they've left something for you") | Never include any preview of content |
| Both submitted (auto-reveal) | Second submission completes | Celebratory, event-framed ("today's reveal is ready") | Don't make it feel administrative |
| Reveal Anyway triggered | Person A triggers early reveal | Informational, no guilt ("[Partner] shared their entry early — see yours?") | No pressure copy |

### What Research Says About Timing and Frequency

- 40% of users lose interest when receiving 3-6 notifications per day. Reveal's max is 2-3 per day naturally (partner submitted + reveal ready), which is within tolerance.
- 39% of users say notifications bother them because of timing, not volume. The "partner submitted" notification hitting at 11pm when the receiving partner is asleep is a real issue. Time zone awareness and quiet hours are worth building even for MVP, or at minimum, documenting as a known friction point.
- Notifications in intimate apps should never use guilt-driven copy. "You haven't submitted yet" is a landmine. If a daily reminder is ever added, it must be opt-in and warm in tone.
- Never reveal the partner's submission content in the notification body. This would be a security violation of the core mechanic. All notification copy must be content-free.

### Notification UX: The Opt-In Moment

Research consistently shows that explaining the benefit before requesting permission dramatically increases opt-in rates. For Reveal, the optimal moment to request notification permission is:

- **Android**: Immediately after pairing is complete (the user has just committed to the app)
- **iOS**: After the first successful submit-and-reveal cycle — when the user has experienced the core loop and understands why notifications matter

Do not request permission on first launch. The user has not yet seen the value.

---

## Timeline UX Patterns

For Reveal's use case (daily entries, growing collection, two people browsing together), the timeline patterns from comparable apps are:

### Pattern Recommendation: Dated List with Visual Cards

For the scale of this app (at most 365 entries per year, likely sparse), a simple chronological list with date-stamped cards is sufficient and appropriate. Neither infinite scroll nor a calendar grid is necessary at MVP.

- **Against calendar grid at MVP**: Calendar view excels when users want to navigate to a specific date. For Reveal, browsing is emotional and sequential ("let's scroll back through our memories"), not navigational ("I want to see July 14th"). Calendar view adds interface complexity without serving the primary use pattern.
- **Against infinite scroll at MVP**: Infinite scroll is designed for high-volume feeds (hundreds of items). This timeline will have tens to low hundreds of entries. A simple list with a scroll is fine.
- **In favor of dated cards with reveal metadata**: Each card should show both entries side-by-side (or stacked), the date, the prompt, and who revealed (if triggered early). This is the memory artifact.

### Future Consideration: Calendar View for "On This Day"

Instagram's use of calendar UI to resurface past moments ("what you shared on this date") is a well-validated pattern. A "memories" feature (show entries from same date in prior years) is a natural v2 addition. Design the data model to support it from day one.

---

## Offline Behavior

### User Expectations in Sharing Apps

Research is clear on three non-negotiable user expectations for offline PWAs:

1. Content they've already loaded should remain accessible
2. The app should tell them it's offline rather than showing a broken state
3. Their in-progress work should not be lost

### What to Build for MVP

| Behavior | Build Now | Defer |
|----------|-----------|-------|
| App shell loads offline | Yes — service worker precache | — |
| Timeline entries readable offline (cached) | Yes — cache last N entries | — |
| Offline compose + queue submission | No — significant complexity | v2 |
| Upload retry on reconnect | Yes — Firebase SDK handles this natively | — |
| Clear "you're offline" indicator in UI | Yes — dead simple, high value | — |
| Cached photos viewable offline | Partial — rely on browser cache, do not implement separate media cache for MVP | v2 |

The main risk is a user composing an entry offline and losing it when they close the browser before reconnection. The minimum mitigation is to persist draft content to localStorage and restore it on app reload. This is not the same as queued submission — it just prevents data loss from early close.

---

## PWA Install Prompts

### Android Chrome

The `beforeinstallprompt` event gives developers full control over timing. The spec (vite-plugin-pwa) will handle the manifest and service worker requirements that trigger it.

**Best trigger moment for Reveal**: After the first successful reveal cycle — the user has just experienced the product's value. This is the highest-intent moment for installation. Intercept the `beforeinstallprompt` event on page load, defer it, and surface the install UI after reveal.

**What to show**: A brief in-app banner ("Add Reveal to your home screen for daily access") with an install button. Not a modal. Not a gate.

### iOS Safari

No programmatic prompt is possible on iOS. Safari requires manual "Add to Home Screen" from the share menu. Chrome and Edge on iOS/iPadOS do not support PWA installation at all — Safari only.

**Required design work**: A custom iOS install instruction UI, shown only when `display-mode: browser` is true (i.e., the app is running in the browser, not as an installed PWA). Show this after the user has paired and submitted once. The instruction must be visual ("tap the share icon, then tap 'Add to Home Screen'") because text alone fails on iOS.

**Key callout for spec**: The spec says "PWA installable on Android Chrome, iOS Safari, desktop Chrome/Edge/Safari." This is accurate, but iOS Safari installation has a conversion surface problem that must be explicitly designed — it cannot be deferred to a "later UX pass." Without an iOS install education screen, iOS users will never install the app.

---

## Content Moderation

**Decision: No content moderation infrastructure needed for Reveal.**

Rationale:

1. Both parties in a pair mutually consent to the relationship and to the app. There is no unsolicited contact.
2. No submission is ever visible to anyone outside the pair. There is no public surface for harmful content to spread to.
3. Firestore and Storage Security Rules mean that not even the app operator can read entries until they are revealed — and even after reveal, only the two pair members can read them.
4. Academic research on content moderation in E2E encrypted systems explicitly notes that "in encrypted message exchanges, only authenticated participants in the conversation can access the message, and no third party has access." Reveal's model is equivalent.
5. The failure mode in an abusive relationship is a relationship problem, not an app moderation problem. The app does not need a reporting flow because the only other party in the pair is the person being reported to.

**One edge case to document**: If the pair is ever dissolved (feature not in MVP), any unrevealed submissions should be deleted, not surfaced. This is a data deletion concern, not a moderation concern.

---

## Feature Dependencies

```
Google Sign-In
  └─ User document created
       └─ Pair invite flow (6-char code)
            └─ Pair membership (exactly 2, enforced via Functions)
                 └─ Daily entry submission
                      └─ Submission privacy (Firestore rules)
                           ├─ Auto-reveal (both submitted)
                           │    └─ Shared timeline
                           └─ Reveal Anyway (one submitted, triggers early)
                                └─ Push notification to partner
                                └─ Partial-reveal state in timeline
```

Push notifications depend on FCM token registration, which depends on user document creation and notification permission grant.

PWA installability depends on manifest + service worker, which can be independent of auth, but install prompt timing depends on user having completed the pairing flow.

---

## MVP Recommendation

**Build first (core loop):**
1. Google Sign-In + user document creation
2. Invite code pairing (6-char, 24h, server-enforced cap of 2)
3. Daily entry submission (photo + text, at least one required)
4. Submission privacy via Firestore/Storage rules
5. Auto-reveal + Reveal Anyway with FCM notifications
6. Shared timeline (simple dated card list, newest first)
7. PWA installability with iOS install education screen

**Build second (table stakes UX):**
8. Clear submission status indicator (home screen ambient state)
9. Offline shell + "you're offline" indicator + localStorage draft persistence
10. Upload progress feedback and retry handling
11. Notification permission opt-in at correct moments (post-pair on Android, post-first-reveal on iOS)

**Defer explicitly:**
- Calendar grid view for timeline (v2)
- "On This Day" memories feature (v2)
- Video/voice entries (v2)
- Prompt rotation (v2 — static prompt sufficient for MVP)
- Offline compose + submission queue (v2)

---

## Spec Observations and Contradiction Flags

These are places where the current spec is underspecified or where feature research surfaces a risk.

| # | Issue | Severity | Recommendation |
|---|-------|----------|---------------|
| 1 | The partial-reveal state (Reveal Anyway, only one side visible) is unspecified as a UX state | High | Explicitly design this state before implementation: what does Person B see after notification? What does the timeline card look like before Person B submits? |
| 2 | No mention of what happens to days where neither person submits | Medium | Days with no entries should simply not appear in the timeline. Spec should confirm: no "missed day" entry, no streak tracking |
| 3 | iOS install education screen has no owner in the spec | Medium | This is mandatory for iOS conversion and must be a designed artifact, not an afterthought |
| 4 | Notification permission timing is not specified | Medium | Tie Android permission request to post-pair moment; tie iOS install instructions to post-first-reveal |
| 5 | "Submission confirmation feedback" is not called out in spec | Low | Needs a "you've submitted" state screen or badge — currently implied but not specified |
| 6 | Static daily prompt is correct for MVP but the spec doesn't define what happens when a new day starts | Low | Define day boundaries: UTC midnight or local timezone? Firebase Timestamp on submission determines the entry's date; be explicit |
| 7 | Spec says "photo + optional text (both optional, at least one required)" — this phrasing is ambiguous | Low | Clarify in spec: either photo or text or both is a valid submission. A text-only submission with no photo should be accepted |

---

## Sources

- Between app analysis: [OneDateIdea.com Between Review](https://www.onedateidea.com/reviews/between-app/)
- User review signals: [JustUseApp Between Reviews](https://justuseapp.com/en/app/458035189/between-couples-love-tracker/reviews), [Apple App Store Between](https://apps.apple.com/us/app/between-the-app-couples-love/id458035189)
- Couples app ecosystem: [CouplesAnalytics on Paired app](https://couplesanalytics.com/en/science/paired-app-reviews-a-data-driven-look-at-top-couples-apps)
- Push notification research: [Appbot 2026 Best Practices](https://appbot.co/blog/app-push-notifications-2026-best-practices/), [Braze Push Notification Guide](https://www.braze.com/resources/articles/push-notifications-best-practices), [Appier on annoying notifications](https://www.appier.com/en/blog/effective-push-notifications)
- PWA install prompts: [web.dev Installation Prompt](https://web.dev/learn/pwa/installation-prompt/), [MDN Making PWAs Installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [MDN Trigger Install Prompt](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt)
- Timeline UX: [UX Patterns Dev - Timeline](https://uxpatterns.dev/patterns/data-display/timeline), [UX Patterns Dev - Calendar](https://uxpatterns.dev/patterns/data-display/calendar), [Memory sharing apps 2026](https://memorymurals.com/journal/best-memory-sharing-apps)
- BeReal mechanic: [BeReal product lessons](https://tearthemdown.medium.com/6-product-lessons-from-bereal-including-user-education-36564408b9c6), [BYU Universe - BeReal experience](https://universe.byu.edu/2022/10/24/not-another-social-network-bereal-draws-massive-crowds-offering-a-unique-social-media-experience/)
- Reveal/waiting UX: [Buzzvel - Time as UX element](https://buzzvel.com/blog/time-as-a-ux-element-designing-for-waiting-anticipation-and-patience), [AxureBoutique - Progress and anxiety](https://axureboutique.com/blogs/ui-ux-design/relieve-user-anxiety-of-waiting-progress-indicator)
- Blind mechanics in games: [BoardGameGeek - Sealed Bid Auctions](https://boardgamegeek.com/boardgamemechanic/2920/auction-sealed-bid)
- Offline PWA: [MagicBell - Offline-First PWAs](https://www.magicbell.com/blog/offline-first-pwas-service-worker-caching-strategies)
- Content moderation in private apps: [CDT Report on E2EE and Moderation](https://cdt.org/insights/report-outside-looking-in-approaches-to-content-moderation-in-end-to-end-encrypted-systems/)
- Coupled journal apps: [Connected Couples App](https://www.connectedcouples.app/couples-journal-app), [Orca/Happyfeed](https://www.okorca.com/)
