import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { doc, getDoc, setDoc } from 'firebase/firestore'

let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-reveal-test',
    firestore: {
      rules: readFileSync('../../firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
    storage: {
      rules: readFileSync('../../storage.rules', 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

afterEach(async () => {
  await testEnv.clearFirestore()
})

beforeEach(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'pairs/pair1'), {
      members: ['uid-alice', 'uid-bob'],
      createdBy: 'uid-alice',
      inviteCode: 'A1B2C3',
      inviteCodeExpiry: new Date(),
      inviteCodeUsed: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await setDoc(doc(db, 'pairs/pair1/entries/2026-08-31'), {
      pairId: 'pair1',
      date: '2026-08-31',
      status: 'one_submitted',
      submittedMembers: ['uid-alice'],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await setDoc(doc(db, 'pairs/pair1/entries/2026-08-31/submissions/uid-alice'), {
      uid: 'uid-alice',
      photoURL: null,
      text: 'Hello Bob',
      submittedAt: new Date(),
    })
    await setDoc(doc(db, 'pairs/pair1/entries/2026-08-31/submissions/uid-bob'), {
      uid: 'uid-bob',
      photoURL: null,
      text: 'Hello Alice',
      submittedAt: new Date(),
    })
  })
})

describe('Firestore submission rules', () => {
  it('denies partner read of unrevealed submission (SEC-01, SUBM-05)', async () => {
    const bobDb = testEnv.authenticatedContext('uid-bob').firestore()
    await assertFails(getDoc(doc(bobDb, 'pairs/pair1/entries/2026-08-31/submissions/uid-alice')))
  })

  it('denies non-member read (SEC-04)', async () => {
    const eveDb = testEnv.authenticatedContext('uid-eve').firestore()
    await assertFails(getDoc(doc(eveDb, 'pairs/pair1/entries/2026-08-31/submissions/uid-alice')))
  })

  it('denies anonymous read', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(anonDb, 'pairs/pair1/entries/2026-08-31/submissions/uid-alice')))
  })

  it('denies client write to submission doc (SEC-02)', async () => {
    const aliceDb = testEnv.authenticatedContext('uid-alice').firestore()
    await assertFails(setDoc(doc(aliceDb, 'pairs/pair1/entries/2026-08-31/submissions/uid-alice'), { text: 'Modified' }, { merge: true }))
  })

  it('denies client write to entry status field (SEC-02)', async () => {
    const aliceDb = testEnv.authenticatedContext('uid-alice').firestore()
    await assertFails(setDoc(doc(aliceDb, 'pairs/pair1/entries/2026-08-31'), { status: 'revealed' }, { merge: true }))
  })

  it('denies client creation of new entry doc', async () => {
    const aliceDb = testEnv.authenticatedContext('uid-alice').firestore()
    await assertFails(setDoc(doc(aliceDb, 'pairs/pair1/entries/2026-09-01'), { pairId: 'pair1', date: '2026-09-01', status: 'pending', submittedMembers: [] }))
  })

  it('allows owner read of own submission (SEC-01)', async () => {
    const aliceDb = testEnv.authenticatedContext('uid-alice').firestore()
    await assertSucceeds(getDoc(doc(aliceDb, 'pairs/pair1/entries/2026-08-31/submissions/uid-alice')))
  })

  it('allows member read of entry doc metadata (SUBM-06)', async () => {
    const aliceDb = testEnv.authenticatedContext('uid-alice').firestore()
    const bobDb = testEnv.authenticatedContext('uid-bob').firestore()
    await assertSucceeds(getDoc(doc(aliceDb, 'pairs/pair1/entries/2026-08-31')))
    await assertSucceeds(getDoc(doc(bobDb, 'pairs/pair1/entries/2026-08-31')))
  })

  it('allows partner read after reveal (SUBM-05 allow path)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'pairs/pair1/entries/2026-08-31'), { status: 'revealed' }, { merge: true })
    })
    const bobDb = testEnv.authenticatedContext('uid-bob').firestore()
    await assertSucceeds(getDoc(doc(bobDb, 'pairs/pair1/entries/2026-08-31/submissions/uid-alice')))
  })

  it('allows partner read of their own submission', async () => {
    const bobDb = testEnv.authenticatedContext('uid-bob').firestore()
    await assertSucceeds(getDoc(doc(bobDb, 'pairs/pair1/entries/2026-08-31/submissions/uid-bob')))
  })
})
