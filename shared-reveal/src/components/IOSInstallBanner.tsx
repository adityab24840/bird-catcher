import { useState } from 'react'

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone = window.matchMedia('(display-mode: standalone)').matches

export default function IOSInstallBanner() {
  const [dismissed, setDismissed] = useState(false)
  if (!isIOS || isStandalone || dismissed) return null
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 p-4"
      style={{
        background: '#F2EDE4',
        borderTop: '1px solid #E8E2D9',
        boxShadow: '0 -2px 16px rgba(45,90,61,0.08)',
      }}
    >
      <p className="text-sm leading-snug mb-2.5" style={{ color: '#1A1A16' }}>
        Install <span className="font-semibold">birds.eye</span>: tap{' '}
        <span className="font-semibold">Share</span> then{' '}
        <span className="font-semibold">Add to Home Screen</span>.
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="text-xs font-medium"
        style={{ color: '#7A7268' }}
      >
        Dismiss
      </button>
    </div>
  )
}
