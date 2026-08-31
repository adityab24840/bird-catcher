import { useOnline } from '../hooks/useOnline'

export default function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-white">
      You're offline — your changes will sync when you reconnect.
    </div>
  )
}
