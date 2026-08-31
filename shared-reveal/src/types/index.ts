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
