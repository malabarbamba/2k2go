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

This guide gives you a complete framework for learning to understand standard Arabic by ear without relying on classroom-style teaching or permanent translation. Whether you are starting from zero or returning after repeated failures, the goal here is simple: build a system that survives real life.

> **The principle in one sentence**
> Listen to real Arabic every day + consolidate useful vocabulary with [spaced repetition →](/comprendre/la-repetition-espacee) = comprehension that builds itself, with [9 minutes of daily reviews →](/demarrer/faire-ses-revues).

---

## Where to start

| Your situation | Start here | Why |
|---|---|---|
| Complete beginner | [The Arabic alphabet →](/bases/lalphabet-arabe) | Letter recognition is the first concrete step |
| Fragile foundations, need structure | [The standard path →](/comprendre/le-parcours-type) | It gives you the full map from zero to autonomy |
| You already understand the method | [Do your reviews →](/demarrer/faire-ses-revues) | You can launch the daily routine immediately |

---

## What you will actually build

The first useful progress in Arabic is not knowing facts *about* the language. It is recognizing words and patterns quickly and without effort. That recognition grows through two mechanisms working together:

- **Exposure**: real standard Arabic audio and video so the ear adapts to rhythm, sound, and recurring structures.
- **Consolidation**: review cards that bring back useful words at the right time, just before forgetting.

When both are active, volume accumulates while mental load stays manageable.

---

## Next reading

- [The active immersion system →](/comprendre/le-systeme-dimmersion-active)
- [Do your reviews →](/demarrer/faire-ses-revues)
- [The standard path →](/comprendre/le-parcours-type)
`,
	},
	"/annexes/glossaire": {
		slug: "/annexes/glossaire",
		title: "Glossary",
		subtitle: "Definitions of the terms used",
		content: `# Glossary

This glossary defines the technical terms used in the documentation. Each definition is framed in the context of learning Arabic through active immersion.

---

## Key terms

- **Active immersion**: focused work on short authentic content with extraction of reusable vocabulary.
- **Passive immersion**: replaying already-worked content in the background for extra exposure.
- **Single-target card**: a review card that isolates one useful word inside a real sentence.
- **FSRS**: the scheduling algorithm that predicts the best review moment for each card.
- **Lexical coverage**: the percentage of words in a text or audio stream that you already know.

---

## Next reading

- [Scientific sources →](/annexes/sources-scientifiques)
`,
	},
	"/annexes/sources-scientifiques": {
		slug: "/annexes/sources-scientifiques",
		title: "Scientific sources",
		subtitle: "References that support the system",
		content: `# Scientific sources

The active immersion system is based on established principles from applied linguistics and cognitive science. This page groups the references that support its main components: exposure, spaced repetition, lexical coverage, and Arabic-specific constraints.

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

## Memory and review scheduling

Spaced repetition research matters because memory weakens predictably. A well-timed review strengthens recall with less time than constant repetition.

---

## Why this matters

This system is not built from motivational slogans. Its pieces are chosen because they line up with what research says about durable vocabulary acquisition.
`,
	},
	"/bases/grammaire-essentielle": {
		slug: "/bases/grammaire-essentielle",
		title: "Essential grammar",
		subtitle: "Minimal grammar, at the right moment",
		content: `# Essential grammar

Forget endless conjugation tables and blank-filling exercises. In this system, grammar is not a prerequisite. It is an **accelerator**. Ten well-chosen minutes of grammar can save hours of confusion during immersion.

---

## The real role of grammar

Useful grammar acts like a map. It helps you label what you keep seeing in real sentences: a definite article, a connector, a missing verb, a pattern of agreement.

The goal is not to memorize everything at once. The goal is to make immersion more understandable so the brain can do the real work through repeated recognition.

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

Look up grammar when the same structure blocks you several times in immersion. Read the minimum necessary, then return to real content so the pattern can settle in context.
`,
	},
	"/bases/lalphabet-arabe": {
		slug: "/bases/lalphabet-arabe",
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

Six letters do not connect to the following letter: **ا د ذ ر ز و**. When they appear, the connection stops and the next letter restarts.

---

## The goal

Do not aim for perfect calligraphy. Aim for fast recognition. Once letters stop slowing you down, real vocabulary work can begin.
`,
	},
	"/bases/lecture-et-voyelles": {
		slug: "/bases/lecture-et-voyelles",
		title: "Reading and vowels",
		subtitle: "Read without vowels, progressively",
		content: `# Reading and vowels

Arabic often omits short vowels in everyday writing. That is the feature that unsettles beginners the most, but it becomes manageable with a progressive approach.

---

## Two kinds of vowels

| Type | Example | Visibility |
|---|---|---|
| Long vowels | ا ، و ، ي | Always visible |
| Short vowels | fatha, kasra, damma | Usually omitted |

Pedagogical and religious texts often keep short vowels. Everyday Arabic usually does not.

---

## Three stages of reading

1. **Fully vocalized texts**: everything is marked.
2. **Partially vocalized texts**: some vowels are present, others are inferred.
3. **Unvocalized texts**: the norm in modern Arabic.

As vocabulary grows, recognition becomes visual and contextual, so missing vowels stop feeling like missing information.

---

## The practical rule

Use vocalized material at the beginning, then let immersion gradually teach your brain to predict the unmarked forms.
`,
	},
	"/comprendre/arabe-standard-arabe-classique-dialectes": {
		slug: "/comprendre/arabe-standard-arabe-classique-dialectes",
		title: "Standard Arabic, Classical Arabic, dialects",
		subtitle: "Choosing the right base",
		content: `# Standard Arabic, Classical Arabic, dialects

Before learning Arabic, you need to answer one question most systems avoid: *which Arabic?* The answer changes years of effort.

---

## Three varieties

| Variety | Main use | Reach |
|---|---|---|
| Modern Standard Arabic | Media, education, formal speech, writing | Shared across the Arab world |
| Classical Arabic | Religious texts, classical literature | Literary, not everyday |
| Dialects | Daily conversation | Region-limited |

---

## Why start with standard Arabic

Standard Arabic gives you the widest return:

- access to media and formal content across countries
- a bridge toward dialects later
- partial continuity with classical Arabic

Starting with a dialect narrows your initial reach. Starting with standard Arabic keeps the broadest door open.
`,
	},
	"/comprendre/immersion-massive": {
		slug: "/comprendre/immersion-massive",
		title: "Massive immersion",
		subtitle: "The exposure volume you need",
		content: `# Massive immersion

Exposure volume is what separates “knowing some words” from “understanding by ear.” The brain needs repeated contact with the language to build fast recognition.

---

## Why volume matters

Words become stable when they are met many times across varied contexts.

| Number of encounters | Effect |
|---|---|
| 1 | quickly forgotten |
| 3 to 5 | vaguely familiar |
| 8 to 10 | usable anchor |
| 15+ | automatic recognition |

---

## Massive does not mean exhausting

Massive immersion does not mean spending all day in front of a screen. It means multiplying contact points through a mix of:

- [active immersion →](/immersion/immersion-active)
- [passive immersion →](/immersion/immersion-passive)

Short, repeatable sessions beat rare heroic efforts.
`,
	},
	"/comprendre/la-repetition-espacee": {
		slug: "/comprendre/la-repetition-espacee",
		title: "Spaced repetition",
		subtitle: "Review less, retain more",
		content: `# Spaced repetition

Spaced repetition is the mechanism that lets you retain thousands of Arabic words with limited daily time. The principle is simple: review a word just before you would forget it.

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
	"/comprendre/le-parcours-type": {
		slug: "/comprendre/le-parcours-type",
		title: "Everything you need to do to finally speak Arabic",
		subtitle: "From zero to comprehension, phase by phase",
		content: `# Everything you need to do to finally speak Arabic

This page gives you the full map from zero to autonomous comprehension of standard Arabic. It is not a rigid timetable. It is a logical sequence where each phase prepares the next one.

---

## Phase 0: build the environment

Start by placing Arabic into your daily environment: podcasts, news clips, educational videos, short excerpts. At first, the goal is not immediate understanding. It is familiarity.

---

## Phase 1: foundations

Build five pillars together:

1. spaced repetition
2. the Foundations 2000 deck
3. active immersion
4. passive immersion
5. minimal grammar support

---

## Phase 2: accumulation

Recognition grows. More words feel familiar. Content becomes less opaque. Your deck personalizes itself around what you actually consume.

---

## Phase 3: autonomy

At this point, immersion becomes the main engine. Cards still consolidate, but exposure now carries most of the weight.
`,
	},
	"/comprendre/le-systeme-dimmersion-active": {
		slug: "/comprendre/le-systeme-dimmersion-active",
		title: "The active immersion system",
		subtitle: "Exposure, consolidation, repetition",
		content: `# The active immersion system

This is the core mechanism of 2k2go: listen to real Arabic every day, extract useful material, and stabilize it with smart review cards.

---

## Why immersion works

The brain acquires language by processing understandable messages repeatedly. That is why real exposure matters more than rule memorization alone.

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
	"/demarrer/carte-a-cible-unique": {
		slug: "/demarrer/carte-a-cible-unique",
		title: "Single-target card",
		subtitle: "Review faster without losing context",
		content: `# Single-target card

The single-target card is the core card format used in 2k2go. Instead of testing an entire sentence, it isolates one target word inside its natural context.

---

## How it works

| Element | Front | Back |
|---|---|---|
| Main content | sentence with one highlighted target word | definition or translation of the target word |
| Evaluation | only the target word matters | optional image or native audio |
| Other words | ideally already known | sentence translation optional |

---

## Why this format is efficient

- less mental fatigue
- preserved context
- faster card creation
- faster reviews

The grading rule is simple: if the target word is recognized immediately, pass. If not, fail.
`,
	},
	"/demarrer/deck-de-fondations-2k": {
		slug: "/demarrer/deck-de-fondations-2k",
		title: "Foundations 2000",
		subtitle: "The 2000 most frequent words",
		content: `# Foundations 2000

Mastering the 2000 most frequent words in standard Arabic gives you roughly 80% coverage of ordinary texts. That coverage is the threshold that makes immersion productive instead of frustrating.

---

## Why 2000 words matters

| Number of words | Approximate coverage |
|---|---|
| 1000 | around 70% |
| 2000 | around 80% |
| 3000 | around 85% |
| 5000 | around 90% |

---

## How to use it

The Foundations deck supports daily reviews. It does **not** replace your personal deck. It complements it.

- **Foundations deck**: frequent words you must meet early
- **Personal deck**: words extracted from your own immersion

The ideal pattern is simple: first meet a word in the Foundations deck, then hear it again in real content.
`,
	},
	"/demarrer/faire-ses-revues": {
		slug: "/demarrer/faire-ses-revues",
		title: "Do your reviews",
		subtitle: "Grading, routine, and card management",
		content: `# Do your reviews

The daily 9-minute review block is the non-negotiable pillar of the system. This is where vocabulary met in immersion becomes durable recognition.

---

## The grading rule

You have two possible answers: **Fail** or **Pass**.

A card counts as passed only if the target word is recognized immediately, without flipping first and without extended hesitation. If recognition is slow, it is a fail.

---

## Why honest grading matters

FSRS adjusts intervals from your answers. If you grade too generously, intervals stretch too fast and words collapse. Honest grading keeps the system calibrated.

---

## The practical routine

- review every day
- keep the session short enough to survive busy days
- avoid overloading new cards if the pile becomes heavy
- use immersion to keep cards connected to real language
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
	"/immersion/immersion-active": {
		slug: "/immersion/immersion-active",
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
	"/immersion/immersion-passive": {
		slug: "/immersion/immersion-passive",
		title: "Passive immersion",
		subtitle: "Reinforce with almost no concentration cost",
		content: `# Passive immersion

Passive immersion is free exposure time: replaying already-worked material in the background while walking, cooking, commuting, or doing light tasks.

---

## The rule

Only use material that was already processed in [active immersion →](/immersion/immersion-active). Unknown background audio is just noise. Familiar material creates reinforcement.

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
	"/introduction/a-qui-sadresse-2k2go": {
		slug: "/introduction/a-qui-sadresse-2k2go",
		title: "Who 2k2go is for",
		subtitle: "Profiles, expectations, prerequisites",
		content: `# Who 2k2go is for

If you are reading this, you have probably already tried to learn Arabic and seen little durable result. Evening classes, apps, tutors, and grammar work often build fragments of knowledge without building real comprehension.

---

## This system is for you if

- you want to control your own learning speed
- you can commit a short but regular daily block
- you accept early exposure even before full understanding

The motivation can be professional, religious, cultural, or family-based. Standard Arabic gives the broadest base.

---

## Typical learner profiles

| Profile | Situation | What the system brings |
|---|---|---|
| Restart after failure | tried before without durable results | a mechanism stronger than raw motivation |
| Complete beginner | starts from zero | a structured path from letters to comprehension |
| Theoretical learner | knows rules but cannot follow audio | the shift from knowledge to recognition |
| Life project | migration, work, family | a shared standard Arabic base |
`,
	},
	"/introduction/lorigine-du-systeme": {
		slug: "/introduction/lorigine-du-systeme",
		title: "The origin of the system",
		subtitle: "From Japan to Arabic",
		content: `# The origin of the system

This page explains how repeated failure with Arabic eventually led, through an unexpected detour via Japanese, to the system used in 2k2go.

---

## Years of failing at Arabic

The starting point was familiar: weekend classes, slow progress, fragmented lessons, and the feeling of spending time without truly learning. Arabic became associated with frustration instead of momentum.

---

## The turning point

The real change came from seeing another language learned differently: more exposure, more direct contact, more systems thinking, less dependence on classroom pacing.

---

## What the system kept

The final method kept only what clearly worked:

- authentic input
- repeated exposure
- targeted card review
- a routine small enough to survive daily life

That is the origin of 2k2go: not theory first, but a method extracted from real failure and real correction.
`,
	},
};

export { WEBAPP_DOCS_ARTICLES_BY_SLUG_EN };

export type { WebappDocsArticle };
