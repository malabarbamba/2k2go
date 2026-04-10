import type {
	FeedItem,
	NotificationCategory,
	NotificationItem,
	PreviewScreenOption,
} from "./types";

export const FONT_SANS =
	"'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif";
export const FONT_SERIF = "'OPTIPrescribe', serif";
export const SESSION_DEMO_STEPS = 6;

/**
 * Largeur maximale du contenu des pages preview.
 * Changer cette valeur unifie la largeur sur toutes les pages.
 */
export const PREVIEW_PAGE_CONTENT_MAX_W = "680px";

/**
 * Espace entre le header et le premier élément (titre) des pages preview.
 * Calibré sur la page Decks :
 *   ScreenDeckPerso pt-4 (1rem) + DeckPersoHome pt-3 (0.75rem) + section mt-4 (1rem) = 2.75rem
 * Toute modification du spacing interne de DeckPersoHome doit être répercutée ici.
 */
export const PREVIEW_PAGE_TOP_SPACING = "2.75rem";
export const SESSION_TOTAL = 47;

export const READY_NOTIFICATIONS: NotificationItem[] = [
	{
		text: "Kamal a corrigé ta prononciation de يشرب",
		time: "Il y a 2 h",
		highlight: "يشرب",
		unread: true,
	},
	{
		text: "Thomas a fini ses cartes et vient de passer les 510 mots",
		time: "Il y a 4 h",
		unread: true,
	},
	{
		text: "3 prononciations natives attendent encore une réponse",
		time: "Natifs",
	},
];

export const HOME_NOTIFICATION = READY_NOTIFICATIONS[0];

export const DONE_NOTIFICATIONS: NotificationItem[] = [
	{
		text: 'Kamal a noté: "accentue un peu plus يشرب"',
		time: "20 min",
		highlight: "يشرب",
		unread: true,
	},
	{
		text: "Thomas a validé sa session du jour avec 510 mots actifs",
		time: "1 h",
	},
	{
		text: "Ton prochain rappel de revue arrive demain matin",
		time: "Planifié",
	},
];

export const ABSENT_NOTIFICATIONS: NotificationItem[] = [
	{
		text: "Thomas a atteint 600 mots pendant ton absence",
		time: "Absent 5 j",
		unread: true,
	},
	{
		text: "Ton deck priorise maintenant les cartes à sauver d'abord",
		time: "Mémoire",
	},
];

export const IMMERSION_ITEMS = [
	{
		title: "Podcast arabe facile",
		meta: "12 min · YouTube",
		comprehension: 62,
	},
	{ title: "Reportage Al Jazeera", meta: "8 min · YouTube", comprehension: 34 },
	{
		title: "Court-métrage égyptien",
		meta: "6 min · YouTube",
		comprehension: 12,
	},
] as const;

export const SCREEN_OPTIONS: PreviewScreenOption[] = [
	{ key: "ready", label: "Accueil" },
	{ key: "session", label: "Session" },
	{ key: "end", label: "Fin" },
	{ key: "done", label: "Terminer" },
	{ key: "absent", label: "Absent" },
];

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
	{ key: "all", label: "Toutes" },
	{ key: "for-me", label: "Pour moi" },
	{ key: "friends", label: "Camarades" },
	{ key: "correct", label: "Corriger" },
];

export const GUEST_NOTIFICATION_FEED: FeedItem[] = [
	{
		id: "for-me-1",
		category: "for-me",
		actorName: "Kamal",
		notifType: "friend-activity",
		title: "Ton accent sur يشرب s'améliore",
		body: "Kamal a laissé un retour audio sur يشرب et te propose une répétition ce soir.",
		time: "Il y a 18 min",
		unread: true,
	},
	{
		id: "correct-1",
		category: "correct",
		notifType: "correct-pending",
		title: "3 prononciations t'attendent",
		body: "3 prononciations attendent ton oreille — aide Lina, Samir et Thomas à valider leurs cartes.",
		time: "Il y a 42 min",
		unread: true,
	},
	{
		id: "friends-request-1",
		category: "friends",
		actorName: "Karim",
		notifType: "friend-request",
		title: "Nouvelle demande de connexion",
		body: "Karim t'a envoyé une demande pour devenir camarade.",
		time: "Il y a 1 h",
		unread: true,
	},
	{
		id: "friends-1",
		category: "friends",
		actorName: "Thomas",
		notifType: "friend-activity",
		title: "Thomas vient de finir sa session",
		body: "Thomas vient de finir sa session avec 24 cartes validées et 510 mots actifs.",
		time: "Il y a 2 h",
	},
	{
		id: "for-me-2",
		category: "for-me",
		notifType: "review-reminder",
		title: "Nouveau rappel intelligent",
		body: "Le deck prioritise demain matin les cartes que tu risques vraiment d'oublier.",
		time: "Aujourd'hui",
	},
	{
		id: "friends-2",
		category: "friends",
		notifType: "friend-activity",
		title: "Le cercle avance",
		body: "2 camarades ont repris leurs revues après 5 jours d'absence.",
		time: "Hier",
	},
	{
		id: "correct-2",
		category: "correct",
		notifType: "correct-pending",
		title: "Corriger prend 2 minutes",
		body: "Une passe de corrections rapide aide la communauté à garder des prononciations propres.",
		time: "Hier",
	},
	{
		id: "for-me-3",
		category: "for-me",
		notifType: "review-reminder",
		title: "Ton rappel du soir est prêt",
		body: "8 cartes critiques sont regroupées pour une revue courte avant 21 h ce soir.",
		time: "Avant-hier",
	},
	{
		id: "friends-3",
		category: "friends",
		actorName: "Lina",
		notifType: "friend-activity",
		title: "Lina vient d'entrer dans le cercle",
		body: "Lina vient d'entrer dans le cercle avec 46 mots actifs dès sa première session.",
		time: "Avant-hier",
	},
	{
		id: "for-me-4",
		category: "for-me",
		notifType: "system",
		title: "Ta série de 7 jours tient bon",
		body: "Ta série de 7 jours tient bon — une courte session demain et ton rythme reste intact.",
		time: "Jeudi",
	},
	{
		id: "friends-4",
		category: "friends",
		actorName: "Samir",
		notifType: "friend-activity",
		title: "Samir a débloqué 40 cartes cette semaine",
		body: "Samir a débloqué 40 cartes cette semaine après deux jours de reprise régulière.",
		time: "Jeudi",
	},
	{
		id: "correct-3",
		category: "correct",
		actorName: "Mariam",
		notifType: "correct-pending",
		title: "Une correction attend encore ton oreille",
		body: "Mariam attend ton oreille sur يكتب pour valider sa carte.",
		time: "Mercredi",
		unread: true,
	},
	{
		id: "for-me-5",
		category: "for-me",
		notifType: "system",
		title: "12 cartes sont maintenant stables",
		body: "12 cartes sont maintenant stables — le deck les espace pour libérer les cartes fragiles.",
		time: "Mercredi",
	},
	{
		id: "friends-5",
		category: "friends",
		notifType: "friend-activity",
		title: "Le groupe a franchi 2 400 mots cumulés",
		body: "Le groupe a franchi 2 400 mots cumulés, surtout sur les verbes du quotidien.",
		time: "Mardi",
	},
	{
		id: "for-me-6",
		category: "for-me",
		notifType: "system",
		title: "Ton prochain créneau immersion est suggéré",
		body: "Un podcast de 9 minutes adapté à ton niveau est prêt pour ton prochain créneau immersion.",
		time: "Lundi",
	},
	{
		id: "friends-6",
		category: "friends",
		actorName: "Kamal",
		notifType: "friend-activity",
		title: "Kamal a repris ses revues après sa pause",
		body: "Kamal a relancé ses revues après sa pause avec 17 cartes en douceur.",
		time: "Lundi",
	},
	{
		id: "friends-7",
		category: "friends",
		actorName: "Thomas",
		notifType: "friend-activity",
		title: "Thomas partage sa meilleure série de la semaine",
		body: "Thomas consolide ses cartes instables avec trois sessions consécutives cette semaine.",
		time: "Ce week-end",
	},
];

export const SHARED_REVIEW_SURFACE_PROPS = {
	className: "rounded-[36px]",
	imageSize: "review" as const,
	showImage: true,
	sourceChipPlacement: "bottom" as const,
	sourceChipTone: "muted" as const,
	showSourceChipOnBack: false,
	shortsFlipLabel: "retourner",
	shortsVowelsTooltip: "Ajoute les voyelles/diacritiques a chaque mot.",
};
