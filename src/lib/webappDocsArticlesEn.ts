import {
	WEBAPP_DOCS_FALSE_IDEAS_EN_CONTENT,
	WEBAPP_DOCS_FALSE_IDEAS_EN_SLUG,
	WEBAPP_DOCS_FALSE_IDEAS_EN_SUBTITLE,
	WEBAPP_DOCS_FALSE_IDEAS_EN_TITLE,
} from "@/lib/webappDocsFalseIdeasEn";
import {
	WEBAPP_DOCS_FAQ_EN_CONTENT,
	WEBAPP_DOCS_FAQ_EN_SLUG,
	WEBAPP_DOCS_FAQ_EN_SUBTITLE,
	WEBAPP_DOCS_FAQ_EN_TITLE,
} from "@/lib/webappDocsFaqEn";

type WebappDocsArticle = {
	slug: string;
	title: string;
	subtitle: string;
	content: string;
};

const WEBAPP_DOCS_ARTICLES_BY_SLUG_EN: Record<string, WebappDocsArticle> = {
	"/": {
		slug: "/",
		title: "Welcome",
		subtitle: "The progression framework",
		content: `# Welcome

This guide gives you a complete framework for learning to understand standard Arabic by ear. No classroom teaching, no permanent translation. Whether you're starting from zero or coming back after failing multiple times, the goal is simple: build a system that survives real life.

> **The principle in one sentence**
> Listen to real Arabic every day + consolidate useful vocabulary with [spaced repetition](/start/reviews) = comprehension that builds itself, with 9 minutes of daily reviews.

---

## Where to start

| Your situation | Start here | Why |
|---|---|---|
| Complete beginner | [Who is it for](/introduction/who-is-it-for) | Understand the method before diving in |
| Ready to commit | [The Arabic Roadmap](/understand/arabic-roadmap) | The full map from zero to autonomy |
| You know the method | [How to Do Your Reviews](/start/reviews) | Launch the daily routine immediately |

---

## Next reading

- [Who is it for](/introduction/who-is-it-for)
- [The Arabic Roadmap](/understand/arabic-roadmap)
`,
	},
	"/appendix/glossary": {
		slug: "/appendix/glossary",
		title: "Glossary",
		subtitle: "Definitions of the terms used",
		content: `# Glossary

Quick reference for the terms used in this guide. Each definition is framed around learning Arabic through active immersion.

---

## Key terms

- **Active immersion**: focused work on short authentic content, where you extract reusable vocabulary.
- **Passive immersion**: replaying already-worked content in the background for extra exposure.
- **One-target sentence**: a review card that isolates one useful word inside a real sentence.
- **FSRS**: the scheduling algorithm that predicts the best review moment for each card.
- **Lexical coverage**: the percentage of words in a text or audio stream that you already know.

---

## Next reading

- [Scientific sources](/appendix/sources)
`,
	},
	"/appendix/sources": {
		slug: "/appendix/sources",
		title: "Scientific sources",
		subtitle: "References that support the system",
		content: `# Scientific sources

This system isn't built from motivational slogans or gut feelings. Every component, the exposure, the cards, the review timing, aligns with decades of research on how memory and language acquisition actually work.

---

## Where this method comes from

I want to be upfront about this. The method behind 2k2go is derived almost entirely from **AJATT** (All Japanese All The Time), a language learning approach created by Khatzumoto, and from **Tatsumoto Ren's** adaptation of it. You can find the original at [tatsumoto-ren.github.io](https://tatsumoto-ren.github.io/blog/table-of-contents.html).

These two approaches have changed language learning for hundreds of thousands of people. I used them for Arabic, proved they worked for me, and built 2k2go around them. That's the honest story.

---

## Language acquisition and immersion

- Krashen (1982): comprehensible input as the core engine of acquisition.
- Nation (2001): vocabulary growth through repetition, frequency, and context.
- Krashen (2003): massive exposure and free reading as vocabulary accelerators.

---

## Lexical coverage

- Nation (2006): the size of vocabulary needed for reading and listening.
- Laufer & Ravenhorst-Kalovski (2010): the 95% and 98% lexical thresholds.

---

## Arabic-specific research

- Masrai, A. (2016). *How Different Is Arabic from Other Languages?* Journal of Applied Linguistics and Language Research. The 2,000 most frequent words in Arabic cover about 80% of word occurrences in standard texts. That's the research behind the Foundations 2000 deck and the whole premise of [The Arabic Roadmap](/understand/arabic-roadmap). Full paper: [scispace.com](https://scispace.com/pdf/how-different-is-arabic-from-other-languages-the-u36eqdnwnc.pdf)

- Ferguson (1959): the formal study of Arabic diglossia, the coexistence of Modern Standard Arabic (high variety) with regional dialects (low variety). This is why [The Three Arabics](/understand/the-three-arabics) matter so much.

---

## Memory and review scheduling

Spaced repetition research matters because memory weakens predictably. A well-timed review strengthens recall with less effort than constant repetition.

- Ebbinghaus (1885): the forgetting curve, how memory decays at a predictable rate.
- Roediger & Karpicke (2006): retrieval practice strengthens memory more than passive review.
- Karpicke & Roediger (2008): active retrieval is the key factor in long-term retention.
`,
	},
	"/foundations/grammar": {
		slug: "/foundations/grammar",
		title: "Essential grammar",
		subtitle: "Minimal grammar, at the right moment",
		content: `# Essential grammar

Forget the conjugation tables and the fill-in-the-blank exercises. In this system, grammar isn't a prerequisite. It's an accelerator. Ten well-chosen minutes of grammar can save hours of confusion during immersion.

---

## The real role of grammar

Useful grammar works like a map. It helps you label what you keep seeing in real sentences: a definite article, a connector, a missing verb, a pattern of agreement.

You're not trying to memorize everything at once. You're trying to make immersion more understandable so your brain can do the real work through repeated recognition.

---

## Good dosage

| What helps | What slows you down |
|---|---|
| Read 1 to 3 pages | Spend hours chaining grammar chapters |
| Clarify one blocking structure | Recite full conjugation tables |
| Go back quickly to immersion | Stay trapped in drills |
| Turn one useful example into a card | Create ten abstract grammar cards at once |

---

## When grammar is worth checking

Look up grammar when the same structure blocks you several times in immersion. Read the minimum necessary, then go back to real content so the pattern can settle in context.
`,
	},
	"/foundations/alphabet": {
		slug: "/foundations/alphabet",
		title: "Learn the Arabic alphabet in 2 days",
		subtitle: "A fast method to move from letters to real words",
		content: `# Learn the Arabic alphabet in 2 days

The alphabet is the first concrete step. With 2 to 3 days of focused effort, you can recognize the 28 Arabic letters and their main sounds.

---

## What makes the alphabet manageable

Arabic is an **abjad**: consonants are written, short vowels are often omitted. Writing goes from right to left, and each letter changes shape depending on its position.

That sounds intimidating until you notice the shortcut: many letters belong to visual families and differ only by dots.

---

## Learn by families

| Family | Letters |
|---|---|
| ب-family | ب ت ث |
| ج-family | ج ح خ |
| س-family | س ش |
| ص-family | ص ض |
| ط-family | ط ظ |
| ع-family | ع غ |
| ف-family | ف ق |

Learning by family is faster than memorizing isolated shapes.

---

## The main exception

Six letters don't connect to the following letter: **ا د ذ ر ز و**. When they appear, the connection stops and the next letter restarts.

---

## The goal

Don't aim for perfect calligraphy. Aim for fast recognition. Once letters stop slowing you down, real vocabulary work can begin.
`,
	},
	"/foundations/reading-vowels": {
		slug: "/foundations/reading-vowels",
		title: "Reading and vowels",
		subtitle: "Read without vowels, progressively",
		content: `# Reading and vowels

Arabic often omits short vowels in everyday writing. That's the feature that unsettles beginners the most, but it becomes manageable with a progressive approach.

---

## Two kinds of vowels

| Type | Example | Visibility |
|---|---|---|
| Long vowels | ا ، و ، ي | Always visible |
| Short vowels | fatha, kasra, damma | Usually omitted |

Pedagogical and religious texts often keep short vowels. Everyday Arabic usually doesn't.

---

## Three stages of reading

1. **Fully vocalized texts**: everything is marked.
2. **Partially vocalized texts**: some vowels are present, others are inferred.
3. **Unvocalized texts**: the norm in modern Arabic.

As vocabulary grows, recognition becomes visual and contextual. Missing vowels stop feeling like missing information.

---

## The practical rule

Use vocalized material at the beginning, then let immersion gradually teach your brain to predict the unmarked forms.
`,
	},
	"/understand/the-three-arabics": {
		slug: "/understand/the-three-arabics",
		title: "The Three Arabics",
		subtitle: "Which Arabic should you actually learn?",
		content: `# The Three Arabics

**Which Arabic should I learn?**

Modern Standard Arabic (MSA). It's the one that works everywhere: news, education, formal writing, all 22 Arab countries and also many more knowing that for example, in Pakistan or Malaysia it is easy to find someone in a mosque that speaks MSA. Everything else comes after. That's why I chose MSA for 2k2go. Read below for a breakdown.

---

## Three varieties, three very different purposes

| Variety | Main use | Geographic reach |
|---|---|---|
| **Modern Standard Arabic** | Media, education, formal speech, writing | All Arab countries |
| **Classical Arabic** | Religious texts, classical literature | Literary, not everyday |
| **Dialects** (Egyptian, Moroccan, Gulf...) | Daily conversation | One region only |

These aren't just accents of the same language. A dialect spoken in Morocco is not understood in Saudi Arabia. And Classical Arabic is not what people use at work or on the news.

---

## Why MSA is the right starting point

**It's universal.** One person who knows MSA can follow the news, read a newspaper, have a formal conversation, and understand content from any Arab country. No other variety gives you that.

**It bridges into dialects.** Dialects evolved out of Arabic. Once you have a solid MSA base, a dialect becomes a set of local variations to add, not a whole new language to learn from scratch. The reverse doesn't work: learning Moroccan Darija doesn't give you a path into Gulf Arabic or MSA.

**It opens religious and classical content.** MSA is close enough to Classical Arabic that a strong foundation makes religious texts accessible. The gap is real, but it's bridgeable. Not like learning a completely different language.

---

## The dialect trap

A lot of learners start with a dialect because it feels more "real" or useful for a specific trip or family connection. That's understandable. But you end up investing years into a variety understood by one region, with almost no overlap into other parts of the Arab world.

If your goal is long-term Arabic comprehension, not just one country's dialect, MSA is the door. Dialects are rooms inside the house.

---

## The recommended order

1. **MSA first**: build broad comprehension
2. **Local dialect**: add it when you have a specific regional need
3. **Classical Arabic**: for religious or literary depth, if that's relevant to you

---

## Next reading

- [The Arabic Roadmap](/understand/arabic-roadmap)
`,
	},
	"/understand/massive-immersion": {
		slug: "/understand/massive-immersion",
		title: "Massive immersion",
		subtitle: "The exposure volume you need",
		content: `# Massive immersion

Exposure volume is what separates "knowing some words" from "understanding by ear." Your brain needs repeated contact with the language to build fast recognition.

---

## Why volume matters

Words become stable when you meet them many times across varied contexts.

| Number of encounters | Effect |
|---|---|
| 1 | quickly forgotten |
| 3 to 5 | vaguely familiar |
| 8 to 10 | usable anchor |
| 15+ | automatic recognition |

---

## Massive doesn't mean exhausting

Massive immersion doesn't mean spending all day in front of a screen. It means multiplying contact points through a mix of active and passive immersion.

Short, repeatable sessions beat rare heroic efforts.
`,
	},
	"/understand/spaced-repetition": {
		slug: "/understand/spaced-repetition",
		title: "Spaced repetition",
		subtitle: "Review less, retain more",
		content: `# Spaced repetition

Spaced repetition is the mechanism that lets you retain thousands of Arabic words with limited daily time. The principle is simple: review a word just before you'd forget it.

---

## The problem it solves

Without review, most words fade. Reviewing too early wastes time. Reviewing too late means relearning.

| Situation | Result |
|---|---|
| Too early | unnecessary effort |
| Too late | relearning cost |
| At the right time | efficient consolidation |

---

## FSRS in practice

2k2go uses **FSRS**. It estimates for each card:

- **stability**: how anchored the word is
- **difficulty**: how resistant it is for you
- **recall probability**: how close it is to slipping

The algorithm does the scheduling so you can focus on honest answers and consistent daily work.
`,
	},
	"/understand/arabic-roadmap": {
		slug: "/understand/arabic-roadmap",
		title: "The Arabic Roadmap",
		subtitle: "3 months to being understood and understanding natives",
		content: `# The Arabic Roadmap

3 months. Intense, but if you follow it, you'll be able to be understood and understand natives. It's the most direct path.

---

## Before anything: make Arabic part of your daily life

Before any method, course, or app, do one thing: start playing Arabic content in the background.

YouTube news clips, podcasts, educational videos, news — whatever. Don't worry about understanding. The goal right now is familiarity. Your ear needs to get used to the sounds, the rhythm, the flow. This is passive exposure, and it costs almost no effort.

Cut distractions where you can. Attention is a limited resource. The less it's scattered, the faster acquisition goes.

What you get at the end of this phase: Arabic stops sounding alien. You're ready for Phase 1.

---

## Phase 1: The foundations (about 1 month)

Five things run in parallel.

**1. Learn the Arabic alphabet (days 1 to 3)**

28 letters, each with 4 forms depending on position. Don't aim for perfect calligraphy. Aim for fast recognition. Many letters share the same base shape and only differ by dots, which makes them easier to group. With a dedicated alphabet deck and focused effort, most learners reach functional recognition in 2 to 3 days.

**2. Start your vocabulary acquisition**

Research shows that the 2,000 most frequent words in Arabic cover about 80% of what you'll encounter in standard texts (Masrai, 2016). That's the threshold where immersion stops feeling like pure noise and starts making partial sense. The Foundations deck is pre-built with those 2,000 words, reviewed daily using FSRS.

**3. Read a grammar guide (15 to 30 minutes per day)**

Grammar here is not a prerequisite. It's a decoder. You're not trying to master everything. You're trying to understand enough structure so immersion starts to make sense faster.

Two free PDFs that cover what you need:
- [Arabic Verbs & Essentials of Grammar (PDF)](https://institutes.abu.edu.ng/idr/public/assets/docs/Arabic%20Verbs%20&%20Essentials%20of%20Grammar%20(%20PDFDrive%20).pdf)
- [Medina Book 1 grammar guide (PDF)](https://dn710800.ca.archive.org/0/items/MadinaBooksHandouts/Book1.pdf)

One thing to keep in mind: these guides may contain language learning advice that conflicts with this method. Use their grammar explanations, ignore their learning strategy recommendations.

**4. Launch your daily review session**

Every day. No exceptions. This is the non-negotiable part of the system. The FSRS algorithm schedules each card at the moment you're about to forget it. See [How to Do Your Reviews](/start/reviews) for the full grading approach.

**5. Build your personal deck from immersion**

Every time you watch or listen to Arabic content, extract 1 to 3 words you want to keep. Turn them into cards. This deck grows with you and reflects the vocabulary you actually encounter in real content. It's yours, not a pre-made list.

---

## Phase 2: Growth (about 3 months)

Once the foundations are solid, the system accelerates on its own.

**Switch to Arabic subtitles.** This is a big shift. When you stop reading French or English subtitles and start reading Arabic ones, the language stops being filtered through translation. It's harder at first. Then it becomes the biggest accelerator you have.

**Diversify your content.** News, documentaries, religious content, business talks, comedy. Each new domain brings its own vocabulary patterns, and the overlap between domains is what builds general fluency. Don't stick to one type of content forever.

**Go monolingual gradually.** At first, your cards have French or English translations. As your vocabulary grows, start defining words in Arabic directly. This transition kills the mental translation habit: the automatic step of converting Arabic into your native language before understanding it.

**Let speech emerge.** Don't force output early. Speaking ability develops from listening comprehension. When you've built a strong recognition base, words and structures start surfacing naturally when you try to speak. Imitation exercises (repeating phrases after native speakers) help calibrate pronunciation.

---

## Phase 3: Mastery (ongoing)

At this point, you understand most standard Arabic content. The work changes character.

**Stop filtering by frequency.** Earlier phases focused on frequent words. Now you learn every unknown word you encounter.

**Target your weak areas.** Some domains are harder than others. Go after the content that still trips you up.

**Read Arabic to think in Arabic.** History, culture, literature. The language becomes a tool for thought, not just a filter.

**Keep going.** The system doesn't stop. It evolves with you.

---

## Overview

| Phase | Goal | Rough duration |
|---|---|---|
| Phase 0 | Build daily immersion environment | 1 to 3 days |
| Phase 1 | Alphabet + Foundations 2000 + grammar basics + review routine | About 1 month |
| Phase 2 | Arabic subtitles, content diversification, monolingual transition | About 3 months |
| Phase 3 | Mastery, culture, advanced registers | Ongoing |

Durations depend on time invested and consistency. The system adapts to your pace.

---

## Next reading

- [The One-Target Sentence](/start/one-target-sentence)
- [How to Do Your Reviews](/start/reviews)
`,
	},
	"/understand/active-immersion-system": {
		slug: "/understand/active-immersion-system",
		title: "The active immersion system",
		subtitle: "Exposure, consolidation, repetition",
		content: `# The active immersion system

This is the core mechanism of 2k2go: listen to real Arabic every day, extract useful material, and stabilize it with smart review cards.

---

## Why immersion works

Your brain acquires language by processing understandable messages repeatedly. That's why real exposure matters more than rule memorization alone.

---

## The three moving parts

| Component | Role |
|---|---|
| Exposure | gives raw language material |
| Consolidation | turns exposure into stable recognition |
| Repetition | brings back material at the right time |

---

## The loop

You listen, notice, extract, review, then meet the same material again in new contexts. That loop is what transforms knowledge into fast recognition.
`,
	},
	"/start/one-target-sentence": {
		slug: "/start/one-target-sentence",
		title: "The One-Target Sentence",
		subtitle: "One unknown word per card, inside a real sentence",
		content: `# The One-Target Sentence

**Why do standard flashcards stop working after a few weeks?**

Because the card format is wrong. The format you use matters more than the deck, more than the app, more than the hours you put in. One sentence, one target word, with the whole sensory package around it. That's not a detail. It's the entire game.

---

## The format

A one-target sentence card contains:

- one real Arabic sentence
- one **target word** inside it, the word being learned on this card
- everything else in the sentence already known

The card tests one thing: can you recall the target word the moment you see the sentence. If yes, pass. If no, fail. The rest of the sentence is not being tested.

There is a rule that comes with this format: do not fail a card because you could not recall a word that is not the target word. If the target came back, the card is a pass. The other words will get their own cards later.

---

## Why one target and not more

Having to recall several unknown words at once lowers retention. When a card has two or three unknowns, retrieval gets tangled. You fail the card, you review it, you fail it again. The memory never forms cleanly because the brain is trying to rebuild too much at the same time.

Splitting the same material into separate one-target cards is counterintuitively faster. Each retrieval is clean. The memory forms on one word at a time. The scheduler can do its job.

The AJATT community calls the underlying strategy *picking low-hanging fruit*. Learn what is one lookup away from being learnable right now. Leave the rest for later, when it will also be one lookup away.

The system self-sorts. A sentence that is too hard today becomes a one-target sentence later, after you have learned one of its words elsewhere. Nothing has to be forced.

---

## The 2k2go card format

A 2k2go card is not just a sentence and a translation. Each card contains five elements built around one target word:

- **Target word**: highlighted in the sentence, the one word being learned on this card
- **Target word audio**: native-voice recording of the target word alone
- **Sentence audio**: native-voice recording of the full sentence
- **Arabic script**: the sentence written in Arabic script
- **Image**: an image that matches the meaning of the sentence

<figure style="text-align: center;">
<img src="/images/docs/one-target-sentence-card.png" alt="A one-target sentence card showing an Arabic sentence with the target word highlighted, the target word alone with audio, its translation, and a matching image" style="display: block; margin: 0 auto; outline: none; border: none;" />
<figcaption><em>Figure: One-target sentence card layout.</em></figcaption>
</figure>

All five elements point at the same target word during the review. The eye sees the script and the image. The ear hears the word and the sentence. Attention is concentrated on one meaning at a time.

This is different from a printed vocabulary list, which gives one written form and one translation, decoded in silence. The one-target sentence card gives multiple sensory inputs tied to a single meaning, reviewed on a schedule that matches how memory consolidates. Sight, sound, and meaning arrive together, which is the condition memories need to anchor in a target language.

---

## The grading rule

- **Pass**: the target word came back instantly. No pause, no translation step, no uncertainty.
- **Fail**: anything else.

The scheduler (FSRS) can only work if grading is honest. A generous pass today becomes a dead review next week.

---

## How FSRS uses the grades

FSRS tracks three values for every card: stability (how anchored the memory is), difficulty (how hard the word is for you), and recall probability (its current estimate of whether you would remember it right now).

It uses these to schedule the next review at the moment the card is about to slip below your target retention. Easy cards stretch out to weeks or months between reviews. Hard cards come back more often.

The result: 9 minutes of daily reviews covers more vocabulary than a longer session on a worse schedule, because most cards are only shown when they actually need reinforcement.

---

## Common mistakes

- Adding cards that contain two or more unknown words
- Failing a card because of a word that is not the target
- Adding too many new cards per day (new-card load compounds fast)
- Translating the full sentence in your head during review instead of recognizing the target word

---

## Next reading

- [How to Do Your Reviews](/start/reviews)
- [Reproducing This in Anki](/start/anki-setup)
- [The Arabic Roadmap](/understand/arabic-roadmap)
`,
	},

	"/start/anki-setup": {
		slug: "/start/anki-setup",
		title: "Reproducing This in Anki",
		subtitle: "The settings 2k2go uses, adapted for Anki",
		content: `# Reproducing This in Anki

**Can I run this method in Anki instead of 2k2go?**

Yes. The parameters below are the ones behind this method, adapted for Anki's SM-2 scheduler (2k2go runs FSRS directly). They work if, and only if, your cards are [one-target sentences](/start/one-target-sentence). The scheduler cannot fix a bad card format. Fix the format first, then apply the settings.

---

## The prerequisite

The most important part of this article is not the numbers below. It is this:

Without one-target sentences, no Anki settings will produce the results you are looking for. The scheduler schedules what you give it. Good cards on good settings work. Bad cards on good settings is just garbage.

If your cards are word-to-translation pairs or multi-target sentences, rebuild the card format before touching deck options.

---

## Credit

These parameters come from the **AJATT** community (All Japanese All The Time), founded by Khatzumoto. AJATT is the original source of the immersion-first approach to language learning. Thousands of people have used it to reach fluency in Japanese and other languages. The method behind 2k2go is an adaptation of that work for Arabic learners.

The work belongs to them. We pass it forward here.

---

## The settings

Open Anki and create an options group called **Sentence cards**. Apply the values below. Two versions are listed for each section: the classic UI and the new UI (Anki 23.10+).

### New Cards

**Classic UI (Tab: New Cards)**

| Setting | Value |
|---|---|
| Steps (in minutes) | \`1 10 360\` |
| Order | Show new cards in order added |
| New cards/day | \`0\` (set per deck as needed) |
| Parent limit | \`99\` |
| Graduating interval | \`2\` days |
| Easy interval | \`4\` days |
| Starting ease | \`131%\` |
| Bury related new cards until the next day | No |

**New UI (Tab: New Cards)**

| Setting | Value |
|---|---|
| Learning steps | \`2m 14m\` |
| Graduating interval | \`1\` day |
| Easy interval | \`3\` days |
| Insertion order | Sequential (oldest cards first) |

### Reviews

**Classic UI (Tab: Reviews)**

| Setting | Value |
|---|---|
| Maximum reviews/day | \`9999\` |
| Parent limit | \`9999\` |
| Easy bonus | \`100%\` |
| Interval modifier | \`192%\` |
| Maximum interval | \`36500\` days |
| Hard interval | \`120%\` |
| Bury related reviews until the next day | No |

The interval modifier at **192%** is the value most people never change. Anki's default is 100%. At 192%, review intervals grow close to twice as fast, which trades a small amount of retention for a large reduction in daily review count. Daily reviews stay short enough to maintain consistently.

### Lapses

**Classic UI (Tab: Lapses)**

| Setting | Value |
|---|---|
| Steps (in minutes) | \`15 720\` |
| New interval | \`55%\` |
| Minimum interval | \`2\` days |
| Leech threshold | \`6\` lapses |
| Leech action | Suspend Card |

**New UI (Section: Lapses)**

| Setting | Value |
|---|---|
| Relearning steps | \`16m 1h\` |
| Minimum interval | \`1\` day |
| Leech threshold | \`6\` lapses |
| Leech action | Suspend Card |

A card that fails six times usually has something wrong with it, most often two unknown words hidden inside what was supposed to be a one-target sentence. Suspend it and rebuild it from a cleaner example.

### Display Order

**New UI only (Section: Display Order)**

| Setting | Value |
|---|---|
| New card gather order | Deck |
| New card sort order | Card type, then order gathered |
| New/review order | Show before reviews |
| Interday learning/review order | Mix with reviews |
| Review sort order | Descending retrievability |

*Descending retrievability* means reviews come back in the order of which card is closest to being forgotten. The most fragile memories come up first, while attention is still fresh.

---

## What the cards themselves need to contain

The settings only work on cards built in the one-target sentence format. A minimum viable card has:

- one target word, visibly marked in the sentence (bold, color, highlight)
- the full Arabic sentence
- audio of the target word, isolated
- audio of the full sentence
- an image matching the meaning of the sentence

Tools for building this pipeline include Yomitan-style browser pop-up dictionaries, mpv with subtitle extraction, and subs2srs for converting video subtitles into batches of sentence cards. Card templates are available in AJATT documentation and can be adapted for Arabic.

---

## Next reading

- [The One-Target Sentence](/start/one-target-sentence)
- [How to Do Your Reviews](/start/reviews)
- [The Arabic Roadmap](/understand/arabic-roadmap)
`,
	},
	"/start/foundations-2000": {
		slug: "/start/foundations-2000",
		title: "Foundations 2000",
		subtitle: "The 2000 most frequent words",
		content: `# Foundations 2000

Mastering the 2,000 most frequent words in standard Arabic gives you roughly 80% coverage of ordinary texts. That coverage is the threshold that makes immersion productive instead of frustrating.

---

## Why 2,000 words matter

| Number of words | Approximate coverage |
|---|---|
| 1,000 | around 70% |
| 2,000 | around 80% |
| 3,000 | around 85% |
| 5,000 | around 90% |

---

## How to use it

The Foundations deck supports daily reviews. It does **not** replace your personal deck. It complements it.

- **Foundations deck**: frequent words you must meet early
- **Personal deck**: words extracted from your own immersion

The ideal pattern is simple: first meet a word in the Foundations deck, then hear it again in real content.
`,
	},
	"/start/reviews": {
		slug: "/start/reviews",
		title: "How to Do Your Reviews",
		subtitle: "Grading honestly, building a routine that lasts",
		content: `# How to Do Your Reviews

**How do I know if I'm reviewing correctly?**

One rule: if you hesitated even slightly, it's a fail. Honest grading is what keeps the entire system calibrated. It's the difference between people who build real comprehension and people who collect cards they can't actually use.

---

## The only grading rule

You have two answers: **Fail** or **Pass**.

A card counts as passed if and only if you recognized the target word **immediately**. Before flipping, without extended thought, without going "I think it was...". If recognition was slow, even if you got it right, that's a fail. Grade it as such.

This sounds strict. It is. Here's why it matters.

---

## Why honest grading is non-negotiable

The FSRS algorithm builds a model of your memory for each card. When you pass a card, it extends the interval before showing you that card again. When you fail, it shortens it.

If you grade generously (passing cards you hesitated on) the algorithm thinks those words are more stable than they really are. It stretches their intervals too far. Weeks later, you've "forgotten" words you thought you knew, reviews pile up, and the whole system feels broken.

Honest grading isn't about being hard on yourself. It's about feeding the algorithm accurate data so it can do its job.

---

## The 9-minute routine

Nine minutes is the typical time for daily reviews when you have a steady card load and a consistent routine. It's not a marketing number. It's what FSRS actually produces when you maintain a card load of a few hundred active words.

The format:
1. Open reviews
2. For each card: see the front, decide immediately (pass or fail), flip to check
3. Stop when the queue is empty

That's it. Every day. The consistency is the mechanism.

---

## What to do when the pile gets heavy

If you miss several days, the review queue grows. Don't try to catch up by cramming. Don't skip more days.

Instead:
- **Stop adding new cards temporarily.** Wait until the queue is back to a manageable size.
- **Review at the normal pace.** Don't extend sessions to compensate. Just maintain the daily habit.
- **Be patient.** It takes a few days of normal reviewing to drain a backlog, not one heroic session.

The goal is to rebuild continuity. Continuity is what makes the system work. Crammed sessions don't replace it.

---

## Common mistakes

**Grading too generously.** "I kind of knew it" is a fail. "I would have gotten it in a second" is a fail.

**Skipping reviews on busy days.** A 4-minute review on a busy day beats a 0-minute review. Keep the streak alive, even if the session is minimal.

**Adding too many new cards.** More than 10 to 15 new cards per day creates a review debt that builds up fast. Start slow.

**Treating reviews as a chore to finish.** Reviews aren't homework. They're the moment where words that would have faded are rescued. That's a useful thing to do.

---

## Next reading

- [The One-Target Sentence](/start/one-target-sentence)
- [The Arabic Roadmap](/understand/arabic-roadmap)
`,
	},
	[WEBAPP_DOCS_FAQ_EN_SLUG]: {
		slug: WEBAPP_DOCS_FAQ_EN_SLUG,
		title: WEBAPP_DOCS_FAQ_EN_TITLE,
		subtitle: WEBAPP_DOCS_FAQ_EN_SUBTITLE,
		content: WEBAPP_DOCS_FAQ_EN_CONTENT,
	},
	[WEBAPP_DOCS_FALSE_IDEAS_EN_SLUG]: {
		slug: WEBAPP_DOCS_FALSE_IDEAS_EN_SLUG,
		title: WEBAPP_DOCS_FALSE_IDEAS_EN_TITLE,
		subtitle: WEBAPP_DOCS_FALSE_IDEAS_EN_SUBTITLE,
		content: WEBAPP_DOCS_FALSE_IDEAS_EN_CONTENT,
	},
	"/immersion/active": {
		slug: "/immersion/active",
		title: "Active immersion",
		subtitle: "Extract vocabulary from real content",
		content: `# Active immersion

Active immersion is the moment when vocabulary enters the system. You work on a short authentic clip, aim for global meaning, then extract 1 to 3 reusable items into cards.

---

## A standard 12-minute session

| Step | Time | Goal |
|---|---|---|
| First pass | 2 min | get the overall meaning |
| Focused replay | 4 min | find recurring words and useful segments |
| Extraction | 3 min | create 1 to 3 cards |
| Flash review | 3 min | install the first contact |

---

## Choosing content

Use short excerpts, ideally 2 to 4 minutes, with roughly 60% global comprehension. The material should be authentic, not learner-only content.

---

## Three classic mistakes

- watching without extracting cards
- translating word by word
- trying to harvest too much from a single clip
`,
	},
	"/immersion/passive": {
		slug: "/immersion/passive",
		title: "Passive immersion",
		subtitle: "Reinforce with almost no concentration cost",
		content: `# Passive immersion

Passive immersion is free exposure time: replaying already-worked material in the background while walking, cooking, commuting, or doing light tasks.

---

## The rule

Only use material that was already processed in active immersion. Unknown background audio is just noise. Familiar material creates reinforcement.

---

## Good moments for passive immersion

- commuting
- walking
- cooking
- cleaning
- light exercise

---

## Place in the system

1. daily card reviews
2. weekly active immersion
3. passive immersion as a bonus multiplier
`,
	},
	"/introduction/who-is-it-for": {
		slug: "/introduction/who-is-it-for",
		title: "Who is it for",
		subtitle: "And where this method actually comes from",
		content: `# Who is it for

**Is this method right for me?**

If you've tried to learn Arabic before and it didn't stick, yes. If you want something based on how your brain actually acquires language, not how textbooks present it, yes. Here's the honest version of what this is and where it came from.

---

## Where this came from

I failed at Arabic multiple times. Evening classes, grammar books, apps with streaks. I spent years feeling like I was learning without actually getting anywhere. The vocabulary I "knew" evaporated as soon as I heard real speech.

The change came when I found **AJATT** (All Japanese All The Time), a language learning method created by Khatzumoto, and later refined by **Tatsumoto Ren** in his open-source immersion guide. You can find the original at [tatsumoto-ren.github.io](https://tatsumoto-ren.github.io/blog/table-of-contents.html). Between them, these two approaches have changed language learning for hundreds of thousands of people. They've fundamentally changed how people think about acquiring a language. Their work is the source of this method, and I'm not going to pretend otherwise.

What I did: I used it for Arabic. I proved it worked for myself. Then I talked with teachers and more advanced learners, showed them the approach, and watched them adopt it. Some used it on its own, some mixed it with courses they were already taking. It's compatible either way. That's where 2k2go comes from. It's that method, built for Arabic, with a dedicated tool to support the daily review habit.

---

## What the method actually is

Two things working together:

1. **Daily exposure to real Arabic.** Authentic audio and video, not textbook sentences. Your brain needs real language to build real recognition.
2. **9 minutes of daily spaced review.** A system that brings words back at the right time, just before you'd forget them. Not flashcard cramming. A calibrated algorithm that manages the schedule for you.

That's the whole system. Everything in this guide is either explaining those two things or helping you do them consistently.

---

## Who this is actually for

| Profile | Situation | What changes with this method |
|---|---|---|
| Restart after failure | tried classes or apps without lasting results | a mechanism stronger than raw motivation |
| Complete beginner | starting from zero | a clear path from alphabet to comprehension |
| Theoretical learner | knows rules but can't follow audio | the shift from abstract knowledge to live recognition |
| Long-term goal | religious, professional, family, or cultural | a standard Arabic base that transfers everywhere |

The motivation can be anything: work, family, religion, culture, or just genuine interest. The method doesn't change based on why you're learning.

---

## What you need to commit to

A short daily block. Nine minutes for reviews, a few times a week for immersion. Early exposure even when you don't understand everything. That discomfort is part of the process. And honest self-assessment, because the grading system only works if you're truthful about what you actually know.

That's the real prerequisite. Not talent, not prior exposure to Arabic, not perfect memory. Just regularity.

---

## Next reading

- [The Three Arabics](/understand/the-three-arabics)
- [The Arabic Roadmap](/understand/arabic-roadmap)
`,
	},
	"/introduction/origin": {
		slug: "/introduction/origin",
		title: "The origin of the system",
		subtitle: "From Japan to Arabic",
		content: `# The origin of the system

This page explains how repeated failure with Arabic eventually led, through an unexpected detour via Japanese, to the system used in 2k2go.

---

## Years of failing at Arabic

The starting point was familiar: weekend classes, slow progress, fragmented lessons, and the feeling of spending time without truly learning. Arabic became associated with frustration instead of momentum.

---

## The turning point

The real change came from seeing another language learned differently. More exposure, more direct contact, more systems thinking, less dependence on classroom pacing.

---

## What the system kept

The final method kept only what clearly worked:

- authentic input
- repeated exposure
- targeted card review
- a routine small enough to survive daily life

That's the origin of 2k2go: not theory first, but a method extracted from real failure and real correction.
`,
	},
};

export { WEBAPP_DOCS_ARTICLES_BY_SLUG_EN };

export type { WebappDocsArticle };
