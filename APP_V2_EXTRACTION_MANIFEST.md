# App V2 Extraction Manifest

## Keep

`src/pages/PreviewNewConceptV2Page.tsx`
why: main `/app-v2/*` runtime controller
who: `src/App.tsx`, `src/pages/PreviewNewConceptDocsV2Page.tsx`
type: frontend

`src/pages/HomeV2Page.tsx`
why: public landing page for the extracted app-v2 flow
who: `src/App.tsx`
type: frontend

`src/pages/LoginV2Page.tsx`, `src/pages/OnboardingV2Page.tsx`
why: auth entry points for app-v2
who: `src/App.tsx`
type: frontend

`src/pages/AppV2WhyItWorksPage.tsx`, `src/lib/webappDocs*.ts`
why: docs subtree under `/app-v2/pourquoi-ca-marche/*`
who: `src/pages/PreviewNewConceptV2Page.tsx`
type: frontend

`src/components/deck-perso-visual-v2/`
why: session review UI and card rendering
who: `src/pages/PreviewNewConceptV2Page.tsx`, `src/pages/HomeV2Page.tsx`
type: frontend

`src/contexts/AuthContext.tsx`
why: Supabase auth bootstrap, sign-in, sign-up, sign-out, session persistence
who: login, onboarding, home, preview page, session components
type: frontend

`src/contexts/ProfileInsightsContext.tsx`, `src/services/profileProgressService.ts`
why: profile metrics shown inside app-v2
who: `src/pages/PreviewNewConceptV2Page.tsx`
type: frontend/backend client

`src/services/deckPersoService.ts`, `src/lib/supabase/rpc.ts`
why: due counts, due cards, search, reviews, source/media enrichment
who: app-v2 page, session UI, mission progress, pending review count
type: backend client

`src/features/preview-new-concept/services.ts`, `discussionService.ts`
why: recommendations, contacts, session discussion/audio sharing
who: app-v2 page, session UI
type: frontend/backend client

`src/services/reviewRemindersService.ts`
why: settings page reminder configuration and web-push registration
who: `src/pages/PreviewNewConceptV2Page.tsx`
type: backend client

`src/integrations/supabase/`, `public/runtime-config.json`, `.env.example`
why: standalone runtime configuration for Supabase
who: auth and service layer
type: config

`supabase/functions/preview-youtube-recommendations/`
why: immersion recommendation backend used by app-v2
who: `src/features/preview-new-concept/services.ts`
type: backend

`supabase/functions/review-reminders-config-v1/`, `supabase/functions/review-reminder-web-push-v1/`
why: reminder settings and web-push endpoints
who: `src/services/reviewRemindersService.ts`
type: backend

`supabase/functions/scheduler-due-v1/`, `supabase/functions/scheduler-review-v1/`
why: runtime scheduler path used by current deck service
who: `src/services/deckPersoService.ts`
type: backend

`supabase/functions/collected-card-media/`
why: custom media overlay support used by current card/session flow
who: `src/lib/collectedCardMedia.ts`, `src/services/deckPersoService.ts`
type: backend

`supabase/migrations/`
why: curated schema and RPC history required by the copied frontend/backend surface
who: Supabase project bootstrap and audit trail
type: backend

## Replace

`src/App.tsx`
why: old app shell carried unrelated routes and providers
who: rebuilt locally for app-v2 only
type: frontend shell

`index.html`
why: old boot shell included unrelated site boot behavior
who: rebuilt locally for runtime-config plus Vite boot only
type: frontend shell

`public/_redirects`
why: old redirects targeted unrelated legacy pages
who: rebuilt locally for app-v2 aliases plus SPA fallback
type: infra

`package.json`, `vite.config.ts`
why: old repo scripts and tooling targeted the monolith
who: rebuilt locally for app-v2 standalone build/lint/test/dev
type: config

## Drop

All non-app-v2 route modules and marketing pages.
why: not mounted by the extracted shell
who: previously wired through the old monolith router only
type: frontend

All unrelated scripts, CI, docs, logs, dist output, and repo-specific operational files.
why: not required to build or run app-v2 standalone
who: old repo only
type: config/infra
