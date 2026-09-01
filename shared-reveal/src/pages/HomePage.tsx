import { useEffect, useMemo, useRef, useState } from 'react'
import ThemeToggle from '../components/ThemeToggle'
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { signOutUser } from '../services/auth'
import { db } from '../firebase/config'
import type { UserDoc } from '../types/index'
import { useEntry } from '../hooks/useEntry'
import { useStreak, useRevealedStreak } from '../hooks/useStreak'
import { uploadSubmissionPhoto, uploadSubmissionAudio, uploadSubmissionSketch, submitEntryFn, revealAnywayFn, toJpegPreviewUrl, sendPingFn, leavePairFn } from '../services/submissions'
import { useNotifications } from '../hooks/useNotifications'
import NotificationPrompt from '../components/NotificationPrompt'
import type { PairDoc } from '../types/index'

const PROMPTS = [
  'What did you do today that made you think of them?',
  'A moment today you wished they were there for.',
  'Something small that made you smile.',
  'A song stuck in your head right now.',
  'Something you want to tell them but haven\'t yet.',
  'What\'s been on your mind lately?',
  'A place you passed today that reminded you of them.',
  'The highlight of your day.',
  'Something that made you laugh today.',
  'A thought you\'ve been carrying around.',
  'Something new you noticed or learned.',
  'What\'s been making you feel proud lately?',
  'A memory that surfaced today.',
  'Something you\'re looking forward to.',
  'What does today smell or feel like?',
  'A small thing that surprised you.',
  'Something you wish you could share with them right now.',
  'What\'s a word that describes your day?',
  'A tiny detail from today worth remembering.',
  'What would you tell them if you saw them right now?',
]

const MOOD_OPTIONS: { key: string; emoji: string; label: string }[] = [
  { key: 'happy', emoji: '😊', label: 'happy' },
  { key: 'missing-you', emoji: '💭', label: 'missing you' },
  { key: 'proud', emoji: '🌟', label: 'proud' },
  { key: 'random', emoji: '🍃', label: 'random' },
]

function haptic(pattern: number | number[] = 10) {
  try { navigator.vibrate?.(pattern) } catch {}
}

function Avatar({
  photoURL,
  name,
  size = 'md',
}: {
  photoURL: string | null
  name: string | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const dims =
    size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-20 w-20 text-2xl' : 'h-10 w-10 text-sm'
  if (photoURL)
    return <img src={photoURL} alt={name ?? ''} className={`${dims} rounded-full object-cover`} />
  return (
    <div
      className={`${dims} rounded-full flex items-center justify-center font-bold`}
      style={{ background: '#E8F0E9', color: '#2D5A3D' }}
    >
      {name?.[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

function AttachChip({ icon, label, active, dot, disabled, onClick }: {
  icon: string; label: string; active: boolean; dot?: boolean
  disabled?: boolean; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="relative flex flex-col items-center gap-1 py-3 rounded-2xl text-[9px] font-bold tracking-[0.07em] uppercase transition-all active:scale-95 disabled:opacity-40"
      style={{ background: active ? '#E8F0E9' : '#F8F5F0', border: `1.5px solid ${active ? '#8FAF8A' : '#E8E2D9'}`, color: active ? '#2D5A3D' : '#7A7268' }}
    >
      <span className="text-lg leading-none">{icon}</span>
      <span>{label}</span>
      {dot && <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full" style={{ background: '#2D5A3D' }} />}
    </button>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 mx-auto" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.3"/>
      <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )
}

function ResubmitForm({
  fileInputRef,
  photoPreview,
  submissionText,
  selectedMood,
  audioBlob,
  locationData,
  gettingLocation,
  songInput,
  songURL,
  sketchBlob,
  showSketch,
  submitting,
  uploadingPhoto,
  submitError,
  onPhotoSelect,
  onClearPhoto,
  onTextChange,
  onMoodChange,
  onAudioBlob,
  onLocation,
  onGettingLocation,
  onSongInput,
  onSongURL,
  onSketchBlob,
  onShowSketch,
  onCancel,
  onSubmit,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>
  photoPreview: string | null
  submissionText: string
  selectedMood: string | null
  audioBlob: Blob | null
  locationData: { lat: number; lng: number } | null
  gettingLocation: boolean
  songInput: string
  songURL: string | null
  sketchBlob: Blob | null
  showSketch: boolean
  submitting: boolean
  uploadingPhoto: boolean
  submitError: string | null
  onPhotoSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onClearPhoto: () => void
  onTextChange: (val: string) => void
  onMoodChange: (mood: string | null) => void
  onAudioBlob: (blob: Blob | null) => void
  onLocation: (loc: { lat: number; lng: number } | null) => void
  onGettingLocation: (v: boolean) => void
  onSongInput: (v: string) => void
  onSongURL: (v: string | null) => void
  onSketchBlob: (b: Blob | null) => void
  onShowSketch: (v: boolean) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  const [showVoice, setShowVoice] = useState(false)
  const [showSongInput, setShowSongInput] = useState(false)

  return (
    <div className="w-full space-y-3 mt-2 text-left">
      <input ref={fileInputRef} type="file" accept="image/*" onChange={onPhotoSelect} className="hidden" />

      {/* Photo */}
      <button type="button" onClick={() => fileInputRef.current?.click()}
        disabled={submitting || uploadingPhoto}
        className="relative w-full h-36 rounded-xl overflow-hidden flex items-center justify-center disabled:opacity-50 transition-all active:scale-[0.99]"
        style={{ border: '1.5px dashed #C9BFA8', background: '#F2EDE4' }}
      >
        {photoPreview ? (
          <>
            <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
            <button type="button" onClick={(e) => { e.stopPropagation(); onClearPhoto() }}
              className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/50 text-white flex items-center justify-center text-sm leading-none">
              ×
            </button>
          </>
        ) : (
          <div className="text-center select-none">
            <div className="text-2xl mb-1">📷</div>
            <p className="text-[11px] tracking-[0.1em] uppercase font-medium" style={{ color: '#7A7268' }}>tap to add photo</p>
          </div>
        )}
      </button>

      {/* Text */}
      <textarea value={submissionText} onChange={(e) => onTextChange(e.target.value.slice(0, 500))}
        placeholder="Add another thought..." disabled={submitting || uploadingPhoto} rows={2}
        className="w-full rounded-xl px-4 py-3 text-[15px] resize-none focus:outline-none disabled:opacity-50"
        style={{ border: '1px solid #C9BFA8', background: '#FFFFFF', color: '#1A1A16' }}
      />

      {/* Mood */}
      <div className="flex gap-2">
        {MOOD_OPTIONS.map(({ key, emoji }) => (
          <button key={key} type="button" onClick={() => onMoodChange(selectedMood === key ? null : key)}
            disabled={submitting || uploadingPhoto}
            className="flex-1 py-2.5 rounded-xl text-xl transition-all active:scale-90"
            style={{ background: selectedMood === key ? '#E8F0E9' : '#F8F5F0', border: `1.5px solid ${selectedMood === key ? '#2D5A3D' : '#E8E2D9'}` }}
          >{emoji}</button>
        ))}
      </div>

      {/* Attachment strip */}
      <div className="grid grid-cols-4 gap-2">
        <AttachChip icon="🎤" label="Voice" active={showVoice || !!audioBlob} dot={!!audioBlob && !showVoice}
          disabled={submitting || uploadingPhoto} onClick={() => setShowVoice(v => !v)} />
        <AttachChip icon="📍" label={gettingLocation ? '…' : locationData ? 'Pinned' : 'Place'}
          active={!!locationData || gettingLocation} disabled={submitting || uploadingPhoto || gettingLocation}
          onClick={async () => {
            if (locationData) { onLocation(null); return }
            onGettingLocation(true)
            try {
              const pos = await new Promise<GeolocationPosition>((res, rej) =>
                navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 })
              )
              onLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
            } catch { /* denied */ }
            onGettingLocation(false)
          }} />
        <AttachChip icon="🎵" label="Song" active={showSongInput || !!songURL} dot={!!songURL && !showSongInput}
          disabled={submitting || uploadingPhoto} onClick={() => setShowSongInput(v => !v)} />
        <AttachChip icon="✏️" label="Draw" active={showSketch || !!sketchBlob} dot={!!sketchBlob && !showSketch}
          disabled={submitting || uploadingPhoto}
          onClick={() => onShowSketch(!showSketch)} />
      </div>

      {/* Voice panel */}
      <div style={{ maxHeight: showVoice ? '300px' : 0, overflow: 'hidden', transition: 'max-height 0.25s ease' }}>
        <div className="pt-1"><VoiceRecorder onBlob={onAudioBlob} disabled={submitting || uploadingPhoto} /></div>
      </div>

      {/* Location pill */}
      {locationData && (
        <div className="flex items-center gap-2 rounded-xl px-4 py-2.5 animate-fadeIn"
          style={{ background: '#E8F0E9', border: '1.5px solid #8FAF8A' }}>
          <span>📍</span>
          <span className="flex-1 text-sm font-medium" style={{ color: '#2D5A3D' }}>{locationData.lat.toFixed(4)}, {locationData.lng.toFixed(4)}</span>
          <button type="button" onClick={() => onLocation(null)} className="text-sm shrink-0 transition-all active:scale-90" style={{ color: '#7A7268' }}>×</button>
        </div>
      )}

      {/* Song panel */}
      <div style={{ maxHeight: showSongInput ? '120px' : 0, overflow: 'hidden', transition: 'max-height 0.25s ease' }}>
        <div className="pt-1">
          {songURL ? (
            <div className="flex items-center gap-2 rounded-xl px-4 py-2.5" style={{ background: '#E8F0E9', border: '1.5px solid #8FAF8A' }}>
              <span>🎵</span>
              <span className="flex-1 text-sm font-medium truncate" style={{ color: '#2D5A3D' }}>{songURL.replace('https://open.spotify.com/', '')}</span>
              <button type="button" onClick={() => { onSongURL(null); onSongInput('') }} className="text-sm shrink-0 transition-all active:scale-90" style={{ color: '#7A7268' }}>×</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input type="url" value={songInput} onChange={(e) => onSongInput(e.target.value)}
                placeholder="open.spotify.com/track/…" disabled={submitting}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm focus:outline-none disabled:opacity-50"
                style={{ border: '1.5px solid #E8E2D9', background: '#F8F5F0', color: '#1A1A16' }} />
              <button type="button" disabled={!songInput.trim() || submitting}
                onClick={() => { const p = parseSpotifyURL(songInput.trim()); if (p) { onSongURL(p); onSongInput('') } }}
                className="rounded-xl px-4 py-2.5 text-sm font-bold transition-all active:scale-95 disabled:opacity-40"
                style={{ background: '#2D5A3D', color: '#fff' }}>Add</button>
            </div>
          )}
        </div>
      </div>

      {/* Sketch panel */}
      <div style={{ maxHeight: showSketch ? '600px' : 0, overflow: 'hidden', transition: 'max-height 0.35s ease' }}>
        <div className="pt-1"><SketchPad onBlob={onSketchBlob} disabled={submitting || uploadingPhoto} /></div>
      </div>

      {submitError && <p className="text-xs" style={{ color: '#B85C38' }}>{submitError}</p>}

      <div className="flex gap-3 pt-1">
        <button onClick={onCancel}
          className="flex-1 rounded-xl py-3 text-sm font-semibold transition-all active:scale-[0.97]"
          style={{ background: '#F2EDE4', border: '1.5px solid #C9BFA8', color: '#7A7268' }}>
          Cancel
        </button>
        <button onClick={onSubmit} disabled={submitting || uploadingPhoto}
          className="flex-1 rounded-xl py-3 text-sm font-semibold text-white transition-all active:scale-[0.97] disabled:opacity-50"
          style={{ background: '#2D5A3D' }}>
          {submitting || uploadingPhoto ? <Spinner /> : 'Share'}
        </button>
      </div>
    </div>
  )
}

function formatHour(h: number): string {
  const d = new Date()
  d.setHours(h, 0, 0, 0)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

const SKETCH_COLORS = ['#1A1A16', '#2D5A3D', '#B85C38', '#7A7268', '#C9BFA8', '#F8F5F0']
const SKETCH_SIZES = [2, 5, 10]

function SketchPad({ onBlob, disabled }: { onBlob: (blob: Blob | null) => void; disabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastRef = useRef<{ x: number; y: number } | null>(null)
  const [color, setColor] = useState('#1A1A16')
  const [brushSize, setBrushSize] = useState(4)
  const [hasStrokes, setHasStrokes] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#F8F5F0'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }, [])

  function getPos(e: PointerEvent) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  function stroke(from: { x: number; y: number }, to: { x: number; y: number }, c: string, size: number) {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return
    ctx.strokeStyle = c
    ctx.lineWidth = size * (canvas.width / canvas.getBoundingClientRect().width)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }

  function emitBlob() {
    canvasRef.current?.toBlob((b) => { if (b) onBlob(b) }, 'image/png')
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return
    canvasRef.current?.setPointerCapture(e.pointerId)
    drawingRef.current = true
    const pos = getPos(e.nativeEvent)
    lastRef.current = pos
    stroke(pos, pos, color, brushSize)
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !lastRef.current) return
    const pos = getPos(e.nativeEvent)
    stroke(lastRef.current, pos, color, brushSize)
    lastRef.current = pos
  }

  function onPointerUp() {
    if (!drawingRef.current) return
    drawingRef.current = false
    lastRef.current = null
    setHasStrokes(true)
    emitBlob()
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return
    ctx.fillStyle = '#F8F5F0'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasStrokes(false)
    onBlob(null)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5 flex-1">
          {SKETCH_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className="h-7 w-7 rounded-full shrink-0 transition-all"
              style={{
                background: c,
                border: color === c ? '2.5px solid #2D5A3D' : '1.5px solid #C9BFA8',
              }}
            />
          ))}
        </div>
        <div className="flex gap-1.5 items-center">
          {SKETCH_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setBrushSize(s)}
              className="flex items-center justify-center rounded-full transition-all"
              style={{
                width: 28, height: 28,
                background: brushSize === s ? '#E8F0E9' : '#F8F5F0',
                border: `1.5px solid ${brushSize === s ? '#2D5A3D' : '#E8E2D9'}`,
              }}
            >
              <div className="rounded-full" style={{
                width: s === 2 ? 4 : s === 5 ? 8 : 13,
                height: s === 2 ? 4 : s === 5 ? 8 : 13,
                background: '#1A1A16',
              }} />
            </button>
          ))}
        </div>
        {hasStrokes && (
          <button type="button" onClick={clear}
            className="text-xs px-2.5 py-1 rounded-lg ml-1"
            style={{ background: '#F2EDE4', border: '1px solid #C9BFA8', color: '#7A7268' }}>
            Clear
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={640}
        height={320}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="w-full rounded-xl"
        style={{ touchAction: 'none', border: '1.5px solid #E8E2D9', cursor: 'crosshair', display: 'block' }}
      />
    </div>
  )
}

function parseSpotifyURL(raw: string): string | null {
  const match = raw.match(/open\.spotify\.com\/(track|album|playlist|episode)\/([A-Za-z0-9]+)/)
  if (!match) return null
  return `https://open.spotify.com/${match[1]}/${match[2]}`
}


function VoiceRecorder({
  onBlob,
  disabled,
}: {
  onBlob: (blob: Blob | null) => void
  disabled: boolean
}) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    onBlob(null)
  }

  async function startRecording() {
    clearPreview()
    chunksRef.current = []
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      mediaRef.current = mr
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const url = URL.createObjectURL(blob)
        setPreviewUrl(url)
        onBlob(blob)
      }
      mr.start()
      setRecording(true)
      setSeconds(0)
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch {
      // mic denied or unavailable
    }
  }

  function stopRecording() {
    mediaRef.current?.stop()
    mediaRef.current = null
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setRecording(false)
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  return (
    <div>
      {previewUrl ? (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 animate-fadeIn"
          style={{ background: '#F8F5F0', border: '1.5px solid #E8E2D9' }}>
          <audio src={previewUrl} controls className="flex-1 h-8" style={{ minWidth: 0 }} />
          <button type="button" onClick={clearPreview}
            className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90"
            style={{ background: '#F2EDE4', border: '1px solid #C9BFA8', color: '#7A7268' }}>
            ×
          </button>
        </div>
      ) : recording ? (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3 animate-fadeIn"
          style={{ background: '#FDF4F0', border: '1.5px solid #E8C4B0' }}>
          <span className="record-dot-pulse h-2.5 w-2.5 rounded-full shrink-0"
            style={{ background: '#B85C38' }} />
          <span className="text-sm font-mono flex-1" style={{ color: '#B85C38' }}>{mm}:{ss}</span>
          <button type="button" onClick={stopRecording}
            className="rounded-full px-4 py-1.5 text-xs font-bold text-white shrink-0 transition-all active:scale-95"
            style={{ background: '#B85C38' }}>
            Stop
          </button>
        </div>
      ) : (
        <button type="button" onClick={startRecording} disabled={disabled}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-all active:scale-95 disabled:opacity-40"
          style={{ background: '#F8F5F0', border: '1.5px solid #E8E2D9', color: '#7A7268' }}>
          <span className="text-base">🎙️</span>
          <span>Tap to record</span>
        </button>
      )}
    </div>
  )
}

export default function HomePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [userDoc, setUserDoc] = useState<UserDoc | null>(null)
  const [partnerDoc, setPartnerDoc] = useState<UserDoc | null>(null)
  const [pairDoc, setPairDoc] = useState<PairDoc | null>(null)
  const [docLoading, setDocLoading] = useState(true)
  const [partnerId, setPartnerId] = useState<string | null>(null)

  const [entryDate, setEntryDate] = useState<string>('')
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [submissionText, setSubmissionText] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [revealing, setRevealing] = useState(false)
  const [revealError, setRevealError] = useState<string | null>(null)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const [showResubmitForm, setShowResubmitForm] = useState(false)
  const [selectedMood, setSelectedMood] = useState<string | null>(null)
  const [pinging, setPinging] = useState(false)
  const [pingReceived, setPingReceived] = useState(false)
  const [pingCooldown, setPingCooldown] = useState(false)
  const mountTimeRef = useRef(Date.now())
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [locationData, setLocationData] = useState<{ lat: number; lng: number } | null>(null)
  const [gettingLocation, setGettingLocation] = useState(false)
  const [songInput, setSongInput] = useState('')
  const [songURL, setSongURL] = useState<string | null>(null)
  const [sketchBlob, setSketchBlob] = useState<Blob | null>(null)
  const [showSketch, setShowSketch] = useState(false)
  const [showVoice, setShowVoice] = useState(false)
  const [showSongInput, setShowSongInput] = useState(false)
  const [reminderInput, setReminderInput] = useState('')
  const [savingReminder, setSavingReminder] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  const [editingNote, setEditingNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [editingPairName, setEditingPairName] = useState(false)
  const [pairNameText, setPairNameText] = useState('')
  const [savingPairName, setSavingPairName] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)
  const prevEntryStatusRef = useRef<string | null | undefined>(undefined)

  const { supported: notifSupported, permission: notifPermission, requestPermission } =
    useNotifications(user?.uid ?? null)

  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        setUserDoc(snap.exists() ? (snap.data() as UserDoc) : null)
        setDocLoading(false)
      },
      (err) => {
        console.error('[HomePage] userDoc error:', err)
        setDocLoading(false)
      },
    )
    return () => unsub()
  }, [user])

  useEffect(() => {
    if (!userDoc?.pairId) {
      setPartnerId(null)
      setPairDoc(null)
      return
    }
    const unsub = onSnapshot(doc(db, 'pairs', userDoc.pairId), (snap) => {
      if (!snap.exists()) return
      const data = snap.data() as PairDoc
      setPairDoc(data)
      setPartnerId(data.members.find((m) => m !== user?.uid) ?? null)

      // Detect incoming ping from partner (ignore own pings and pings before mount)
      const ping = data.lastPing
      if (ping?.from && ping.from !== user?.uid) {
        const pingAt = ping.at?.toMillis?.() ?? 0
        if (pingAt > mountTimeRef.current) {
          setPingReceived(true)
          haptic([10, 50, 10])
          setTimeout(() => setPingReceived(false), 3000)
        }
      }
    })
    return () => unsub()
  }, [userDoc?.pairId, user?.uid])

  useEffect(() => {
    if (!partnerId) {
      setPartnerDoc(null)
      return
    }
    const unsub = onSnapshot(doc(db, 'users', partnerId), (snap) => {
      setPartnerDoc(snap.exists() ? (snap.data() as UserDoc) : null)
    })
    return () => unsub()
  }, [partnerId])

  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA')
    setEntryDate(today)
    // Restore draft saved for today
    try {
      const raw = localStorage.getItem(`draft_${today}`)
      if (raw) {
        const d = JSON.parse(raw)
        if (d.text) setSubmissionText(d.text)
        if (d.mood) setSelectedMood(d.mood)
        if (d.tags) setSelectedTags(d.tags)
      }
    } catch { /* ignore */ }
  }, [])

  // Save draft whenever text/mood/tags change
  useEffect(() => {
    if (!entryDate) return
    const payload = { text: submissionText, mood: selectedMood, tags: selectedTags }
    if (!submissionText && !selectedMood && !selectedTags.length) {
      localStorage.removeItem(`draft_${entryDate}`)
    } else {
      localStorage.setItem(`draft_${entryDate}`, JSON.stringify(payload))
    }
  }, [submissionText, selectedMood, selectedTags, entryDate])


  const { entryDoc, entryLoading } = useEntry(userDoc?.pairId ?? null, entryDate)

  useEffect(() => {
    const prev = prevEntryStatusRef.current
    const curr = entryDoc?.status
    if (prev === 'one_submitted' && curr === 'revealed') {
      setShowCelebration(true)
      haptic([40, 30, 40, 30, 60])
      setTimeout(() => setShowCelebration(false), 3200)
    }
    prevEntryStatusRef.current = curr
  }, [entryDoc?.status])

  const { myStreak, partnerStreak } = useStreak(
    userDoc?.pairId ?? null,
    user?.uid ?? null,
    partnerId,
  )
  const revealedStreak = useRevealedStreak(userDoc?.pairId ?? null)

  const daysTogether = pairDoc?.createdAt
    ? Math.max(1, Math.floor((Date.now() - pairDoc.createdAt.toMillis()) / 86400000) + 1)
    : null

  const iSubmitted = entryDoc?.submittedMembers?.includes(user?.uid ?? '') ?? false
  const partnerSubmitted = entryDoc?.submittedMembers?.includes(partnerId ?? '') ?? false

  // App badge: set when partner submitted but we haven't
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return
    try {
      if (entryDoc && !iSubmitted && partnerSubmitted) {
        navigator.setAppBadge(1)
      } else {
        navigator.clearAppBadge()
      }
    } catch { /* not supported */ }
    return () => { try { navigator.clearAppBadge() } catch { /* ignore */ } }
  }, [iSubmitted, partnerSubmitted, entryDoc])
  const partnerFirstName = partnerDoc?.displayName?.split(' ')[0] ?? 'them'

  const todayLabel = entryDate
    ? (() => {
        const d = new Date(entryDate + 'T12:00:00')
        const weekday = d.toLocaleDateString('en-US', { weekday: 'long' })
        const day = String(d.getDate()).padStart(2, '0')
        const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
        return `${weekday} · ${day} ${month}`
      })()
    : ''

  const todayPrompt = useMemo(() => {
    if (!entryDate) return null
    const n = parseInt(entryDate.replace(/-/g, ''), 10)
    return PROMPTS[n % PROMPTS.length]
  }, [entryDate])

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedPhoto(file)
    // Convert to JPEG first so preview works regardless of HEIC/format
    const url = await toJpegPreviewUrl(file)
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return url
    })
  }

  function clearPhoto() {
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setSelectedPhoto(null)
  }

  async function handleSubmit() {
    setSubmitError(null)
    if (!selectedPhoto && !submissionText.trim() && !audioBlob && !locationData && !songURL && !sketchBlob) {
      setSubmitError('Add a photo, write something, record a memo, pin a location, add a song, or draw something.')
      return
    }
    setSubmitting(true)
    let photoURL: string | null = null
    let audioURL: string | null = null
    try {
      if (selectedPhoto && userDoc?.pairId && user) {
        setUploadingPhoto(true)
        photoURL = await uploadSubmissionPhoto(userDoc.pairId, entryDate, user.uid, selectedPhoto)
        setUploadingPhoto(false)
      }
      if (audioBlob && userDoc?.pairId && user) {
        audioURL = await uploadSubmissionAudio(userDoc.pairId, entryDate, user.uid, audioBlob)
      }
      let sketchURL: string | null = null
      if (sketchBlob && userDoc?.pairId && user) {
        sketchURL = await uploadSubmissionSketch(userDoc.pairId, entryDate, user.uid, sketchBlob)
      }
      await submitEntryFn({ entryDate, text: submissionText.trim() || null, photoURL, audioURL, mood: selectedMood, location: locationData, songURL, sketchURL, tags: selectedTags.length ? selectedTags : undefined })
      haptic(15)
      localStorage.removeItem(`draft_${entryDate}`)
      setSelectedPhoto(null)
      setPhotoPreview(null)
      setSubmissionText('')
      setSelectedMood(null)
      setSelectedTags([])
      setAudioBlob(null)
      setLocationData(null)
      setSongURL(null)
      setSongInput('')
      setSketchBlob(null)
      setShowSketch(false)
      setShowVoice(false)
      setShowSongInput(false)
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit')
      console.error('[HomePage] submit error:', err)
    } finally {
      setSubmitting(false)
      setUploadingPhoto(false)
    }
  }

  async function handleRevealAnyway() {
    setRevealing(true)
    setRevealError(null)
    try {
      await revealAnywayFn({ entryDate })
      haptic([10, 80, 10])
    } catch (err: unknown) {
      setRevealError(err instanceof Error ? err.message : 'Failed to reveal')
    } finally {
      setRevealing(false)
    }
  }

  function cancelResubmit() {
    setShowResubmitForm(false)
    setSelectedPhoto(null)
    setPhotoPreview(null)
    setSubmissionText('')
    setSelectedMood(null)
    setSelectedTags([])
    setAudioBlob(null)
    setLocationData(null)
    setSongURL(null)
    setSongInput('')
    setSketchBlob(null)
    setShowSketch(false)
    setShowVoice(false)
    setShowSongInput(false)
  }

  async function submitAndCloseResubmit() {
    await handleSubmit()
    setShowResubmitForm(false)
  }

  const CONFETTI_PIECES = [
    { left: 5, delay: 0, color: '#2D5A3D', size: 8 },
    { left: 12, delay: 0.12, color: '#8FAF8A', size: 10 },
    { left: 22, delay: 0.06, color: '#B85C38', size: 7 },
    { left: 31, delay: 0.22, color: '#C9BFA8', size: 9 },
    { left: 40, delay: 0.04, color: '#2D5A3D', size: 11 },
    { left: 48, delay: 0.18, color: '#E8C4B0', size: 7 },
    { left: 57, delay: 0.08, color: '#3D7A53', size: 10 },
    { left: 65, delay: 0.28, color: '#8FAF8A', size: 8 },
    { left: 74, delay: 0.14, color: '#B85C38', size: 9 },
    { left: 82, delay: 0.02, color: '#2D5A3D', size: 7 },
    { left: 90, delay: 0.2, color: '#C9BFA8', size: 11 },
    { left: 96, delay: 0.1, color: '#3D7A53', size: 8 },
    { left: 8, delay: 0.32, color: '#E8C4B0', size: 9 },
    { left: 18, delay: 0.16, color: '#2D5A3D', size: 10 },
    { left: 35, delay: 0.24, color: '#8FAF8A', size: 7 },
    { left: 52, delay: 0.36, color: '#B85C38', size: 8 },
    { left: 68, delay: 0.08, color: '#C9BFA8', size: 10 },
    { left: 78, delay: 0.3, color: '#3D7A53', size: 9 },
    { left: 86, delay: 0.04, color: '#2D5A3D', size: 7 },
    { left: 44, delay: 0.42, color: '#8FAF8A', size: 11 },
  ]

  return (
    <div className="flex flex-col h-screen overflow-hidden animate-fadeUp">
      {showCelebration && (
        <div className="fixed inset-0 pointer-events-none z-40 overflow-hidden">
          {CONFETTI_PIECES.map((p, i) => (
            <div
              key={i}
              className="confetti-piece"
              style={{
                left: `${p.left}%`,
                top: '-10px',
                width: p.size,
                height: p.size + 2,
                background: p.color,
                animationDelay: `${p.delay}s`,
              }}
            />
          ))}
        </div>
      )}
      {/* Header */}
      <header
        className="px-5 pt-12 pb-4 flex items-start justify-between shrink-0"
        style={{ background: 'var(--c-bg)' }}
      >
        <div>
          <p className="text-xs tracking-[0.3em] font-bold" style={{ color: 'var(--c-text-1)' }}>
            {pairDoc?.pairName ? pairDoc.pairName.toUpperCase() : 'BIRDS.EYE'}
          </p>
          {todayLabel && (
            <p
              className="text-[11px] tracking-[0.15em] mt-0.5 uppercase"
              style={{ color: 'var(--c-text-2)' }}
            >
              {todayLabel}
            </p>
          )}
          {daysTogether !== null && (
            <p className="text-[10px] tracking-[0.12em] mt-0.5 uppercase" style={{ color: 'var(--c-green-mid)' }}>
              Day {daysTogether}{revealedStreak >= 2 ? ` · 🔥 ${revealedStreak}` : ' · building this 🌱'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button onClick={() => setShowSignOutConfirm(true)} className="rounded-full" title="Account">
            <Avatar photoURL={user?.photoURL ?? null} name={user?.displayName ?? null} size="sm" />
          </button>
        </div>
      </header>

      {/* Notification permission prompt / iOS EU fallback */}
      <NotificationPrompt
        supported={notifSupported}
        permission={notifPermission}
        onRequest={requestPermission}
      />

      {/* Main content */}
      <main className="flex-1 px-5 overflow-y-auto pb-4">
        {/* Dare banners */}
        {partnerStreak >= 3 && (
          <div
            className="mb-4 rounded-xl px-4 py-3 flex items-center gap-3 border"
            style={{ background: '#E8F0E9', borderColor: '#8FAF8A' }}
          >
            <span className="text-xl">🌿</span>
            <div>
              <p className="text-sm font-semibold" style={{ color: '#2D5A3D' }}>
                {partnerFirstName} missed {partnerStreak} days
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#7A7268' }}>
                You're owed a dare — make them do anything!
              </p>
            </div>
          </div>
        )}
        {myStreak >= 3 && (
          <div
            className="mb-4 rounded-xl px-4 py-3 flex items-center gap-3 border"
            style={{ background: '#FAF0EB', borderColor: '#C9BFA8' }}
          >
            <span className="text-xl">🌱</span>
            <div>
              <p className="text-sm font-semibold" style={{ color: '#B85C38' }}>
                You missed {myStreak} days
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#7A7268' }}>
                {partnerFirstName} gets to dare you — better check in!
              </p>
            </div>
          </div>
        )}

        {/* State machine */}
        {docLoading || entryLoading ? (
          /* ── LOADING ── */
          <div className="flex h-64 items-center justify-center animate-fadeUp">
            <div
              className="h-7 w-7 rounded-full border-2 animate-spin"
              style={{ borderColor: '#E8F0E9', borderTopColor: '#2D5A3D' }}
            />
          </div>
        ) : entryDoc?.status === 'revealed' ? (
          /* ── REVEALED ── */
          <div className="flex flex-col items-center text-center gap-5 pt-6 animate-fadeUp">
            <div
              className="w-full rounded-2xl px-5 py-6 text-center animate-popIn"
              style={{ background: '#E8F0E9', border: '1px solid #8FAF8A' }}
            >
              <p className="text-3xl mb-2">🌿</p>
              <p className="text-base font-bold tracking-[0.1em] uppercase" style={{ color: '#1C2B1E' }}>
                Revealed
              </p>
              <p className="text-xs tracking-widest uppercase mt-1 font-medium" style={{ color: '#2D5A3D' }}>
                {todayLabel}
              </p>
            </div>
            <button
              onClick={() => navigate('/timeline')}
              className="w-full rounded-lg py-4 text-sm font-semibold text-white tracking-widest uppercase"
              style={{ background: '#2D5A3D' }}
            >
              Open Timeline
            </button>
            <div className="w-full" style={{ borderTop: '1px solid #C9BFA8' }} />
            {!showResubmitForm ? (
              <button
                onClick={() => setShowResubmitForm(true)}
                className="w-full rounded-lg py-3 text-sm font-medium border"
                style={{ borderColor: '#2D5A3D', color: '#2D5A3D' }}
              >
                + Add another thing
              </button>
            ) : (
              <ResubmitForm
                fileInputRef={fileInputRef}
                photoPreview={photoPreview}
                submissionText={submissionText}
                selectedMood={selectedMood}
                audioBlob={audioBlob}
                locationData={locationData}
                gettingLocation={gettingLocation}
                songInput={songInput}
                songURL={songURL}
                sketchBlob={sketchBlob}
                showSketch={showSketch}
                submitting={submitting}
                uploadingPhoto={uploadingPhoto}
                submitError={submitError}
                onPhotoSelect={handlePhotoSelect}
                onClearPhoto={clearPhoto}
                onTextChange={setSubmissionText}
                onMoodChange={setSelectedMood}
                onAudioBlob={setAudioBlob}
                onLocation={setLocationData}
                onGettingLocation={setGettingLocation}
                onSongInput={setSongInput}
                onSongURL={setSongURL}
                onSketchBlob={setSketchBlob}
                onShowSketch={setShowSketch}
                onCancel={cancelResubmit}
                onSubmit={submitAndCloseResubmit}
              />
            )}
          </div>
        ) : iSubmitted ? (
          /* ── WAITING ── */
          <div className="flex flex-col items-center text-center pt-8 gap-6 animate-fadeUp">
            {/* Submitted badge */}
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: '#2D5A3D' }}
              />
              <span
                className="text-[10px] tracking-[0.2em] uppercase font-semibold"
                style={{ color: '#2D5A3D' }}
              >
                Submitted
              </span>
            </div>

            {/* Ping received animation */}
            {pingReceived && (
              <div className="animate-popIn text-center" style={{ marginBottom: -8 }}>
                <span className="text-2xl" style={{ animation: 'leafFloat 2.5s ease forwards', display: 'inline-block' }}>💭</span>
                <p className="text-[10px] tracking-widest uppercase mt-1" style={{ color: '#7A7268' }}>
                  {partnerFirstName} is thinking of you
                </p>
              </div>
            )}

            {/* Partner avatar */}
            <div className="relative" style={{ width: 88, height: 88 }}>
              {/* Progress ring — lights up when partner submits */}
              <svg
                className="absolute inset-0 w-full h-full"
                viewBox="0 0 88 88"
                style={{ transform: 'rotate(-90deg)' }}
              >
                <circle
                  cx="44" cy="44" r="38"
                  fill="none"
                  stroke="#E8F0E9"
                  strokeWidth="3"
                />
                <circle
                  cx="44" cy="44" r="38"
                  fill="none"
                  stroke="#2D5A3D"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray="238.76"
                  strokeDashoffset={partnerSubmitted ? 0 : 238.76}
                  style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)' }}
                />
              </svg>
              {/* Avatar centered inside ring */}
              <div className="absolute inset-0 flex items-center justify-center">
                <Avatar
                  photoURL={partnerDoc?.photoURL ?? null}
                  name={partnerDoc?.displayName ?? null}
                  size="lg"
                />
              </div>
              {partnerSubmitted && (
                <span
                  className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full border-2 border-white flex items-center justify-center text-white text-[10px] font-bold animate-popIn"
                  style={{ background: '#2D5A3D' }}
                >
                  ✓
                </span>
              )}
            </div>

            <div>
              <p className="text-base font-semibold" style={{ color: '#1A1A16' }}>
                {partnerDoc?.displayName?.split(' ')[0] ?? '…'}
              </p>
              {partnerSubmitted ? (
                <p className="text-sm mt-1 animate-popIn" style={{ color: '#2D5A3D' }}>
                  They shared too ✓
                </p>
              ) : (
                <p className="text-sm mt-1 flex items-center justify-center gap-0.5" style={{ color: '#7A7268' }}>
                  Waiting
                  <span style={{ animation: 'blink 1.4s ease infinite', display: 'inline-block' }}>.</span>
                  <span style={{ animation: 'blink 1.4s ease 0.2s infinite', display: 'inline-block' }}>.</span>
                  <span style={{ animation: 'blink 1.4s ease 0.4s infinite', display: 'inline-block' }}>.</span>
                </p>
              )}
            </div>

            {/* Thinking of you ping */}
            {!partnerSubmitted && (
              <button
                onClick={async () => {
                  if (pingCooldown) return
                  setPinging(true)
                  try {
                    await sendPingFn({})
                    haptic(15)
                    setPingCooldown(true)
                    setTimeout(() => setPingCooldown(false), 30000)
                  } catch { /* best-effort */ }
                  setPinging(false)
                }}
                disabled={pinging || pingCooldown}
                className="text-xs font-medium px-5 py-2 rounded-full transition-all active:scale-95 disabled:opacity-40"
                style={{ background: '#F2EDE4', border: '1px solid #C9BFA8', color: '#7A7268' }}
              >
                {pingCooldown ? '💭 sent' : pinging ? '…' : '💭 thinking of you'}
              </button>
            )}

            {/* Divider */}
            <div className="w-full" style={{ borderTop: '1px solid #C9BFA8' }} />

            <div className="w-full space-y-2">
              {!showResubmitForm && (
                <button
                  onClick={() => setShowResubmitForm(true)}
                  className="w-full rounded-lg py-3 text-sm font-medium border"
                  style={{ borderColor: '#2D5A3D', color: '#2D5A3D' }}
                >
                  + Add another thing
                </button>
              )}
              <button
                onClick={handleRevealAnyway}
                disabled={revealing}
                className="w-full rounded-lg py-3 text-sm font-medium border disabled:opacity-50"
                style={{ borderColor: '#C9BFA8', color: '#7A7268' }}
              >
                {revealing ? 'Revealing…' : "Don't wait — reveal now"}
              </button>
              {revealError && (
                <p className="text-xs" style={{ color: '#B85C38' }}>
                  {revealError}
                </p>
              )}
              {showResubmitForm && (
                <ResubmitForm
                  fileInputRef={fileInputRef}
                  photoPreview={photoPreview}
                  submissionText={submissionText}
                  selectedMood={selectedMood}
                  audioBlob={audioBlob}
                  locationData={locationData}
                  gettingLocation={gettingLocation}
                  songInput={songInput}
                  songURL={songURL}
                  sketchBlob={sketchBlob}
                  showSketch={showSketch}
                  submitting={submitting}
                  uploadingPhoto={uploadingPhoto}
                  submitError={submitError}
                  onPhotoSelect={handlePhotoSelect}
                  onClearPhoto={clearPhoto}
                  onTextChange={setSubmissionText}
                  onMoodChange={setSelectedMood}
                  onAudioBlob={setAudioBlob}
                  onLocation={setLocationData}
                  onGettingLocation={setGettingLocation}
                  onSongInput={setSongInput}
                  onSongURL={setSongURL}
                  onSketchBlob={setSketchBlob}
                  onShowSketch={setShowSketch}
                  onCancel={cancelResubmit}
                  onSubmit={submitAndCloseResubmit}
                />
              )}
            </div>
          </div>
        ) : (
          /* ── SUBMIT FORM ── */
          <div className="space-y-4 pt-2 pb-4 animate-fadeUp">
            {/* Day 1 welcome card */}
            {daysTogether === 1 && (
              <div
                className="rounded-2xl px-5 py-5 animate-fadeIn"
                style={{ background: '#E8F0E9', border: '1px solid #8FAF8A' }}
              >
                <p className="text-2xl mb-2">🌿</p>
                <p className="text-sm font-bold" style={{ color: '#1C2B1E' }}>Welcome. You go first.</p>
                <p className="text-xs leading-relaxed mt-1.5" style={{ color: '#2D5A3D' }}>
                  Share something that reminded you of them today — a photo, a thought, anything.
                  It stays completely private until you both share.
                </p>
              </div>
            )}
            <p
              className="text-[10px] tracking-[0.2em] uppercase font-semibold"
              style={{ color: '#7A7268' }}
            >
              What reminded you today?
            </p>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoSelect}
              className="hidden"
            />

            {/* Photo tap area */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting || uploadingPhoto}
              className="relative w-full h-52 rounded-xl overflow-hidden flex items-center justify-center disabled:opacity-50 transition-all active:scale-[0.98]"
              style={{ border: '1.5px dashed #C9BFA8', background: '#F2EDE4' }}
            >
              {photoPreview ? (
                <>
                  <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      clearPhoto()
                    }}
                    className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/50 text-white flex items-center justify-center text-sm leading-none"
                  >
                    ×
                  </button>
                </>
              ) : (
                <div className="text-center select-none">
                  <div className="text-3xl mb-2">📷</div>
                  <p
                    className="text-[11px] tracking-[0.1em] uppercase font-medium"
                    style={{ color: '#7A7268' }}
                  >
                    tap to add photo
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: '#C9BFA8' }}>
                    optional
                  </p>
                </div>
              )}
            </button>

            {/* Textarea */}
            <div>
              <textarea
                value={submissionText}
                onChange={(e) => setSubmissionText(e.target.value.slice(0, 500))}
                placeholder="write something..."
                disabled={submitting || uploadingPhoto}
                rows={3}
                className="w-full rounded-xl px-4 py-3 text-[15px] leading-relaxed resize-none focus:outline-none disabled:opacity-50"
                style={{
                  border: '1px solid #C9BFA8',
                  background: '#FFFFFF',
                  color: '#1A1A16',
                }}
              />
              {submissionText.length > 0 ? (
                <p className="text-[10px] text-right mt-1" style={{ color: '#C9BFA8' }}>
                  {submissionText.length}/500
                </p>
              ) : todayPrompt ? (
                <p className="text-[11px] italic mt-1.5 leading-relaxed animate-fadeIn" style={{ color: '#C9BFA8' }}>
                  💭 {todayPrompt}
                </p>
              ) : null}
            </div>

            {/* Mood picker */}
            <div>
              <p className="text-[10px] tracking-[0.15em] uppercase mb-2" style={{ color: '#C9BFA8' }}>
                How are you feeling?
              </p>
              <div className="flex gap-2">
                {MOOD_OPTIONS.map(({ key, emoji }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedMood(selectedMood === key ? null : key)}
                    disabled={submitting || uploadingPhoto}
                    className="flex-1 py-2.5 rounded-xl text-xl transition-all active:scale-95"
                    style={{
                      background: selectedMood === key ? '#E8F0E9' : '#F8F5F0',
                      border: `1.5px solid ${selectedMood === key ? '#2D5A3D' : '#E8E2D9'}`,
                    }}
                    title={key}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            {(() => {
              const TAG_OPTIONS = [
                { key: '🧳 trip', label: '🧳 trip' },
                { key: '💔 hard day', label: '💔 hard day' },
                { key: '🎉 milestone', label: '🎉 milestone' },
                { key: '🌀 just because', label: '🌀 just because' },
                { key: '🎂 birthday', label: '🎂 birthday' },
              ]
              return (
                <div>
                  <p className="text-[10px] tracking-[0.15em] uppercase mb-2" style={{ color: '#C9BFA8' }}>Tag it</p>
                  <div className="flex flex-wrap gap-2">
                    {TAG_OPTIONS.map(({ key, label }) => {
                      const active = selectedTags.includes(key)
                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={submitting || uploadingPhoto}
                          onClick={() => setSelectedTags((prev) => active ? prev.filter((t) => t !== key) : [...prev, key])}
                          className="rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 disabled:opacity-40"
                          style={{
                            background: active ? '#E8F0E9' : '#F8F5F0',
                            border: `1.5px solid ${active ? '#2D5A3D' : '#E8E2D9'}`,
                            color: active ? '#2D5A3D' : '#7A7268',
                          }}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Attachment strip */}
            <div className="grid grid-cols-4 gap-2">
              <AttachChip icon="🎤" label="Voice" active={showVoice || !!audioBlob} dot={!!audioBlob && !showVoice}
                disabled={submitting || uploadingPhoto} onClick={() => setShowVoice(v => !v)} />
              <AttachChip icon="📍" label={gettingLocation ? '…' : locationData ? 'Pinned' : 'Place'}
                active={!!locationData || gettingLocation} disabled={submitting || uploadingPhoto || gettingLocation}
                onClick={async () => {
                  if (locationData) { setLocationData(null); return }
                  setGettingLocation(true)
                  try {
                    const pos = await new Promise<GeolocationPosition>((res, rej) =>
                      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 })
                    )
                    setLocationData({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                  } catch {
                    setSubmitError('Could not get location. Check browser permissions.')
                  }
                  setGettingLocation(false)
                }} />
              <AttachChip icon="🎵" label="Song" active={showSongInput || !!songURL} dot={!!songURL && !showSongInput}
                disabled={submitting || uploadingPhoto} onClick={() => setShowSongInput(v => !v)} />
              <AttachChip icon="✏️" label="Draw" active={showSketch || !!sketchBlob} dot={!!sketchBlob && !showSketch}
                disabled={submitting || uploadingPhoto}
                onClick={() => setShowSketch(v => !v)} />
            </div>

            {/* Voice panel */}
            <div style={{ maxHeight: showVoice ? '300px' : 0, overflow: 'hidden', transition: 'max-height 0.25s ease' }}>
              <div className="pt-1"><VoiceRecorder onBlob={setAudioBlob} disabled={submitting || uploadingPhoto} /></div>
            </div>

            {/* Location pill */}
            {locationData && (
              <div className="flex items-center gap-2 rounded-xl px-4 py-2.5 animate-fadeIn"
                style={{ background: '#E8F0E9', border: '1.5px solid #8FAF8A' }}>
                <span>📍</span>
                <span className="flex-1 text-sm font-medium" style={{ color: '#2D5A3D' }}>{locationData.lat.toFixed(4)}, {locationData.lng.toFixed(4)}</span>
                <button type="button" onClick={() => setLocationData(null)} className="text-sm shrink-0 transition-all active:scale-90" style={{ color: '#7A7268' }}>×</button>
              </div>
            )}

            {/* Song panel */}
            <div style={{ maxHeight: showSongInput ? '120px' : 0, overflow: 'hidden', transition: 'max-height 0.25s ease' }}>
              <div className="pt-1">
                {songURL ? (
                  <div className="flex items-center gap-2 rounded-xl px-4 py-2.5" style={{ background: '#E8F0E9', border: '1.5px solid #8FAF8A' }}>
                    <span>🎵</span>
                    <span className="flex-1 text-sm font-medium truncate" style={{ color: '#2D5A3D' }}>{songURL.replace('https://open.spotify.com/', '')}</span>
                    <button type="button" onClick={() => { setSongURL(null); setSongInput('') }} className="text-sm shrink-0 transition-all active:scale-90" style={{ color: '#7A7268' }}>×</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input type="url" value={songInput} onChange={(e) => setSongInput(e.target.value)}
                      placeholder="open.spotify.com/track/…" disabled={submitting}
                      className="flex-1 rounded-xl px-4 py-2.5 text-sm focus:outline-none disabled:opacity-50"
                      style={{ border: '1.5px solid #E8E2D9', background: '#F8F5F0', color: '#1A1A16' }} />
                    <button type="button" disabled={!songInput.trim() || submitting}
                      onClick={() => {
                        const parsed = parseSpotifyURL(songInput.trim())
                        if (parsed) { setSongURL(parsed); setSongInput('') }
                        else setSubmitError('Paste a valid Spotify track, album, or playlist link.')
                      }}
                      className="rounded-xl px-4 py-2.5 text-sm font-bold transition-all active:scale-95 disabled:opacity-40"
                      style={{ background: '#2D5A3D', color: '#fff' }}>Add</button>
                  </div>
                )}
              </div>
            </div>

            {/* Sketch panel */}
            <div style={{ maxHeight: showSketch ? '600px' : 0, overflow: 'hidden', transition: 'max-height 0.35s ease' }}>
              <div className="pt-1"><SketchPad onBlob={setSketchBlob} disabled={submitting || uploadingPhoto} /></div>
            </div>

            {submitError && (
              <p className="text-xs" style={{ color: '#B85C38' }}>
                {submitError}
              </p>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting || uploadingPhoto}
              className={`w-full rounded-xl py-4 text-sm font-bold text-white tracking-widest uppercase disabled:opacity-50 transition-all active:scale-[0.98] btn-shimmer ${(submitting || uploadingPhoto) ? 'active' : ''}`}
            >
              {submitting || uploadingPhoto ? <Spinner /> : 'Share'}
            </button>

            {/* Partner already submitted — motivational preview */}
            {partnerSubmitted && !iSubmitted && (
              <div
                className="mt-2 rounded-xl overflow-hidden border animate-fadeIn"
                style={{ borderColor: '#C9BFA8' }}
              >
                <div
                  className="flex items-center gap-2 px-3 py-2 border-b"
                  style={{ background: '#F2EDE4', borderColor: '#C9BFA8' }}
                >
                  <Avatar photoURL={partnerDoc?.photoURL ?? null} name={partnerDoc?.displayName ?? null} size="sm" />
                  <p className="text-[11px] tracking-[0.1em] uppercase font-semibold" style={{ color: '#2D5A3D' }}>
                    {partnerFirstName} already shared something ✓
                  </p>
                </div>
                <div
                  className="px-4 py-5 flex items-center justify-center"
                  style={{ background: '#F8F5F0' }}
                >
                  <p className="text-xs text-center" style={{ color: '#7A7268' }}>
                    Share yours to reveal what they sent
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Pinned fridge note — visible in all states */}
      {userDoc?.pairId && (
        <div
          className="shrink-0 px-5 py-3 border-t"
          style={{ background: '#F8F5F0', borderColor: '#E8E2D4' }}
        >
          {editingNote ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value.slice(0, 200))}
                placeholder="Leave a note for both of you..."
                rows={2}
                autoFocus
                className="w-full rounded-lg px-3 py-2 text-sm resize-none focus:outline-none"
                style={{ border: '1px solid #C9BFA8', background: '#fff', color: '#1A1A16' }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setEditingNote(false); setNoteText(pairDoc?.pinnedNote ?? '') }}
                  className="flex-1 rounded-lg py-1.5 text-xs font-medium"
                  style={{ border: '1px solid #C9BFA8', color: '#7A7268' }}
                >
                  Cancel
                </button>
                <button
                  disabled={savingNote}
                  onClick={async () => {
                    setSavingNote(true)
                    try {
                      await updateDoc(doc(db, 'pairs', userDoc.pairId!), {
                        pinnedNote: noteText.trim() || null,
                        updatedAt: serverTimestamp(),
                      })
                      setEditingNote(false)
                    } catch (e) { console.error(e) }
                    setSavingNote(false)
                  }}
                  className="flex-1 rounded-lg py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  style={{ background: '#2D5A3D' }}
                >
                  {savingNote ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <button
              className="w-full text-left flex items-start gap-2 group"
              onClick={() => { setNoteText(pairDoc?.pinnedNote ?? ''); setEditingNote(true) }}
            >
              <span style={{ fontSize: 16, marginTop: 1 }}>📌</span>
              <span
                className="text-sm leading-snug flex-1 group-active:opacity-70"
                style={{ color: pairDoc?.pinnedNote ? '#1A1A16' : '#C9BFA8' }}
              >
                {pairDoc?.pinnedNote ?? 'Leave a note for both of you…'}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Bottom nav */}
      <nav
        className="shrink-0 flex"
        style={{ background: '#1C2B1E', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      >
        <button
          onClick={() => navigate('/home')}
          className="flex-1 flex flex-col items-center pt-3 pb-1 gap-1"
          style={{ color: '#8FAF8A' }}
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
          style={{ color: '#4A5C4A' }}
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

      {/* Sign-out confirmation sheet */}
      {showSignOutConfirm && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          onClick={() => setShowSignOutConfirm(false)}
        >
          <div
            className="rounded-t-3xl px-5 pb-10 pt-5 shadow-xl"
            style={{ background: '#FFFFFF' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="mx-auto mb-5 h-1 w-10 rounded-full"
              style={{ background: '#E8E2D4' }}
            />
            <div className="mb-5 flex items-center gap-3">
              <Avatar
                photoURL={user?.photoURL ?? null}
                name={user?.displayName ?? null}
                size="md"
              />
              <div>
                <p className="font-semibold text-sm" style={{ color: '#1A1A16' }}>
                  {user?.displayName ?? '—'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#7A7268' }}>
                  {user?.email ?? ''}
                </p>
              </div>
            </div>

            {/* Pair name */}
            {userDoc?.pairId && (
              <div
                className="mb-4 rounded-xl px-4 py-3"
                style={{ background: '#F8F5F0', border: '1px solid #E8E2D4' }}
              >
                <p className="text-[10px] tracking-[0.15em] uppercase mb-2" style={{ color: '#C9BFA8' }}>
                  What do you call yourselves?
                </p>
                {editingPairName ? (
                  <div className="flex gap-2">
                    <input
                      value={pairNameText}
                      onChange={(e) => setPairNameText(e.target.value.slice(0, 30))}
                      placeholder="e.g. us, home, ..."
                      autoFocus
                      className="flex-1 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                      style={{ border: '1px solid #C9BFA8', background: '#fff', color: '#1A1A16' }}
                    />
                    <button
                      disabled={savingPairName}
                      onClick={async () => {
                        setSavingPairName(true)
                        try {
                          await updateDoc(doc(db, 'pairs', userDoc.pairId!), {
                            pairName: pairNameText.trim() || null,
                            updatedAt: serverTimestamp(),
                          })
                          setEditingPairName(false)
                        } catch (e) { console.error(e) }
                        setSavingPairName(false)
                      }}
                      className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                      style={{ background: '#2D5A3D' }}
                    >
                      {savingPairName ? '…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditingPairName(false)}
                      className="rounded-lg px-2 py-1.5 text-sm"
                      style={{ color: '#7A7268' }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    className="w-full text-left"
                    onClick={() => { setPairNameText(pairDoc?.pairName ?? ''); setEditingPairName(true) }}
                  >
                    <span className="text-sm" style={{ color: pairDoc?.pairName ? '#1A1A16' : '#C9BFA8' }}>
                      {pairDoc?.pairName ?? 'Set a name…'}
                    </span>
                  </button>
                )}
              </div>
            )}

            {/* Daily reminder */}
            {user && (
              <div
                className="mb-4 rounded-xl px-4 py-3"
                style={{ background: '#F8F5F0', border: '1px solid #E8E2D4' }}
              >
                <p className="text-[10px] tracking-[0.15em] uppercase mb-2" style={{ color: '#C9BFA8' }}>
                  Daily reminder
                </p>
                {userDoc?.reminderTime ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm flex-1" style={{ color: '#1A1A16' }}>
                      🔔 {formatHour(userDoc.reminderTime.hour)} every day
                    </span>
                    <button
                      disabled={savingReminder}
                      onClick={async () => {
                        setSavingReminder(true)
                        try {
                          await updateDoc(doc(db, 'users', user.uid), {
                            reminderTime: null,
                            updatedAt: serverTimestamp(),
                          })
                        } catch (e) { console.error(e) }
                        setSavingReminder(false)
                      }}
                      className="text-xs px-2.5 py-1 rounded-lg"
                      style={{ border: '1px solid #C9BFA8', color: '#7A7268' }}
                    >
                      {savingReminder ? '…' : 'Turn off'}
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="time"
                      value={reminderInput}
                      onChange={(e) => setReminderInput(e.target.value)}
                      className="flex-1 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                      style={{ border: '1px solid #C9BFA8', background: '#fff', color: '#1A1A16' }}
                    />
                    <button
                      disabled={!reminderInput || savingReminder}
                      onClick={async () => {
                        const hour = parseInt(reminderInput.split(':')[0], 10)
                        if (isNaN(hour)) return
                        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
                        setSavingReminder(true)
                        try {
                          await updateDoc(doc(db, 'users', user.uid), {
                            reminderTime: { hour, tz },
                            updatedAt: serverTimestamp(),
                          })
                          setReminderInput('')
                        } catch (e) { console.error(e) }
                        setSavingReminder(false)
                      }}
                      className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                      style={{ background: '#2D5A3D' }}
                    >
                      {savingReminder ? '…' : 'Set'}
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={async () => {
                setShowSignOutConfirm(false)
                await signOutUser()
              }}
              className="w-full rounded-lg border py-3.5 text-sm font-medium transition-colors"
              style={{ borderColor: '#FAD4CA', color: '#B85C38' }}
            >
              Sign out
            </button>
            <button
              onClick={() => setShowSignOutConfirm(false)}
              className="mt-2 w-full rounded-lg py-3 text-sm transition-colors"
              style={{ color: '#7A7268' }}
            >
              Cancel
            </button>

            {/* Leave pair */}
            {userDoc?.pairId && (
              <div className="mt-4 pt-4" style={{ borderTop: '1px solid #F0EBE0' }}>
                {!showLeaveConfirm ? (
                  <button
                    onClick={() => { setShowLeaveConfirm(true); setLeaveError(null) }}
                    className="w-full text-xs py-2 transition-colors"
                    style={{ color: '#C9BFA8' }}
                  >
                    Leave pair
                  </button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-center leading-relaxed" style={{ color: '#7A7268' }}>
                      Both of you will lose access to this pair.{' '}
                      <button
                        onClick={() => { setShowSignOutConfirm(false); window.location.href = '/export' }}
                        className="underline"
                        style={{ color: '#2D5A3D' }}
                      >
                        Export your journal first.
                      </button>
                    </p>
                    {leaveError && <p className="text-xs text-center" style={{ color: '#B85C38' }}>{leaveError}</p>}
                    <button
                      disabled={leaving}
                      onClick={async () => {
                        setLeaving(true)
                        setLeaveError(null)
                        try {
                          await leavePairFn({})
                        } catch (e: unknown) {
                          setLeaveError(e instanceof Error ? e.message : 'Failed to leave')
                          setLeaving(false)
                        }
                        // pairId → null triggers App.tsx redirect to /pair-setup automatically
                      }}
                      className="w-full rounded-lg py-2.5 text-sm font-medium border disabled:opacity-50"
                      style={{ borderColor: '#FAD4CA', color: '#B85C38' }}
                    >
                      {leaving ? 'Leaving…' : 'I understand — leave pair'}
                    </button>
                    <button
                      onClick={() => setShowLeaveConfirm(false)}
                      className="w-full py-2 text-xs"
                      style={{ color: '#C9BFA8' }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
