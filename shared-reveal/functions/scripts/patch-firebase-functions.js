/**
 * Patches firebase-functions v7 so that functions.config() returns {} instead
 * of throwing. The firebase-tools@14 emulator runtime calls functions.config()
 * internally (functionsEmulatorRuntime.js:456) before loading user code.
 * In firebase-functions v7 this call throws, crashing the functions process.
 *
 * This patch is idempotent — safe to run multiple times.
 * Remove when firebase-tools is updated to handle firebase-functions v7.
 */
const fs = require('fs')
const path = require('path')

const configPath = path.join(
  __dirname,
  '../node_modules/firebase-functions/lib/v1/config.js'
)

if (!fs.existsSync(configPath)) {
  console.log('patch-firebase-functions: config.js not found, skipping')
  process.exit(0)
}

const original = fs.readFileSync(configPath, 'utf8')

const throwLine =
  'throw new Error("functions.config() has been removed in firebase-functions v7. " + "Migrate to environment parameters using the params module. " + "Migration guide: https://firebase.google.com/docs/functions/config-env#migrate-config");'
const patchedLine =
  '/* patched: return {} instead of throwing — emulator calls this internally */ return {};'

if (original.includes(patchedLine)) {
  console.log('patch-firebase-functions: already patched')
  process.exit(0)
}

if (!original.includes(throwLine)) {
  console.log('patch-firebase-functions: throw line not found — may be already fixed upstream')
  process.exit(0)
}

const patched = original.replace(throwLine, patchedLine)
fs.writeFileSync(configPath, patched, 'utf8')
console.log('patch-firebase-functions: patched', configPath)
