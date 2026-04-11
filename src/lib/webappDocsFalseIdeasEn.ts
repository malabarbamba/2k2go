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

const WEBAPP_DOCS_FALSE_IDEAS_EN_SLUG = "/bad-habits/six-real-reasons";
const WEBAPP_DOCS_FALSE_IDEAS_EN_TITLE = "Why Your Arabic Never Gets Better (6 Real Reasons)";
const WEBAPP_DOCS_FALSE_IDEAS_EN_SUBTITLE =
	"The habits that feel like progress but aren't";
const WEBAPP_DOCS_FALSE_IDEAS_EN_INTRO =
	"These habits aren't your fault. They're actively sold to you as solutions. Each one produces a convincing feeling of progress while quietly preventing the one thing that actually matters: direct comprehension of real Arabic, without translation. Here's what they are and why they don't work.";

const WEBAPP_DOCS_FALSE_IDEAS_EN_ITEMS = [
	{
		title: "Classroom courses as the main source",
		body: "In a typical Arabic class, roughly 80% of the time is spent in your native language. Teacher explanations, exercise instructions, side questions from classmates. Actual Arabic you hear and process? Maybe 10 minutes per hour. That's not enough exposure to build comprehension.\r\n\r\nClasses can be useful as a supplement, a place to ask questions that came up in real practice. But they can't be the main vehicle if your goal is to actually understand spoken Arabic. The volume just isn't there.\r\n\r\n> **Useful use**\r\n> A course as a supplement for targeted questions: yes. As your primary source of Arabic? The math doesn't work.",
	},
	{
		title: "Textbooks as the center of learning",
		body: "Textbook Arabic isn't real Arabic. The sentences are engineered to teach grammar points, they're not sentences anyone actually says. The vocabulary is curated for pedagogical logic, not for what you'll actually hear. When you move from the textbook to real audio, you're practically starting over.\r\n\r\nA textbook is useful as an **occasional reference**, checking a grammar rule, confirming a conjugation pattern. Used that way, it's fine. Used as the center of your learning, it builds a parallel world of Arabic that doesn't transfer to real content.",
	},
	{
		title: "Gamified apps",
		body: "You can maintain a 400-day streak on a language app and still not understand a single news clip. The streak measures your consistency *inside the app*, not your Arabic comprehension.\r\n\r\n| What the app measures | What is actually missing |\r\n|---|---|\r\n| Arabic / translation speed | Direct comprehension without translation |\r\n| App-calibrated exercise performance | Exposure to authentic, unfiltered Arabic |\r\n| Daily login habit | Measurable progress on real content |\r\n\r\nThe apps aren't lying. They're measuring what they measure. The problem is mistaking that metric for language acquisition.",
	},
	{
		title: "Systematic translation",
		body: "Every time you reach for a translator, you're skipping the part where your brain builds a direct Arabic to meaning connection. You understood the translation, not the Arabic.\r\n\r\nOver time, this creates a brain that processes Arabic *through* your native language, with translation as a mandatory middle step. That step is exactly what fluent comprehension doesn't have.\r\n\r\nThe better habit: try to understand from context first. Look up the word if genuinely stuck. Add it to a card. The next time you hear it, you'll recognize it directly, no translation needed.",
	},
	{
		title: "Perfectionism",
		body: "Freezing on every unknown word doesn't make you thorough. It makes you stop.\r\n\r\nThe learner who pauses every sentence to look up every word spends more time in the dictionary than in Arabic. They never build tolerance for ambiguity, the essential skill that real comprehension requires, because real speech doesn't come with a pause button.\r\n\r\nThe effective approach is intentionally incomplete: one pass for global meaning, then zoom in on **1 to 3 reusable elements**. The rest becomes clear through accumulation. You don't need to understand everything now. You need to keep going.",
	},
	{
		title: "No daily routine",
		body: "Three hours on Sunday does not replace 9 minutes every day. This isn't a productivity cliché. It's a spaced repetition constraint.\r\n\r\nThe scheduling algorithm that keeps your vocabulary from fading is calibrated for daily use. When you skip days, cards pile up. When you do a Sunday cram session to compensate, the algorithm's timing predictions break down. You end up reviewing things you already know while forgetting things you should have caught earlier.\r\n\r\n> **The rule**\r\n> The best format is the one you actually maintain every day. A modest daily habit beats an ambitious one that collapses on the first busy week.",
	},
] as const satisfies readonly WebappDocsFalseIdea[];

const WEBAPP_DOCS_FALSE_IDEAS_EN_WORKS_TITLE = "What actually works";
const WEBAPP_DOCS_FALSE_IDEAS_EN_WORKS_BODY =
	"The habits that create measurable progress come down to three things, and none of them are complicated:\r\n\r\n- **Regular exposure to authentic content.** Real Arabic, every week. Not textbook sentences, not app exercises. Actual content made for native speakers.\r\n- **Daily review with [honest grading](/start/reviews).** Nine minutes. Every day. Pass means instant recognition. Anything else is a fail.\r\n- **Patient measurement over weeks, not sessions.** Progress in language acquisition isn't visible after a single session. It's visible after several uninterrupted weeks. The signal is recognition speed, not the feeling of the day.";

const WEBAPP_DOCS_FALSE_IDEAS_EN_NEXT_READING = [
	{ label: "The Arabic Roadmap", slug: "/understand/arabic-roadmap" },
	{ label: "How to Do Your Reviews", slug: "/start/reviews" },
	{ label: "The One-Target Sentence", slug: "/start/one-target-sentence" },
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
		(link) => `- [${link.label}](${link.slug})`,
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
