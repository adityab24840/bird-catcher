/**
 * Clears all Firebase Storage-backed fields from submission documents.
 * Run after storage bucket was recreated — old URLs are permanently dead.
 *
 * Usage: node scripts/clear-dead-storage-urls.mjs
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

if (!getApps().length) {
  initializeApp({ projectId: 'birds-eye-c09ff' })
}

const db = getFirestore()

async function run() {
  const pairsSnap = await db.collection('pairs').get()
  console.log(`Found ${pairsSnap.size} pair(s)`)

  let cleared = 0

  for (const pairDoc of pairsSnap.docs) {
    const entriesSnap = await pairDoc.ref.collection('entries').get()

    for (const entryDoc of entriesSnap.docs) {
      const subsSnap = await entryDoc.ref.collection('submissions').get()

      for (const subDoc of subsSnap.docs) {
        const data = subDoc.data()
        const hasStorageData =
          (data.photoURLs?.length > 0) ||
          data.photoURL ||
          data.sketchURL ||
          (data.audioURLs?.length > 0)

        if (!hasStorageData) continue

        await subDoc.ref.update({
          photoURLs: [],
          photoURL: null,
          sketchURL: null,
          audioURLs: [],
        })

        console.log(`  Cleared: pairs/${pairDoc.id}/entries/${entryDoc.id}/submissions/${subDoc.id}`)
        cleared++
      }
    }
  }

  console.log(`\nDone. ${cleared} submission(s) cleared.`)
}

run().catch((err) => { console.error(err); process.exit(1) })
