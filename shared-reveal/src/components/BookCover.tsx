import { useEffect, useState } from 'react'

export default function BookCover({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    // small delay so the cover is painted before animating
    const t1 = setTimeout(() => setOpen(true), 60)
    // unmount after animation completes
    const t2 = setTimeout(() => { setGone(true); onDone() }, 860)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onDone])

  if (gone) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        transformOrigin: 'left center',
        transform: open
          ? 'perspective(1400px) rotateY(-115deg)'
          : 'perspective(1400px) rotateY(0deg)',
        transition: open ? 'transform 0.78s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        background: '#1C2B1E',
        // subtle leather grain via noise overlay
        boxShadow: open
          ? '-8px 0 40px rgba(0,0,0,0.5)'
          : '8px 0 40px rgba(0,0,0,0.3)',
      }}
    >
      {/* Grain texture */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.06,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '180px',
        }}
      />

      {/* Spine shadow on right edge */}
      <div style={{
        position: 'absolute',
        top: 0, right: 0, bottom: 0,
        width: 20,
        background: 'linear-gradient(to left, rgba(0,0,0,0.25), transparent)',
      }} />

      {/* Horizontal rule top */}
      <div style={{
        position: 'absolute',
        top: 52, left: 32, right: 32,
        height: 1,
        background: 'rgba(74,138,96,0.3)',
      }} />

      {/* Cover content — centred */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        padding: '0 40px',
        userSelect: 'none',
      }}>
        {/* Leaf mark */}
        <svg width="52" height="60" viewBox="0 0 52 60" fill="none" opacity={0.55}>
          <path d="M26 58 Q24 44 18 28 Q14 16 20 8" stroke="#8FAF8A" strokeWidth="2" strokeLinecap="round" fill="none"/>
          <ellipse cx="16" cy="50" rx="10" ry="3.5" transform="rotate(-42 16 50)" fill="#8FAF8A"/>
          <ellipse cx="14" cy="40" rx="9"  ry="3"   transform="rotate(-36 14 40)" fill="#8FAF8A" opacity=".8"/>
          <ellipse cx="36" cy="52" rx="10" ry="3.5" transform="rotate(38 36 52)"  fill="#8FAF8A"/>
          <ellipse cx="38" cy="42" rx="9"  ry="3"   transform="rotate(32 38 42)"  fill="#8FAF8A" opacity=".8"/>
        </svg>

        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: 13,
            letterSpacing: '0.35em',
            fontWeight: 700,
            textTransform: 'uppercase',
            color: '#8FAF8A',
          }}>
            birds.eye
          </div>
          <div style={{
            marginTop: 8,
            fontSize: 10,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'rgba(143,175,138,0.45)',
          }}>
            A journal for two
          </div>
        </div>

        {/* Decorative horizontal lines */}
        <div style={{ width: 48, display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
          <div style={{ height: 1, background: 'rgba(74,138,96,0.35)' }} />
          <div style={{ height: 1, background: 'rgba(74,138,96,0.2)' }} />
        </div>
      </div>

      {/* Horizontal rule bottom */}
      <div style={{
        position: 'absolute',
        bottom: 52, left: 32, right: 32,
        height: 1,
        background: 'rgba(74,138,96,0.3)',
      }} />

      {/* Year stamp bottom-right */}
      <div style={{
        position: 'absolute',
        bottom: 32, right: 32,
        fontSize: 10,
        letterSpacing: '0.2em',
        color: 'rgba(143,175,138,0.35)',
        textTransform: 'uppercase',
      }}>
        {new Date().getFullYear()}
      </div>
    </div>
  )
}
