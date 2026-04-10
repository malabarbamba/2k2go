# Deck Translation English Reference

Use this reference when the paired skill or agent needs deeper deck-specific guidance for manual Arabic-to-English translation and QA.

## Repository Context

- Main French/source deck: `src/assets/deck-fondations-2k/Fondations-2k.csv`
- English deck under active manual translation: `src/assets/deck-fondations-2k/Fondations-2k-English.csv`
- Locale-aware deck wiring already exists in the app code.
- This workflow is for improving the English deck manually, not for reworking the application wiring.

## Column Priorities

Treat these as the main translation targets:

- `SentFrench`: English sentence translation in the English deck file
- `VocabDef`: short English gloss
- `Note`: learner-facing explanation, when present and visible

Preserve these as non-translation structure unless explicitly requested:

- `SentBase`
- `SentFull`
- `VocabBase`
- `VocabFull`
- `SentAudio`
- `VocabAudio`
- `Image`
- `Focus`
- `Tags`

## Arabic-First Rules

Use Arabic as the source of truth.

- If English matches French but not Arabic, treat it as wrong.
- If English diverges from French but matches Arabic, keep or prefer it.
- If Arabic is idiomatic, produce natural English that preserves meaning rather than copying French phrasing.
- If the highlighted vocabulary word and the full sentence need different English wording, make both accurate separately.

## Typical Error Patterns Already Seen In This Deck

- French leftovers in the English sentence field
- French leftovers in the gloss field
- English copied too closely from French instead of Arabic
- English that is technically understandable but unnatural for learners
- Repeated vocabulary translated inconsistently across nearby rows
- Learner-facing notes still written in French or mixed French-English
- Corrupted rows with temporary markers or partial cleanup notes

## Manual QA Method

For each chunk:

1. Read the full row range before editing.
2. Identify repeated target words across nearby rows.
3. Fix obvious French leakage first.
4. Re-translate doubtful rows from Arabic, not from the old English.
5. Re-read the entire edited chunk for consistency.
6. Summarize the row range and the main correction patterns.

## Meaning Guidance

Prefer translations like these when they best reflect the Arabic:

- `مرحبا` may mean `hello`, `hi`, or `welcome` depending on context.
- `عفوا` may mean `you're welcome`, `sorry`, or `excuse me` depending on context.
- `من فضلك` is usually `please`, not a literal phrase.
- `الحمام` may be `bathroom`, `restroom`, or `pigeon` depending on context, though the deck often signals the intended reading.
- Religious/cultural words such as `حلال`, `رمضان`, and `العيد` should stay natural in English without over-explaining the main field.

## Style Expectations For This Deck

- Favor simple present and straightforward classroom English.
- Prefer `I am hungry` over more formal paraphrases.
- Prefer `Do you know the answer?` over awkward French-shaped English.
- Avoid adding interpretation that is not present in the Arabic.
- Keep note text short, explanatory, and learner-focused.

## Chunk Reporting Template

When reporting progress, include:

- `Rows X-Y reviewed`
- `First-pass translation` or `Second-pass QA`
- `Key fixes:` followed by 2-4 notable corrections
- `Ambiguities:` followed by unresolved rows, if any

## When To Use Web Checks

Use focused web verification only when needed:

- ambiguous particles
- idioms or sayings
- culturally specific expressions
- uncommon verb senses
- cases where Arabic and French both seem questionable

Prefer short dictionary-style confirmation over broad browsing.
