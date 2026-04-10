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
			{ label: "Welcome", slug: "/" },
			{ label: "The origin of the system", slug: "/introduction/lorigine-du-systeme" },
			{ label: "Who 2k2go is for", slug: "/introduction/a-qui-sadresse-2k2go" },
		],
	},
	{
		id: "comprendre",
		label: "Understand",
		iconKey: "comprendre",
		articles: [
			{ label: "The active immersion system", slug: "/comprendre/le-systeme-dimmersion-active" },
			{ label: "Standard Arabic, Classical Arabic, dialects", slug: "/comprendre/arabe-standard-arabe-classique-dialectes" },
			{ label: "The standard path", slug: "/comprendre/le-parcours-type" },
			{ label: "Massive immersion", slug: "/comprendre/immersion-massive" },
			{ label: "Spaced repetition", slug: "/comprendre/la-repetition-espacee" },
		],
	},
	{
		id: "demarrer",
		label: "Start",
		iconKey: "demarrer",
		articles: [
			{ label: "Do your reviews", slug: "/demarrer/faire-ses-revues" },
			{ label: "Single-target card", slug: "/demarrer/carte-a-cible-unique" },
			{ label: "Foundations 2000", slug: "/demarrer/deck-de-fondations-2k" },
		],
	},
	{
		id: "immersion",
		label: "Immersion",
		iconKey: "immersion",
		articles: [
			{ label: "Active immersion", slug: "/immersion/immersion-active" },
			{ label: "Passive immersion", slug: "/immersion/immersion-passive" },
		],
	},
	{
		id: "bases",
		label: "Foundations",
		iconKey: "bases",
		articles: [
			{ label: "The Arabic alphabet", slug: "/bases/lalphabet-arabe" },
			{ label: "Reading and vowels", slug: "/bases/lecture-et-voyelles" },
			{ label: "Essential grammar", slug: "/bases/grammaire-essentielle" },
		],
	},
	{
		id: "fausses-idees",
		label: "Bad habits",
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
			{ label: "Glossary", slug: "/annexes/glossaire" },
			{ label: "Scientific sources", slug: "/annexes/sources-scientifiques" },
		],
	},
] as const;

export { WEBAPP_DOCS_NAV_CATEGORIES_EN };

export type { WebappDocsArticle, WebappDocsCategory, WebappDocsCategoryIconKey, WebappDocsCategoryId };
