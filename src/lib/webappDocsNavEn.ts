import { WEBAPP_DOCS_FALSE_IDEAS_EN_NAV_ARTICLES } from "@/lib/webappDocsFalseIdeasEn";
import { WEBAPP_DOCS_FAQ_EN_NAV_ARTICLES } from "@/lib/webappDocsFaqEn";

type WebappDocsCategoryId =
	| "introduction"
	| "comprendre"
	| "demarrer"
	| "immersion"
	| "bases"
	| "fausses-idees"
	| "faq"
	| "annexes";

type WebappDocsCategoryIconKey = WebappDocsCategoryId;

type WebappDocsArticle = {
	label: string;
	slug: string;
};

type WebappDocsCategory = {
	id: WebappDocsCategoryId;
	label: string;
	iconKey: WebappDocsCategoryIconKey;
	articles: readonly WebappDocsArticle[];
};

const WEBAPP_DOCS_NAV_CATEGORIES_EN: readonly WebappDocsCategory[] = [
	{
		id: "introduction",
		label: "Introduction",
		iconKey: "introduction",
		articles: [
			{ label: "Who is it for", slug: "/introduction/who-is-it-for" },
			{ label: "The Three Arabics", slug: "/understand/the-three-arabics" },
		],
	},
	{
		id: "comprendre",
		label: "The Method",
		iconKey: "comprendre",
		articles: [
			{ label: "The Arabic Roadmap", slug: "/understand/arabic-roadmap" },
			{ label: "The One-Target Sentence", slug: "/start/one-target-sentence" },
			{ label: "How to Do Your Reviews", slug: "/start/reviews" },
			{ label: "Reproducing This in Anki", slug: "/start/anki-setup" },
		],
	},
	{
		id: "fausses-idees",
		label: "Bad Habits",
		iconKey: "fausses-idees",
		articles: WEBAPP_DOCS_FALSE_IDEAS_EN_NAV_ARTICLES,
	},
	{
		id: "faq",
		label: "FAQ",
		iconKey: "faq",
		articles: WEBAPP_DOCS_FAQ_EN_NAV_ARTICLES,
	},
	{
		id: "annexes",
		label: "Appendices",
		iconKey: "annexes",
		articles: [
			{ label: "Glossary", slug: "/appendix/glossary" },
			{ label: "Scientific sources", slug: "/appendix/sources" },
		],
	},
] as const;

export { WEBAPP_DOCS_NAV_CATEGORIES_EN };

export type { WebappDocsArticle, WebappDocsCategory, WebappDocsCategoryIconKey, WebappDocsCategoryId };
