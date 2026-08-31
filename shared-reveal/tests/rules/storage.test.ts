import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { doc, setDoc } from 'firebase/firestore'

let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-reveal-storage-test',
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
  })
})

const PHOTO_PATH = 'pairs/pair1/entries/2026-08-31/uid-alice/photo.jpg'

describe('Storage submission rules (SEC-03)', () => {
  it('denies non-member write to storage path (SEC-03)', async () => {
    const eveStorage = testEnv.authenticatedContext('uid-eve').storage()
    await assertFails(eveStorage.ref(PHOTO_PATH).putString('data'))
  })

  it('denies write to non-owner path', async () => {
    const bobStorage = testEnv.authenticatedContext('uid-bob').storage()
    await assertFails(bobStorage.ref(PHOTO_PATH).putString('data'))
  })

  it('denies partner read before reveal', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref(PHOTO_PATH).putString('data')
    })
    const bobStorage = testEnv.authenticatedContext('uid-bob').storage()
    await assertFails(bobStorage.ref(PHOTO_PATH).getBytes(1024))
  })

  it('allows owner write to own path', async () => {
    const aliceStorage = testEnv.authenticatedContext('uid-alice').storage()
    await assertSucceeds(aliceStorage.ref(PHOTO_PATH).putString('data'))
  })

  it('allows owner read of own photo', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref(PHOTO_PATH).putString('data')
    })
    const aliceStorage = testEnv.authenticatedContext('uid-alice').storage()
    await assertSucceeds(aliceStorage.ref(PHOTO_PATH).getBytes(1024))
  })

  it('allows partner read after reveal', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref(PHOTO_PATH).putString('data')
      await setDoc(doc(ctx.firestore(), 'pairs/pair1/entries/2026-08-31'), { status: 'revealed' }, { merge: true })
    })
    const bobStorage = testEnv.authenticatedContext('uid-bob').storage()
    await assertSucceeds(bobStorage.ref(PHOTO_PATH).getBytes(1024))
  })
})
