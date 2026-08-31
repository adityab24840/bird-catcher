import type { Timestamp } from 'firebase/firestore'

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
}

/**
 * Entry document at pairs/{pairId}/entries/{entryDate}.
 * Readable by both pair members at all times (metadata only — no submission content).
 * Writable only via Cloud Functions (Admin SDK). Client writes blocked by security rules.
 */
export interface EntryDoc {
  pairId: string
  date: string  // YYYY-MM-DD in user local timezone (D-02)
  status: 'pending' | 'one_submitted'  // Phase 4 adds 'revealed'
  submittedMembers: string[]  // UIDs who have submitted
  createdAt: Timestamp
  updatedAt: Timestamp
}

/**
 * Submission document at pairs/{pairId}/entries/{entryDate}/submissions/{uid}.
 * Readable by owner always; readable by partner only when entry status === 'revealed'.
 * Not writable by clients — only Cloud Functions (Admin SDK) write this doc.
 */
export interface SubmissionDoc {
  uid: string
  photoURL: string | null  // Firebase Storage download URL, null if text-only submission
  text: string | null  // max 500 chars enforced by CF schema, null if photo-only submission
  submittedAt: Timestamp
}
