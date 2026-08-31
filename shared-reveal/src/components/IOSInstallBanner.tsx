import { useState } from 'react'

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone = window.matchMedia('(display-mode: standalone)').matches

export default function IOSInstallBanner() {
  const [dismissed, setDismissed] = useState(false)
  if (!isIOS || isStandalone || dismissed) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-white border-t border-gray-200 p-4 shadow-lg">
      <p className="text-sm text-gray-700 mb-2">
        Install Bird Eye: tap <span className="font-semibold">Share</span> then{' '}
        <span className="font-semibold">Add to Home Screen</span>.
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="text-xs text-gray-500 underline"
      >
        Dismiss
      </button>
    </div>
  )
}
