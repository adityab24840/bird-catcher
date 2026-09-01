import { useState } from 'react'

interface Props {
  supported: boolean
  permission: NotificationPermission | 'unknown'
  onRequest: () => Promise<void>
}

function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
}

function isIOSEUBlocked(): boolean {
  // iOS 17.4+ in EU cannot receive PWA push (Apple DMA compliance restriction).
  // We detect iOS 17.4+ by parsing the UA — region cannot be detected reliably,
  // so we show the in-app fallback hint to all iOS 17.4+ users whose Notification
  // permission is denied or unavailable.
  const match = navigator.userAgent.match(/OS (\d+)_/)
  const major = match ? parseInt(match[1], 10) : 0
  return isIOS() && major >= 17
}

export default function NotificationPrompt({ supported, permission, onRequest }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const [requesting, setRequesting] = useState(false)

  if (dismissed) return null

  // iOS EU / push not supported — show in-app guidance
  if (!supported || (isIOSEUBlocked() && permission !== 'granted')) {
    return (
      <div
        className="mx-4 mb-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
        style={{ background: '#EDE8DF', color: '#5C5449' }}
      >
        <span style={{ fontSize: 16 }}>🌿</span>
        <p className="flex-1 leading-snug">
          Push notifications aren't available on this device. Open the app daily to see what your partner shared.
        </p>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          style={{ opacity: 0.5, fontSize: 16, lineHeight: 1 }}
        >
          ×
        </button>
      </div>
    )
  }

  // Permission already granted — nothing to prompt
  if (permission === 'granted') return null

  // Permission denied — show Safari settings hint
  if (permission === 'denied') {
    return (
      <div
        className="mx-4 mb-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
        style={{ background: '#EDE8DF', color: '#5C5449' }}
      >
        <span style={{ fontSize: 16 }}>🔕</span>
        <p className="flex-1 leading-snug">
          Notifications blocked. Enable them in Safari Settings › Bird Eye to get partner alerts.
        </p>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          style={{ opacity: 0.5, fontSize: 16, lineHeight: 1 }}
        >
          ×
        </button>
      </div>
    )
  }

  // Permission default (not yet asked) — soft prompt
  return (
    <div
      className="mx-4 mb-3 flex items-center gap-3 rounded-xl px-3 py-2.5"
      style={{ background: '#EDE8DF', color: '#1C2B1E' }}
    >
      <span style={{ fontSize: 18 }}>🔔</span>
      <p className="flex-1 text-xs leading-snug">
        Get notified when your partner shares or reveals.
      </p>
      <button
        onClick={async () => {
          setRequesting(true)
          await onRequest()
          setRequesting(false)
          setDismissed(true)
        }}
        disabled={requesting}
        className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-opacity"
        style={{ background: '#2D5A3D', color: '#F2EDE4', opacity: requesting ? 0.6 : 1 }}
      >
        {requesting ? '…' : 'Enable'}
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{ opacity: 0.4, fontSize: 18, lineHeight: 1 }}
      >
        ×
      </button>
    </div>
  )
}
