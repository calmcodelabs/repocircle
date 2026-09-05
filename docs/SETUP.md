# RepoCircle — One-time Setup Runbook & Local Dev

Two one-time console sessions (~15 min total, free, no card), mirroring Score
Keeper's setup style. Do these once before/while M0 lands.

## A. GitHub OAuth App (5 min)

1. github.com → Settings → Developer settings → **OAuth Apps → New OAuth App**
   - Name: `RepoCircle` · Homepage: `https://calmcodelabs.github.io/repocircle/`
   - Callback URL: `https://<firebase-project-id>.firebaseapp.com/__/auth/handler`
     (get the exact value from Firebase in step B3 — placeholder is fine initially)
2. Generate a **client secret**. It gets pasted into the Firebase console **only**
   (step B3). It must never appear in this repo, an issue, or a chat log.

## B. Firebase project (10 min)

1. console.firebase.google.com → **Add project** → `repocircle` → Analytics **off**.
2. **Firestore Database** → Create → production mode → region `asia-south1`
   (nearest to the first real groups; region is permanent).
3. **Authentication → Sign-in method → GitHub** → paste Client ID + secret from A2 →
   copy the shown callback URL back into the OAuth App (A1). Save.
4. Authentication → Settings → **Authorized domains** → add `calmcodelabs.github.io`
   (`localhost` is pre-authorized for dev).
5. Project settings → **Add web app** → register (no hosting) → copy the
   `firebaseConfig` object into `src/firebase-config.ts`. This config is public
   by design (same as Score Keeper) — safe to commit.
6. Firestore → **Rules** → deployed from this repo (`firestore.rules`) via
   `npm run deploy:rules` (Firebase CLI, `firebase login` once) — console-paste works
   as fallback. Rules draft: [SECURITY.md §3](SECURITY.md).
7. Firestore → **TTL** → add policy: collection group `events`, field `expireAt` (M3).

## C. GitHub Pages (already enabled)

Repo → Settings → Pages: deploys from GitHub Actions (M0 switches the placeholder
branch-deploy to the build workflow). URL: `https://calmcodelabs.github.io/repocircle/`.

## D. Discord (per group, optional, 1 min — admins do this in-app later)

Server → channel ⚙ → Integrations → **Webhooks → New** → copy URL → paste into
RepoCircle → Group settings → Integrations. Regenerate there anytime to revoke.

## E. Local development

```bash
git clone git@github.com:calmcodelabs/repocircle.git && cd repocircle
npm install
npm run dev            # Vite on http://localhost:5173 (authorized for Firebase auth)
npm run emulators      # Firestore + Auth emulators for rules tests / offline hacking
npm run test           # vitest unit + rules suites (starts emulator itself in CI)
npm run build && npm run preview
```

- `npm run dev` against the **real** Firebase project is normal (it's free-tier and
  rules-guarded); use emulators when editing rules or working offline.
- Node ≥ 20. No `.env` files exist or should ever exist.

## F. Recovery / break-glass (documented per SECURITY §4)

- **Last admin left a group**: Firebase console → Firestore →
  `groups/{gid}/members/{uid}` → set `role: "admin"` manually.
- **Discord webhook leaked**: regenerate in Discord, update in-app. Old URL dies.
- **A user's GitHub token misused**: user revokes at github.com → Settings →
  Applications → RepoCircle; all copies die instantly (nothing is stored server-side).
- **Rules pushed broken**: `firebase deploy --only firestore:rules` from the last
  good commit (rules are versioned in-repo — that's the point).

## G. Deploying Firestore rules & indexes (no more console pasting)

After a one-time `npx -y firebase-tools@14 login` on your machine, ship rule/index
changes straight from the repo:

```bash
export PATH="$HOME/.local/node22/bin:$PATH"   # if node lives in ~/.local/node22
npm run deploy:rules
```

This targets `repocircle-3e9a6` (pinned in `.firebaserc`). Always deploy rules right
after any change to `firestore.rules` or `firestore.indexes.json` — the emulator tests
gate correctness, this makes production match. The login credential lives only on your
machine; nothing secret is committed.
