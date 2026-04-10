import { buildDocsHeadingAnchorIds } from "@/lib/webappDocsAnchors";

type WebappDocsFaqQuestion = {
	question: string;
	answer: string;
};

type WebappDocsFaqSection = {
	title: string;
	questions: readonly WebappDocsFaqQuestion[];
};

type WebappDocsFaqNavArticle = {
	label: string;
	slug: string;
};

type WebappDocsFaqReadingLink = {
	label: string;
	slug: string;
};

type WebappDocsFaqHeading = {
	kind: "section" | "question";
	text: string;
};

const WEBAPP_DOCS_FAQ_EN_SLUG = "/faq";
const WEBAPP_DOCS_FAQ_EN_TITLE = "FAQ";
const WEBAPP_DOCS_FAQ_EN_SUBTITLE = "Frequently asked questions";
const WEBAPP_DOCS_FAQ_EN_INTRO =
	"The most common questions about the system, grouped by theme. If your question is not listed here, one of the guide articles probably covers it in more detail.";

const WEBAPP_DOCS_FAQ_EN_SECTIONS = [
	{
		title: "Results and progress",
		questions: [
			{
				question: "What results should I expect in the first weeks?",
				answer:
					"A realistic first goal is to follow the main idea of a short piece of content without translating every word. Progress shows up as stability: less confusion, more anchors, and more words recognized automatically. That first step usually appears after a few uninterrupted weeks of routine.",
			},
			{
				question: "How can I tell I am improving when I feel stuck?",
				answer:
					"The best indicator is recognition speed, not the feeling of the day. If words that used to block you now feel immediate, progress is real. Plateaus often mean the system is stabilizing before the next visible jump.",
			},
		],
	},
	{
		title: "Routine and organization",
		questions: [
			{
				question: "What is the minimum effective routine?",
				answer:
					"[9 minutes of reviews](/start/reviews) every day, plus 2 to 3 sessions of listening to real Arabic per week. The format is intentionally short so it survives even busy days.",
			},
			{
				question: "What should I do after several days without reviews?",
				answer:
					"Restart the normal format on the very first day back. Do not try to compensate. Temporarily reduce new cards if the review pile feels heavy. The goal is to rebuild continuity, not repay a debt.",
			},
			{
				question: "Where should I start if I am starting from zero?",
				answer:
					"The [Arabic Roadmap](/understand/arabic-roadmap) covers this in full, but the quick version: learn the alphabet (2 to 3 days), start the Foundations 2000 deck, add daily reviews, then introduce short Arabic listening sessions in week 2. Each phase is covered in the roadmap.",
			},
		],
	},
	{
		title: "Content and themes",
		questions: [
			{
				question: "How should I choose video themes?",
				answer:
					"Pick one main theme and keep it for a week so repeated vocabulary has time to settle. That focus reduces noise and increases useful repetition. Changing themes too often feels fresh but slows down progress.",
			},
			{
				question: "Which theme should I choose for my goal?",
				answer:
					"- **Smooth start** → news, daily life\r\n- **Religious goal** → spirituality content in standard Arabic\r\n- **Professional goal** → business and economics content\r\n\r\nThe right theme is the one you can reuse in real life.",
			},
		],
	},
	{
		title: "Common objections",
		questions: [
			{
				question: "Do I need to master grammar before immersing myself?",
				answer:
					"No. Immersion builds the ear and recognition first. [Grammar](/foundations/grammar) comes later to solve specific blockers.",
			},
			{
				question: "Why start with comprehension instead of speaking?",
				answer:
					"Because stable speech depends on a stable ear. A learner who understands well retrieves useful structures faster when speaking, with fewer blocks and fewer approximations.",
			},
			{
				question: "Are long pieces of content better for progress?",
				answer:
					"Not at the beginning. The real accelerator is the density of reusable returns: short segments, reworked, then consolidated. Long-form content becomes more useful once your recognition base is already strong.",
			},
		],
	},
] as const satisfies readonly WebappDocsFaqSection[];

const WEBAPP_DOCS_FAQ_EN_NEXT_READING = [
	{ label: "How to Do Your Reviews", slug: "/start/reviews" },
	{ label: "The One-Target Sentence", slug: "/start/one-target-sentence" },
	{ label: "The Arabic Roadmap", slug: "/understand/arabic-roadmap" },
] as const satisfies readonly WebappDocsFaqReadingLink[];

const WEBAPP_DOCS_FAQ_EN_HEADINGS = WEBAPP_DOCS_FAQ_EN_SECTIONS.flatMap(
	(section) => [
		{ kind: "section", text: section.title },
		...section.questions.map(({ question }) => ({
			kind: "question",
			text: question,
		})),
	],
) as readonly WebappDocsFaqHeading[];

const WEBAPP_DOCS_FAQ_EN_HEADING_ANCHORS = buildDocsHeadingAnchorIds(
	WEBAPP_DOCS_FAQ_EN_HEADINGS.map((heading) => heading.text),
);

const WEBAPP_DOCS_FAQ_EN_NAV_ARTICLES: readonly WebappDocsFaqNavArticle[] =
	WEBAPP_DOCS_FAQ_EN_HEADINGS.flatMap((heading, index) => {
		if (heading.kind !== "question") {
			return [];
		}

		return [
			{
				label: heading.text,
				slug: `${WEBAPP_DOCS_FAQ_EN_SLUG}#${WEBAPP_DOCS_FAQ_EN_HEADING_ANCHORS[index]}`,
			},
		];
	});

const WEBAPP_DOCS_FAQ_EN_CONTENT = [
	`# ${WEBAPP_DOCS_FAQ_EN_TITLE}`,
	"",
	WEBAPP_DOCS_FAQ_EN_INTRO,
	"",
	...WEBAPP_DOCS_FAQ_EN_SECTIONS.flatMap((section) => [
		"---",
		"",
		`## ${section.title}`,
		"",
		...section.questions.flatMap(({ question, answer }) => [
			`### ${question}`,
			"",
			answer,
			"",
		]),
	]),
	"---",
	"",
	"## Next reading",
	"",
	...WEBAPP_DOCS_FAQ_EN_NEXT_READING.map(
		(link) => `- [${link.label}](${link.slug})`,
	),
	"",
].join("\r\n");

export {
	WEBAPP_DOCS_FAQ_EN_CONTENT,
	WEBAPP_DOCS_FAQ_EN_INTRO,
	WEBAPP_DOCS_FAQ_EN_NAV_ARTICLES,
	WEBAPP_DOCS_FAQ_EN_NEXT_READING,
	WEBAPP_DOCS_FAQ_EN_SECTIONS,
	WEBAPP_DOCS_FAQ_EN_SLUG,
	WEBAPP_DOCS_FAQ_EN_SUBTITLE,
	WEBAPP_DOCS_FAQ_EN_TITLE,
};
