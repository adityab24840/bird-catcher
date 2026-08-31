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
