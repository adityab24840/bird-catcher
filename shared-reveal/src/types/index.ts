import type { Timestamp } from 'firebase/firestore'

export interface SummaryDoc {
  type: 'weekly' | 'monthly'
  period: string
  label: string       // 'last week' | month name e.g. 'August'
  revealCount: number
  createdAt: Timestamp
}

/**
 * Shape of the Firestore users/{uid} document.
 *
 * Created server-side by the Auth onCreate Cloud Function (AUTH-02).
 * pairId is always null until the user joins a pair in Phase 2.
 */
export interface UserDoc {
  displayName: string | null
  email: string | null
  photoURL: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
  pairId: string | null
  fcmToken: string | null
  reminderTime?: { hour: number; tz: string } | null
  lastDissolvedAt?: Timestamp | null
  favoriteSubmissions?: string[]
}

/** Shape of the Firestore pairs/{pairId} document. Written only by Cloud Functions. */
export interface PairDoc {
  createdBy: string
  members: string[]
  inviteCode: string
  inviteCodeExpiry: Timestamp
  inviteCodeUsed: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
  lastPing?: { from: string; at: Timestamp } | null
  pinnedNote?: string | null
  pairName?: string | null
  milestonesFired?: string[]
  dissolvedAt?: Timestamp | null
  dissolvedBy?: string | null
}

/**
 * Entry document at pairs/{pairId}/entries/{entryDate}.
 * Readable by both pair members at all times (metadata only — no submission content).
 * Writable only via Cloud Functions (Admin SDK). Client writes blocked by security rules.
 */
export interface EntryDoc {
  pairId: string
  date: string  // YYYY-MM-DD in user local timezone (D-02)
  status: 'pending' | 'one_submitted' | 'revealed'
  submittedMembers: string[]  // UIDs who have submitted
  createdAt: Timestamp
  updatedAt: Timestamp
  revealedBy?: string  // uid of who triggered reveal, or 'auto'
  revealReason?: 'auto' | 'manual'
  revealedAt?: Timestamp
  reactions?: Record<string, string>  // uid → emoji, set via reactToEntry CF
  favoritedBy?: string[]
  deletionRequest?: { requestedBy: string; requestedAt: Timestamp } | null
}

/**
 * Submission document at pairs/{pairId}/entries/{entryDate}/submissions/{uid}.
 * Readable by owner always; readable by partner only when entry status === 'revealed'.
 * Not writable by clients — only Cloud Functions (Admin SDK) write this doc.
 */
export interface SubmissionDoc {
  uid: string
  // v2 format: arrays accumulate across re-submissions
  photoURLs: string[]
  texts: string[]
  // v1 legacy fields (old docs written before arrays — kept for backward compat)
  photoURL?: string | null
  text?: string | null
  audioURLs: string[]
  location?: { lat: number; lng: number } | null
  songURLs?: string[]
  songURL?: string | null
  sketchURL?: string | null
  submittedAt: Timestamp
  updatedAt?: Timestamp
  mood?: string | null  // 'happy' | 'missing-you' | 'proud' | 'random'
  tags?: string[]       // 'trip' | 'hard-day' | 'milestone' | 'just-because' | 'birthday'
}
