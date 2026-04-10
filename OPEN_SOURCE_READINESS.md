# Open Source Readiness Checklist

This checklist is for pre-release hardening before publishing changes publicly.

## Security and Secrets

- [ ] No credentials, tokens, or private keys in tracked files.
- [ ] Runtime config and examples use placeholders or local-only values.
- [ ] `SECURITY.md` is present and private disclosure flow is clear.
- [ ] CI includes secret scanning and dependency checks.
- [ ] GitHub Secret Scanning and Push Protection are enabled in repository settings.

## Supply Chain and Dependencies

- [ ] Dependencies are explicit and install is reproducible.
- [ ] Dependabot is configured for dependency and Actions updates.
- [ ] Critical dependency risks are tracked and triaged.

## Community and Contributor Experience

- [ ] README explains what the project does, why it exists, and how to run it.
- [ ] `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `SUPPORT.md` are present.
- [ ] Issue/PR templates set quality and security expectations.

## Governance and Scope

- [ ] Scope is documented to avoid feature creep.
- [ ] Maintainer response expectations are realistic.
- [ ] Large changes require issue-first discussion.
- [ ] Branch protection is enabled for `main` (required PR reviews, status checks).

## Legal and Licensing

- [ ] License is explicit and compatible with project goals.
- [ ] Contributors are informed they must have rights to submitted code.
- [ ] Any dual-license or CLA decision is documented before external contributions.

## Common Rookie Mistakes to Avoid

- [ ] Publishing without clear setup docs.
- [ ] Accepting every feature PR and increasing long-term maintenance cost.
- [ ] Delaying hard decisions about scope and architecture.
- [ ] Assuming contributors will appear without onboarding documentation.
- [ ] Treating public PRs as a safe place for undisclosed security fixes.
