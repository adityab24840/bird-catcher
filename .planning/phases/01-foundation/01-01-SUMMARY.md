---
phase: "01"
plan: "01"
subsystem: "frontend-scaffold"
tags: [vite, react, tailwind-v4, pwa, firebase, typescript, service-worker, workbox]
completed: "2026-08-31T05:09:10Z"
duration_minutes: 40

dependency_graph:
  requires: []
  provides:
    - shared-reveal/package.json (full dependency manifest)
    - shared-reveal/vite.config.ts (Vite 8 + Tailwind v4 + vite-plugin-pwa injectManifest + define block)
    - shared-reveal/src/sw.ts (unified service worker skeleton: Workbox + Storage exclusion + FCM slot)
    - shared-reveal/firestore.rules (/users/{uid} rules + pairId client-write block)
    - shared-reveal/firebase.json (emulator ports: auth:9099, firestore:8080, storage:9199, functions:5001)
  affects: []

tech_stack:
  added:
    - "React 19.2.8 + react-dom 19.2.8"
    - "TypeScript 5.5+ (^5.5.0)"
    - "Vite 8.2.2"
    - "@vitejs/plugin-react 6.1.1 (Vite 8-compatible — v4.x only supports Vite up to v7)"
    - "Tailwind CSS 4.3.3 via @tailwindcss/vite 4.3.3 (no PostCSS, no tailwind.config.ts)"
    - "vite-plugin-pwa 1.3.0 (injectManifest strategy)"
    - "workbox-precaching 7.4.1 + workbox-routing 7.4.1"
    - "firebase 12.18.0 (modular)"
    - "react-router-dom 7.x"
    - "zod 4.5.4"
    - "@types/react 19.x + @types/react-dom 19.x (react@19 does not ship built-in types)"
    - "vitest 4.1.11 + @testing-library/react@16 + jsdom"
    - "@playwright/test 1.62.1"
    - "firebase-admin 14.3.0 + @firebase/rules-unit-testing 5.0.2"
  patterns:
    - "Vite define block for SW Firebase config injection (__FIREBASE_*__ literals, not import.meta.env)"
    - "Single unified sw.ts (injectManifest) — prevents dual-SW FCM reload loop"
    - "Tailwind v4 CSS-first config via @theme in global.css"
    - "Firebase Storage explicit fetch passthrough in sw.ts (prevents iOS upload stall)"
    - "TypeScript project references: tsconfig.json -> tsconfig.app.json + tsconfig.node.json"

key_files:
  created:
    - shared-reveal/package.json
    - shared-reveal/package-lock.json
    - shared-reveal/tsconfig.json
    - shared-reveal/tsconfig.app.json
    - shared-reveal/tsconfig.node.json
    - shared-reveal/.gitignore
    - shared-reveal/.env.example
    - shared-reveal/src/vite-env.d.ts
    - shared-reveal/vite.config.ts
    - shared-reveal/src/sw.ts
    - shared-reveal/src/styles/global.css
    - shared-reveal/index.html
    - shared-reveal/src/main.tsx
    - shared-reveal/src/App.tsx
    - shared-reveal/src/pages/LandingPage.tsx
    - shared-reveal/src/pages/HomePage.tsx
    - shared-reveal/public/icons/icon-192.png
    - shared-reveal/public/icons/icon-512.png
    - shared-reveal/public/icons/icon-512-maskable.png
    - shared-reveal/public/icons/apple-touch-icon-180.png
    - shared-reveal/firebase.json
    - shared-reveal/.firebaserc
    - shared-reveal/firestore.rules
    - shared-reveal/storage.rules
  modified: []

decisions:
  - "@vitejs/plugin-react 6.1.1 selected — v4.x (the initially planned ^4.5.0) supports only Vite up to v7; v6.x is the Vite 8-compatible release"
  - "@types/react@19 + @types/react-dom@19 added — react@19.2.8 does not ship bundled TypeScript types unlike some pre-release builds; @types packages are required"
  - "FCM handler deferred to Phase 5 per plan — sw.ts has insertion point comment; FCM-ready slot is wired but handler not registered"
  - "LandingPage and HomePage are intentional stubs with explicit comments; plan 01-02 implements real UI"
  - "Placeholder PNGs generated at exact required dimensions (192x192, 512x512, 180x180) using PIL with brand-purple (#a855f7) color"
---

# Phase 01 Plan 01: Build Toolchain Scaffold Summary

Vite 8 + React 19 + TypeScript 5.5 + Tailwind v4 + vite-plugin-pwa injectManifest + unified service worker skeleton with Firebase Storage passthrough — production build exits 0, manifest emits standalone with 3 icons, dev server serves HTTP 200.

## What Was Built

The `shared-reveal/` project root with a complete build toolchain. After this plan:

- `npm install` completes without peer-dependency errors
- `npm run build` produces a valid production bundle in `dist/` including: hashed JS bundle, `manifest.webmanifest` (name/short_name/icons/display:standalone/start_url/theme_color), and compiled `sw.js`
- `npm run dev` starts Vite dev server on port 5173 and serves HTTP 200
- The unified service worker skeleton (`src/sw.ts`) excludes `firebasestorage.googleapis.com` from SW interception (PWA-05), ready for Phase 3 uploads
- Firebase project config files (`firebase.json`, `firestore.rules`, `storage.rules`, `.firebaserc`) are in place
- Firestore rules protect `/users/{uid}` and deny client writes to `pairId`

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Package legitimacy verification (supply-chain gate) | -- | Human-approved before execution |
| 2 | Create project structure, package.json, TS config, install deps | 66ef805 | Done |
| 3a | Configure Vite + Tailwind v4 + PWA + service worker skeleton + app shell | 58af101 | Done |
| 3b | Firebase project config files + prove the build | d3953ff | Done |

## Verification Results

```
npm install                 -> exits 0, no ERESOLVE
npm run build               -> exits 0; dist/ with manifest.webmanifest + sw.js + assets
manifest.webmanifest        -> display:standalone, 3 icons (192, 512, 512-maskable)
npm run dev                 -> HTTP 200 on localhost:5173
src/sw.ts                   -> contains firebasestorage.googleapis.com passthrough
vite.config.ts              -> strategies:'injectManifest' + 6 __FIREBASE_*__ define keys
firestore.rules             -> match /users/{uid} + pairId client-write block
no tailwind.config.ts       -> confirmed absent
no @tailwindcss/postcss     -> confirmed absent
icon dimensions             -> 192x192, 512x512, 512x512 (maskable), 180x180 -- verified with PIL
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] @vitejs/plugin-react upgraded from ^4.5.0 to 6.1.1**
- **Found during:** Task 2 (first npm install attempt)
- **Issue:** `@vitejs/plugin-react@4.7.0` peer dependency requires `vite@^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0` -- explicitly excludes Vite 8. Install would fail with ERESOLVE.
- **Fix:** Pinned `@vitejs/plugin-react` to `6.1.1`, which requires `vite@^8.0.0` -- the Vite 8-native release
- **Files modified:** shared-reveal/package.json, package-lock.json
- **Commit:** 66ef805

**2. [Rule 3 - Blocking] Added @types/react@19 and @types/react-dom@19**
- **Found during:** Task 3b (first npm run build attempt, tsc phase)
- **Issue:** `react@19.2.8` does not ship bundled TypeScript declaration files. `tsc -b` failed with "Could not find a declaration file for module 'react'" and 30+ JSX element type errors across all .tsx files.
- **Fix:** Installed `@types/react@^19.2.18` and `@types/react-dom@^19.2.5` as devDependencies
- **Files modified:** shared-reveal/package.json, package-lock.json
- **Commit:** d3953ff (alongside Firebase config files)

## Known Stubs

| File | Description | Resolved By |
|------|-------------|-------------|
| shared-reveal/src/pages/LandingPage.tsx | Placeholder with "Sign-in coming in plan 01-02" text | plan 01-02 |
| shared-reveal/src/pages/HomePage.tsx | Placeholder with "Authenticated shell -- full implementation in plan 01-02" | plan 01-02 |
| shared-reveal/public/icons/*.png | Solid-color placeholder PNGs with lettermark R -- not production art | Phase 6 or design phase |
| shared-reveal/.firebaserc | "default": "<your-firebase-project-id>" -- requires real project ID | Manual step before deploy |

These stubs are intentional per the plan (`scaffolding_exception: true`). The stubs do NOT prevent the plan's goal (buildable toolchain) from being achieved.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes beyond what is already in the plan's threat model. The Firestore rules introduce a `/users/{uid}` write path which is explicitly planned; the `pairId` client-write block is correctly implemented.

## Self-Check: PASSED

- shared-reveal/package.json: FOUND
- shared-reveal/vite.config.ts: FOUND
- shared-reveal/src/sw.ts: FOUND
- shared-reveal/firebase.json: FOUND
- shared-reveal/firestore.rules: FOUND
- shared-reveal/src/pages/LandingPage.tsx: FOUND
- shared-reveal/src/pages/HomePage.tsx: FOUND
- shared-reveal/public/icons/icon-192.png: FOUND
- Commit 66ef805: FOUND
- Commit 58af101: FOUND
- Commit d3953ff: FOUND
