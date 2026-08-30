# Domain Pitfalls

**Domain:** Firebase PWA — private two-person submission app with Firestore-enforced reveal privacy
**Researched:** 2026-08-30

---

## Critical Pitfalls

Mistakes that cause rewrites, security holes, or broken core features.

---

### Pitfall 1: Firestore Rules — Accessing a Missing Field Throws, Not False

**What goes wrong:** A rule like `resource.data.status == 'revealed'` throws a runtime error (not `false`) when the `status` field does not exist on the document. This means any document created before you added the field — or any document where the field was never written — causes the rule to error out and deny the request. This is especially treacherous on entry documents before the first user submits: the document may exist with no `status` field, so rules that reference it deny all reads, including reads by the pair member who should be allowed to see the entry shell.

**Why it happens:** Firestore security rules use a strict evaluation model. Dereferencing a key that does not exist on a map returns a runtime error, not null or undefined. The rule evaluates to an error state, which counts as a deny.

**Consequences:** Legitimate reads silently fail with PERMISSION_DENIED. The emulator shows this as a rules evaluation error, but production shows it as a generic denial. Debugging is confusing because the rule "looks correct."

**Warning signs:**
- PERMISSION_DENIED errors on documents you expect to be readable
- Emulator logs show `Error: Property status is undefined on object` during rule evaluation
- Rules work on new documents but fail on older ones that predate a field addition

**Prevention:**
Always guard field access with the `in` operator before accessing the value:

```
// WRONG
allow read: if resource.data.status == 'revealed';

// CORRECT
allow read: if 'status' in resource.data && resource.data.status == 'revealed';
```

For `request.resource.data` (writes), do the same:
```
allow create: if 'submittedAt' in request.resource.data;
```

Also use `resource != null` before accessing `resource.data` on rules that might fire on non-existent documents (delete rules, create rules with `get()` calls that return null).

**Milestone:** Address in the same milestone that authors Security Rules (submission and reveal rules). Write a Firebase Emulator test for every rule branch including documents with missing fields — this is the only way to catch this before production.

---

### Pitfall 2: Firebase Auth Token Not Ready at First Firestore Request

**What goes wrong:** After `signInWithRedirect` / `signInWithPopup` resolves, `onAuthStateChanged` fires and the app redirects to the main screen. The first Firestore write (e.g., creating the user document) fires before the underlying ID token has been attached to the SDK's internal request headers. The result is a PERMISSION_DENIED even though `auth.currentUser` is non-null.

**Why it happens:** Firebase Auth restores state from IndexedDB asynchronously. `onAuthStateChanged` can fire before the in-memory token is fully hydrated. Additionally, `email_verified` and custom claims in the token JWT are cached from the previous session — they are only refreshed when the token is force-refreshed or when the user signs in fresh. A rule that checks `request.auth.token.email_verified == true` may fail for an existing signed-in user until a forced token refresh happens. [Documented Firebase SDK issue #2536.](https://github.com/firebase/firebase-js-sdk/issues/2536)

**Consequences:** First-run user document creation silently fails. The user sees no error but their document is never written — pair-joining later fails because the user document doesn't exist. Re-login fixes it, which is impossible to reproduce in testing unless you clear state.

**Warning signs:**
- PERMISSION_DENIED only on the very first sign-in, not on subsequent logins
- Error disappears after the user refreshes the page
- Works fine in the emulator (emulator doesn't enforce token timing)

**Prevention:**
- After auth state resolves, explicitly call `auth.currentUser.getIdToken(true)` before making any Firestore write if the user is brand new (check `additionalUserInfo.isNewUser` from the credential result)
- For rules that depend on custom claims, always call `getIdToken(true)` after any claim change on the backend before retrying the Firestore operation
- Wrap the initial user document creation in a retry with exponential backoff, or use a Cloud Function (`onCreate` trigger on the Auth user) to create the user document server-side so the client never races against its own token

**Milestone:** Auth and user provisioning milestone (M1). The Cloud Function approach (create user document in Auth `onCreate` trigger) eliminates this class of bug entirely — strongly preferred over client-side creation.

---

### Pitfall 3: Reveal Race Condition — Both Users Submit Simultaneously

**What goes wrong:** User A and User B each submit their entry within milliseconds of each other. Each submission triggers the `submitEntry` Cloud Function. Both function invocations read the entry document and see that the partner has not yet submitted. Both write their own submission data. Neither invocation detects "both submitted" because they each read a snapshot where only one submission exists. The reveal never triggers. Both users wait forever.

**Why it happens:** Without a transaction, the two Cloud Function calls are not serialized. The read-check-write sequence is not atomic: both reads happen before either write completes.

**Consequences:** The core privacy reveal mechanic silently breaks. There is no error — both submissions are saved, both users see a "waiting for partner" state that never resolves. This could go undetected in testing if you test submissions sequentially.

**Warning signs:**
- In load testing or rapid manual testing, "auto-reveal" occasionally fails to trigger
- Both `submittedA` and `submittedB` are `true` on the entry document but `status` is still `'pending'`

**Prevention:**
Use a Firestore transaction inside the Cloud Function. The transaction must:
1. Read the entry document
2. Write the current user's submission fields
3. Check if both submissions are now present
4. If yes, atomically set `status: 'revealed'` in the same transaction

```typescript
await db.runTransaction(async (txn) => {
  const entryRef = db.doc(`pairs/${pairId}/entries/${entryId}`);
  const entry = await txn.get(entryRef);
  const updates: Record<string, unknown> = {
    [`submissions.${uid}`]: submissionData,
    [`submittedBy.${uid}`]: true,
  };
  const data = entry.data() ?? {};
  const partnerUid = pairMembers.find((m) => m !== uid);
  if (data.submittedBy?.[partnerUid]) {
    updates.status = 'revealed';
    updates.revealedAt = FieldValue.serverTimestamp();
    updates.revealReason = 'auto';
  }
  txn.update(entryRef, updates);
});
```

Do NOT use `FieldValue.increment` as a substitute — it is atomic for the increment but does not let you conditionally branch based on the resulting value.

**Milestone:** Submit + Reveal Cloud Function milestone. Write an emulator-based concurrent test: fire two `submitEntry` calls with `Promise.all()` and assert the entry ends in `status: 'revealed'` exactly once.

---

### Pitfall 4: "Reveal Anyway" Races with Partner's Simultaneous Submission

**What goes wrong:** User A clicks "Reveal Anyway." Simultaneously, User B (the partner) is in the middle of submitting. Two Cloud Function calls race: `revealAnyway` and `submitEntry`. If `revealAnyway` wins, `status` becomes `'revealed-anyway'`. If `submitEntry` then runs and doesn't check the current status before writing, it may overwrite `revealReason` or incorrectly update `status` to `'auto'` — or worse, the transaction in `submitEntry` reads the pre-`revealAnyway` snapshot and writes over it.

**Why it happens:** Two independent state machines (submit and reveal) are modifying the same document without coordinating their terminal conditions.

**Consequences:** Reveal metadata is corrupted. Audit trail (`revealedBy`, `revealReason`, `revealedAt`) may be inaccurate. Notification logic downstream sends the wrong notification type.

**Warning signs:**
- Entry documents with `revealReason: 'auto'` but only one submission present
- Notification logs show both "reveal-anyway" and "auto-reveal" notifications sent for the same entry

**Prevention:**
Both the `submitEntry` and `revealAnyway` Cloud Functions must treat the entry's `status` field as a finite state machine. Inside the transaction, check `currentStatus` before writing:

```typescript
// Inside submitEntry transaction
if (data.status === 'revealed' || data.status === 'revealed-anyway') {
  // Already revealed by a concurrent revealAnyway — skip status update
  // Still write this user's submission data (it belongs to the entry)
  txn.update(entryRef, { [`submissions.${uid}`]: submissionData });
  return;
}
```

Similarly in `revealAnyway`:
```typescript
if (data.status !== 'pending') {
  throw new HttpsError('failed-precondition', 'Entry already revealed.');
}
```

Both functions use transactions, so if they conflict, one retries automatically and sees the committed state.

**Milestone:** Reveal Cloud Function milestone. Add a specific E2E test: trigger `revealAnyway` and `submitEntry` concurrently and assert that exactly one terminal `status` value is written and exactly one notification type is sent.

---

### Pitfall 5: FCM Notification Sent Before Firestore Write Commits

**What goes wrong:** A Cloud Function sends an FCM notification ("Both of you have submitted — go see!") but sends it before the `await db.doc(entryPath).update({ status: 'revealed' })` has actually committed. The recipient opens the app, the client reads the entry, and the security rule checks `resource.data.status == 'revealed'` — but the document still has `status: 'pending'` because the write hasn't propagated. The app shows PERMISSION_DENIED or "still waiting," and the user is confused.

**Why it happens:** Accidentally placing the FCM send call before the Firestore `await`, or inside a `Promise.all()` where both the Firestore write and the FCM send race each other.

**Consequences:** The user taps the notification, opens the app, and cannot see the content. "But I got the notification!" — trust is broken.

**Warning signs:**
- In testing, tapping a push notification immediately sometimes shows the wait screen
- Race condition correlates with Cloud Function execution time under load

**Prevention:**
Always sequence: write → confirm commit → send FCM. Never put FCM sends in a `Promise.all()` with the Firestore write that gates the read permission:

```typescript
// Always sequential, never concurrent with the write
await entryRef.update({ status: 'revealed', revealedAt: FieldValue.serverTimestamp() });
// Only after commit succeeds:
await sendFCMNotification(partnerFcmToken, { type: 'auto-reveal', entryId });
```

**Milestone:** Notifications milestone. Add this ordering as a code review checklist item. It is easy to accidentally break when refactoring the Cloud Function.

---

### Pitfall 6: Cloud Functions Cold Start on joinPair and revealEntry

**What goes wrong:** The first invocation of `joinPair` or `revealEntry` (after a period of inactivity) takes 2–5 seconds instead of <500ms. This is the cold start: the Node.js runtime, your module imports, and the Firebase Admin SDK all initialize from scratch. `joinPair` is a first-time user experience. `revealEntry` is the emotional moment of the product. A 4-second spinner on either is a significant UX degradation.

**Why it happens:** Gen1 Cloud Functions have no warm instances by default. Gen2 (Cloud Run backed) has better concurrency but still cold-starts from zero if the function hasn't been called recently. Heavy dependencies (Admin SDK, Zod, etc.) in global scope all load on cold start.

**Consequences:** First-impression failures. If the user retries `joinPair` during the cold start, you may get duplicate join attempts.

**Warning signs:**
- Function execution time in Cloud Logging shows bimodal distribution: <500ms vs. 3000ms+
- First usage of the day is consistently slow

**Prevention:**
- Use Cloud Functions Gen2 (v2) for all critical path functions: `joinPair`, `revealEntry`, `submitEntry`
- Set `minInstances: 1` on these functions in `firebase.json` to keep one warm instance — at roughly $5–10/month per function for a 256MB instance, this is acceptable for a two-person app
- Move all `require`/`import` inside function handlers (lazy initialization) for non-critical dependencies
- Use `initializeApp()` at module level (this is fine — it's cheap) but defer Firestore client creation: `const db = getFirestore()` should be inside the handler or using a lazy singleton
- Add a client-side minimum spinner of 300ms so a fast response doesn't feel janky while a slow one feels no worse

```typescript
// firebase.json (Gen2 with minInstances)
"functions": [{
  "source": "functions",
  "runtime": "nodejs20",
  "minInstances": 1  // applied per-function via options in the code
}]
```

In the function:
```typescript
export const joinPair = onCall({ minInstances: 1, region: 'us-central1' }, async (request) => { ... });
```

**Milestone:** Cloud Functions milestone (pair join). Apply `minInstances` from the start — retrofitting it is trivial, but forgetting it until a user demo causes a bad impression.

---

### Pitfall 7: FCM Token Accumulation and Stale Token Silent Failures

**What goes wrong:** When a user reinstalls the PWA or clears the browser cache, they get a new FCM registration token. The old token is now stale. When the Cloud Function tries to send to the old token, it gets a 404 `UNREGISTERED` response from FCM — which it silently ignores if not handled. The user never receives notifications. Also: as of May 2024, tokens inactive for 270 days are expired by FCM, adding another source of stale tokens. If a user has multiple browsers/devices, you accumulate multiple tokens and must manage them all.

**Why it happens:** Most implementations store a single FCM token per user and never clean up old ones. The token refresh listener (`onMessage`) is only called when the app is open, so rotations during offline periods are missed.

**Consequences:** Push notifications stop silently for a subset of users. There is no error from the user's perspective — the notification just never arrives.

**Warning signs:**
- FCM send success rate in Cloud Logging drops over time without any code changes
- Users who reinstalled the PWA stop receiving notifications
- Firebase Console shows `UNREGISTERED` errors in FCM logs

**Prevention:**
- On every app load, call `getToken()` and upsert the result to Firestore: `users/{uid}/fcmTokens` as a subcollection or a map with token as key and lastSeen timestamp as value — never a single field
- Handle 404 `UNREGISTERED` in the Cloud Function that sends FCM: delete the stale token from Firestore immediately on failure
- Periodically (on app foreground) refresh the token with `getToken({ vapidKey })` and update Firestore
- Limit stored tokens per user to the 5 most recently seen — a two-person app realistically has 1–2 devices per user

```typescript
// Cloud Function: send with cleanup
try {
  await messaging.send({ token: fcmToken, notification: payload });
} catch (err) {
  if (err.code === 'messaging/registration-token-not-registered') {
    await userRef.update({ [`fcmTokens.${fcmToken}`]: FieldValue.delete() });
  }
}
```

**Milestone:** Notifications milestone. Do not implement a "single token per user" model even as a shortcut — the cleanup is harder to retrofit than building it correctly from the start.

---

### Pitfall 8: Google Sign-In Popup Blocked in iOS Safari PWA Mode

**What goes wrong:** `signInWithPopup(provider)` is called from a PWA installed to the iOS home screen (standalone mode). iOS Safari in standalone mode blocks all popups unconditionally — the popup window never opens. Falling back to `signInWithRedirect(provider)` triggers a redirect to accounts.google.com, which completes auth but then redirects back to the app. In standalone mode, this redirect opens in an external Safari tab rather than staying in the PWA — the user is kicked out of the app, completes sign-in in Safari, and is left in Safari instead of the PWA. Firebase's `getRedirectResult()` in the PWA context never resolves because the redirect happened in a different browser context.

**Why it happens:** iOS standalone PWA mode uses `WKWebView` which has strict popup and cross-origin redirect restrictions. The PWA scope and the Google OAuth callback URL create a context boundary that iOS will not cross within the same WKWebView instance. [Documented in firebase/firebaseui-web issue #139.](https://github.com/firebase/firebaseui-web/issues/139) [Also in GoogleChromeLabs/pwacompat issue #15.](https://github.com/GoogleChromeLabs/pwacompat/issues/15)

**Consequences:** Sign-in is completely broken for iOS users who have installed the PWA to their home screen. This breaks the core "installable PWA" requirement on iOS.

**Warning signs:**
- Popup doesn't appear at all on iOS home screen PWA
- Redirect completes in Safari but user is left in Safari, not the PWA
- `getRedirectResult()` returns null after the redirect resolves

**Prevention:**
The best available workaround is to redirect to an out-of-scope URL that forces an in-app browser (`SFSafariViewController`) rather than staying in the `WKWebView`:

1. Detect standalone mode: `window.navigator.standalone === true` (iOS-only property)
2. When on iOS standalone, do NOT use `signInWithPopup` or `signInWithRedirect` directly
3. Instead, open a dedicated auth page at a URL outside your PWA's `scope` (e.g., `/auth/google-callback` with a different `start_url` outside the manifest scope). iOS will open this in an in-app Safari view that can complete OAuth and post a message back via `localStorage` or a shared cookie. Alternatively, use a custom URL scheme if available.
4. The most reliable proven pattern for Firebase + iOS PWA: implement a small service-worker-intercepted custom auth flow that completes in a `SFSafariViewController`-compatible way, or accept that iOS users must sign in from Safari *before* installing to home screen.

Practically, the simplest safe guidance: in the onboarding flow, show iOS users an "Open in Safari to sign in first" notice before the install prompt.

**Milestone:** Auth milestone (M1). This is a day-zero blocker for iOS. Test on a real iPhone in standalone mode, not in the iOS Simulator.

---

### Pitfall 9: iOS PWA Standalone Mode Has Isolated Storage from Safari

**What goes wrong:** A user signs into the app in Safari on iOS, then adds it to their home screen. When they open the PWA from the home screen, they are signed out. Firebase Auth persists state in IndexedDB by default. IndexedDB (as well as localStorage and sessionStorage) is NOT shared between Safari browser context and standalone PWA (home screen) context on iOS. They are completely separate sandboxes. The user experiences this as "the app forgot I logged in."

**Why it happens:** iOS treats installed PWAs as isolated web apps with their own storage sandbox, entirely separate from the Safari browser's storage. This is by design (security isolation) but is deeply confusing for users and developers. [Documented at developer.apple.com forums.](https://developer.apple.com/forums/thread/125109) Also: clearing Safari history on iOS wipes all PWA storage. And localStorage has a 7-day cap for sites not interacted with.

**Consequences:** Users who install the PWA must sign in again inside the PWA context. If Google Sign-In in standalone mode is also broken (Pitfall 8 above), the user is locked out.

**Warning signs:**
- Users who installed the PWA report being signed out
- Firebase Auth state is non-null in Safari but null when opening the home screen icon

**Prevention:**
- Accept that users must authenticate inside the PWA context (not via Safari), and design the onboarding to make this clear
- Ensure the Google Sign-In flow works in standalone mode (address Pitfall 8 first)
- Do not attempt to share auth state via cookies alone — the storage isolation applies to cookies set via JavaScript too
- Test the full onboarding flow (install → open from home screen → sign in) on a real device before considering auth complete
- Display a "tap here for sign-in instructions" for first-time iOS users explaining they will need to sign in again inside the installed app

**Milestone:** Auth + PWA install milestone. This is a paired dependency with Pitfall 8. Both must be solved together.

---

### Pitfall 10: Service Worker Caching Interfering with Firebase Storage Uploads

**What goes wrong:** Firebase Storage uploads (`uploadBytesResumable`) use a series of multipart HTTP requests to `firebasestorage.googleapis.com`. If the service worker's fetch handler intercepts these requests (because it uses a broad `networkFirst` or `staleWhileRevalidate` strategy for all external requests), uploads on iOS Safari silently stall: the `UploadTask` snapshot state never advances, the progress callback stops firing, and the `.then()` on the task promise never resolves. The file appears to upload (no error thrown) but never completes. [Documented Firebase SDK issue: firebase-js-sdk#2783, firebase-ios-sdk#4391.](https://github.com/firebase/firebase-js-sdk/issues/2783)

**Why it happens:** The resumable upload protocol sends a specific sequence of `POST` and `PUT` requests with `Content-Range` headers. Service worker interception breaks the connection between the upload task state machine and the actual network response.

**Consequences:** Photo uploads silently fail on iOS Safari when the PWA is installed. No error message. The user waits indefinitely.

**Warning signs:**
- Upload progress freezes at 0% on iOS Safari PWA
- Works fine in a regular Safari browser tab (no service worker active)
- Removing the service worker registration fixes the issue

**Prevention:**
Explicitly exclude Firebase Storage URLs from service worker caching in `vite-plugin-pwa`:

```typescript
// vite.config.ts
VitePWA({
  workbox: {
    navigateFallbackDenylist: [/^\/api/],
    runtimeCaching: [
      // Do NOT cache Firebase Storage or Auth requests
    ],
    // Exclude Firebase Storage from any interception
    urlsToExcludeFromNetworkOnly: [],
    // Ensure SW does not intercept storage uploads
  },
  // OR use injectManifest mode and manually exclude:
  // In your custom SW:
  // if (event.request.url.includes('firebasestorage.googleapis.com')) return;
})
```

In a custom service worker:
```javascript
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Never intercept Firebase Storage uploads
  if (url.hostname === 'firebasestorage.googleapis.com') return;
  // ... rest of caching logic
});
```

**Milestone:** PWA + Storage milestone. Add a specific integration test: upload a file in the PWA context (with service worker active) and assert the upload completes.

---

### Pitfall 11: iOS Push Notifications Only Work from Home Screen PWA, iOS 16.4+

**What goes wrong:** FCM Web Push is implemented and tested on Android/desktop Chrome. On iOS, notifications never arrive. Or: notifications arrive for users on iOS 16.4+ but only when the PWA is added to the home screen — users accessing the site in Safari get no notifications, and the Notification API returns `'denied'` before you even call `requestPermission()`. Also: Apple removed standalone PWA support in the EU in iOS 17.4 under the DMA — users in EU countries using PWAs from iOS 17.4+ cannot receive push notifications at all.

**Why it happens:** Apple added Web Push support for Home Screen web apps in iOS 16.4 (March 2023). The Notifications API is not available to Safari tabs on iOS — only to installed PWAs. [Apple documentation and developer forums confirm this.](https://iwritecodesometimes.net/2024/04/23/push-notifications-in-safari-progressive-web-apps/)

**Consequences:** A significant percentage of iOS users receive no notifications. The FCM notification requirement is partially undeliverable on iOS. Users on iOS < 16.4 (a shrinking but real population) receive nothing.

**Warning signs:**
- `Notification.permission` is `'denied'` or `Notification` is undefined in Safari tab on iOS
- `getToken()` throws `messaging/unsupported-browser` in Safari
- `messaging/permission-blocked` in Cloud Logging for iOS users

**Prevention:**
- Detect notification support before requesting permission: `'Notification' in window && 'serviceWorker' in navigator`
- Detect standalone mode and iOS version; gate the notification permission request on `window.navigator.standalone === true` (iOS) or `window.matchMedia('(display-mode: standalone)').matches`
- Show an explicit in-app message for iOS Safari tab users: "Add to Home Screen to enable notifications"
- For iOS < 16.4 users, provide an in-app notification fallback: a badge/dot on the entry section showing the partner has submitted, discoverable on next app open
- Do not block the core UX on push permission — treat it as an enhancement, not a requirement

**Milestone:** Notifications milestone. Test on real devices at iOS 16.3 (should show graceful degradation) and iOS 16.4+ in standalone mode (should work).

---

### Pitfall 12: PWA Install Prompt — No `beforeinstallprompt` on iOS

**What goes wrong:** The standard PWA install prompt pattern (`window.addEventListener('beforeinstallprompt', ...)`) does not fire on iOS at all. An implementation that relies on `beforeinstallprompt` to show an install banner will show nothing on iOS, leaving iOS users without guidance on how to install the app. Meanwhile, on Android/Chrome, the deferred prompt is correctly triggered and displayed.

**Why it happens:** Safari on iOS does not implement `beforeinstallprompt` — it is a Chrome-specific event. iOS has no browser-level "install" prompt; the only path is manual: the user taps the Share button → "Add to Home Screen."

**Consequences:** iOS users never know they can install the app. The "installable on iOS Safari" requirement from the project is met by the manifest technically, but usability requires explicit in-app guidance.

**Warning signs:**
- Install banner appears on Android Chrome but never on iOS
- `beforeinstallprompt` listener never fires during iOS testing

**Prevention:**
- Detect iOS explicitly: `const isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase())`
- Detect standalone mode: `const isStandalone = window.navigator.standalone === true`
- If iOS and not standalone: show a custom non-dismissable banner with a screenshot of the Share button and "Add to Home Screen" instruction
- For Android/Chrome: continue using `beforeinstallprompt` deferred prompt
- Persist the "already shown install prompt" state to avoid re-showing after installation

**Milestone:** PWA shell milestone (M1). This is UI-only with no backend dependency — implement it alongside the manifest and service worker.

---

## Moderate Pitfalls

---

### Pitfall 13: Firestore Real-Time Listener Memory Leaks on Timeline

**What goes wrong:** The timeline screen sets up a `onSnapshot` listener to receive real-time entry updates. When the user navigates away, the React component unmounts. If the useEffect cleanup function does not call the unsubscribe function returned by `onSnapshot`, the listener remains active indefinitely. With Firestore's pay-per-read billing model, an orphaned listener on a high-traffic collection reads every document update even when no UI is displaying it.

**Why it happens:** `onSnapshot` returns an unsubscribe function that must be explicitly called. Forgetting to return it from `useEffect` is easy:

```typescript
// WRONG
useEffect(() => {
  onSnapshot(query, handler); // unsubscribe function not captured
}, []);

// CORRECT
useEffect(() => {
  const unsubscribe = onSnapshot(query, handler);
  return unsubscribe; // called on unmount
}, []);
```

**Warning signs:**
- Firestore read counts in Firebase Console spike after navigating between screens
- `onSnapshot` callback fires after the component is unmounted (React "setState on unmounted" warnings)

**Prevention:**
Enforce this with an ESLint rule or a custom hook:
```typescript
function useFirestoreQuery<T>(query: Query, transform: (snap: QuerySnapshot) => T[]) {
  const [data, setData] = useState<T[]>([]);
  useEffect(() => {
    return onSnapshot(query, (snap) => setData(transform(snap)));
  }, []); // always returns unsubscribe
  return data;
}
```
Make all Firestore subscriptions go through this hook pattern. Never call `onSnapshot` directly in a component body.

**Milestone:** Timeline milestone. The hook pattern should be established in the entry submission milestone and reused everywhere — do not introduce it later as a refactor.

---

### Pitfall 14: Invite Code Brute-Force Risk

**What goes wrong:** A 6-character alphanumeric invite code has at most 36^6 ≈ 2.18 billion combinations. However, if only uppercase letters and digits are used (to avoid ambiguous characters like 0/O, 1/l), the space shrinks. More importantly, codes expire in 24 hours — so an attacker only needs to guess a valid code within the 24h window. With no rate limiting on the `joinPair` Cloud Function, an automated script can attempt thousands of guesses per second. In practice with a 24h window, the attack surface is any code valid right now, which is typically zero or one at a time for this app. But a malicious actor who knows a pair is forming could attempt to join before the intended partner.

**Consequences:** An attacker could join the pair as the second member (capping it at 2), locking out the real partner. The real partner can no longer join. Data submitted to this pair is now visible to the attacker once revealed.

**Warning signs:**
- Multiple failed `joinPair` calls from the same IP in Cloud Function logs
- Pair slots filled by unknown users

**Prevention:**
- Rate limit at the Cloud Function level: use Firestore to track attempts by IP, or use App Check to require legitimate clients
- Enable Firebase App Check on the Cloud Function — this does not eliminate abuse but raises the bar significantly
- Mark invite codes as single-use immediately upon first successful join attempt, even before the transaction commits (optimistic mark + transactional confirm)
- Use a code character set that excludes visually ambiguous characters but maintains entropy: use `BCDFGHJKLMNPQRSTVWXYZ23456789` (30 chars, 6 chars = 729M combinations)
- Store a `usedAt` timestamp on the invite code and reject codes marked used, regardless of expiry
- Return a generic error message for invalid codes — do not distinguish between "expired," "not found," and "already used" (prevents oracle attacks)

**Milestone:** Pair creation milestone. App Check should be enabled from day one — it is harder to retrofit.

---

### Pitfall 15: iOS HEIC Image Upload — Canvas Cannot Decode HEIC

**What goes wrong:** iOS devices default to HEIC/HEIF format for photos from iOS 11+. An `<input type="file" accept="image/*">` on iOS will include HEIC files. The client-side compression pipeline reads the file into a `<canvas>` using `new Image()` and `drawImage()` — but browsers do not support HEIC decoding. The `Image` element fires an `error` event instead of `load`. If not handled, the Canvas is blank, `canvas.toBlob()` produces a tiny blank JPEG, and a near-empty image is uploaded silently. Alternatively, the file may be passed through uncompressed (original HEIC), which can be 8–15 MB.

**Why it happens:** HEIC is an Apple proprietary format. No browser (including Safari on desktop) decodes HEIC in the Canvas API. iOS does convert HEIC to JPEG when the file is accessed via a file input on newer iOS versions, but this behavior is not guaranteed across all iOS versions and depends on the file access method.

**Warning signs:**
- Upload succeeds but the stored image is blank or an empty JPEG
- `Image.onerror` fires silently when attempting to draw a HEIC file
- Uploaded file size is unexpectedly tiny (blank canvas) or unexpectedly large (raw HEIC)

**Prevention:**
- After reading the file, check the MIME type: if `file.type === 'image/heic'` or `file.type === 'image/heif'`, or if the type is empty, pre-convert using `heic2any` before passing to the Canvas compressor
- Use `heic2any` with `quality: 0.8` and `toType: 'image/jpeg'` for the conversion
- Always attach an `onerror` handler to the `Image` element in the compression pipeline and surface an error to the user if the image cannot be decoded (do not silently upload a blank image)
- Add a file type validation step before compression: reject files that are not image types the browser can decode

```typescript
import heic2any from 'heic2any';

async function normalizeImage(file: File): Promise<Blob> {
  if (file.type === 'image/heic' || file.type === 'image/heif') {
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.8 });
    return Array.isArray(converted) ? converted[0] : converted;
  }
  return file;
}
```

**Milestone:** Image upload milestone. Test on a real iOS device by taking a photo and uploading it — do not rely on simulators which may not reproduce HEIC behavior.

---

### Pitfall 16: Firebase Client Config Exposure — The Real Risks

**What goes wrong:** Most Firebase security warnings focus on the `apiKey` in `firebaseConfig`. The `apiKey` is safe to expose by design — it identifies the project but does not grant elevated access. The real exposure risks in this project are:

1. **Unsecured Firestore/Storage rules combined with the known project ID**: if rules have any wide-open `allow read, write: if true` left from development, the exposed project ID and apiKey allow anyone to read and write all data
2. **VAPID private key**: the FCM VAPID private key is a secret; the public key (used in `getToken()`) is safe. Never confuse them
3. **Service account JSON in client code**: some developers accidentally bundle a service account JSON when trying to use Admin SDK features client-side. The Admin SDK must never run in the browser or be bundled into the client

**Warning signs:**
- Service account JSON or `GOOGLE_APPLICATION_CREDENTIALS` appears in the Vite bundle
- Firestore rules contain `allow read, write: if true` in any production rule file
- VAPID private key appears in environment variables accessible to the client (Vite exposes all `VITE_` prefixed variables to the bundle)

**Prevention:**
- Use `import.meta.env.VITE_*` only for public client config (firebaseConfig values, VAPID public key)
- Never prefix Admin SDK credentials or service account paths with `VITE_`
- Run `npm run build` and inspect the bundle with `npx vite-bundle-visualizer` before any deployment to confirm no secrets are bundled
- Lock Firestore rules before the first deployment — use the Firebase Emulator test suite as a gate

**Milestone:** Auth and rules milestone. Make bundle inspection part of the deployment checklist.

---

### Pitfall 17: Playwright E2E Cannot Automate Real Google OAuth

**What goes wrong:** Playwright E2E tests that navigate to the login screen and click "Sign in with Google" will hit Google's bot detection, be shown a CAPTCHA or an account picker that cannot be automated, or fail entirely in CI because the Google OAuth flow checks for browser automation signals and blocks headless browsers.

**Consequences:** E2E tests cannot test the authenticated app state, which is the majority of the application. The test suite either has 0% coverage of authenticated flows or breaks intermittently in CI.

**Prevention:**
Use Firebase Emulator + Admin SDK to create test users programmatically and inject the auth token into the browser's IndexedDB before the test begins:

1. Use `firebase.auth().signInWithCustomToken(token)` where `token` is generated by the Admin SDK in a test setup fixture
2. Use `@nearform/playwright-firebase` package which wraps this pattern
3. Or: create a `TEST_AUTH_BYPASS` environment variable that the app detects in development mode only and auto-signs in with a preset test UID

```typescript
// playwright/fixtures/auth.ts
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export async function createTestToken(uid: string): Promise<string> {
  const app = initializeApp({ credential: cert(serviceAccount) }, 'test');
  return getAuth(app).createCustomToken(uid);
}
```

Then in the Playwright test:
```typescript
const token = await createTestToken('test-user-a');
await page.evaluate(async (token) => {
  await firebase.auth().signInWithCustomToken(token);
}, token);
```

Never test with real Google accounts. Never store Google credentials in CI environment variables for OAuth automation.

**Milestone:** Testing milestone. This fixture must be built before any E2E test can cover authenticated flows — build it in the first milestone that introduces auth, not as an afterthought.

---

## Minor Pitfalls

---

### Pitfall 18: Firestore `get()` in Security Rules — Billing and Latency

**What goes wrong:** Firestore Security Rules allow cross-document reads with `get()` (e.g., `get(/databases/$(database)/documents/pairs/$(pairId)).data.members`). Every call to `get()` in a rule counts as an additional Firestore read for billing. If the timeline query returns 50 entries and each entry's read rule calls `get()` on the pair document, that's 50 additional reads per page load.

**Prevention:** Denormalize pair membership data onto each entry document (e.g., store `allowedUids: [uid1, uid2]` on each entry). This eliminates the need for cross-document rule reads. The entry write rule enforces that `allowedUids` matches the pair's members at write time.

**Milestone:** Security Rules milestone. Design the data model with this constraint in mind from the start.

---

### Pitfall 19: Firebase Storage CORS Not Configured for Production Domain

**What goes wrong:** Storage uploads work fine in development (localhost is allowed by default) but fail in production with CORS errors once the app is deployed to the Firebase Hosting domain. Firebase Storage CORS is not automatically configured to allow the production domain.

**Prevention:** Configure CORS on the Storage bucket before first deployment:
```json
// cors.json
[{ "origin": ["https://your-app.web.app", "https://your-custom-domain.com"], "method": ["GET", "POST", "PUT", "DELETE"], "maxAgeSeconds": 3600 }]
```
```bash
gsutil cors set cors.json gs://your-project.appspot.com
```

**Milestone:** Storage milestone. Add CORS configuration to the deployment checklist.

---

### Pitfall 20: Firestore Offline Persistence and Security Rule Mismatch

**What goes wrong:** Firestore offline persistence (enabled by default in the web SDK) caches documents locally. A user who was previously in a pair, loses pair membership (edge case), or whose rules change, may see stale cached data from a previous session. On the reveal mechanic specifically: a user might see the partner's submission from a previous offline cache even though the rule now denies the read. This is a minor edge case for a two-person app but worth noting.

**Prevention:** For the reveal mechanic reads (accessing partner submissions), always use `getDoc()` with `{ source: 'server' }` to force a server read rather than relying on the offline cache. Only use cache for UI shell/skeleton data, not for privacy-sensitive reads.

**Milestone:** Security Rules + reveal milestone.

---

## Phase-Specific Warnings

| Milestone Topic | Likely Pitfall | Mitigation |
|----------------|---------------|------------|
| Auth (M1) | Google Sign-In popup blocked in iOS standalone | Test on real iPhone before closing milestone; implement out-of-scope redirect workaround |
| Auth (M1) | iOS storage sandbox isolation | Accept: user signs in inside PWA context; document this in onboarding |
| Pair Creation (M2) | Invite code brute force | Enable App Check and rate limiting from day one |
| Pair Creation (M2) | Cold start on joinPair | Set `minInstances: 1` on joinPair Cloud Function |
| Submission + Storage (M3) | HEIC images from iOS | Detect and pre-convert with heic2any before Canvas compression |
| Submission + Storage (M3) | Service worker blocking Storage uploads | Exclude firebasestorage.googleapis.com from SW interception |
| Security Rules (M3) | Missing field access in rules | Use `in` guard on every field access; test every rule in the emulator with missing-field docs |
| Reveal Mechanic (M4) | Both-submit race condition | Use Firestore transaction in submitEntry; include concurrent test |
| Reveal Mechanic (M4) | Reveal-Anyway + submit race | Use status FSM check in both Cloud Functions |
| Notifications (M5) | FCM sent before Firestore write commits | Always await Firestore write before sending FCM |
| Notifications (M5) | FCM token stale/expired | Implement per-device token upsert with cleanup on 404 |
| Notifications (M5) | iOS push only in standalone 16.4+ | Degrade gracefully; show in-app badge for non-eligible users |
| PWA Shell | No beforeinstallprompt on iOS | Implement manual "Add to Home Screen" instruction UI for iOS |
| Timeline (M6) | Listener memory leaks | Use custom hook enforcing unsubscribe in useEffect cleanup |
| Timeline (M6) | get() in rules causing excess reads | Denormalize allowedUids onto entry documents |
| Testing | Cannot automate Google OAuth in E2E | Use Firebase Admin SDK custom token + Playwright fixture from day one |

---

## Sources

- [Firestore Security Rules: Writing conditions (official docs)](https://firebase.google.com/docs/firestore/security/rules-conditions)
- [Firestore Security Rules: Field access control (official docs)](https://firebase.google.com/docs/firestore/security/rules-fields)
- [Firebase SDK issue #2536: email_verified not updated until re-sign-in](https://github.com/firebase/firebase-js-sdk/issues/2536)
- [Firestore Transactions and batched writes (official docs)](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Race Conditions in Firestore — QuintoAndar Tech Blog](https://medium.com/quintoandar-tech-blog/race-conditions-in-firestore-how-to-solve-it-5d6ff9e69ba7)
- [Cloud Functions Gen2: fewer cold starts (Firebase blog 2022)](https://firebase.blog/posts/2022/12/cloud-functions-firebase-v2/)
- [Comprehensive Analysis of Firebase Functions Cold Starts (2025)](https://www.javacodegeeks.com/2025/04/comprehensive-analysis-of-firebase-functions-cold-starts.html)
- [FCM: Best practices for token management (official docs)](https://firebase.google.com/docs/cloud-messaging/manage-tokens)
- [FCM token refresh ignored — silent notification failures (Medium)](https://aliwajdan.medium.com/the-fcm-token-refresh-i-ignored-silently-killed-push-for-some-users-431da21cfcb4)
- [iOS Safari PWA limitations complete guide 2026 (MagicBell)](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [Google auth for iOS Safari web app mode — firebaseui-web issue #139](https://github.com/firebase/firebaseui-web/issues/139)
- [Remove manifest from iOS to allow OAuth redirect — pwacompat issue #15](https://github.com/GoogleChromeLabs/pwacompat/issues/15)
- [iOS PWA storage isolation — Apple Developer Forums](https://developer.apple.com/forums/thread/125109)
- [How to share state between Safari and iOS standalone PWA (Medium)](https://jakub-kozak.medium.com/how-to-share-state-data-between-a-pwa-in-ios-safari-and-standalone-mode-64174a48b043)
- [Firebase Storage UploadTask never completes on iOS — firebase-js-sdk #2783](https://github.com/firebase/firebase-js-sdk/issues/2783)
- [Firebase Auth: Session management with service workers (official docs)](https://firebase.google.com/docs/auth/web/service-worker-sessions)
- [Push notifications in Safari iOS PWAs (2024)](https://iwritecodesometimes.net/2024/04/23/push-notifications-in-safari-progressive-web-apps/)
- [PWA push notifications on iOS in 2026 (WebsCraft)](https://webscraft.org/blog/pwa-pushspovischennya-na-ios-u-2026-scho-realno-pratsyuye?lang=en)
- [heic2any: Client-side HEIC/HEIF to JPEG conversion](https://github.com/alexcorvi/heic2any)
- [nearform/playwright-firebase: Firebase auth in Playwright tests](https://github.com/nearform/playwright-firebase)
- [Firebase API keys — what is actually safe to expose (official docs)](https://firebase.google.com/docs/projects/api-keys)
- [resource.data null value error — Firestore rules (AppSloveWorld)](https://www.appsloveworld.com/google-cloud-firestore/2/how-to-set-firestore-security-rules-resource-data-null-value-error)
- [Firestore real-time listeners: memory leaks in React (DEV Community)](https://dev.to/itselftools/seamlessly-fetch-data-in-real-time-with-firebase-and-react-hooks-2g5)
