# 2000togo

Standalone extraction of the `/app-v2` experience from the original `arabeurgence` repo.

Included route surface:

- `/home-v2`
- `/login-v2`
- `/onboarding-v2`
- `/signup-v2`
- `/app-v2/*`
- redirect aliases under `/app-v2/home`, `/app-v2/login`, `/app-v2/signup`, `/app-v2/onboarding`

Included backend surface:

- Supabase auth client wiring
- app-v2 deck/session/search/profile/friends/reminders services
- relevant Supabase Edge Functions under `supabase/functions/`
- curated migrations required by the current app-v2 runtime under `supabase/migrations/`

Run locally:

```bash
npm install
npm run dev
```

Verification commands:

```bash
npm run lint
npm run test
npm run build
```

Configuration:

- Default runtime config lives in `public/runtime-config.json`.
- Optional env-based bootstrapping is documented in `.env.example`.

Reference docs:

- `ARCHITECTURE.md`
- `APP_V2_EXTRACTION_MANIFEST.md`
