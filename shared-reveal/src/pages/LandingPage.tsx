/**
 * LandingPage — unauthenticated entry point.
 *
 * AUTH-01: Provides the "Continue with Google" button that calls signInWithGoogle
 * (signInWithRedirect). The browser will navigate away to the Google OAuth flow;
 * after the redirect returns, useAuth calls completeRedirect() to capture the result
 * and App.tsx automatically redirects the now-authenticated user to /home.
 */
import { useState } from 'react'
import { signInWithGoogle } from '../services/auth'

export default function LandingPage() {
  const [loading, setLoading] = useState(false)

  async function handleSignIn() {
    setLoading(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      console.error('[LandingPage] signInWithGoogle error:', err)
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col animate-pageIn">
      <div className="flex flex-1 flex-col items-center justify-center px-8 pb-16 pt-20 text-center">
        {/* Brand mark — leaf branch in dark green */}
        <div className="mb-8">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <path
              d="M32 60 Q30 42 26 26 Q22 12 28 6"
              stroke="#2D5A3D" strokeWidth="2.5" strokeLinecap="round" fill="none"
            />
            <ellipse cx="22" cy="50" rx="11" ry="4" transform="rotate(-42 22 50)" fill="#2D5A3D" opacity="0.85"/>
            <ellipse cx="20" cy="40" rx="10" ry="3.5" transform="rotate(-36 20 40)" fill="#2D5A3D" opacity="0.75"/>
            <ellipse cx="21" cy="30" rx="9" ry="3" transform="rotate(-28 21 30)" fill="#2D5A3D" opacity="0.65"/>
            <ellipse cx="24" cy="21" rx="7" ry="2.5" transform="rotate(-18 24 21)" fill="#2D5A3D" opacity="0.55"/>
            <ellipse cx="40" cy="52" rx="11" ry="4" transform="rotate(38 40 52)" fill="#2D5A3D" opacity="0.85"/>
            <ellipse cx="38" cy="42" rx="10" ry="3.5" transform="rotate(32 38 42)" fill="#2D5A3D" opacity="0.75"/>
            <ellipse cx="37" cy="33" rx="9" ry="3" transform="rotate(24 37 33)" fill="#2D5A3D" opacity="0.65"/>
            <ellipse cx="36" cy="24" rx="7" ry="2.5" transform="rotate(14 36 24)" fill="#2D5A3D" opacity="0.55"/>
            <circle cx="28" cy="6" r="3.5" fill="#2D5A3D" opacity="0.9"/>
          </svg>
        </div>

        <h1 className="text-[2.75rem] font-bold tracking-tight" style={{ color: '#1A1A16', letterSpacing: '-0.02em' }}>
          birds.eye
        </h1>
        <p className="mt-3 text-base max-w-[260px] leading-relaxed mx-auto" style={{ color: '#7A7268' }}>
          Share what reminded you of them today. See it together once you both share.
        </p>

        <button
          onClick={handleSignIn}
          disabled={loading}
          className="mt-14 flex w-full max-w-xs items-center justify-center gap-3 rounded-2xl px-6 py-4 text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-60"
          style={{ background: '#2D5A3D', color: '#FFFFFF' }}
        >
          {loading ? (
            <div
              className="h-4 w-4 rounded-full border-2 animate-spin"
              style={{ borderColor: 'rgba(255,255,255,0.35)', borderTopColor: '#FFFFFF' }}
            />
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
          )}
          {loading ? 'Signing in…' : 'Continue with Google'}
        </button>
      </div>

      <p className="pb-10 text-center text-xs" style={{ color: '#C9BFA8' }}>
        Just the two of you. Always private.
      </p>
    </div>
  )
}
