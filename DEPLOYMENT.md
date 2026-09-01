# Deployment setup

This site is built and published automatically by
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) on every push
to `main`. There is no manual build/copy step.

## One-time GitHub setup

**Repository secrets** — Settings → Secrets and variables → Actions:

- `APP_DATA_URL` — the deployed Google Apps Script web app URL that acts as
  this app's data backend (the shared board state key-value store).
- `APP_DATA_SECRET` — the shared secret the app sends with every request to
  that backend.
- `GAME_CONTENT_KEY` — the same base64 AES-256 key used to encrypt game
  content locally (see below). The client decrypts game content with this
  key at runtime, so it must match whatever key `npm run encrypt-content`
  used to produce the committed `src/games/encrypted/*.json` files.

**Backend**: this app reuses the same generic Google Apps Script KV-store
pattern as `family-pantry` (`{secret, action: "get"|"set", id, data}` over
POST, backed by a Sheet), but deployed as its **own, separate** Web App
project and Sheet — do not point this app at family-pantry's live
deployment. Each game code gets its own row in the sheet (the sync adapter
keys remote storage per game, `birthdayBingo:v1:board:{code}:records`, not
one blob for everything).

**Pages source** — Settings → Pages → Build and deployment → Source is set to
**GitHub Actions** (not "Deploy from a branch").

**`local-sync` dependency** — same as family-pantry: `package.json` depends
on [`cuptordare/local-sync`](https://github.com/cuptordare/local-sync) via a
git dependency. That repo must stay **public**, otherwise `npm ci` in CI has
no credentials to clone it.

## Game content: authoring and encryption

Game content (columns, tasks, prizes, player rosters, host passcode) is
authored as plaintext JSON in `content/games/{CODE}.json` — this directory is
**gitignored** and never committed. Before it can be built/deployed, it must
be encrypted:

1. Generate a key once (32 random bytes, base64-encoded):
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
   Put it in `.env` as `GAME_CONTENT_KEY` (and as the `GAME_CONTENT_KEY`
   repository secret for CI — both must match, or deployed clients won't be
   able to decrypt).
2. Author `content/games/{CODE}.json` (see an existing file for the schema).
3. Run `npm run encrypt-content`. This validates the content (rejects a
   missing `hostPasscode`, a reserved `HOST` player code, or an `assignedTo`
   that doesn't match a roster entry) and writes
   `src/games/encrypted/{CODE}.json` — **this ciphertext file is committed**;
   it's the only place game content exists in the repository. Commit it
   whenever content changes.

This stops casual GitHub browsing from revealing party content, but not a
determined inspection of the running app — the decrypt key ships inside the
built client JS bundle, same threat model as the original app's base64
obfuscation.

## Local development

1. `npm install`
2. Copy `.env.example` to `.env` and fill in `APP_DATA_URL`, `APP_DATA_SECRET`,
   and `GAME_CONTENT_KEY` (see above).
3. Author and encrypt at least one game (see above) so `src/games/encrypted/`
   isn't empty — the build fails otherwise.
4. `npm run build` then `npm run dev` to serve the built `dist/` locally.

`.env` and `content/games/*.json` are gitignored and must never be committed.
