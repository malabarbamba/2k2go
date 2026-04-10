# 2k2go

Open-source vocab cards for the 2,000 most frequent Arabic words, in order, with spaced repetition and real-content exposure.

## what it does

- 2,000-word deck based on frequency data for Modern Standard Arabic
- FSRS spaced repetition scheduling
- Immersion through authentic Arabic video/audio
- Progress tracking
- Review reminders

## why 2,000 words

High-frequency word lists show that roughly 2,000 words account for ~80% of word occurrences in standard Arabic text. This app focuses on that set.

## who uses it

Anyone learning Arabic - for work, religion, family, relocation, or personal interest. Works for beginners and for people restarting after dropping off other methods.

## setup

1. Install dependencies:

```bash
npm install
```

2. Configure Supabase for local development.

- The committed `public/runtime-config.json` is a template with empty Supabase values.
- A fresh clone will not connect to any Supabase project until you provide local config.
- Choose one local setup path:

```bash
cp .env.example .env
```

- Then set:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`

- Or create an untracked `public/runtime-config.local.json` with your local values. This file is loaded before `public/runtime-config.json` and is ignored by git.

```json
{
	"SUPABASE_URL": "https://your-project.supabase.co",
	"SUPABASE_PUBLISHABLE_KEY": "sb_publishable_your_key"
}
```

3. Start the dev server:

```bash
npm run dev
```

4. Run the standard checks:

```bash
npm run lint
npm run test
npm run build
```

If neither `.env` nor `public/runtime-config.local.json` is provided, the app will start but Supabase-backed features will stay unavailable because the committed template does not include live credentials.

## github pages domain migration

To use `https://2k2go.github.io` (without `/repo-name`), deploy from a user/org Pages repository named exactly `2k2go.github.io` under owner `2k2go`.

Recommended migration flow:

1. Create the `2k2go` GitHub owner (user or org).
2. Transfer this repository to owner `2k2go` and rename it to `2k2go.github.io`.
3. Keep the existing Pages workflow on `main`.
4. Update Supabase Auth redirect settings to include:
   - `https://2k2go.github.io`
   - `https://2k2go.github.io/*`

The Vite config auto-detects user/org Pages repos (`<owner>.github.io`) and builds with base path `/`; project repos still build with `/<repo>/`.

## project docs

- `ARCHITECTURE.md`
- `APP_V2_COMPONENT_MANIFEST.md`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `OPEN_SOURCE_READINESS.md`
- `SUPPORT.md`

## contributing

PRs welcome. Word list corrections and translation fixes are especially useful.

Before opening a PR, run:

```bash
npm run lint
npm run test
npm run typecheck
npm run build
```

For vulnerability reports, do not open a public issue. Follow `SECURITY.md`.

## license

GNU GPL v3.0. See `LICENSE`.
