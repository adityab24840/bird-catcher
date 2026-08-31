/**
 * HomePage — authenticated home shell.
 *
 * STUB: Real implementation added in plan 01-02.
 * Plan 01-02 will add:
 *   - AuthProvider context consumption (current user, sign-out)
 *   - User document read from Firestore (users/{uid})
 *   - "You're offline" graceful shell state (PWA-03)
 *   - Sign-out button
 *   - Route guard: redirect to / if not authenticated
 */
export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-muted p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-white font-bold shadow">
          R
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Home</h1>
        <p className="text-sm text-gray-400">Authenticated shell — full implementation in plan 01-02</p>
      </div>
    </div>
  )
}
