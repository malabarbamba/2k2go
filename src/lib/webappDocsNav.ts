import { WEBAPP_DOCS_FALSE_IDEAS_NAV_ARTICLES } from "@/lib/webappDocsFalseIdeas";
import { WEBAPP_DOCS_FAQ_NAV_ARTICLES } from "@/lib/webappDocsFaq";
import type { AppLocale } from "@/lib/appLocale";
import { WEBAPP_DOCS_NAV_CATEGORIES_EN } from "@/lib/webappDocsNavEn";

const WEBAPP_DOCS_BASE_URL = "https://2k2go.github.io/docs";
const WEBAPP_DOCS_WEBAPP_ROUTE_BASE = "/app/docs";

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

const WEBAPP_DOCS_NAV_CATEGORIES: readonly WebappDocsCategory[] = [
	{
		id: "introduction",
		label: "Introduction",
		iconKey: "introduction",
		articles: [
			{ label: "Bienvenue", slug: "/" },
			{
				label: "L'origine du système",
				slug: "/introduction/lorigine-du-systeme",
			},
			{
				label: "À qui s'adresse 2k2go",
				slug: "/introduction/a-qui-sadresse-2k2go",
			},
		],
	},
	{
		id: "comprendre",
		label: "Comprendre",
		iconKey: "comprendre",
		articles: [
			{
				label: "Le système d'immersion active",
				slug: "/comprendre/le-systeme-dimmersion-active",
			},
			{
				label: "Arabe standard, arabe classique, dialectes",
				slug: "/comprendre/arabe-standard-arabe-classique-dialectes",
			},
			{ label: "Le parcours type", slug: "/comprendre/le-parcours-type" },
			{ label: "Immersion massive", slug: "/comprendre/immersion-massive" },
			{
				label: "La répétition espacée",
				slug: "/comprendre/la-repetition-espacee",
			},
		],
	},
	{
		id: "demarrer",
		label: "Démarrer",
		iconKey: "demarrer",
		articles: [
			{ label: "Faire ses revues", slug: "/demarrer/faire-ses-revues" },
			{ label: "Carte à cible unique", slug: "/demarrer/carte-a-cible-unique" },
			{
				label: "Fondations 2000",
				slug: "/demarrer/deck-de-fondations-2k",
			},
		],
	},
	{
		id: "immersion",
		label: "Immersion",
		iconKey: "immersion",
		articles: [
			{ label: "Immersion active", slug: "/immersion/immersion-active" },
			{ label: "Immersion passive", slug: "/immersion/immersion-passive" },
		],
	},
	{
		id: "bases",
		label: "Les bases",
		iconKey: "bases",
		articles: [
			{ label: "L'alphabet arabe", slug: "/bases/lalphabet-arabe" },
			{ label: "Lecture et voyelles", slug: "/bases/lecture-et-voyelles" },
			{ label: "Grammaire essentielle", slug: "/bases/grammaire-essentielle" },
		],
	},
	{
		id: "fausses-idees",
		label: "Fausses bonnes idées",
		iconKey: "fausses-idees",
		articles: WEBAPP_DOCS_FALSE_IDEAS_NAV_ARTICLES,
	},
	{
		id: "faq",
		label: "FAQ",
		iconKey: "faq",
		articles: WEBAPP_DOCS_FAQ_NAV_ARTICLES,
	},
	{
		id: "annexes",
		label: "Annexes",
		iconKey: "annexes",
		articles: [
			{ label: "Glossaire", slug: "/annexes/glossaire" },
			{
				label: "Sources scientifiques",
				slug: "/annexes/sources-scientifiques",
			},
		],
	},
];

const normalizeDocsSlug = (slug: string): string => {
	if (slug === "/") {
		return "/";
	}

	const trimmedSlug = slug.trim();
	if (!trimmedSlug) {
		return "/";
	}

	return trimmedSlug.startsWith("/") ? trimmedSlug : `/${trimmedSlug}`;
};

const normalizeDocsRouteBase = (routeBase: string): string => {
	const trimmedRouteBase = routeBase.trim();
	if (!trimmedRouteBase) {
		return WEBAPP_DOCS_WEBAPP_ROUTE_BASE;
	}

	const withLeadingSlash = trimmedRouteBase.startsWith("/")
		? trimmedRouteBase
		: `/${trimmedRouteBase}`;
	const withoutTrailingSlashes = withLeadingSlash.replace(/\/+$/g, "");

	return withoutTrailingSlashes || "/";
};

const buildWebappDocsArticleUrl = (slug: string): string => {
	const normalizedBaseUrl = WEBAPP_DOCS_BASE_URL.replace(/\/+$/, "");
	const normalizedSlug = normalizeDocsSlug(slug);

	if (normalizedSlug === "/") {
		return `${normalizedBaseUrl}/`;
	}

	return `${normalizedBaseUrl}${normalizedSlug}`;
};

const buildWebappDocsInAppPath = (
	slug: string,
	routeBase: string = WEBAPP_DOCS_WEBAPP_ROUTE_BASE,
): string => {
	const normalizedSlug = normalizeDocsSlug(slug);
	const normalizedRouteBase = normalizeDocsRouteBase(routeBase);

	if (normalizedSlug === "/") {
		return normalizedRouteBase;
	}

	if (normalizedRouteBase === "/") {
		return normalizedSlug;
	}

	return `${normalizedRouteBase}${normalizedSlug}`;
};

export {
	WEBAPP_DOCS_WEBAPP_ROUTE_BASE,
	WEBAPP_DOCS_BASE_URL,
	WEBAPP_DOCS_NAV_CATEGORIES,
	buildWebappDocsInAppPath,
	buildWebappDocsArticleUrl,
};

const getWebappDocsNavCategories = (locale: AppLocale = "fr") =>
	locale === "en" ? WEBAPP_DOCS_NAV_CATEGORIES_EN : WEBAPP_DOCS_NAV_CATEGORIES;

export { getWebappDocsNavCategories };

export type {
	WebappDocsArticle,
	WebappDocsCategory,
	WebappDocsCategoryIconKey,
	WebappDocsCategoryId,
};
