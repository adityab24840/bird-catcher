import { useRegisterSW } from 'virtual:pwa-register/react'

export default function UpdateBanner() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-between gap-3 bg-purple-600 px-4 py-3 text-white shadow-lg">
      <p className="text-sm font-medium">New version available</p>
      <button
        onClick={() => updateServiceWorker(true)}
        className="shrink-0 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold hover:bg-white/30 active:scale-95 transition-all"
      >
        Update now
      </button>
    </div>
  )
}
