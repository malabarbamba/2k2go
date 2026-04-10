# Contributing

Thanks for helping improve this project.

## Before You Start

- Read `README.md`, `ARCHITECTURE.md`, and `SECURITY.md`.
- For larger changes, open an issue first to align scope.
- For security-sensitive changes, follow `SECURITY.md` and avoid public disclosure before a fix is ready.

## Local Setup

```bash
npm install
npm run dev
```

## Quality Checks

Run these before opening a pull request:

```bash
npm run lint
npm run test
npm run typecheck
npm run build
```

## Pull Request Guidelines

- Keep changes focused and easy to review.
- Include tests when behavior changes.
- Update docs when setup, behavior, or contracts change.
- Explain the why, not only the what.

## Security and Privacy Rules

- Never commit secrets or credentials.
- Never commit `.env` files or production config with live keys.
- Never expose Supabase service-role keys in frontend/runtime config.
- Do not include personal data in examples, fixtures, screenshots, or logs.
- Use placeholders for domains, emails, tokens, and IDs when documenting.

## Licensing and Rights

By submitting a contribution, you confirm that:

- You have the legal right to submit the code/content.
- Your contribution is compatible with this repository's license.
