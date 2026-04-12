# App Component Manifest

2k2go is an arabic language learning website based on the fact : 2000 words = 80% comprehension, documented on more than 9 languages, including Arabic (English, French, Russian, Japanese, Greek, Spanish, Italian...).

## Core Frontend

`src/pages/AppPage.tsx`
why: main `/app/*` runtime controller
who: `src/App.tsx`
type: frontend

`src/pages/HomePage.tsx`
why: public landing page for the app flow
who: `src/App.tsx`
type: frontend

`src/pages/LoginPage.tsx`, `src/pages/SignupPage.tsx`
why: auth entry points for app
who: `src/App.tsx`
type: frontend

`src/pages/WhyItWorksPage.tsx`, `src/lib/webappDocs*.ts`
why: docs subtree under `/app/why-2000-to-go/*`
who: `src/pages/AppPage.tsx`
type: frontend

`src/components/deck-perso-visual-v2/`
why: session review UI and card rendering
who: `src/pages/AppPage.tsx`, `src/pages/HomePage.tsx`
type: frontend

## Shared Runtime Services

`src/contexts/AuthContext.tsx`
why: Supabase auth bootstrap, sign-in, sign-up, sign-out, session persistence
who: login, onboarding, home, preview page, session components
type: frontend

`src/contexts/ProfileInsightsContext.tsx`, `src/services/profileProgressService.ts`
why: profile metrics shown inside app
who: `src/pages/AppPage.tsx`
type: frontend/backend client

`src/services/deckPersoService.ts`, `src/lib/supabase/rpc.ts`
why: due counts, due cards, search, reviews, source/media enrichment
who: app page, session UI, mission progress, pending review count
type: backend client

`src/features/preview-new-concept/services.ts`, `discussionService.ts`
why: recommendations, contacts, session discussion/audio sharing
who: app page, session UI
type: frontend/backend client

`src/services/reviewRemindersService.ts`
why: settings page reminder configuration and web-push registration
who: `src/pages/AppPage.tsx`
type: backend client

## Supabase Integration

`src/integrations/supabase/`, `public/runtime-config.json`, `.env.example`
why: runtime configuration for Supabase
who: auth and service layer
type: config

`preview-youtube-recommendations` (private backend)
why: immersion recommendation backend used by app
who: `src/features/preview-new-concept/services.ts`
type: backend

`review-reminders-config-v1`, `review-reminder-web-push-v1` (private backend)
why: reminder settings and web-push endpoints
who: `src/services/reviewRemindersService.ts`
type: backend

`scheduler-due-v1`, `scheduler-review-v1` (private backend)
why: runtime scheduler path used by current deck service
who: `src/services/deckPersoService.ts`
type: backend

`collected-card-media` (private backend)
why: custom media overlay support used by current card/session flow
who: `src/lib/collectedCardMedia.ts`, `src/services/deckPersoService.ts`
type: backend

`database schema, migrations, and RPC definitions` (private backend: `malabarbamba/2k2go-backend-private`)
why: schema and RPC contracts required by the frontend/backend surface
who: private Supabase backend repository and live infrastructure
type: backend

## Shell and Tooling

`src/App.tsx`, `index.html`, `public/_redirects`
why: app routing, bootstrapping, redirects, and SPA fallback
who: frontend runtime
type: frontend shell

`package.json`, `vite.config.ts`
why: scripts and build configuration
who: local development and CI
type: config
