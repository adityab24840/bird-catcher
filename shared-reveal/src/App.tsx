import { Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import HomePage from './pages/HomePage'

/**
 * App root — defines all client-side routes.
 *
 * Phase 1 routes:
 *   /       — Landing / Sign-in (unauthenticated entry point)
 *   /home   — Authenticated home shell
 *
 * Auth guard and protected route wrapper are added in plan 01-02.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/home" element={<HomePage />} />
    </Routes>
  )
}
