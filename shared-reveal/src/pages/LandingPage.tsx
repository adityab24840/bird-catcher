/**
 * LandingPage — unauthenticated entry point.
 *
 * AUTH-01: Provides the "Sign in with Google" button that calls signInWithGoogle
 * (signInWithRedirect). The browser will navigate away to the Google OAuth flow;
 * after the redirect returns, useAuth calls completeRedirect() to capture the result
 * and App.tsx automatically redirects the now-authenticated user to /home.
 */
import { signInWithGoogle } from '../services/auth'

export default function LandingPage() {
  async function handleSignIn() {
    try {
      await signInWithGoogle()
      // Browser navigates away — no state update needed here
    } catch (err) {
      console.error('[LandingPage] signInWithGoogle error:', err)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6">
      <div className="flex flex-col items-center gap-8 text-center">
        {/* App mark */}
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500 text-white text-2xl font-bold shadow-lg">
          R
        </div>

        {/* Heading */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reveal</h1>
          <p className="mt-2 text-gray-500">Share what reminded you of them today.</p>
        </div>

        {/* Sign-in button */}
        <button
          onClick={handleSignIn}
          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
        >
          {/* Google 'G' icon (SVG) */}
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>
      </div>
    </div>
  )
}
