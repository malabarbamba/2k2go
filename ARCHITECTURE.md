# Architecture

## Scope

This repo contains only the extracted `/app-v2` experience and the backend code paths it currently depends on.

## Frontend Shell

- `src/App.tsx` mounts a dedicated router for app-v2 only.
- `src/pages/PreviewNewConceptV2Page.tsx` remains the main runtime controller for `/app-v2/*`.
- `src/pages/HomeV2Page.tsx`, `LoginV2Page.tsx`, and `OnboardingV2Page.tsx` provide the public entry flow.
- `src/pages/AppV2WhyItWorksPage.tsx` renders the `/app-v2/pourquoi-ca-marche/*` docs subtree.

## Dependency Centers

- `src/components/deck-perso-visual-v2/`: review session UI.
- `src/services/deckPersoService.ts`: deck, due-count, search, review, and media runtime.
- `src/contexts/AuthContext.tsx`: Supabase auth/session bootstrap.
- `src/contexts/ProfileInsightsContext.tsx`: profile progression and review metrics.
- `src/features/preview-new-concept/services.ts`: recommendations, contacts, and app-v2 support services.

## Backend Surface

- `supabase/functions/preview-youtube-recommendations/`
- `supabase/functions/review-reminders-config-v1/`
- `supabase/functions/review-reminder-web-push-v1/`
- `supabase/functions/scheduler-due-v1/`
- `supabase/functions/scheduler-review-v1/`
- `supabase/functions/collected-card-media/`

## Database Scope

The copied migrations are a curated subset for the current app-v2 feature set:

- deck/session/search/review RPCs
- auth-linked daily activity and progression RPCs
- friends/connections
- reminder preferences and runtime
- preview session discussion/audio sharing
- collected card media/source links
- app-v2 session unique visitor tracking

## Known Tradeoff

Some shared service files still contain broader legacy logic internally because app-v2 imports them directly. The repo removes unrelated route surfaces and app shells first, then keeps these shared service files intact to preserve runtime behavior.
