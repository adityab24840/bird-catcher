import { useEffect, useMemo, useRef, useState } from 'react'
import ThemeToggle from '../components/ThemeToggle'
import BookCover from '../components/BookCover'
import { doc, onSnapshot, collection, query, orderBy, limit, getDocs } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase/config'
import { useTimeline } from '../hooks/useTimeline'
import { useOnThisDay } from '../hooks/useOnThisDay'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { usePairId } from '../hooks/usePair'
import { useAuth } from '../hooks/useAuth'
import type { EntryDoc, SubmissionDoc, UserDoc, SummaryDoc } from '../types/index'
import { reactToEntryFn, requestEntryDeletionFn, respondEntryDeletionFn, revealAnywayFn } from '../services/submissions'
import { updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore'

const MOOD_EMOJIS: Record<string, string> = {
  happy: '😊',
  'missing-you': '💭',
  proud: '🌟',
  random: '🍃',
}

const REACTION_EMOJIS = ['❤️', '😂', '😢', '🌿', '✨']

function Avatar({ photoURL, name }: { photoURL: string | null; name: string | null }) {
  if (photoURL)
    return <img src={photoURL} alt={name ?? ''} className="h-8 w-8 rounded-full object-cover" />
  return (
    <div
      className="h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs"
      style={{ background: '#E8F0E9', color: '#2D5A3D' }}
    >
      {name?.[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

function PhotoLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  const [scale, setScale] = useState(1)
  const lastTouchDistRef = useRef<number | null>(null)

  function getTouchDist(e: React.TouchEvent) {
    const t1 = e.touches[0], t2 = e.touches[1]
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) lastTouchDistRef.current = getTouchDist(e)
  }

  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && lastTouchDistRef.current != null) {
      const dist = getTouchDist(e)
      const delta = dist / lastTouchDistRef.current
      setScale((s) => Math.max(1, Math.min(5, s * delta)))
      lastTouchDistRef.current = dist
    }
  }

  function onTouchEnd() {
    lastTouchDistRef.current = null
    setScale((s) => (s < 1.15 ? 1 : s))
  }

  function handleWheel(e: React.WheelEvent) {
    e.stopPropagation()
    setScale((s) => Math.max(1, Math.min(5, s - e.deltaY * 0.003)))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-fadeIn overflow-hidden"
      style={{ background: 'rgba(0,0,0,0.92)' }}
      onClick={() => scale === 1 && onClose()}
    >
      <img
        src={url}
        alt=""
        className="max-w-full max-h-full object-contain select-none"
        style={{
          maxHeight: '92dvh',
          maxWidth: '96vw',
          transform: `scale(${scale})`,
          transition: scale === 1 ? 'transform 0.2s ease' : 'none',
          touchAction: 'none',
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onWheel={handleWheel}
      />
      <button
        className="absolute top-5 right-5 h-9 w-9 rounded-full flex items-center justify-center text-xl text-white"
        style={{ background: 'rgba(255,255,255,0.15)' }}
        onClick={onClose}
      >×</button>
      {scale > 1 && (
        <button
          className="absolute bottom-8 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full text-xs text-white"
          style={{ background: 'rgba(255,255,255,0.15)' }}
          onClick={() => setScale(1)}
        >
          Reset zoom
        </button>
      )}
    </div>
  )
}

function AudioPlayer({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)

  const bars = useMemo(() => {
    let h = 0
    for (let i = 0; i < url.length; i++) h = ((h << 5) - h + url.charCodeAt(i)) | 0
    return Array.from({ length: 36 }, (_, i) => {
      h = ((h << 5) - h + (i + 1) * 2654435761) | 0
      return 18 + (Math.abs(h) % 72)
    })
  }, [url])

  function toggle() {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) }
    else { a.play().catch(() => {}); setPlaying(true) }
  }

  function onTimeUpdate() {
    const a = audioRef.current
    if (!a || !a.duration) return
    setProgress(a.currentTime / a.duration)
  }

  function onEnded() { setPlaying(false); setProgress(0) }

  const playedBars = Math.round(progress * bars.length)
  const remaining = duration > 0 ? duration * (1 - progress) : 0
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(Math.round(remaining) % 60).padStart(2, '0')

  function seekTo(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current
    if (!a || !a.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    a.currentTime = ratio * a.duration
    setProgress(ratio)
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={onEnded}
      />
      <button
        onClick={toggle}
        className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90"
        style={{ background: '#2D5A3D' }}
      >
        {playing ? (
          <svg width="12" height="14" viewBox="0 0 12 14" fill="white">
            <rect x="0" y="0" width="4" height="14" rx="1"/>
            <rect x="8" y="0" width="4" height="14" rx="1"/>
          </svg>
        ) : (
          <svg width="12" height="14" viewBox="0 0 12 14" fill="white">
            <path d="M2 1.5L10.5 7 2 12.5V1.5z"/>
          </svg>
        )}
      </button>
      <div
        className="flex-1 flex items-end gap-[2px] h-8 cursor-pointer"
        onClick={seekTo}
        role="progressbar"
      >
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm transition-colors duration-75"
            style={{
              height: `${h}%`,
              background: i < playedBars ? '#2D5A3D' : '#E8E2D9',
            }}
          />
        ))}
      </div>
      <span
        className="text-[10px] font-mono shrink-0 w-9 text-right tabular-nums"
        style={{ color: '#7A7268' }}
      >
        {duration > 0 ? `${mm}:${ss}` : ''}
      </span>
    </div>
  )
}

/* ── Shared card inner content (media, text, tags, audio, location, song) ─── */
function CardMedia({
  sub,
  onPhotoTap,
  compact = false,
}: {
  sub: SubmissionDoc
  onPhotoTap: (url: string) => void
  compact?: boolean
}) {
  const photos = sub.photoURLs?.length ? sub.photoURLs : sub.photoURL ? [sub.photoURL] : []
  const texts = sub.texts?.length ? sub.texts : sub.text ? [sub.text] : []
  const audios = sub.audioURLs ?? []

  return (
    <>
      {photos[0] && (
        <img
          src={photos[0]}
          alt=""
          onClick={() => onPhotoTap(photos[0])}
          className="cursor-pointer w-full object-cover block active:opacity-90 transition-opacity"
          style={{ height: compact ? 160 : 220 }}
        />
      )}
      {!compact && photos.slice(1).map((url, i) => (
        <img key={i} src={url} alt="" loading="lazy" onClick={() => onPhotoTap(url)}
          className="cursor-pointer w-full object-cover block active:opacity-90 border-t"
          style={{ height: 180, borderColor: 'var(--c-border)' }} />
      ))}
      {sub.sketchURL && (
        <img src={sub.sketchURL} alt="sketch" loading="lazy" onClick={() => onPhotoTap(sub.sketchURL!)}
          className="w-full block border-t cursor-pointer active:opacity-80 transition-opacity"
          style={{ borderColor: 'var(--c-border)' }} />
      )}
      {texts.length > 0 && (
        <div className={`px-4 ${compact ? 'pt-3 pb-1' : 'pt-4 pb-1'}`}>
          {texts.map((t, i) => (
            <p key={i} className={`leading-relaxed mb-2 last:mb-0 ${compact ? 'text-[13px]' : 'text-[15px]'}`}
              style={{ color: '#1A1A16' }}>{t}</p>
          ))}
        </div>
      )}
      {sub.tags && sub.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-2">
          {sub.tags.map((tag) => (
            <span key={tag} className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
              style={{ background: '#E8F0E9', color: '#2D5A3D' }}>{tag}</span>
          ))}
        </div>
      )}
      {!compact && sub.location && (
        <div className="mt-3 mx-4 rounded-xl overflow-hidden border" style={{ borderColor: '#E8E2D9' }}>
          <iframe title="location map"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${sub.location.lng - 0.012},${sub.location.lat - 0.008},${sub.location.lng + 0.012},${sub.location.lat + 0.008}&layer=mapnik&marker=${sub.location.lat},${sub.location.lng}`}
            width="100%" height="150" loading="lazy"
            style={{ display: 'block', border: 'none', pointerEvents: 'none' }} />
          <a href={`https://www.google.com/maps?q=${sub.location.lat},${sub.location.lng}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5" style={{ background: '#F8F5F0' }}>
            <span className="text-xs">📍</span>
            <span className="text-[10px] font-medium" style={{ color: '#2D5A3D' }}>
              {sub.location.lat.toFixed(4)}, {sub.location.lng.toFixed(4)}
            </span>
            <span className="text-[9px] ml-auto" style={{ color: '#C9BFA8' }}>open ↗</span>
          </a>
        </div>
      )}
      {!compact && sub.songURL && (
        <div className="mt-3 mx-4 rounded-xl overflow-hidden">
          <iframe
            src={`https://open.spotify.com/embed/${sub.songURL.replace('https://open.spotify.com/', '')}?utm_source=generator`}
            width="100%" height="80" frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy" style={{ display: 'block', borderRadius: 12 }} />
        </div>
      )}
      {!compact && audios.map((url, i) => (
        <div key={i} className="mt-2 mx-4 rounded-xl overflow-hidden border" style={{ borderColor: '#E8E2D9' }}>
          <p className="px-4 pt-2 text-[9px] tracking-[0.15em] uppercase font-semibold" style={{ color: '#C9BFA8' }}>
            🎙 Voice memo
          </p>
          <AudioPlayer url={url} />
        </div>
      ))}
    </>
  )
}

/* ── Polaroid card — for entries with a photo ─────────────────────────────── */
function PolaroidCard({
  sub, member, isFavorited, onToggleFavorite, onPhotoTap, tilt = 0, compact = false,
}: {
  sub: SubmissionDoc; member: UserDoc | undefined; isFavorited: boolean
  onToggleFavorite: () => void; onPhotoTap: (url: string) => void; tilt?: number; compact?: boolean
}) {
  const photos = sub.photoURLs?.length ? sub.photoURLs : sub.photoURL ? [sub.photoURL] : []
  const texts = sub.texts?.length ? sub.texts : sub.text ? [sub.text] : []
  const ts = sub.updatedAt ?? sub.submittedAt
  const timeLabel = ts ? ts.toDate().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : ''
  const firstName = member?.displayName?.split(' ')[0] ?? '…'
  const moods = sub.mood && MOOD_EMOJIS[sub.mood] ? MOOD_EMOJIS[sub.mood] : null

  return (
    <div className="relative animate-fadeIn"
      style={{
        transform: `rotate(${tilt}deg)`,
        transformOrigin: 'center top',
        filter: 'drop-shadow(0 6px 20px rgba(28,43,30,0.18))',
      }}
    >
      <div className="relative overflow-hidden" style={{ borderRadius: 4, background: 'var(--c-bg-card)' }}>
        {/* Photo(s) — full aspect ratio in single-col, fixed crop in 2-col */}
        {photos[0] && (
          <img src={photos[0]} alt="" onClick={() => onPhotoTap(photos[0])}
            className="cursor-pointer w-full block active:opacity-90 transition-opacity"
            style={compact
              ? { height: 160, objectFit: 'cover', display: 'block' }
              : { width: '100%', height: 'auto', display: 'block' }} />
        )}
        {!compact && photos.slice(1).map((url, i) => (
          <img key={i} src={url} alt="" loading="lazy" onClick={() => onPhotoTap(url)}
            className="cursor-pointer w-full block active:opacity-90 transition-opacity"
            style={{ width: '100%', height: 'auto', display: 'block', borderTop: '1px solid var(--c-border)' }} />
        ))}
        {/* Sketch — full width at natural aspect ratio */}
        {sub.sketchURL && (
          <img src={sub.sketchURL} alt="sketch" onClick={() => onPhotoTap(sub.sketchURL!)}
            loading="lazy"
            className="w-full block cursor-pointer"
            style={{ width: '100%', height: 'auto', display: 'block', borderTop: photos[0] ? '1px solid var(--c-border)' : undefined }} />
        )}

        {/* Polaroid bottom */}
        <div className="px-5 pt-4 pb-3" style={{ background: 'var(--c-bg-surface)' }}>
          {texts.length > 0 && (
            <p className="text-[14px] leading-snug mb-3" style={{ color: 'var(--c-text-1)', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
              {texts[0]}
            </p>
          )}
          {sub.tags && sub.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {sub.tags.map((tag) => (
                <span key={tag} className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                  style={{ background: 'var(--c-green-light)', color: 'var(--c-green)' }}>{tag}</span>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar photoURL={member?.photoURL ?? null} name={member?.displayName ?? null} />
              <span className="text-[12px] font-semibold" style={{ color: 'var(--c-text-1)' }}>{firstName}</span>
              {moods && <span className="text-sm">{moods}</span>}
            </div>
            <span className="text-[10px] tabular-nums" style={{ color: 'var(--c-text-3)', fontFamily: 'Georgia, serif' }}>{timeLabel}</span>
          </div>
        </div>

        {/* Extra media: location, song, voice memos */}
        {sub.location && (
          <div style={{ borderTop: '1px solid var(--c-border)' }}>
            <iframe title="location map"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${sub.location.lng - 0.012},${sub.location.lat - 0.008},${sub.location.lng + 0.012},${sub.location.lat + 0.008}&layer=mapnik&marker=${sub.location.lat},${sub.location.lng}`}
              width="100%" height="140" loading="lazy"
              style={{ display: 'block', border: 'none', pointerEvents: 'none' }} />
            <a href={`https://www.google.com/maps?q=${sub.location.lat},${sub.location.lng}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2" style={{ background: 'var(--c-bg-surface)' }}>
              <span className="text-xs">📍</span>
              <span className="text-[10px] font-medium" style={{ color: 'var(--c-green)' }}>
                {sub.location.lat.toFixed(4)}, {sub.location.lng.toFixed(4)}
              </span>
              <span className="text-[9px] ml-auto" style={{ color: 'var(--c-text-3)' }}>open ↗</span>
            </a>
          </div>
        )}
        {sub.songURL && (
          <div className="px-4 pb-3" style={{ background: 'var(--c-bg-surface)' }}>
            <iframe
              src={`https://open.spotify.com/embed/${sub.songURL.replace('https://open.spotify.com/', '')}?utm_source=generator`}
              width="100%" height="80" frameBorder="0"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy" style={{ display: 'block', borderRadius: 10 }} />
          </div>
        )}
        {(sub.audioURLs ?? []).map((url, i) => (
          <div key={i} className="border-t" style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg-surface)' }}>
            <p className="px-4 pt-2 text-[9px] tracking-[0.15em] uppercase font-semibold" style={{ color: 'var(--c-text-3)' }}>🎙 Voice memo</p>
            <AudioPlayer url={url} />
          </div>
        ))}

        {/* Favourite */}
        <button onClick={onToggleFavorite}
          className="absolute top-2.5 right-2.5 h-8 w-8 rounded-full flex items-center justify-center text-base transition-transform active:scale-75"
          style={{ background: isFavorited ? 'rgba(253,236,234,0.95)' : 'rgba(255,255,255,0.82)', boxShadow: '0 1px 6px rgba(0,0,0,0.12)', backdropFilter: 'blur(6px)' }}
          aria-label={isFavorited ? 'Unfavorite' : 'Favourite'}
        >{isFavorited ? '❤️' : '🤍'}</button>
      </div>
    </div>
  )
}

/* ── Journal page card — for text-only entries ────────────────────────────── */
function JournalCard({
  sub, member, isFavorited, onToggleFavorite, onPhotoTap: _onPhotoTap,
}: {
  sub: SubmissionDoc; member: UserDoc | undefined; isFavorited: boolean
  onToggleFavorite: () => void; onPhotoTap: (url: string) => void
}) {
  const texts = sub.texts?.length ? sub.texts : sub.text ? [sub.text] : []
  const audios = sub.audioURLs ?? []
  const ts = sub.updatedAt ?? sub.submittedAt
  const timeLabel = ts ? ts.toDate().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : ''
  const firstName = member?.displayName?.split(' ')[0] ?? '…'
  const moods = sub.mood && MOOD_EMOJIS[sub.mood] ? MOOD_EMOJIS[sub.mood] : null

  return (
    <div className="relative animate-fadeIn overflow-hidden" style={{
      borderRadius: 3,
      background: 'var(--c-bg-surface)',
      boxShadow: '0 2px 12px rgba(28,43,30,0.10), inset 0 0 0 1px rgba(201,191,168,0.25)',
      backgroundImage: `
        repeating-linear-gradient(transparent, transparent 27px, rgba(180,170,148,0.25) 27px, rgba(180,170,148,0.25) 28px)
      `,
    }}>
      {/* Left margin line */}
      <div className="absolute top-0 bottom-0" style={{ left: 44, width: 1, background: 'rgba(184,92,56,0.22)' }} />

      {/* Content */}
      <div className="pl-14 pr-5 pt-5 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Avatar photoURL={member?.photoURL ?? null} name={member?.displayName ?? null} />
            <span className="text-[11px] font-semibold" style={{ color: 'var(--c-text-2)' }}>{firstName}</span>
            {moods && <span className="text-sm">{moods}</span>}
          </div>
          <span className="text-[10px]" style={{ color: 'var(--c-text-3)', fontFamily: 'Georgia, serif' }}>{timeLabel}</span>
        </div>

        {texts.length === 0 && audios.length === 0 && !sub.sketchURL && (
          <p className="text-sm italic" style={{ color: 'var(--c-text-3)' }}>Nothing written</p>
        )}
        {texts.map((t, i) => (
          <p key={i} className="text-[15px] leading-[28px] mb-0" style={{ color: 'var(--c-text-1)', fontFamily: 'Georgia, serif' }}>{t}</p>
        ))}
        {sub.sketchURL && (
          <img src={sub.sketchURL} alt="sketch" loading="lazy"
            className="w-full rounded-xl mt-3 cursor-pointer block"
            onClick={() => _onPhotoTap(sub.sketchURL!)} />
        )}

        {sub.songURL && (
          <div className="mt-3 rounded-xl overflow-hidden">
            <iframe src={`https://open.spotify.com/embed/${sub.songURL.replace('https://open.spotify.com/', '')}?utm_source=generator`}
              width="100%" height="80" frameBorder="0"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy" style={{ display: 'block', borderRadius: 12 }} />
          </div>
        )}
        {audios.map((url, i) => (
          <div key={i} className="mt-2 rounded-xl overflow-hidden border" style={{ borderColor: 'var(--c-border)' }}>
            <p className="px-4 pt-2 text-[9px] tracking-[0.15em] uppercase font-semibold" style={{ color: 'var(--c-text-3)' }}>🎙 Voice memo</p>
            <AudioPlayer url={url} />
          </div>
        ))}

        {sub.location && (
          <div className="mt-3 rounded-xl overflow-hidden border" style={{ borderColor: 'var(--c-border)' }}>
            <iframe title="location map"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${sub.location.lng - 0.012},${sub.location.lat - 0.008},${sub.location.lng + 0.012},${sub.location.lat + 0.008}&layer=mapnik&marker=${sub.location.lat},${sub.location.lng}`}
              width="100%" height="140" loading="lazy"
              style={{ display: 'block', border: 'none', pointerEvents: 'none' }} />
            <a href={`https://www.google.com/maps?q=${sub.location.lat},${sub.location.lng}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5" style={{ background: 'var(--c-bg-surface)' }}>
              <span className="text-xs">📍</span>
              <span className="text-[10px] font-medium" style={{ color: 'var(--c-green)' }}>
                {sub.location.lat.toFixed(4)}, {sub.location.lng.toFixed(4)}
              </span>
              <span className="text-[9px] ml-auto" style={{ color: 'var(--c-text-3)' }}>open ↗</span>
            </a>
          </div>
        )}

        {sub.tags && sub.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {sub.tags.map((tag) => (
              <span key={tag} className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                style={{ background: 'var(--c-green-light)', color: 'var(--c-green)' }}>{tag}</span>
            ))}
          </div>
        )}
      </div>

      {/* Favourite */}
      <button onClick={onToggleFavorite}
        className="absolute top-2.5 right-2.5 h-7 w-7 rounded-full flex items-center justify-center text-sm transition-transform active:scale-75"
        style={{ background: isFavorited ? 'rgba(253,236,234,0.95)' : 'rgba(255,255,255,0.7)', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}
        aria-label={isFavorited ? 'Unfavorite' : 'Favourite'}
      >{isFavorited ? '❤️' : '🤍'}</button>
    </div>
  )
}

/* ── Default card — fallback (mixed content without leading photo) ─────────── */
function SubmissionCard({
  sub,
  member,
  isFavorited,
  onToggleFavorite,
  onPhotoTap,
  variant = 'default',
  tilt = 0,
  compact = false,
}: {
  sub: SubmissionDoc
  member: UserDoc | undefined
  isFavorited: boolean
  onToggleFavorite: () => void
  onPhotoTap: (url: string) => void
  variant?: 'polaroid' | 'journal' | 'default'
  tilt?: number
  compact?: boolean
}) {
  const photos = sub.photoURLs?.length ? sub.photoURLs : sub.photoURL ? [sub.photoURL] : []
  const texts = sub.texts?.length ? sub.texts : sub.text ? [sub.text] : []
  const audios = sub.audioURLs ?? []
  const hasVisualMedia = photos.length > 0 || !!sub.sketchURL
  const hasContent = hasVisualMedia || texts.length > 0 || audios.length > 0 || !!sub.location || !!sub.songURL

  if (variant === 'polaroid' || (variant === 'default' && hasVisualMedia)) {
    return <PolaroidCard sub={sub} member={member} isFavorited={isFavorited} onToggleFavorite={onToggleFavorite} onPhotoTap={onPhotoTap} tilt={tilt} compact={compact} />
  }
  if (variant === 'journal' || (variant === 'default' && !hasVisualMedia)) {
    return <JournalCard sub={sub} member={member} isFavorited={isFavorited} onToggleFavorite={onToggleFavorite} onPhotoTap={onPhotoTap} />
  }

  const ts = sub.updatedAt ?? sub.submittedAt
  const timeLabel = ts ? ts.toDate().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : ''
  const isUpdated = !!(sub.updatedAt)
  const firstName = member?.displayName?.split(' ')[0] ?? '…'

  return (
    <div className="relative bg-white rounded-2xl overflow-hidden animate-fadeIn"
      style={{ boxShadow: '0 2px 16px rgba(28,43,30,0.09)' }}>
      <CardMedia sub={sub} onPhotoTap={onPhotoTap} />
      {!hasContent && <p className="px-4 py-4 text-sm italic" style={{ color: '#C9BFA8' }}>Nothing shared</p>}
      <div className="flex items-center gap-2.5 px-4 pt-3 pb-3.5 mt-1" style={{ borderTop: '1px solid #F0EBE0' }}>
        <Avatar photoURL={member?.photoURL ?? null} name={member?.displayName ?? null} />
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-semibold" style={{ color: '#1A1A16' }}>{firstName}</span>
        </div>
        {timeLabel && <span className="text-[11px] font-medium tabular-nums shrink-0" style={{ color: '#7A7268' }}>{timeLabel}{isUpdated && ' · edited'}</span>}
        {sub.mood && MOOD_EMOJIS[sub.mood] && <span className="text-base" title={sub.mood}>{MOOD_EMOJIS[sub.mood]}</span>}
      </div>
      <button onClick={onToggleFavorite}
        className="absolute top-2.5 right-2.5 h-8 w-8 rounded-full flex items-center justify-center text-base transition-transform active:scale-75"
        style={{ background: isFavorited ? 'rgba(253,236,234,0.95)' : 'rgba(255,255,255,0.85)', boxShadow: '0 1px 6px rgba(0,0,0,0.12)', backdropFilter: 'blur(6px)' }}
        aria-label={isFavorited ? 'Unfavorite' : 'Favourite'}
      >{isFavorited ? '❤️' : '🤍'}</button>
    </div>
  )
}

function DaySection({
  entry,
  pairId,
  memberUids,
  memberDocs,
  currentUid,
  favKeys,
  onToggleFav,
  onPhotoTap,
}: {
  entry: EntryDoc
  pairId: string
  memberUids: string[]
  memberDocs: Record<string, UserDoc>
  currentUid: string
  favKeys: Set<string>
  onToggleFav: (date: string, submitterUid: string) => void
  onPhotoTap: (url: string) => void
}) {
  const [submissions, setSubmissions] = useState<SubmissionDoc[]>([])
  const [subError, setSubError] = useState<string | null>(null)
  const [reacting, setReacting] = useState(false)
  const [deletionWorking, setDeletionWorking] = useState(false)
  const [revealing, setRevealing] = useState(false)

  const isRevealed = entry.status === 'revealed'
  const iSubmitted = entry.submittedMembers?.includes(currentUid) ?? false
  const partnerUid = memberUids.find((u) => u !== currentUid) ?? null
  const partnerSubmitted = partnerUid ? (entry.submittedMembers?.includes(partnerUid) ?? false) : false

  useEffect(() => {
    // Fall back to currentUid when memberDocs hasn't loaded yet (race on first render)
    const effectiveUids = memberUids.length ? memberUids : (currentUid ? [currentUid] : [])
    if (!effectiveUids.length) return

    const subMap: Record<string, SubmissionDoc> = {}

    // When not revealed, only subscribe to own submission (security rules block partner reads)
    const uidsToLoad = isRevealed ? effectiveUids : effectiveUids.filter((u) => u === currentUid)

    const unsubs = uidsToLoad.map((uid) =>
      onSnapshot(
        doc(db, `pairs/${pairId}/entries/${entry.date}/submissions/${uid}`),
        (snap) => {
          if (snap.exists()) {
            subMap[uid] = snap.data() as SubmissionDoc
          } else {
            delete subMap[uid]
          }
          const sorted = effectiveUids.map((u) => subMap[u]).filter((s): s is SubmissionDoc => s !== null && s !== undefined)
          sorted.sort((a, b) => (b.submittedAt?.toMillis?.() ?? 0) - (a.submittedAt?.toMillis?.() ?? 0))
          setSubmissions(sorted)
        },
        (err) => {
          console.error('[DaySection] submission read error:', err)
          setSubError(err.message ?? 'Permission denied')
        },
      )
    )

    return () => unsubs.forEach((u) => u())
  }, [pairId, entry.date, memberUids, isRevealed, currentUid])

  const date = new Date(entry.date + 'T12:00:00')
  const isToday = entry.date === new Date().toLocaleDateString('en-CA')
  const day = String(date.getDate()).padStart(2, '0')
  const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  const year = date.getFullYear()
  const dateLabel = isToday ? 'Today' : `${day} ${month} ${year}`

  return (
    <div className="animate-fadeUp">
      {/* Timeline date marker */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className="shrink-0 h-3 w-3 rounded-full border-2"
          style={{
            background: isRevealed ? '#2D5A3D' : '#F2EDE4',
            borderColor: '#2D5A3D',
          }}
        />
        <span
          className="text-[11px] tracking-[0.18em] font-bold uppercase"
          style={{ color: isToday ? '#2D5A3D' : '#7A7268' }}
        >
          {dateLabel}
        </span>
        {entry.status === 'one_submitted' && (
          <span className="text-[9px] tracking-[0.1em] uppercase px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#E8F0E9', color: '#2D5A3D' }}>
            in progress
          </span>
        )}
      </div>

      {subError && (
        <p className="text-xs text-center" style={{ color: '#B85C38' }}>
          {subError}
        </p>
      )}

      {submissions.length === 0 && !subError ? (
        <div className="space-y-5 pl-6">
          <div className="h-28 rounded-2xl animate-pulse" style={{ background: '#E8E2D4' }} />
          <div className="h-16 rounded-2xl animate-pulse" style={{ background: '#EDE8DF' }} />
        </div>
      ) : (
        <div className="pl-6">
          {/* Masonry 2-col when both revealed; stacked otherwise */}
          <div className="space-y-5 mb-5">
            {submissions.map((sub, idx) => (
              <SubmissionCard
                key={sub.uid}
                sub={sub}
                member={memberDocs[sub.uid]}
                isFavorited={favKeys.has(`${entry.date}/${sub.uid}`)}
                onToggleFavorite={() => onToggleFav(entry.date, sub.uid)}
                onPhotoTap={onPhotoTap}
                tilt={idx === 0 ? 1.2 : -0.8}
              />
            ))}
          </div>

          {/* one_submitted: partner's blurred placeholder + reveal/waiting states */}
          {!isRevealed && (() => {
            const partnerMember = partnerUid ? memberDocs[partnerUid] : undefined
            const partnerName = partnerMember?.displayName?.split(' ')[0] ?? 'Partner'
            if (partnerSubmitted && !iSubmitted) {
              // Partner submitted, I haven't — tappable blurred tile
              return (
                <button
                  disabled={revealing}
                  onClick={async () => {
                    setRevealing(true)
                    try { await revealAnywayFn({ entryDate: entry.date }) }
                    catch { /* will retry */ }
                    setRevealing(false)
                  }}
                  className="w-full relative rounded-xl overflow-hidden border text-left transition-all active:scale-[0.98] disabled:opacity-60"
                  style={{ borderColor: '#E8E2D4', boxShadow: '0 1px 6px rgba(28,43,30,0.06)' }}
                >
                  {/* Fake blurred content */}
                  <div className="px-4 py-4 space-y-2 select-none" style={{ filter: 'blur(8px)', userSelect: 'none' }}>
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full" style={{ background: '#C9BFA8' }} />
                      <div>
                        <div className="h-3 rounded w-20 mb-1" style={{ background: '#C9BFA8' }} />
                        <div className="h-2.5 rounded w-12" style={{ background: '#E8E2D9' }} />
                      </div>
                    </div>
                    <div className="h-3.5 rounded" style={{ background: '#E8E2D9', width: '88%' }} />
                    <div className="h-3.5 rounded" style={{ background: '#E8E2D9', width: '72%' }} />
                    <div className="h-3.5 rounded" style={{ background: '#E8E2D9', width: '80%' }} />
                  </div>
                  {/* Centre label */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5"
                    style={{ backdropFilter: 'blur(1px)' }}>
                    <span className="text-2xl">{revealing ? '…' : '🔒'}</span>
                    <p className="text-xs font-semibold" style={{ color: '#1A1A16' }}>
                      {revealing ? 'Revealing…' : `Tap to reveal ${partnerName}'s message`}
                    </p>
                  </div>
                </button>
              )
            }
            if (iSubmitted && !partnerSubmitted) {
              // I submitted, partner hasn't — waiting tile
              return (
                <div className="rounded-xl px-4 py-6 flex flex-col items-center gap-1.5 border border-dashed"
                  style={{ borderColor: '#C9BFA8' }}>
                  <span className="text-2xl">⏳</span>
                  <p className="text-sm font-medium" style={{ color: '#7A7268' }}>Waiting for {partnerName}…</p>
                  <p className="text-xs" style={{ color: '#C9BFA8' }}>Their tile appears once they share</p>
                </div>
              )
            }
            return null
          })()}

          {/* Deletion consent UI — revealed entries only */}
          {entry.status === 'revealed' && (() => {
            const dr = entry.deletionRequest
            if (!dr) {
              return (
                <div className="flex justify-end px-1">
                  <button
                    disabled={deletionWorking}
                    onClick={async () => {
                      setDeletionWorking(true)
                      try { await requestEntryDeletionFn({ entryDate: entry.date }) }
                      catch { /* best-effort — entry updates via onSnapshot */ }
                      setDeletionWorking(false)
                    }}
                    className="text-[10px] px-2 py-1 rounded-lg disabled:opacity-40"
                    style={{ color: '#C9BFA8', border: '1px solid #E8E2D9' }}
                  >
                    🗑 Delete
                  </button>
                </div>
              )
            }
            if (dr.requestedBy === currentUid) {
              return (
                <div className="rounded-xl px-3 py-2.5 text-xs flex items-center gap-2"
                  style={{ background: '#FAF0EB', border: '1px solid #E8D5C8' }}>
                  <span style={{ color: '#7A7268' }}>Waiting for partner to approve deletion…</span>
                  <button
                    disabled={deletionWorking}
                    onClick={async () => {
                      setDeletionWorking(true)
                      try {
                        await respondEntryDeletionFn({ entryDate: entry.date, accept: false })
                      } catch { /* best-effort */ }
                      setDeletionWorking(false)
                    }}
                    className="ml-auto text-[10px] px-2 py-1 rounded disabled:opacity-40"
                    style={{ color: '#B85C38' }}
                  >
                    Cancel
                  </button>
                </div>
              )
            }
            return (
              <div className="rounded-xl px-3 py-2.5 space-y-2"
                style={{ background: '#FAF0EB', border: '1px solid #E8D5C8' }}>
                <p className="text-xs font-medium" style={{ color: '#B85C38' }}>
                  Partner wants to delete this entry
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={deletionWorking}
                    onClick={async () => {
                      setDeletionWorking(true)
                      try { await respondEntryDeletionFn({ entryDate: entry.date, accept: false }) }
                      catch { /* best-effort */ }
                      setDeletionWorking(false)
                    }}
                    className="flex-1 rounded-lg py-1.5 text-xs font-medium disabled:opacity-40"
                    style={{ border: '1px solid #C9BFA8', color: '#7A7268' }}
                  >
                    Decline
                  </button>
                  <button
                    disabled={deletionWorking}
                    onClick={async () => {
                      setDeletionWorking(true)
                      try { await respondEntryDeletionFn({ entryDate: entry.date, accept: true }) }
                      catch { /* best-effort */ }
                      setDeletionWorking(false)
                    }}
                    className="flex-1 rounded-lg py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                    style={{ background: '#B85C38' }}
                  >
                    {deletionWorking ? '…' : 'Delete'}
                  </button>
                </div>
              </div>
            )
          })()}

          {/* Reaction row — only on revealed entries */}
          {entry.status === 'revealed' && (
            <div className="flex items-center gap-1.5 px-1 pt-1">
              {REACTION_EMOJIS.map((emoji) => {
                const myReaction = entry.reactions?.[currentUid]
                const isSelected = myReaction === emoji
                return (
                  <button
                    key={emoji}
                    disabled={reacting}
                    onClick={async () => {
                      setReacting(true)
                      try {
                        await reactToEntryFn({ entryDate: entry.date, emoji: isSelected ? '' : emoji })
                      } catch { /* best-effort */ }
                      setReacting(false)
                    }}
                    className="rounded-xl px-2 py-1.5 text-lg transition-all active:scale-90 disabled:opacity-60"
                    style={{
                      background: isSelected ? '#E8F0E9' : 'transparent',
                      border: `1.5px solid ${isSelected ? '#2D5A3D' : 'transparent'}`,
                    }}
                  >
                    {emoji}
                  </button>
                )
              })}
              {/* Partner's reaction display */}
              {Object.entries(entry.reactions ?? {})
                .filter(([uid]) => uid !== currentUid)
                .map(([uid, emoji]) => (
                  <span
                    key={uid}
                    className="ml-auto text-base flex items-center gap-1"
                    style={{ color: '#7A7268' }}
                  >
                    <span>{memberDocs[uid]?.displayName?.split(' ')[0] ?? '…'}</span>
                    <span>{emoji}</span>
                  </span>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CalendarView({
  entries,
  onSelectDate,
  selectedDate,
  calMonth,
  setCalMonth,
  pairId,
  memberDocs,
  memberUids,
  currentUid,
  favKeys,
  onToggleFav,
  onPhotoTap,
}: {
  entries: EntryDoc[]
  onSelectDate: (date: string) => void
  selectedDate: string | null
  calMonth: Date
  setCalMonth: React.Dispatch<React.SetStateAction<Date>>
  pairId: string
  memberDocs: Record<string, UserDoc>
  memberUids: string[]
  currentUid: string
  favKeys: Set<string>
  onToggleFav: (date: string, uid: string) => void
  onPhotoTap: (url: string) => void
}) {
  const entryDates = new Set(entries.map((e) => e.date))

  const monthLabel = calMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  const firstDay = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1)
  const lastDay = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0)
  const startDow = firstDay.getDay()
  const daysInMonth = lastDay.getDate()

  const today = new Date().toLocaleDateString('en-CA')

  const selectedEntry = selectedDate ? entries.find((e) => e.date === selectedDate) : null

  return (
    <div className="px-4 pt-2">
      {/* Month header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() =>
            setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
          }
          className="px-3 py-1.5 text-lg leading-none"
          style={{ color: '#7A7268' }}
        >
          ‹
        </button>
        <p
          className="text-xs tracking-[0.2em] uppercase font-semibold"
          style={{ color: '#1A1A16' }}
        >
          {monthLabel}
        </p>
        <button
          onClick={() =>
            setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
          }
          className="px-3 py-1.5 text-lg leading-none"
          style={{ color: '#7A7268' }}
        >
          ›
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-2">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div
            key={i}
            className="text-center text-[10px] tracking-widest uppercase py-1"
            style={{ color: '#7A7268' }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {/* Empty offset cells */}
        {Array.from({ length: startDow }).map((_, i) => (
          <div key={`e${i}`} />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateStr = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const hasEntry = entryDates.has(dateStr)
          const isToday = dateStr === today
          const isSelected = dateStr === selectedDate

          let bg = 'transparent'
          let color = '#7A7268'
          let fontWeight: React.CSSProperties['fontWeight'] = 'normal'
          let border = 'none'

          if (isSelected) {
            bg = '#2D5A3D'
            color = '#FFFFFF'
            fontWeight = 600
          } else if (hasEntry) {
            bg = '#E8F0E9'
            color = '#2D5A3D'
            fontWeight = 600
          } else if (isToday) {
            border = '1px solid #C9BFA8'
            color = '#1A1A16'
          }

          return (
            <button
              key={day}
              onClick={() => hasEntry ? onSelectDate(dateStr) : undefined}
              className="aspect-square flex items-center justify-center text-sm rounded-lg mx-0.5 transition-all"
              style={{ background: bg, color, fontWeight, border }}
            >
              {day}
            </button>
          )
        })}
      </div>

      {/* Selected date entry */}
      {selectedDate && entryDates.has(selectedDate) && (
        <div className="mt-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px" style={{ background: '#C9BFA8' }} />
            <span
              className="text-[10px] tracking-[0.2em] uppercase text-center font-semibold shrink-0"
              style={{ color: '#7A7268' }}
            >
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </span>
            <div className="flex-1 h-px" style={{ background: '#C9BFA8' }} />
          </div>
          {selectedEntry && (
            <DaySection entry={selectedEntry} pairId={pairId} memberUids={memberUids} memberDocs={memberDocs} currentUid={currentUid} favKeys={favKeys} onToggleFav={onToggleFav} onPhotoTap={onPhotoTap} />
          )}
        </div>
      )}
    </div>
  )
}

export default function TimelinePage() {
  const { user } = useAuth()
  const { pairId } = usePairId(user?.uid ?? null)
  const { entries, loading, error, refresh } = useTimeline(pairId)
  const onThisDay = useOnThisDay(pairId ?? null)
  const navigate = useNavigate()
  const { pulling, distance } = usePullToRefresh(refresh)

  const [coverDone, setCoverDone] = useState(false)
  const [memberDocs, setMemberDocs] = useState<Record<string, UserDoc>>({})
  const [view, setView] = useState<'journal' | 'calendar'>('journal')
  const [calMonth, setCalMonth] = useState<Date>(() => new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [filterFavs, setFilterFavs] = useState(false)
  const [filterMonth, setFilterMonth] = useState<string | null>(null)
  const [latestSummary, setLatestSummary] = useState<SummaryDoc | null>(null)
  const [summaryDismissed, setSummaryDismissed] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [searchQ, setSearchQ] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  // Per-submission favorites — stored as "date/uid" strings in user doc
  const myFavs: string[] = (user?.uid ? memberDocs[user.uid]?.favoriteSubmissions : undefined) ?? []
  const favKeys = new Set(myFavs)

  async function toggleFav(date: string, submitterUid: string) {
    if (!user) return
    const key = `${date}/${submitterUid}`
    const isFav = favKeys.has(key)
    const ref = doc(db, 'users', user.uid)
    try {
      await updateDoc(ref, { favoriteSubmissions: isFav ? arrayRemove(key) : arrayUnion(key) })
    } catch (e) { console.error(e) }
  }

  // Available months derived from entries (e.g. "2026-08")
  const availableMonths = Array.from(
    new Set(entries.map((e) => e.date.slice(0, 7)))
  ).sort((a, b) => b.localeCompare(a))

  // Flashback: random revealed entry different from today
  const flashbackEntry = useMemo(() => {
    const revealed = entries.filter((e) => e.status === 'revealed' && e.date !== new Date().toLocaleDateString('en-CA'))
    if (revealed.length === 0) return null
    // deterministic "random" per day
    const n = parseInt(new Date().toLocaleDateString('en-CA').replace(/-/g, ''), 10)
    return revealed[n % revealed.length]
  }, [entries])

  const filteredEntries = entries.filter((e) => {
    if (filterFavs && !myFavs.some((k) => k.startsWith(e.date + '/'))) return false
    if (filterMonth && !e.date.startsWith(filterMonth)) return false
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase()
      // Match against date string (YYYY-MM-DD) and human-readable month/day
      const human = new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toLowerCase()
      if (!e.date.includes(q) && !human.includes(q)) return false
    }
    return true
  })

  useEffect(() => {
    if (!pairId || !user) return
    const unsubscribers: (() => void)[] = []

    const listenToUser = (uid: string) => {
      const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
        if (snap.exists())
          setMemberDocs((prev) => ({ ...prev, [uid]: snap.data() as UserDoc }))
      })
      unsubscribers.push(unsub)
    }

    listenToUser(user.uid)

    const pairUnsub = onSnapshot(doc(db, 'pairs', pairId), (snap) => {
      if (!snap.exists()) return
      const members: string[] = snap.data().members
      members.forEach((uid) => {
        if (uid === user.uid) return
        listenToUser(uid)
      })
    })
    unsubscribers.push(pairUnsub)

    return () => unsubscribers.forEach((u) => u())
  }, [pairId, user])

  useEffect(() => {
    if (!pairId) return
    setSummaryDismissed(false)
    getDocs(
      query(
        collection(db, 'pairs', pairId, 'summaries'),
        orderBy('createdAt', 'desc'),
        limit(1)
      )
    ).then((snap) => {
      if (!snap.empty) setLatestSummary(snap.docs[0].data() as SummaryDoc)
    }).catch(() => {})
  }, [pairId])

  return (
    <div className="flex flex-col h-screen overflow-hidden animate-pageIn">
      {!coverDone && (() => {
        const names = Object.values(memberDocs).map((m) => m.displayName?.split(' ')[0]).filter(Boolean) as string[]
        return <BookCover onDone={() => setCoverDone(true)} name1={names[0]} name2={names[1]} />
      })()}
      {/* Header */}
      <header
        className="flex items-center justify-between px-5 pt-12 pb-4 shrink-0"
        style={{ background: 'var(--c-bg)' }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/home')}
            className="transition-colors"
            style={{ color: '#7A7268' }}
            aria-label="Back"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
              <path
                d="M15 19l-7-7 7-7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <p
            className="text-xs tracking-[0.3em] font-bold uppercase"
            style={{ color: '#1A1A16' }}
          >
            Timeline
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />

          {/* Search toggle */}
          <button
            onClick={() => { setShowSearch((v) => !v); setSearchQ('') }}
            className="flex items-center justify-center rounded-xl p-2 border transition-all"
            style={{ background: showSearch ? 'var(--c-green)' : 'transparent', borderColor: showSearch ? 'var(--c-green)' : 'var(--c-border-mid)' }}
            title="Search"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" stroke={showSearch ? '#fff' : 'var(--c-text-1)'} strokeWidth="1.8" />
              <path d="M20 20l-3.5-3.5" stroke={showSearch ? '#fff' : 'var(--c-text-1)'} strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>

          {/* View toggle */}
          <button
            onClick={() => setView((v) => (v === 'journal' ? 'calendar' : 'journal'))}
            className="flex items-center justify-center rounded-xl p-2 border transition-all"
            style={{
              background: view === 'calendar' ? 'var(--c-green)' : 'transparent',
              borderColor: view === 'calendar' ? 'var(--c-green)' : 'var(--c-border-mid)',
            }}
            title={view === 'journal' ? 'Calendar view' : 'Journal view'}
          >
            {view === 'journal' ? (
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="18" rx="2" stroke="var(--c-text-1)" strokeWidth="1.8" />
                <path d="M3 9h18" stroke="var(--c-text-1)" strokeWidth="1.8" />
                <path d="M8 2v4M16 2v4" stroke="var(--c-text-1)" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                <path d="M4 6h16M4 10h16M4 14h16M4 18h16" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Search bar */}
      {showSearch && view === 'journal' && (
        <div className="shrink-0 px-4 py-2" style={{ background: 'var(--c-bg)', borderBottom: '1px solid var(--c-border)' }}>
          <input
            autoFocus
            type="search"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search entries…"
            className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none"
            style={{ background: 'var(--c-bg-card)', border: '1px solid var(--c-border-mid)', color: 'var(--c-text-1)' }}
          />
        </div>
      )}

      {/* Date navigation strip — journal view only */}
      {view === 'journal' && entries.length > 0 && (
        <div
          className="shrink-0 flex items-center gap-2 px-4 py-2.5 overflow-x-auto"
          style={{ background: 'var(--c-bg)', borderBottom: '1px solid var(--c-border)' }}
        >
          {entries.slice(0, 60).map((entry) => {
            const d = new Date(entry.date + 'T12:00:00')
            const isToday = entry.date === new Date().toLocaleDateString('en-CA')
            const day = d.getDate()
            const mon = d.toLocaleDateString('en-US', { month: 'short' })
            return (
              <button
                key={entry.date}
                onClick={() => {
                  const el = document.getElementById(`entry-${entry.date}`)
                  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className="shrink-0 flex flex-col items-center rounded-xl px-2.5 py-1.5 transition-all"
                style={{
                  background: isToday ? '#2D5A3D' : entry.status === 'revealed' ? 'var(--c-bg-surface)' : 'transparent',
                  border: `1px solid ${isToday ? '#2D5A3D' : 'var(--c-border)'}`,
                  minWidth: 40,
                }}
              >
                <span className="text-[14px] font-bold leading-none" style={{ color: isToday ? '#fff' : 'var(--c-text-1)' }}>{day}</span>
                <span className="text-[9px] tracking-wide uppercase" style={{ color: isToday ? 'rgba(255,255,255,0.75)' : 'var(--c-text-3)' }}>{mon}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Filter bar — journal view only */}
      {view === 'journal' && entries.length > 0 && (
        <div
          className="shrink-0 flex items-center gap-2 px-4 py-2 overflow-x-auto"
          style={{ background: 'var(--c-bg)', borderBottom: '1px solid var(--c-border)' }}
        >
          {/* Favorites toggle */}
          <button
            onClick={() => setFilterFavs((f) => !f)}
            className="shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
            style={{
              background: filterFavs ? '#2D5A3D' : '#F0EBE2',
              color: filterFavs ? '#fff' : '#7A7268',
              border: `1px solid ${filterFavs ? '#2D5A3D' : '#C9BFA8'}`,
            }}
          >
            {filterFavs ? '❤️' : '🤍'} Favorites
          </button>

          {/* Month pills */}
          {availableMonths.map((ym) => {
            const label = new Date(ym + '-15').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
            const active = filterMonth === ym
            return (
              <button
                key={ym}
                onClick={() => setFilterMonth(active ? null : ym)}
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
                style={{
                  background: active ? '#1C2B1E' : '#F0EBE2',
                  color: active ? '#fff' : '#7A7268',
                  border: `1px solid ${active ? '#1C2B1E' : '#C9BFA8'}`,
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-6">
        {pulling && (
          <div
            className="flex justify-center py-2 transition-all"
            style={{ opacity: Math.min(distance / 64, 1) }}
          >
            <div className="h-5 w-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#2D5A3D', borderTopColor: 'transparent' }} />
          </div>
        )}
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div
              className="h-7 w-7 rounded-full border-2 animate-spin"
              style={{ borderColor: '#E8F0E9', borderTopColor: '#2D5A3D' }}
            />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 text-center gap-3 px-4">
            <p className="text-sm font-mono break-all" style={{ color: '#B85C38' }}>
              {error}
            </p>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center gap-4 px-8 animate-fadeIn">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <ellipse cx="32" cy="52" rx="18" ry="6" fill="#E8F0E9"/>
              <path d="M32 52 Q28 38 22 26 Q18 18 22 10 Q26 4 32 8 Q38 4 42 10 Q46 18 42 26 Q36 38 32 52Z" fill="#2D5A3D" opacity="0.15"/>
              <path d="M32 52 Q28 38 22 26 Q18 18 22 10" stroke="#2D5A3D" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5"/>
              <path d="M32 52 Q36 38 42 26 Q46 18 42 10" stroke="#2D5A3D" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5"/>
              <ellipse cx="27" cy="28" rx="7" ry="3" transform="rotate(-30 27 28)" fill="#2D5A3D" opacity="0.3"/>
              <ellipse cx="37" cy="28" rx="7" ry="3" transform="rotate(30 37 28)" fill="#2D5A3D" opacity="0.3"/>
              <ellipse cx="24" cy="20" rx="5" ry="2" transform="rotate(-20 24 20)" fill="#2D5A3D" opacity="0.25"/>
              <ellipse cx="40" cy="20" rx="5" ry="2" transform="rotate(20 40 20)" fill="#2D5A3D" opacity="0.25"/>
            </svg>
            <div>
              <p className="font-semibold text-sm" style={{ color: '#1A1A16' }}>Your journal is growing</p>
              <p className="text-xs mt-1.5 leading-relaxed" style={{ color: '#7A7268' }}>
                Entries appear here once<br/>both of you share something
              </p>
            </div>
          </div>
        ) : view === 'calendar' ? (
          <CalendarView
            entries={entries}
            onSelectDate={setSelectedDate}
            selectedDate={selectedDate}
            calMonth={calMonth}
            setCalMonth={setCalMonth}
            pairId={pairId!}
            memberDocs={memberDocs}
            memberUids={Object.keys(memberDocs)}
            currentUid={user?.uid ?? ''}
            favKeys={favKeys}
            onToggleFav={toggleFav}
            onPhotoTap={setLightbox}
          />
        ) : (
          /* Journal view */
          <div className="px-4 pt-2 pb-8">
            {/* No results after filtering */}
            {filteredEntries.length === 0 && (filterFavs || filterMonth) && (
              <p className="text-center text-sm pt-12" style={{ color: '#C9BFA8' }}>
                No entries match this filter
              </p>
            )}

            {/* Summary card */}
            {latestSummary && !summaryDismissed && !filterFavs && !filterMonth && (
              <div
                className="rounded-xl px-4 py-3 flex items-start gap-3 animate-fadeIn"
                style={{ background: '#E8F0E9', border: '1px solid #8FAF8A' }}
              >
                <span style={{ fontSize: 20 }}>{latestSummary.type === 'weekly' ? '📅' : '🗓️'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] tracking-[0.2em] uppercase font-semibold" style={{ color: '#2D5A3D' }}>
                    {latestSummary.type === 'weekly' ? 'Weekly summary' : 'Monthly summary'}
                    {' · '}{latestSummary.label}
                  </p>
                  <p className="text-sm mt-0.5 font-medium" style={{ color: '#1C2B1E' }}>
                    {latestSummary.revealCount === 1
                      ? '1 reveal'
                      : `${latestSummary.revealCount} reveals`}
                    {' '}together
                  </p>
                </div>
                <button
                  onClick={() => setSummaryDismissed(true)}
                  className="text-sm shrink-0 mt-0.5"
                  style={{ color: '#7A7268' }}
                >
                  ×
                </button>
              </div>
            )}

            {/* On this day */}
            {onThisDay && !filterFavs && !filterMonth && (
              <div
                className="rounded-xl px-4 py-3 flex items-start gap-3 animate-fadeIn"
                style={{ background: '#EDE8DF', border: '1px solid #C9BFA8' }}
              >
                <span style={{ fontSize: 20 }}>🕰</span>
                <div>
                  <p className="text-[10px] tracking-[0.2em] uppercase font-semibold" style={{ color: '#7A7268' }}>
                    On this day · {new Date(onThisDay.date + 'T12:00:00').getFullYear()}
                  </p>
                  <p className="text-sm mt-0.5" style={{ color: '#1A1A16' }}>
                    You both shared something{onThisDay.favoritedBy?.length ? ' ❤️' : ''} — scroll down to see it
                  </p>
                </div>
              </div>
            )}

            {/* Flashback */}
            {flashbackEntry && !filterFavs && !filterMonth && !searchQ && (
              <button
                onClick={() => {
                  setFilterMonth(null)
                  setFilterFavs(false)
                  setTimeout(() => {
                    document.getElementById(`entry-${flashbackEntry.date}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }, 50)
                }}
                className="w-full rounded-xl px-4 py-3 flex items-center gap-3 text-left animate-fadeIn"
                style={{ background: '#EDE8DF', border: '1px solid #C9BFA8' }}
              >
                <span className="text-xl">🎲</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] tracking-[0.18em] uppercase font-semibold" style={{ color: '#7A7268' }}>Remember this?</p>
                  <p className="text-sm mt-0.5 font-medium truncate" style={{ color: '#1A1A16' }}>
                    {new Date(flashbackEntry.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                  <path d="M9 18l6-6-6-6" stroke="#C9BFA8" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            )}

            {/* Timeline rail wrapper */}
            <div className="relative">
              {/* Vertical rail */}
              {filteredEntries.length > 0 && (
                <div
                  className="absolute top-1.5 bottom-8 w-px"
                  style={{
                    left: 5,
                    background: 'linear-gradient(to bottom, #2D5A3D55, #C9BFA888, #2D5A3D22)',
                  }}
                />
              )}

              <div className="space-y-6">
                {filteredEntries.map((entry, idx) => {
                  const entryMonth = entry.date.slice(0, 7)
                  const prevMonth = idx > 0 ? filteredEntries[idx - 1].date.slice(0, 7) : null
                  const showMonthHeader = prevMonth !== null && entryMonth !== prevMonth
                  const monthLabel = new Date(entryMonth + '-15').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()
                  return (
                    <div key={entry.date} id={`entry-${entry.date}`}>
                      {showMonthHeader && (
                        <div className="flex items-center gap-3 mb-5 mt-2 pl-6">
                          <div className="flex-1 h-px" style={{ background: '#E8E2D9' }} />
                          <span className="text-[9px] tracking-[0.25em] font-bold shrink-0" style={{ color: '#C9BFA8' }}>
                            {monthLabel}
                          </span>
                          <div className="flex-1 h-px" style={{ background: '#E8E2D9' }} />
                        </div>
                      )}
                      <DaySection
                        entry={entry}
                        pairId={pairId!}
                        memberUids={Object.keys(memberDocs)}
                        memberDocs={memberDocs}
                        currentUid={user?.uid ?? ''}
                        favKeys={favKeys}
                        onToggleFav={toggleFav}
                        onPhotoTap={setLightbox}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom nav */}
      <nav
        className="shrink-0 flex"
        style={{ background: '#1C2B1E', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      >
        <button
          onClick={() => navigate('/home')}
          className="flex-1 flex flex-col items-center pt-3 pb-1 gap-1"
          style={{ color: '#4A5C4A' }}
        >
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
            <path d="M3 12L12 3l9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 10v9a1 1 0 001 1h4v-4h4v4h4a1 1 0 001-1v-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[9px] tracking-[0.15em] uppercase font-semibold">Today</span>
        </button>
        <button
          onClick={() => navigate('/timeline')}
          className="flex-1 flex flex-col items-center pt-3 pb-1 gap-1"
          style={{ color: '#8FAF8A' }}
        >
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M3 9h18" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="text-[9px] tracking-[0.15em] uppercase font-semibold">Timeline</span>
        </button>
        <button
          onClick={() => navigate('/stats')}
          className="flex-1 flex flex-col items-center pt-3 pb-1 gap-1"
          style={{ color: '#4A5C4A' }}
        >
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
            <path d="M4 20V14M8 20V10M12 20V6M16 20V12M20 20V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="text-[9px] tracking-[0.15em] uppercase font-semibold">Stats</span>
        </button>
        <button
          onClick={() => navigate('/export')}
          className="flex-1 flex flex-col items-center pt-3 pb-1 gap-1"
          style={{ color: '#4A5C4A' }}
        >
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
            <path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 20h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="text-[9px] tracking-[0.15em] uppercase font-semibold">Export</span>
        </button>
      </nav>

      {lightbox && <PhotoLightbox url={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}
