import { httpsCallable } from 'firebase/functions'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { functions, storage } from '../firebase/config'
export async function compressImage(file: File, maxPx = 1280, quality = 0.82): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file),
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

interface SubmitEntryInput {
  entryDate: string
  text: string | null
  photoURL: string | null
  audioURL: string | null
  mood: string | null
  location: { lat: number; lng: number } | null
  songURL: string | null
  sketchURL: string | null
  tags?: string[]
}

interface SubmitEntryResult {
  entryDate: string
  alreadySubmitted: boolean
}

export const submitEntryFn = httpsCallable<SubmitEntryInput, SubmitEntryResult>(
  functions,
  'submitEntry'
)

async function toJpeg(file: File): Promise<File> {
  // Try canvas first — works for JPEG/PNG/WebP
  const canvasResult = await compressImage(file)
  if (canvasResult !== file) return canvasResult   // canvas succeeded

  // Canvas returned same reference → likely HEIC or undecodable format
  // Fall back to heic2any (lazy-loaded, ~1.2 MB WASM)
  try {
    const heic2any = (await import('heic2any')).default
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.88 })
    const jpegBlob: Blob = Array.isArray(result) ? result[0] : result
    const jpegFile = new File([jpegBlob], 'photo.jpg', { type: 'image/jpeg' })
    return compressImage(jpegFile)   // compress the freshly converted JPEG
  } catch {
    // heic2any failed — upload original and hope browser handles it
    return file
  }
}

export async function toJpegPreviewUrl(file: File): Promise<string> {
  const jpeg = await toJpeg(file)
  return URL.createObjectURL(jpeg)
}

export async function uploadSubmissionSketch(
  pairId: string,
  entryDate: string,
  uid: string,
  blob: Blob
): Promise<string> {
  const storagePath = `pairs/${pairId}/entries/${entryDate}/${uid}/${Date.now()}_sketch.png`
  const storageRef = ref(storage, storagePath)
  const snapshot = await uploadBytes(storageRef, blob, { contentType: 'image/png' })
  return getDownloadURL(snapshot.ref)
}

export async function uploadSubmissionAudio(
  pairId: string,
  entryDate: string,
  uid: string,
  blob: Blob
): Promise<string> {
  const storagePath = `pairs/${pairId}/entries/${entryDate}/${uid}/${Date.now()}_audio.webm`
  const storageRef = ref(storage, storagePath)
  const snapshot = await uploadBytes(storageRef, blob, { contentType: 'audio/webm' })
  return getDownloadURL(snapshot.ref)
}

export async function uploadSubmissionPhoto(
  pairId: string,
  entryDate: string,
  uid: string,
  file: File
): Promise<string> {
  try {
    const uploadFile = await toJpeg(file)
    const storagePath = `pairs/${pairId}/entries/${entryDate}/${uid}/${Date.now()}_photo.jpg`
    const storageRef = ref(storage, storagePath)
    const snapshot = await uploadBytes(storageRef, uploadFile, { contentType: 'image/jpeg' })
    return getDownloadURL(snapshot.ref)
  } catch (err) {
    console.error('[uploadSubmissionPhoto] failed:', err)
    throw err
  }
}

interface RevealAnywayInput {
  entryDate: string
}

interface RevealAnywayResult {
  entryDate: string
  revealed: boolean
}

export const revealAnywayFn = httpsCallable<RevealAnywayInput, RevealAnywayResult>(
  functions,
  'revealAnyway'
)

export const reactToEntryFn = httpsCallable<{ entryDate: string; emoji: string }, { entryDate: string; emoji: string }>(
  functions,
  'reactToEntry'
)

export const sendPingFn = httpsCallable<Record<string, never>, { sent: boolean }>(
  functions,
  'sendPing'
)

export const leavePairFn = httpsCallable<Record<string, never>, { success: boolean }>(
  functions,
  'leavePair'
)

export const requestEntryDeletionFn = httpsCallable<{ entryDate: string }, { entryDate: string }>(
  functions,
  'requestEntryDeletion'
)

export const respondEntryDeletionFn = httpsCallable<{ entryDate: string; accept: boolean }, { entryDate: string; deleted: boolean }>(
  functions,
  'respondEntryDeletion'
)
