import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase/config'

interface CreatePairResult {
  pairId: string
  inviteCode: string
}

interface JoinPairResult {
  pairId: string
}

export const createPairFn = httpsCallable<void, CreatePairResult>(functions, 'createPair')
export const joinPairFn = httpsCallable<{ inviteCode: string }, JoinPairResult>(functions, 'joinPair')
