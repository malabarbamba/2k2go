import { buildDocsHeadingAnchorIds } from "@/lib/webappDocsAnchors";

type WebappDocsFalseIdea = {
	title: string;
	body: string;
};

type WebappDocsFalseIdeasNavArticle = {
	label: string;
	slug: string;
};

type WebappDocsFalseIdeasReadingLink = {
	label: string;
	slug: string;
};

type WebappDocsFalseIdeasHeading = {
	kind: "idea" | "closing";
	text: string;
};

const WEBAPP_DOCS_FALSE_IDEAS_EN_SLUG =
	"/fausses-idees/les-habitudes-qui-freinent-la-progression";
const WEBAPP_DOCS_FALSE_IDEAS_EN_TITLE = "false good ideas";
const WEBAPP_DOCS_FALSE_IDEAS_EN_SUBTITLE =
	"What feels productive without creating real comprehension";
const WEBAPP_DOCS_FALSE_IDEAS_EN_INTRO =
	"Some learning habits are reassuring without being effective. They create the feeling of progress, but they do not build the ability to understand real Arabic. This page identifies the most common traps so you can avoid them early.";

const WEBAPP_DOCS_FALSE_IDEAS_EN_ITEMS = [
	{
		title: "Classroom courses as the main source",
		body: "A classroom gives structure, correction, and social support. But it rarely provides enough exposure volume. Most of the time is spent in the learner's native language: explanations, instructions, and side exchanges. Actual contact time with Arabic stays low.\r\n\r\n> **Useful use**\r\n> A course can be helpful as a supplement for questions that come from real practice. It cannot be the main source if your goal is listening comprehension.",
	},
	{
		title: "Textbooks as the center of learning",
		body: "Textbooks feel safe because they offer chapters, exercises, and clear progression. The problem is that their sentences are artificial and built to illustrate grammar points, not real language. The vocabulary often does not match what you meet in authentic audio or video.\r\n\r\nA textbook remains useful as an **occasional reference**: checking a rule, clarifying a conjugation point, or confirming a pattern. It should not replace exposure.",
	},
	{
		title: "Gamified apps",
		body: "Badges, streaks, and rankings create a strong sense of progress *inside the app*. The problem is transfer. You can maintain a 200-day streak and still be unable to follow a news clip in Arabic.\r\n\r\n| What the app strengthens | What is still missing |\r\n|---|---|\r\n| Arabic ↔ native-language translation | Direct comprehension without translation |\r\n| Calibrated, comfortable exercises | Exposure to authentic language |\r\n| Feeling of progress | Measurable progress on real Arabic |",
	},
	{
		title: "Systematic translation",
		body: "Using Google Translate on every sentence inserts an extra step between sound and meaning. The learner ends up understanding the translation, not the Arabic. The brain never builds a direct route.\r\n\r\nThe rule is simple: try to understand through context first, verify if needed, then capture the useful word on a card so you do not need to translate it again next time.",
	},
	{
		title: "Perfectionism",
		body: "Wanting to understand everything before moving on creates the opposite of progress. The learner freezes on every unknown word, replays the same passage endlessly, and postpones card creation until everything feels clear.\r\n\r\nThe effective approach is incremental: one pass for global meaning, then a zoom on **1 to 3 reusable elements**. The rest becomes clearer through accumulation.",
	},
	{
		title: "No daily routine",
		body: "Without regularity, [spaced repetition →](/comprendre/la-repetition-espacee) cannot work. Three hours on Sunday do not replace 9 minutes every day. Irregular sessions create forgotten material, then catch-up pressure, then discouragement.\r\n\r\n> **The best format**\r\n> The best format is the one you actually keep every day. A short, durable routine beats an ambitious routine that collapses on the first busy week.",
	},
] as const satisfies readonly WebappDocsFalseIdea[];

const WEBAPP_DOCS_FALSE_IDEAS_EN_WORKS_TITLE = "What works";
const WEBAPP_DOCS_FALSE_IDEAS_EN_WORKS_BODY =
	"The habits that create measurable progress can be reduced to three points:\r\n\r\n- Regular exposure to authentic content ([active immersion →](/immersion/immersion-active) and [passive immersion →](/immersion/immersion-passive))\r\n- Daily consolidation with cards and [honest grading →](/demarrer/faire-ses-revues)\r\n- Active patience that measures progress over several weeks, not after a single session";

const WEBAPP_DOCS_FALSE_IDEAS_EN_NEXT_READING = [
	{ label: "Massive immersion", slug: "/comprendre/immersion-massive" },
	{
		label: "The active immersion system",
		slug: "/comprendre/le-systeme-dimmersion-active",
	},
	{ label: "Do your reviews", slug: "/demarrer/faire-ses-revues" },
] as const satisfies readonly WebappDocsFalseIdeasReadingLink[];

const WEBAPP_DOCS_FALSE_IDEAS_EN_HEADINGS = [
	...WEBAPP_DOCS_FALSE_IDEAS_EN_ITEMS.map(({ title }) => ({
		kind: "idea" as const,
		text: title,
	})),
	{ kind: "closing" as const, text: WEBAPP_DOCS_FALSE_IDEAS_EN_WORKS_TITLE },
	{ kind: "closing" as const, text: "Next reading" },
] as const satisfies readonly WebappDocsFalseIdeasHeading[];

const WEBAPP_DOCS_FALSE_IDEAS_EN_HEADING_ANCHORS = buildDocsHeadingAnchorIds(
	WEBAPP_DOCS_FALSE_IDEAS_EN_HEADINGS.map((heading) => heading.text),
);

const WEBAPP_DOCS_FALSE_IDEAS_EN_NAV_ARTICLES: readonly WebappDocsFalseIdeasNavArticle[] =
	WEBAPP_DOCS_FALSE_IDEAS_EN_HEADINGS.flatMap((heading, index) => {
		if (heading.kind !== "idea") {
			return [];
		}

		return [
			{
				label: heading.text,
				slug: `${WEBAPP_DOCS_FALSE_IDEAS_EN_SLUG}#${WEBAPP_DOCS_FALSE_IDEAS_EN_HEADING_ANCHORS[index]}`,
			},
		];
	});

const WEBAPP_DOCS_FALSE_IDEAS_EN_CONTENT = [
	`# ${WEBAPP_DOCS_FALSE_IDEAS_EN_TITLE}`,
	"",
	WEBAPP_DOCS_FALSE_IDEAS_EN_INTRO,
	"",
	...WEBAPP_DOCS_FALSE_IDEAS_EN_ITEMS.flatMap((item) => [
		"---",
		"",
		`## ${item.title}`,
		"",
		item.body,
		"",
	]),
	"---",
	"",
	`## ${WEBAPP_DOCS_FALSE_IDEAS_EN_WORKS_TITLE}`,
	"",
	WEBAPP_DOCS_FALSE_IDEAS_EN_WORKS_BODY,
	"",
	"---",
	"",
	"## Next reading",
	"",
	...WEBAPP_DOCS_FALSE_IDEAS_EN_NEXT_READING.map(
		(link) => `- [${link.label} →](${link.slug})`,
	),
	"",
].join("\r\n");

export {
	WEBAPP_DOCS_FALSE_IDEAS_EN_CONTENT,
	WEBAPP_DOCS_FALSE_IDEAS_EN_INTRO,
	WEBAPP_DOCS_FALSE_IDEAS_EN_ITEMS,
	WEBAPP_DOCS_FALSE_IDEAS_EN_NAV_ARTICLES,
	WEBAPP_DOCS_FALSE_IDEAS_EN_NEXT_READING,
	WEBAPP_DOCS_FALSE_IDEAS_EN_SLUG,
	WEBAPP_DOCS_FALSE_IDEAS_EN_SUBTITLE,
	WEBAPP_DOCS_FALSE_IDEAS_EN_TITLE,
};
