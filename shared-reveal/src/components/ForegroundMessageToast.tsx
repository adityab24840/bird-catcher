import { useEffect } from 'react'

interface Props {
  message: { title: string; body: string } | null
  onDismiss: () => void
}

export default function ForegroundMessageToast({ message, onDismiss }: Props) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDismiss, 5000)
    return () => clearTimeout(t)
  }, [message, onDismiss])

  if (!message) return null

  return (
    <div
      className="fixed top-4 left-1/2 z-50 animate-fadeUp"
      style={{
        transform: 'translateX(-50%)',
        maxWidth: 340,
        width: 'calc(100% - 32px)',
      }}
    >
      <div
        className="flex items-start gap-3 rounded-2xl px-4 py-3 shadow-lg"
        style={{ background: '#1C2B1E', color: '#F2EDE4' }}
      >
        <span style={{ fontSize: 20 }}>🌿</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">{message.title}</p>
          <p className="text-xs mt-0.5 opacity-80 leading-snug">{message.body}</p>
        </div>
        <button
          onClick={onDismiss}
          className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
          style={{ fontSize: 18, lineHeight: 1, paddingTop: 1 }}
        >
          ×
        </button>
      </div>
    </div>
  )
}
