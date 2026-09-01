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
import { useNotifications } from './hooks/useNotifications'
import { useTheme } from './hooks/useTheme'
import LandingPage from './pages/LandingPage'
import HomePage from './pages/HomePage'
import PairSetupPage from './pages/PairSetupPage'
import TimelinePage from './pages/TimelinePage'
import ExportPage from './pages/ExportPage'
import StatsPage from './pages/StatsPage'
import OfflineBanner from './components/OfflineBanner'
import IOSInstallBanner from './components/IOSInstallBanner'
import UpdateBanner from './components/UpdateBanner'
import ForegroundMessageToast from './components/ForegroundMessageToast'
import OnboardingOverlay from './components/OnboardingOverlay'

export default function App() {
  const { user, loading } = useAuth()
  const { pairId, pairLoading } = usePairId(user?.uid ?? null)
  const { foregroundMessage, clearForegroundMessage } = useNotifications(user?.uid ?? null)
  useTheme() // apply stored theme preference on mount

  // Hold rendering until both auth state and pair state are known.
  // pairLoading is only relevant when signed in (usePairId returns false immediately for null uid).
  if (loading || (user && pairLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: '#E8E2D9', borderTopColor: '#2D5A3D' }} />
      </div>
    )
  }

  return (
    <>
      <ForegroundMessageToast message={foregroundMessage} onDismiss={clearForegroundMessage} />
      <UpdateBanner />
      <OfflineBanner />
      <IOSInstallBanner />
      <OnboardingOverlay visible={!!user && !!pairId} user={user} pairId={pairId} />
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

        {/* /export — journal PDF export, paired only */}
        <Route
          path="/export"
          element={user ? <ExportPage /> : <Navigate to="/" replace />}
        />

        {/* /stats — relationship stats dashboard */}
        <Route
          path="/stats"
          element={user ? <StatsPage /> : <Navigate to="/" replace />}
        />
      </Routes>
    </>
  )
}
