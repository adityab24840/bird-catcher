/**
 * App root — defines all client-side routes with auth guards.
 *
 * Auth routing logic (AUTH-03):
 *   - While loading (auth state unknown): render a neutral loading state to
 *     prevent any flash of the wrong page.
 *   - Signed out: / shows LandingPage; /home redirects to /.
 *   - Signed in:  /home shows HomePage; / redirects to /home.
 *
 * This makes AUTH-03 (session persistence) observable: a hard refresh while
 * signed in lands the user back on /home without a sign-in prompt.
 */
import { Navigate, Routes, Route } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import LandingPage from './pages/LandingPage'
import HomePage from './pages/HomePage'
import OfflineBanner from './components/OfflineBanner'
import IOSInstallBanner from './components/IOSInstallBanner'

export default function App() {
  const { user, loading } = useAuth()

  // Hold rendering until Firebase Auth resolves the persisted session.
  // Without this guard, signed-in users see a brief flash of LandingPage.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <>
      <OfflineBanner />
      <IOSInstallBanner />
      <Routes>
      {/* / — LandingPage when signed out; redirect to /home when signed in */}
      <Route
        path="/"
        element={user ? <Navigate to="/home" replace /> : <LandingPage />}
      />

      {/* /home — HomePage when signed in; redirect to / when signed out */}
      <Route
        path="/home"
        element={user ? <HomePage /> : <Navigate to="/" replace />}
      />
      </Routes>
    </>
  )
}
