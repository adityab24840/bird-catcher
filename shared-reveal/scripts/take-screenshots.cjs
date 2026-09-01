'use strict'
/**
 * Playwright screenshot script for birds.eye
 * Run from: shared-reveal/
 *   node scripts/take-screenshots.cjs
 *
 * Requires: emulators (auth:9099, firestore:8080) + dev server (localhost:5175) already running.
 */

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'

const { chromium } = require('@playwright/test')
const { mkdirSync } = require('fs')
const { join } = require('path')
// Use firebase-admin from functions/ to bypass security rules
const ADMIN_PATH = join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin')
const { initializeApp, getApps } = require(ADMIN_PATH)
const { getFirestore, FieldValue } = require(join(ADMIN_PATH, 'lib', 'firestore'))
const { getAuth } = require(join(ADMIN_PATH, 'lib', 'auth'))

const PROJECT_ID = 'birds-eye-c09ff'
const APP_URL = 'http://localhost:5175'
const SCREENSHOTS_DIR = join(__dirname, '..', '..', 'docs', 'screenshots')

mkdirSync(SCREENSHOTS_DIR, { recursive: true })

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Init admin (emulator, no credentials needed)
if (!getApps().length) {
  initializeApp({ projectId: PROJECT_ID })
}
const db = getFirestore()
const authAdmin = getAuth()

async function fsSet(path, data) {
  const parts = path.split('/')
  let ref = db.collection(parts[0])
  for (let i = 1; i < parts.length; i++) {
    ref = i % 2 === 0 ? ref.collection(parts[i]) : ref.doc(parts[i])
  }
  await ref.set(data, { merge: false })
}

async function createAuthUser(uid, displayName, email) {
  try {
    await authAdmin.createUser({ uid, displayName, email, emailVerified: true })
  } catch (e) {
    if (!e.message.includes('already exists')) console.warn('createAuthUser:', e.message)
  }
}

// ── Seed ─────────────────────────────────────────────────────────────────────

const UID1 = 'ss-user-01'
const UID2 = 'ss-user-02'
const PAIR_ID = 'ss-pair-01'
const ts = FieldValue.serverTimestamp()

const d = (daysAgo) => {
  const d = new Date(Date.now() - daysAgo * 86400000)
  return d.toLocaleDateString('en-CA')
}

async function seed() {
  console.log('Seeding…')
  await createAuthUser(UID1, 'Aditya', 'aditya-ss@test.local')
  await createAuthUser(UID2, 'Friede', 'friede-ss@test.local')
  await createAuthUser('ss-new', 'New User', 'new-ss@test.local')

  await fsSet(`users/${UID1}`, { displayName: 'Aditya', email: 'aditya-ss@test.local', photoURL: null, pairId: PAIR_ID, fcmToken: null, createdAt: ts, updatedAt: ts })
  await fsSet(`users/${UID2}`, { displayName: 'Friede', email: 'friede-ss@test.local', photoURL: null, pairId: PAIR_ID, fcmToken: null, createdAt: ts, updatedAt: ts })
  await fsSet(`users/ss-new`, { displayName: 'New User', email: 'new-ss@test.local', photoURL: null, pairId: null, fcmToken: null, createdAt: ts, updatedAt: ts })

  await fsSet(`pairs/${PAIR_ID}`, {
    createdBy: UID1, members: [UID1, UID2], inviteCode: 'ABCDEF',
    inviteCodeExpiry: ts, inviteCodeUsed: true, createdAt: ts, updatedAt: ts, pairName: "birds.eye",
  })

  // Revealed entries
  for (let i = 1; i <= 3; i++) {
    const date = d(i)
    await fsSet(`pairs/${PAIR_ID}/entries/${date}`, {
      pairId: PAIR_ID, date, status: 'revealed', submittedMembers: [UID1, UID2],
      createdAt: ts, updatedAt: ts, revealedBy: 'auto', revealReason: 'auto', revealedAt: ts,
    })
    await fsSet(`pairs/${PAIR_ID}/entries/${date}/submissions/${UID1}`, {
      uid: UID1, photoURLs: [], audioURLs: [],
      texts: [i === 1 ? 'Saw a heron and thought of you instantly.' : i === 2 ? 'This song played right when I was thinking of you.' : 'The light was perfect today.'],
      songURLs: i === 2 ? ['https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'] : [],
      songURL: i === 2 ? 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC' : null,
      mood: ['happy', 'missing-you', 'proud'][i - 1], tags: [], submittedAt: ts,
    })
    await fsSet(`pairs/${PAIR_ID}/entries/${date}/submissions/${UID2}`, {
      uid: UID2, photoURLs: [], audioURLs: [],
      texts: [i === 1 ? 'The sunset looked like your favourite colour.' : i === 2 ? 'Found your old note today ♡' : 'Walked past our spot.'],
      songURLs: [], mood: ['random', 'missing-you', 'happy'][i - 1], tags: [], submittedAt: ts,
    })
  }

  // Today — user 1 submitted only
  const today = d(0)
  await fsSet(`pairs/${PAIR_ID}/entries/${today}`, {
    pairId: PAIR_ID, date: today, status: 'one_submitted', submittedMembers: [UID1], createdAt: ts, updatedAt: ts,
  })
  await fsSet(`pairs/${PAIR_ID}/entries/${today}/submissions/${UID1}`, {
    uid: UID1, photoURLs: [], audioURLs: [], texts: ['Thinking of you ♡'], songURLs: [], mood: 'random', tags: [], submittedAt: ts,
  })

  console.log('Seed done.')
}

// ── Playwright helpers ────────────────────────────────────────────────────────

const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2 }

async function signIn(page, uid, route = '/home') {
  // Create custom token server-side (admin SDK → emulator signs it)
  const customToken = await authAdmin.createCustomToken(uid)
  await page.goto(APP_URL + '/')
  await page.waitForLoadState('domcontentloaded')
  // window.__testSignIn wired in main.tsx calls signInWithCustomToken(auth, token)
  await page.evaluate((token) => window.__testSignIn(token), customToken)
  await page.waitForURL(/\/(home|pair-setup|timeline|stats|export)/, { timeout: 15000 })
  if (route !== '/home' && route !== '/pair-setup') {
    await page.goto(APP_URL + route)
    await page.waitForLoadState('domcontentloaded')
    await sleep(600)
  }
}

async function dark(page, on) {
  await page.evaluate((d) => document.documentElement.setAttribute('data-theme', d ? 'dark' : 'light'), on)
  await sleep(200)
}

async function shot(page, name, opts = {}) {
  await sleep(opts.delay ?? 800)
  const p = join(SCREENSHOTS_DIR, name)
  await page.screenshot({ path: p, fullPage: false, clip: { x: 0, y: 0, width: 390, height: 844 } })
  console.log('  ✓', name)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  await seed()

  const browser = await chromium.launch({ headless: true })

  const ctx = (scheme) => browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
  })

  // Landing
  console.log('\n→ Landing')
  {
    const c = await ctx('light')
    const page = await c.newPage()
    await page.goto(APP_URL + '/')
    await page.waitForLoadState('domcontentloaded')
    await sleep(500)
    await shot(page, 'landing.png')
    await dark(page, true)
    await shot(page, 'landing-dark.png')
    await c.close()
  }

  // Pair setup (unpaired user)
  console.log('\n→ Onboarding / pair-setup')
  {
    const c = await ctx('light')
    const page = await c.newPage()
    await signIn(page, 'ss-new')
    await page.waitForURL(/\/pair-setup/, { timeout: 8000 }).catch(() => {})
    await sleep(600)
    await shot(page, 'pair-setup.png')
    await shot(page, 'onboarding.png')
    await c.close()
  }

  // Home — waiting state (UID1 already submitted)
  console.log('\n→ Home (waiting)')
  {
    const c = await ctx('light')
    const page = await c.newPage()
    await signIn(page, UID1)
    await page.goto(APP_URL + '/home')
    await page.waitForLoadState('domcontentloaded')
    await sleep(1200)
    await shot(page, 'home-waiting.png')
    await dark(page, true)
    await shot(page, 'home-waiting-dark.png')
    await c.close()
  }

  // Home — empty (UID2 hasn't submitted today)
  console.log('\n→ Home (empty/form)')
  {
    const c = await ctx('light')
    const page = await c.newPage()
    await signIn(page, UID2)
    await page.goto(APP_URL + '/home')
    await page.waitForLoadState('domcontentloaded')
    await sleep(1000)
    await shot(page, 'home.png')
    await dark(page, true)
    await shot(page, 'home-dark.png')
    await dark(page, false)

    // Dismiss any onboarding modal that may intercept clicks
    await page.keyboard.press('Escape')
    await page.locator('[class*="fixed inset-0"]').evaluate(el => el.remove()).catch(() => {})
    await sleep(300)

    // Try to focus the textarea so the form area is visible
    try {
      await page.locator('textarea').first().click({ timeout: 5000 })
      await sleep(500)
    } catch { /* modal may not have dismissed — take shot as-is */ }
    await shot(page, 'home-form.png')
    await dark(page, true)
    await shot(page, 'home-form-dark.png')
    await c.close()
  }

  // Revealed — from UID2's perspective (sees both UID1 and UID2's entries from yesterday)
  console.log('\n→ Home (revealed)')
  {
    const c = await ctx('light')
    const page = await c.newPage()
    await signIn(page, UID2)
    await page.goto(APP_URL + '/home')
    await page.waitForLoadState('domcontentloaded')
    await sleep(1200)
    await shot(page, 'home-revealed.png')
    await dark(page, true)
    await shot(page, 'home-revealed-dark.png')
    await c.close()
  }

  // Timeline
  console.log('\n→ Timeline')
  {
    const c = await ctx('light')
    const page = await c.newPage()
    await signIn(page, UID1)
    await page.goto(APP_URL + '/timeline')
    await page.waitForLoadState('domcontentloaded')
    // Book cover fires first — capture it
    await sleep(400)
    await shot(page, 'timeline-book-cover.png')
    // Wait for cover to finish
    await sleep(2500)
    await shot(page, 'timeline-journal.png')
    await shot(page, 'timeline-new.png')
    await shot(page, 'timeline-card.png')
    await shot(page, 'timeline-polaroid.png')
    await dark(page, true)
    await shot(page, 'timeline-dark.png')
    await c.close()
  }

  // Stats
  console.log('\n→ Stats')
  {
    const c = await ctx('light')
    const page = await c.newPage()
    await signIn(page, UID1)
    await page.goto(APP_URL + '/stats')
    await page.waitForLoadState('domcontentloaded')
    await sleep(1500)
    await shot(page, 'stats.png')
    await dark(page, true)
    await shot(page, 'stats-dark.png')
    await c.close()
  }

  // Export
  console.log('\n→ Export')
  {
    const c = await ctx('light')
    const page = await c.newPage()
    // Suppress the auto-print dialog
    await c.route('**', route => route.continue())
    await signIn(page, UID1)
    await page.goto(APP_URL + '/export')
    await page.waitForLoadState('domcontentloaded')
    await sleep(2000)
    await shot(page, 'export.png')
    await dark(page, true)
    await shot(page, 'export-dark.png')
    await c.close()
  }

  await browser.close()
  console.log('\nDone! Screenshots in', SCREENSHOTS_DIR)
}

run().catch(e => { console.error(e); process.exit(1) })
