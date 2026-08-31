/**
 * App root — defines all client-side routes with three-tier auth + pair guards.
 *
 * Routing logic:
 *   - Loading (auth or pair state unknown): spinner to prevent flash of wrong page.
 *   - Signed out: / shows LandingPage; /home and /pair-setup redirect to /.
 *   - Signed in + no pair (pairId === null): redirect to /pair-setup.
 *   - Signed in + paired: /home shows HomePage; / and /pair-setup redirect to /home.
 *
 * The pair guard is driven by usePairId which subscribes to users/{uid} via onSnapshot.
 * When joinPair Cloud Function writes pairId to both users' documents, both clients
 * redirect to /home automatically — no polling or manual navigation needed (D-01, D-03).
 */
import { Navigate, Routes, Route } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { usePairId } from './hooks/usePair'
import LandingPage from './pages/LandingPage'
import HomePage from './pages/HomePage'
import PairSetupPage from './pages/PairSetupPage'
import TimelinePage from './pages/TimelinePage'
import OfflineBanner from './components/OfflineBanner'
import IOSInstallBanner from './components/IOSInstallBanner'
import UpdateBanner from './components/UpdateBanner'

export default function App() {
  const { user, loading } = useAuth()
  const { pairId, pairLoading } = usePairId(user?.uid ?? null)

  // Hold rendering until both auth state and pair state are known.
  // pairLoading is only relevant when signed in (usePairId returns false immediately for null uid).
  if (loading || (user && pairLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <>
      <UpdateBanner />
      <OfflineBanner />
      <IOSInstallBanner />
      <Routes>
        {/* / — signed out → Landing; signed in + no pair → /pair-setup; signed in + paired → /home */}
        <Route
          path="/"
          element={
            !user ? <LandingPage /> :
            pairId === null ? <Navigate to="/pair-setup" replace /> :
            <Navigate to="/home" replace />
          }
        />

        {/* /pair-setup — unpaired authenticated users only */}
        <Route
          path="/pair-setup"
          element={
            !user ? <Navigate to="/" replace /> :
            pairId !== null ? <Navigate to="/home" replace /> :
            <PairSetupPage />
          }
        />

        {/* /home — paired authenticated users only */}
        <Route
          path="/home"
          element={user ? <HomePage /> : <Navigate to="/" replace />}
        />

        {/* /timeline — paired authenticated users only */}
        <Route
          path="/timeline"
          element={user ? <TimelinePage /> : <Navigate to="/" replace />}
        />
      </Routes>
    </>
  )
}
