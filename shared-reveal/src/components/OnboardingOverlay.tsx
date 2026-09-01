import { useState, useEffect } from 'react'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { User } from 'firebase/auth'

const TUTORIAL_STEPS = [
  {
    emoji: '🌿',
    title: 'You go first',
    body: 'Each day, share something that reminded you of them — a photo, a thought, a voice memo, a song. Anything.',
  },
  {
    emoji: '🔒',
    title: 'It stays hidden',
    body: "Your entry is completely private the moment you submit. They can't see it — not even a hint.",
  },
  {
    emoji: '✨',
    title: 'Both reveal at once',
    body: "When you both submit, everything reveals simultaneously. A moment of \"here's what I was thinking about you.\"",
  },
]

const STORAGE_KEY = 'onboarding_seen_v2'
const TOTAL_STEPS = TUTORIAL_STEPS.length + 2 // + pair name + reminder

export default function OnboardingOverlay({
  visible,
  user,
  pairId,
}: {
  visible: boolean
  user: User | null
  pairId: string | null
}) {
  const [step, setStep] = useState(0)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true')
  const [pairName, setPairName] = useState('')
  const [reminderInput, setReminderInput] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!visible) return
    setDismissed(localStorage.getItem(STORAGE_KEY) === 'true')
  }, [visible])

  if (!visible || dismissed) return null

  const isTutorial = step < TUTORIAL_STEPS.length
  const isPairNameStep = step === TUTORIAL_STEPS.length
  const isReminderStep = step === TUTORIAL_STEPS.length + 1
  const isLast = step === TOTAL_STEPS - 1
  const s = isTutorial ? TUTORIAL_STEPS[step] : null

  async function finish() {
    if (saving) return
    setSaving(true)
    try {
      if (pairName.trim() && pairId) {
        await updateDoc(doc(db, 'pairs', pairId), {
          pairName: pairName.trim(),
          updatedAt: serverTimestamp(),
        })
      }
      if (reminderInput && user) {
        const hour = parseInt(reminderInput.split(':')[0], 10)
        if (!isNaN(hour)) {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
          await updateDoc(doc(db, 'users', user.uid), {
            reminderTime: { hour, tz },
            updatedAt: serverTimestamp(),
          })
        }
      }
    } catch (e) {
      console.error('[OnboardingOverlay] save error', e)
    }
    localStorage.setItem(STORAGE_KEY, 'true')
    setSaving(false)
    setDismissed(true)
  }

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, 'true')
    setDismissed(true)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center animate-fadeIn"
      style={{ background: 'rgba(24,24,26,0.72)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="w-full max-w-sm mx-auto rounded-t-3xl px-7 pt-8 pb-10 animate-fadeUp"
        style={{ background: 'var(--c-bg-card)' }}
      >
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-7">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className="rounded-full transition-all"
              style={{
                width: i === step ? 20 : 8,
                height: 8,
                background: i === step ? 'var(--c-green)' : 'var(--c-border)',
              }}
            />
          ))}
        </div>

        {/* Tutorial step */}
        {isTutorial && s && (
          <div className="text-center mb-6">
            <div className="text-5xl mb-4">{s.emoji}</div>
            <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--c-text-1)' }}>
              {s.title}
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
              {s.body}
            </p>
          </div>
        )}

        {/* Pair name step */}
        {isPairNameStep && (
          <div className="mb-6">
            <div className="text-5xl text-center mb-4">🏡</div>
            <h2 className="text-xl font-bold mb-2 text-center" style={{ color: 'var(--c-text-1)' }}>
              What do you call each other?
            </h2>
            <p className="text-sm leading-relaxed mb-4 text-center" style={{ color: 'var(--c-text-2)' }}>
              This shows at the top of your journal — optional, skip if you like.
            </p>
            <input
              type="text"
              value={pairName}
              onChange={(e) => setPairName(e.target.value.slice(0, 30))}
              placeholder="e.g. us, home, the two birds…"
              className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
              style={{
                border: '1.5px solid var(--c-border)',
                background: 'var(--c-bg-surface)',
                color: 'var(--c-text-1)',
              }}
            />
          </div>
        )}

        {/* Daily reminder step */}
        {isReminderStep && (
          <div className="mb-6">
            <div className="text-5xl text-center mb-4">🔔</div>
            <h2 className="text-xl font-bold mb-2 text-center" style={{ color: 'var(--c-text-1)' }}>
              Get a daily reminder
            </h2>
            <p className="text-sm leading-relaxed mb-4 text-center" style={{ color: 'var(--c-text-2)' }}>
              A gentle nudge each day so you don't forget to share — optional.
            </p>
            <input
              type="time"
              value={reminderInput}
              onChange={(e) => setReminderInput(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
              style={{
                border: '1.5px solid var(--c-border)',
                background: 'var(--c-bg-surface)',
                color: 'var(--c-text-1)',
              }}
            />
          </div>
        )}

        <button
          onClick={isLast ? finish : () => setStep((n) => n + 1)}
          disabled={saving}
          className="w-full rounded-xl py-4 text-sm font-bold text-white tracking-widest uppercase transition-all active:scale-[0.98] disabled:opacity-50"
          style={{ background: 'var(--c-green)' }}
        >
          {saving ? '…' : isLast ? 'Start' : 'Next'}
        </button>

        {!isLast && (
          <button
            onClick={dismiss}
            className="w-full mt-3 py-2 text-xs font-medium"
            style={{ color: 'var(--c-text-3)' }}
          >
            Skip intro
          </button>
        )}
      </div>
    </div>
  )
}
