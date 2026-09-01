import { useState, useEffect } from 'react'

const STEPS = [
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
    body: "When you both submit, everything reveals simultaneously. A moment of “here’s what I was thinking about you.”",
  },
]

const STORAGE_KEY = 'onboarding_seen_v1'

export default function OnboardingOverlay({ visible }: { visible: boolean }) {
  const [step, setStep] = useState(0)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true')

  useEffect(() => {
    if (!visible) return
    setDismissed(localStorage.getItem(STORAGE_KEY) === 'true')
  }, [visible])

  if (!visible || dismissed) return null

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, 'true')
    setDismissed(true)
  }

  const isLast = step === STEPS.length - 1
  const s = STEPS[step]

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
          {STEPS.map((_, i) => (
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

        <div className="text-center mb-6">
          <div className="text-5xl mb-4">{s.emoji}</div>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--c-text-1)' }}>
            {s.title}
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
            {s.body}
          </p>
        </div>

        <button
          onClick={isLast ? dismiss : () => setStep((s) => s + 1)}
          className="w-full rounded-xl py-4 text-sm font-bold text-white tracking-widest uppercase transition-all active:scale-[0.98]"
          style={{ background: 'var(--c-green)' }}
        >
          {isLast ? 'Start' : 'Next'}
        </button>

        {!isLast && (
          <button
            onClick={dismiss}
            className="w-full mt-3 py-2 text-xs font-medium"
            style={{ color: 'var(--c-text-3)' }}
          >
            Skip
          </button>
        )}
      </div>
    </div>
  )
}
