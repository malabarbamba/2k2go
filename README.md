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

2. Configure Supabase.

- Default client runtime config lives in `public/runtime-config.json`.
- The committed `public/runtime-config.json` uses empty Supabase values; set your own project values locally for deployment.
- If you prefer env-based setup, copy `.env.example` to `.env` and set:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`

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
