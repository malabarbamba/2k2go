---
name: Deck English Translation
description: This skill should be used when the user asks to "translate a deck into English", "make an English version of a flashcard deck", "review English deck translations", "check English against Arabic", "make another pass on deck translations", or when a multilingual deck must be translated manually with Arabic as the source of truth and French used only as secondary context.
version: 0.1.0
---

# Deck English Translation

Use this skill with the paired agent at `ai-skills/AGENTS/deck-translation-en__agent.md`.
Load `ai-skills/SKILLS/deck-translation-en__reference.md` when deeper deck-specific guidance is needed.

## Purpose

Translate English-facing deck content manually while treating Arabic as the authoritative source.
Preserve deck structure and learner usefulness even when French glosses or legacy English are wrong.

## Trigger Conditions

Apply this skill when work includes:

- building an English deck from an Arabic or Arabic-French source deck
- revising an existing English deck that contains French leakage
- running Arabic-first QA on a row range
- translating learner-facing note text without damaging CSV structure

## Source Priority

Use this order of authority:

1. Arabic source text
2. Neighboring deck context and repeated vocabulary nearby
3. French as a supporting clue
4. Existing English as draft material only

Follow Arabic when Arabic and French disagree.
Rewrite English when it is natural relative to French but wrong for Arabic.

## Editing Rules

Edit only English-facing content unless explicitly asked for structural changes.
Preserve:

- CSV separators and quoting
- row order and IDs
- audio fields
- image fields
- Arabic fields
- tags, focus values, and metadata unless visible note text needs English cleanup

## Translation Workflow

Follow this sequence:

1. Read a bounded chunk of rows.
2. Identify the Arabic target expression for each row.
3. Judge whether the current English is correct, awkward, or wrong.
4. Rewrite sentence translations and glosses manually from Arabic.
5. Rewrite learner-facing notes in concise English when needed.
6. Run a second-pass QA on the same chunk for consistency and naturalness.

## English Style Rules

Prefer beginner-friendly English on beginner cards.
Prefer direct sentence translations over French-shaped phrasing.
Keep glosses short and useful.
Avoid adding nuance not present in the Arabic.

## Ambiguity Handling

Verify ambiguous words before deciding.
Use focused web checks for particles, social phrases, idioms, and culturally specific terms when local deck context is not enough.

## QA Checklist

After each chunk, verify:

1. Does the English match the Arabic rather than merely the French?
2. Does the gloss match the highlighted Arabic word?
3. Does the sentence sound natural in English?
4. Are repeated words translated consistently nearby?
5. Did any visible notes remain in French?
6. Was CSV structure preserved exactly?

## Repository-Specific Guidance

For the Foundation 2000 workflow in this repository:

- Maintain a separate English deck file instead of changing the French source file.
- Prioritize visible early cards and landing-page content for higher QA attention.
- Report progress by exact row range.
- Call out Arabic-over-French meaning corrections when they are notable.

## Additional Resources

### Reference Files

- `ai-skills/SKILLS/deck-translation-en__reference.md` - Deck-specific rules, common error patterns, chunk reporting, and ambiguity guidance

## Output Expectations

When reporting progress, include:

- exact row range reviewed
- whether the pass was first-pass translation or second-pass QA
- notable Arabic-over-French corrections
- unresolved ambiguities, if any
- whether validation or build checks were run
