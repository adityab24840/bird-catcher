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
}

interface SubmitEntryResult {
  entryDate: string
  alreadySubmitted: boolean
}

export const submitEntryFn = httpsCallable<SubmitEntryInput, SubmitEntryResult>(
  functions,
  'submitEntry'
)

export async function uploadSubmissionPhoto(
  pairId: string,
  entryDate: string,
  uid: string,
  file: File
): Promise<string> {
  try {
    // Step 1: HEIC detection — iOS sometimes returns empty MIME for HEIC files
    const isHeic =
      file.type === 'image/heic' ||
      file.type === 'image/heif' ||
      file.name.toLowerCase().endsWith('.heic') ||
      file.name.toLowerCase().endsWith('.heif')

    let fileToCompress: File

    if (isHeic) {
      // Step 2: Lazy-import heic2any (~1.2 MB WASM — keep out of initial bundle)
      const heic2any = (await import('heic2any')).default
      const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
      // heic2any returns Blob | Blob[] (Burst/Live Photo returns array)
      const jpegBlob: Blob = Array.isArray(result) ? result[0] : result
      fileToCompress = new File([jpegBlob], 'photo.jpg', { type: 'image/jpeg' })
    } else {
      fileToCompress = file
    }

    // Step 3: Canvas-based compress — no web worker, safe on iOS Safari PWA
    const compressedFile = await compressImage(fileToCompress)

    // Step 4: Upload to Firebase Storage
    const storagePath = `pairs/${pairId}/entries/${entryDate}/${uid}/${Date.now()}_photo.jpg`
    const storageRef = ref(storage, storagePath)
    const snapshot = await uploadBytes(storageRef, compressedFile, {
      contentType: 'image/jpeg',
    })

    // Step 5: Get permanent download URL
    const photoURL = await getDownloadURL(snapshot.ref)
    return photoURL
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
