/**
 * LandingPage — unauthenticated entry point.
 *
 * STUB: Real implementation added in plan 01-02.
 * Plan 01-02 will add:
 *   - "Sign in with Google" button wired to signInWithRedirect
 *   - getRedirectResult() call on mount to capture post-redirect auth result
 *   - IOSInstallBanner component (shown when iOS browser tab, not standalone)
 *   - Auth state listener: redirect to /home if already signed in
 */
export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface p-6">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500 text-white text-2xl font-bold shadow-lg">
          R
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reveal</h1>
          <p className="mt-2 text-gray-500">Share what reminded you of them today.</p>
        </div>
        <p className="text-sm text-gray-400">Sign-in coming in plan 01-02</p>
      </div>
    </div>
  )
}
