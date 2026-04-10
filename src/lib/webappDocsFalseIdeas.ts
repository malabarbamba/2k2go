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

const WEBAPP_DOCS_FALSE_IDEAS_SLUG =
	"/fausses-idees/les-habitudes-qui-freinent-la-progression";
const WEBAPP_DOCS_FALSE_IDEAS_TITLE = "fausses bonnes idées";
const WEBAPP_DOCS_FALSE_IDEAS_SUBTITLE =
	"Ce qui donne l'impression d'avancer sans créer de compréhension";
const WEBAPP_DOCS_FALSE_IDEAS_INTRO =
	"Certaines pratiques d'apprentissage sont rassurantes sans être efficaces. Elles donnent une sensation de progression — chapitres terminés, séries de jours, règles mémorisées — mais ne construisent pas la capacité à comprendre un vrai contenu en arabe. Cette page identifie les fausses bonnes idées les plus courantes pour vous aider à les éviter.";

const WEBAPP_DOCS_FALSE_IDEAS_ITEMS = [
	{
		title: "Les cours en classe comme source principale",
		body: "Un cours en classe offre un cadre social et des corrections. Mais il ne fournit pas le volume d'exposition nécessaire. Le temps passé en classe est majoritairement en français (explications, consignes, échanges entre élèves). Le temps d'exposition réelle à l'arabe est faible.\r\n\r\n> **Utilisation efficace**\r\n> Un cours est utile en complément, pour poser des questions ciblées issues de la pratique. Mais il ne peut pas être la source principale d'apprentissage quand l'objectif est la compréhension orale.",
	},
	{
		title: "Les manuels scolaires comme cœur de l'apprentissage",
		body: "Les manuels offrent une structure rassurante : chapitres, exercices, corrigés. Le problème : les phrases sont artificielles, conçues pour illustrer un point de grammaire, pas pour représenter la langue réelle. Le vocabulaire est souvent décalé par rapport à ce qu'on rencontre dans une vidéo authentique.\r\n\r\nLe manuel reste utile comme **référence ponctuelle** : vérifier une règle, comprendre un point de conjugaison. Mais les exercices à trous ne créent pas l'oreille nécessaire à la compréhension.",
	},
	{
		title: "Les applications gamifiées",
		body: "Les badges, séries et classements créent une forte sensation de progression *à l'intérieur de l'application*. Le problème : cette progression ne se transfère pas. On peut maintenir une série de 200 jours et rester incapable de suivre une vidéo d'actualités en arabe.\r\n\r\n| Ce que l'appli renforce | Ce qui manque |\r\n|---|---|\r\n| Traduction arabe ↔ français | Compréhension directe sans traduction |\r\n| Exercices calibrés et confortables | Inconfort de l'exposition au contenu authentique |\r\n| Sentiment de progression | Progression mesurable sur du vrai arabe |",
	},
	{
		title: "La traduction systématique",
		body: "Utiliser Google Translate pour chaque phrase ajoute une étape entre le son et la compréhension. L'apprenant comprend du français, pas de l'arabe. Le cerveau ne développe pas de chemin direct.\r\n\r\nLa règle : essayer d'abord de comprendre par le contexte, vérifier ensuite si nécessaire, et capturer le mot en carte pour ne plus avoir besoin de le traduire la prochaine fois.",
	},
	{
		title: "Le perfectionnisme",
		body: "Vouloir tout comprendre avant d'avancer produit un effet paradoxal : l'apprenant s'arrête sur chaque mot inconnu, recommence les mêmes passages indéfiniment et ne crée pas de cartes tant que tout n'est pas clair.\r\n\r\nL'approche efficace est incrémentale : une première passe pour la compréhension globale, puis un zoom sur **1 à 3 éléments exploitables**. Le reste se clarifiera par accumulation.",
	},
	{
		title: "L'absence de routine quotidienne",
		body: "Sans régularité, la [répétition espacée →](/comprendre/la-repetition-espacee) ne fonctionne pas. Trois heures le dimanche ne remplacent pas 9 minutes chaque jour. Les sessions irrégulières produisent des oublis qui s'accumulent et génèrent une charge de rattrapage décourageante.\r\n\r\n> **Le meilleur format**\r\n> C'est celui qui est suivi tous les jours. Un format court et tenable vaut mieux qu'un format ambitieux qui ne survit pas à la première semaine chargée.",
	},
] as const satisfies readonly WebappDocsFalseIdea[];

const WEBAPP_DOCS_FALSE_IDEAS_WORKS_TITLE = "Ce qui fonctionne";
const WEBAPP_DOCS_FALSE_IDEAS_WORKS_BODY =
	"Les habitudes qui produisent une progression mesurable se résument en trois points :\r\n\r\n- Exposition régulière à du contenu authentique ([immersion active →](/immersion/immersion-active) et [passive →](/immersion/immersion-passive))\r\n- Consolidation quotidienne par cartes avec [notation honnête →](/demarrer/faire-ses-revues)\r\n- Patience active qui mesure la progression sur plusieurs semaines, pas après une seule session";

const WEBAPP_DOCS_FALSE_IDEAS_NEXT_READING = [
	{ label: "Immersion massive", slug: "/comprendre/immersion-massive" },
	{
		label: "Le système d'immersion active",
		slug: "/comprendre/le-systeme-dimmersion-active",
	},
	{ label: "Faire ses revues", slug: "/demarrer/faire-ses-revues" },
] as const satisfies readonly WebappDocsFalseIdeasReadingLink[];

const WEBAPP_DOCS_FALSE_IDEAS_HEADINGS = [
	...WEBAPP_DOCS_FALSE_IDEAS_ITEMS.map(({ title }) => ({
		kind: "idea" as const,
		text: title,
	})),
	{ kind: "closing" as const, text: WEBAPP_DOCS_FALSE_IDEAS_WORKS_TITLE },
	{ kind: "closing" as const, text: "Prochaine lecture" },
] as const satisfies readonly WebappDocsFalseIdeasHeading[];

const WEBAPP_DOCS_FALSE_IDEAS_HEADING_ANCHORS = buildDocsHeadingAnchorIds(
	WEBAPP_DOCS_FALSE_IDEAS_HEADINGS.map((heading) => heading.text),
);

const WEBAPP_DOCS_FALSE_IDEAS_NAV_ARTICLES: readonly WebappDocsFalseIdeasNavArticle[] =
	WEBAPP_DOCS_FALSE_IDEAS_HEADINGS.flatMap((heading, index) => {
		if (heading.kind !== "idea") {
			return [];
		}

		return [
			{
				label: heading.text,
				slug: `${WEBAPP_DOCS_FALSE_IDEAS_SLUG}#${WEBAPP_DOCS_FALSE_IDEAS_HEADING_ANCHORS[index]}`,
			},
		];
	});

const WEBAPP_DOCS_FALSE_IDEAS_CONTENT = [
	`# ${WEBAPP_DOCS_FALSE_IDEAS_TITLE}`,
	"",
	WEBAPP_DOCS_FALSE_IDEAS_INTRO,
	"",
	...WEBAPP_DOCS_FALSE_IDEAS_ITEMS.flatMap((item) => [
		"---",
		"",
		`## ${item.title}`,
		"",
		item.body,
		"",
	]),
	"---",
	"",
	`## ${WEBAPP_DOCS_FALSE_IDEAS_WORKS_TITLE}`,
	"",
	WEBAPP_DOCS_FALSE_IDEAS_WORKS_BODY,
	"",
	"---",
	"",
	"## Prochaine lecture",
	"",
	...WEBAPP_DOCS_FALSE_IDEAS_NEXT_READING.map(
		(link) => `- [${link.label} →](${link.slug})`,
	),
	"",
].join("\r\n");

export {
	WEBAPP_DOCS_FALSE_IDEAS_CONTENT,
	WEBAPP_DOCS_FALSE_IDEAS_INTRO,
	WEBAPP_DOCS_FALSE_IDEAS_ITEMS,
	WEBAPP_DOCS_FALSE_IDEAS_NAV_ARTICLES,
	WEBAPP_DOCS_FALSE_IDEAS_NEXT_READING,
	WEBAPP_DOCS_FALSE_IDEAS_SLUG,
	WEBAPP_DOCS_FALSE_IDEAS_SUBTITLE,
	WEBAPP_DOCS_FALSE_IDEAS_TITLE,
};

export type {
	WebappDocsFalseIdea,
	WebappDocsFalseIdeasNavArticle,
	WebappDocsFalseIdeasReadingLink,
};
