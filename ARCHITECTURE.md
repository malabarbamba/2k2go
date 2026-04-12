# Architecture

## Scope

2k2go is an arabic language learning website based on the fact : 2000 words = 80% comprehension, documented on more than 9 languages, including Arabic (English, French, Russian, Japanese, Greek, Spanish, Italian...).

This repo contains the public frontend experience and foundation deck assets.
The backend implementation is maintained separately in the private repository `malabarbamba/2k2go-backend-private` and live Supabase infrastructure.

Frontend agents should not recreate or track `supabase/` in this public repo.
Backend schema, migrations, edge functions, and production deploy workflows live in the private backend repo.

## Frontend Shell

- `src/App.tsx` mounts a dedicated router for the preview app shell.
- `src/pages/AppPage.tsx` remains the main runtime controller for `/app/*`.
- `src/pages/HomePage.tsx`, `LoginPage.tsx`, and `SignupPage.tsx` provide the public entry flow.
- `src/pages/WhyItWorksPage.tsx` renders the `/app/why-2000-to-go/*` docs subtree.

## Dependency Centers

- `src/components/deck-perso-visual-v2/`: review session UI.
- `src/services/deckPersoService.ts`: deck, due-count, search, review, and media runtime.
- `src/contexts/AuthContext.tsx`: Supabase auth/session bootstrap.
- `src/contexts/ProfileInsightsContext.tsx`: profile progression and review metrics.
- `src/features/preview-new-concept/services.ts`: recommendations, contacts, and preview app support services.

## Backend Surface

- `preview-youtube-recommendations`
- `review-reminders-config-v1`
- `review-reminder-web-push-v1`
- `scheduler-due-v1`
- `scheduler-review-v1`
- `collected-card-media`

These backend services are consumed by the public frontend but their source code is not published in this repository.

## Database Scope

The frontend depends on a database surface that supports:

- deck/session/search/review RPCs
- auth-linked daily activity and progression RPCs
- friends/connections
- reminder preferences and runtime
- preview session discussion/audio sharing
- collected card media/source links
- preview app session unique visitor tracking

## Known Tradeoff

Some shared service files still contain broader compatibility logic because the preview app imports them directly. The project keeps these service files intact to preserve runtime behavior while maintaining a focused route surface.
