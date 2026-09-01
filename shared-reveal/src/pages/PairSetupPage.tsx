import { useState } from 'react'
import { createPairFn, joinPairFn } from '../services/pair'

type View = 'choose' | 'create-waiting' | 'join'

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
          title: 'Bird Eye',
          text: `Join my Bird Eye — enter code ${inviteCode} at the app.`,
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-md">
        {/* App mark */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500 text-white font-bold shadow">
            R
          </div>
        </div>

        {view === 'choose' && (
          <>
            <h1 className="mb-2 text-center text-2xl font-bold text-gray-900">Pair up</h1>
            <p className="mb-8 text-center text-sm text-gray-500">
              Create a private space with one person or join theirs.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="w-full rounded-xl bg-purple-500 py-3 text-sm font-medium text-white hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create a pair'}
              </button>
              <button
                onClick={() => { setView('join'); setError(null) }}
                className="w-full rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
              >
                Join with code
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-red-600 text-center">{error}</p>}
          </>
        )}

        {view === 'create-waiting' && (
          <>
            <h1 className="mb-2 text-center text-2xl font-bold text-gray-900">Share this code</h1>
            <p className="mb-6 text-center text-sm text-gray-500">
              Ask your partner to enter it. This page will update automatically once they join.
            </p>
            {inviteCode && (
              <div className="mb-4 rounded-xl bg-gray-50 p-6 text-center">
                <p className="font-mono text-3xl font-bold tracking-widest text-gray-900">
                  {inviteCode}
                </p>
              </div>
            )}
            <div className="flex gap-2 mb-4">
              <button
                onClick={handleCopy}
                className="flex-1 rounded-xl bg-purple-500 py-3 text-sm font-medium text-white hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={handleShare}
                className="flex-1 rounded-xl border-2 border-purple-500 py-3 text-sm font-medium text-purple-600 hover:bg-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
              >
                Share ↗
              </button>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-purple-500" />
              Waiting for your partner…
            </div>
            {error && <p className="mt-3 text-sm text-red-600 text-center">{error}</p>}
          </>
        )}

        {view === 'join' && (
          <>
            <h1 className="mb-2 text-center text-2xl font-bold text-gray-900">Enter code</h1>
            <p className="mb-6 text-center text-sm text-gray-500">
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
              className="mb-3 w-full rounded-xl border border-gray-200 px-4 py-3 text-center font-mono text-xl font-bold uppercase tracking-widest text-gray-900 placeholder-gray-300 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            />
            {joining && (
              <div className="mb-3 flex items-center justify-center gap-2 text-sm text-gray-400">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-purple-500" />
                Joining…
              </div>
            )}
            {error && <p className="mb-3 text-sm text-red-600 text-center">{error}</p>}
            <button
              onClick={() => { setView('choose'); setJoinCode(''); setError(null) }}
              className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
            >
              Back
            </button>
          </>
        )}
      </div>
    </div>
  )
}
