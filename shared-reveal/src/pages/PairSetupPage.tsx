import { useState } from 'react'
import { createPairFn, joinPairFn } from '../services/pair'

type View = 'choose' | 'create-waiting' | 'join'

function Spinner() {
  return (
    <div
      className="h-4 w-4 rounded-full border-2 animate-spin"
      style={{ borderColor: 'rgba(255,255,255,0.35)', borderTopColor: '#FFFFFF' }}
    />
  )
}

function SpinnerDark() {
  return (
    <div
      className="h-4 w-4 rounded-full border-2 animate-spin"
      style={{ borderColor: '#E8E2D9', borderTopColor: '#2D5A3D' }}
    />
  )
}

export default function PairSetupPage() {
  const [view, setView] = useState<View>('choose')
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState('')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setCreating(true)
    setError(null)
    try {
      const result = await createPairFn()
      setInviteCode(result.data.inviteCode)
      setView('create-waiting')
    } catch (err: any) {
      setError(err.message ?? 'Failed to create pair')
    } finally {
      setCreating(false)
    }
  }

  async function handleCopy() {
    if (!inviteCode) return
    try {
      await navigator.clipboard.writeText(inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy to clipboard')
    }
  }

  async function handleShare() {
    if (!inviteCode) return
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'birds.eye',
          text: `Join my birds.eye — enter code ${inviteCode} at the app.`,
        })
      } catch { /* cancelled */ }
    } else {
      await handleCopy()
    }
  }

  async function handleJoin(code: string) {
    if (joining) return
    setJoining(true)
    setError(null)
    try {
      await joinPairFn({ inviteCode: code })
      // usePairId onSnapshot in App.tsx fires and redirects to /home automatically
    } catch (err: any) {
      setError(err.message ?? 'Failed to join pair')
      setJoining(false)
    }
  }

  function handleCodeInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 6)
    setJoinCode(val)
    setError(null)
    if (val.length === 6) {
      void handleJoin(val)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 animate-pageIn">
      {/* App mark */}
      <div className="mb-8">
        <svg width="40" height="40" viewBox="0 0 64 64" fill="none">
          <path d="M32 60 Q30 42 26 26 Q22 12 28 6" stroke="#2D5A3D" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
          <ellipse cx="22" cy="50" rx="11" ry="4" transform="rotate(-42 22 50)" fill="#2D5A3D" opacity="0.8"/>
          <ellipse cx="20" cy="38" rx="9" ry="3" transform="rotate(-30 20 38)" fill="#2D5A3D" opacity="0.65"/>
          <ellipse cx="40" cy="52" rx="11" ry="4" transform="rotate(38 40 52)" fill="#2D5A3D" opacity="0.8"/>
          <ellipse cx="38" cy="40" rx="9" ry="3" transform="rotate(26 38 40)" fill="#2D5A3D" opacity="0.65"/>
          <circle cx="28" cy="6" r="3.5" fill="#2D5A3D" opacity="0.9"/>
        </svg>
      </div>

      <div className="w-full max-w-xs">
        {view === 'choose' && (
          <div className="animate-fadeUp">
            <h1 className="mb-2 text-center text-2xl font-bold" style={{ color: '#1A1A16', letterSpacing: '-0.01em' }}>Pair up</h1>
            <p className="mb-8 text-center text-sm leading-relaxed" style={{ color: '#7A7268' }}>
              Create a private space with one person, or join theirs.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="w-full rounded-2xl py-4 text-sm font-semibold text-white transition-all active:scale-[0.97] disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: '#2D5A3D' }}
              >
                {creating ? <><Spinner /> Creating…</> : 'Create a pair'}
              </button>
              <button
                onClick={() => { setView('join'); setError(null) }}
                className="w-full rounded-2xl py-4 text-sm font-semibold transition-all active:scale-[0.97]"
                style={{ background: '#F8F5F0', border: '1.5px solid #E8E2D9', color: '#1A1A16' }}
              >
                Join with code
              </button>
            </div>
            {error && <p className="mt-4 text-sm text-center" style={{ color: '#B85C38' }}>{error}</p>}
          </div>
        )}

        {view === 'create-waiting' && (
          <div className="animate-fadeUp">
            <h1 className="mb-2 text-center text-2xl font-bold" style={{ color: '#1A1A16', letterSpacing: '-0.01em' }}>Share this code</h1>
            <p className="mb-6 text-center text-sm leading-relaxed" style={{ color: '#7A7268' }}>
              Ask your partner to enter it. This page updates automatically once they join.
            </p>
            {inviteCode && (
              <div
                className="mb-5 rounded-2xl py-7 text-center"
                style={{ background: '#FFFFFF', border: '1.5px solid #E8E2D9' }}
              >
                <p className="font-mono text-4xl font-bold tracking-[0.18em]" style={{ color: '#1A1A16' }}>
                  {inviteCode}
                </p>
                <p className="mt-2 text-[11px] tracking-[0.08em]" style={{ color: '#C9BFA8' }}>
                  EXPIRES IN 24 HOURS
                </p>
              </div>
            )}
            <div className="flex gap-2.5 mb-5">
              <button
                onClick={handleCopy}
                className="flex-1 rounded-2xl py-3.5 text-sm font-semibold text-white transition-all active:scale-[0.97]"
                style={{ background: copied ? '#3D7A53' : '#2D5A3D' }}
              >
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
              <button
                onClick={handleShare}
                className="flex-1 rounded-2xl py-3.5 text-sm font-semibold transition-all active:scale-[0.97]"
                style={{ background: '#F8F5F0', border: '1.5px solid #E8E2D9', color: '#2D5A3D' }}
              >
                Share ↗
              </button>
            </div>
            <div className="flex items-center justify-center gap-2.5 text-sm" style={{ color: '#7A7268' }}>
              <SpinnerDark />
              Waiting for your partner…
            </div>
            {error && <p className="mt-4 text-sm text-center" style={{ color: '#B85C38' }}>{error}</p>}
          </div>
        )}

        {view === 'join' && (
          <div className="animate-fadeUp">
            <h1 className="mb-2 text-center text-2xl font-bold" style={{ color: '#1A1A16', letterSpacing: '-0.01em' }}>Enter code</h1>
            <p className="mb-6 text-center text-sm leading-relaxed" style={{ color: '#7A7268' }}>
              Ask your partner for their 6-character code.
            </p>
            <input
              type="text"
              value={joinCode}
              onChange={handleCodeInput}
              placeholder="A1B2C3"
              maxLength={6}
              autoFocus
              disabled={joining}
              className="mb-4 w-full rounded-2xl px-4 py-4 text-center font-mono text-2xl font-bold uppercase tracking-[0.18em] transition-all disabled:opacity-50 outline-none"
              style={{
                background: '#FFFFFF',
                border: '1.5px solid #E8E2D9',
                color: '#1A1A16',
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = '#8FAF8A'}
              onBlur={(e) => e.currentTarget.style.borderColor = '#E8E2D9'}
            />
            {joining && (
              <div className="mb-4 flex items-center justify-center gap-2 text-sm" style={{ color: '#7A7268' }}>
                <SpinnerDark />
                Joining…
              </div>
            )}
            {error && <p className="mb-4 text-sm text-center" style={{ color: '#B85C38' }}>{error}</p>}
            <button
              onClick={() => { setView('choose'); setJoinCode(''); setError(null) }}
              className="w-full rounded-2xl py-3.5 text-sm font-semibold transition-all active:scale-[0.97]"
              style={{ background: '#F8F5F0', border: '1.5px solid #E8E2D9', color: '#7A7268' }}
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
