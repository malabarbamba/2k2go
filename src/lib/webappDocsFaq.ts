import { buildDocsHeadingAnchorIds } from "@/lib/webappDocsAnchors";
import {
	WEBAPP_DOCS_FAQ_EN_CONTENT,
	WEBAPP_DOCS_FAQ_EN_NAV_ARTICLES,
	WEBAPP_DOCS_FAQ_EN_SLUG,
	WEBAPP_DOCS_FAQ_EN_SUBTITLE,
	WEBAPP_DOCS_FAQ_EN_TITLE,
} from "@/lib/webappDocsFaqEn";
import type { AppLocale } from "@/lib/appLocale";

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

const WEBAPP_DOCS_FAQ_SLUG = "/faq";
const WEBAPP_DOCS_FAQ_TITLE = "FAQ";
const WEBAPP_DOCS_FAQ_SUBTITLE = "Questions fréquentes";
const WEBAPP_DOCS_FAQ_INTRO =
	"Les questions les plus fréquentes sur le système, regroupées par thème. Si votre question n'est pas ici, les articles du guide couvrent probablement le sujet en détail.";

const WEBAPP_DOCS_FAQ_SECTIONS = [
	{
		title: "Résultats et progression",
		questions: [
			{
				question: "Quels résultats attendre dans les premières semaines ?",
				answer:
					"L'objectif réaliste au départ est de suivre l'idée principale d'un contenu court sans traduire chaque mot. La progression se mesure à la stabilité : moins de confusion, plus de repères, plus de mots reconnus automatiquement. Cette première marche arrive généralement après quelques semaines de routine tenue sans interruption.",
			},
			{
				question:
					"Comment savoir si je progresse quand j'ai l'impression de stagner ?",
				answer:
					"Le meilleur indicateur est la vitesse de reconnaissance, pas le ressenti du jour. Si des mots qui posaient problème deviennent instantanés, la progression est réelle. Les plateaux correspondent souvent à une stabilisation avant le palier suivant.",
			},
		],
	},
	{
		title: "Routine et organisation",
		questions: [
			{
				question: "Quelle est la routine minimale efficace ?",
				answer:
					"[9 minutes de cartes →](/demarrer/faire-ses-revues) tous les jours + 2 à 3 sessions d'[immersion active →](/immersion/immersion-active) par semaine. Ce format est volontairement court pour être tenable même les jours chargés.",
			},
			{
				question: "Que faire après plusieurs jours sans revue ?",
				answer:
					"Reprendre le format normal dès le premier jour de reprise, sans chercher à rattraper. Réduire temporairement les nouvelles cartes si la pile de revues est lourde. L'objectif : remettre la chaîne en continu, pas rembourser une dette.",
			},
			{
				question: "Par où commencer quand on part de zéro ?",
				answer:
					"| Étape | Action |\r\n|---|---|\r\n| 1 | Apprendre [l'alphabet →](/bases/lalphabet-arabe) (2–3 jours) |\r\n| 2 | Lancer le [deck Fondations 2000 →](/demarrer/deck-de-fondations-2k) |\r\n| 3 | Commencer l'[immersion passive →](/immersion/immersion-passive) en parallèle |\r\n| 4 | Ajouter l'[immersion active →](/immersion/immersion-active) dès la 2e semaine |",
			},
		],
	},
	{
		title: "Contenu et thèmes",
		questions: [
			{
				question: "Comment choisir les thèmes de vidéos ?",
				answer:
					"Choisir un thème principal et le garder pendant une semaine pour obtenir des repères stables. Ce focus réduit le bruit et augmente la répétition du vocabulaire utile. Changer de thème trop souvent donne l'impression de variété mais ralentit la progression.",
			},
			{
				question: "Quel thème selon son objectif ?",
				answer:
					"- **Départ sans blocage** → actualités, vie quotidienne\r\n- **Besoin religieux** → contenus de spiritualité en arabe standard\r\n- **Besoin professionnel** → contenus d'affaires et d'économie\r\n\r\nLe bon thème est celui qui peut être réutilisé dans la vie réelle.",
			},
		],
	},
	{
		title: "Objections fréquentes",
		questions: [
			{
				question: "Faut-il maîtriser la grammaire avant de s'immerger ?",
				answer:
					"Non. L'immersion construit d'abord l'oreille et la reconnaissance. La [grammaire →](/bases/grammaire-essentielle) intervient ensuite pour corriger des blocages précis.",
			},
			{
				question:
					"Pourquoi commencer par la compréhension plutôt que la production orale ?",
				answer:
					"Parce que la parole stable dépend d'une oreille stable. Un apprenant qui comprend bien récupère plus vite les structures utiles au moment de parler, avec moins de blocages et moins d'approximations.",
			},
			{
				question: "Les contenus longs sont-ils meilleurs pour progresser ?",
				answer:
					"Pas au début. L'accélérateur principal est la densité de retours exploitables : segments courts, retravaillés, puis consolidés. Le format long devient utile quand la base de reconnaissance est solide.",
			},
		],
	},
] as const satisfies readonly WebappDocsFaqSection[];

const WEBAPP_DOCS_FAQ_NEXT_READING = [
	{ label: "Faire ses revues", slug: "/demarrer/faire-ses-revues" },
	{ label: "Immersion active", slug: "/immersion/immersion-active" },
	{ label: "Le parcours type", slug: "/comprendre/le-parcours-type" },
] as const satisfies readonly WebappDocsFaqReadingLink[];

const WEBAPP_DOCS_FAQ_HEADINGS = WEBAPP_DOCS_FAQ_SECTIONS.flatMap((section) => [
	{ kind: "section", text: section.title },
	...section.questions.map(({ question }) => ({
		kind: "question",
		text: question,
	})),
]) as readonly WebappDocsFaqHeading[];

const WEBAPP_DOCS_FAQ_HEADING_ANCHORS = buildDocsHeadingAnchorIds(
	WEBAPP_DOCS_FAQ_HEADINGS.map((heading) => heading.text),
);

const WEBAPP_DOCS_FAQ_NAV_ARTICLES: readonly WebappDocsFaqNavArticle[] =
	WEBAPP_DOCS_FAQ_HEADINGS.flatMap((heading, index) => {
		if (heading.kind !== "question") {
			return [];
		}

		return [
			{
				label: heading.text,
				slug: `${WEBAPP_DOCS_FAQ_SLUG}#${WEBAPP_DOCS_FAQ_HEADING_ANCHORS[index]}`,
			},
		];
	});

const WEBAPP_DOCS_FAQ_CONTENT = [
	`# ${WEBAPP_DOCS_FAQ_TITLE}`,
	"",
	WEBAPP_DOCS_FAQ_INTRO,
	"",
	...WEBAPP_DOCS_FAQ_SECTIONS.flatMap((section) => [
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
	"## Prochaine lecture",
	"",
	...WEBAPP_DOCS_FAQ_NEXT_READING.map(
		(link) => `- [${link.label} →](${link.slug})`,
	),
	"",
].join("\r\n");

export {
	WEBAPP_DOCS_FAQ_CONTENT,
	WEBAPP_DOCS_FAQ_INTRO,
	WEBAPP_DOCS_FAQ_NAV_ARTICLES,
	WEBAPP_DOCS_FAQ_NEXT_READING,
	WEBAPP_DOCS_FAQ_SECTIONS,
	WEBAPP_DOCS_FAQ_SLUG,
	WEBAPP_DOCS_FAQ_SUBTITLE,
	WEBAPP_DOCS_FAQ_TITLE,
};

const getWebappDocsFaqContent = (locale: AppLocale = "fr"): string =>
	locale === "en" ? WEBAPP_DOCS_FAQ_EN_CONTENT : WEBAPP_DOCS_FAQ_CONTENT;

const getWebappDocsFaqNavArticles = (
	locale: AppLocale = "fr",
): readonly WebappDocsFaqNavArticle[] =>
	locale === "en" ? WEBAPP_DOCS_FAQ_EN_NAV_ARTICLES : WEBAPP_DOCS_FAQ_NAV_ARTICLES;

const getWebappDocsFaqTitle = (locale: AppLocale = "fr"): string =>
	locale === "en" ? WEBAPP_DOCS_FAQ_EN_TITLE : WEBAPP_DOCS_FAQ_TITLE;

const getWebappDocsFaqSubtitle = (locale: AppLocale = "fr"): string =>
	locale === "en" ? WEBAPP_DOCS_FAQ_EN_SUBTITLE : WEBAPP_DOCS_FAQ_SUBTITLE;

const getWebappDocsFaqSlug = (locale: AppLocale = "fr"): string =>
	locale === "en" ? WEBAPP_DOCS_FAQ_EN_SLUG : WEBAPP_DOCS_FAQ_SLUG;

export {
	getWebappDocsFaqContent,
	getWebappDocsFaqNavArticles,
	getWebappDocsFaqSlug,
	getWebappDocsFaqSubtitle,
	getWebappDocsFaqTitle,
};

export type {
	WebappDocsFaqNavArticle,
	WebappDocsFaqQuestion,
	WebappDocsFaqReadingLink,
	WebappDocsFaqSection,
};
