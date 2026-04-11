import { matchPath } from "react-router-dom";

const ROUTE_AUTH_ACCESS = {
	PUBLIC: "public",
	AUTH_REQUIRED: "auth-required",
	GUEST_ALLOWED: "guest-allowed",
	AUTH_OPTIONAL_PREVIEW: "auth-optional-preview",
} as const;

type RouteAuthAccess =
	(typeof ROUTE_AUTH_ACCESS)[keyof typeof ROUTE_AUTH_ACCESS];
type AuthSensitiveScopeGroup = "webapp-sidebar" | "excluded";

type RouteAuthContractEntry = {
	path: string;
	access: RouteAuthAccess;
};

type MountedRouteAuthContractEntry = RouteAuthContractEntry & {
	scope: AuthSensitiveScopeGroup;
};

const ROUTE_PATHS = {
	AUTH: "/auth",
	ONBOARDING: "/onboarding",
	PASSWORD_RESET: "/nouveau-mot-de-passe",
	ONBOARDING_INTERMEDIATE: "/test-onboarding-intermediate",
	CALENDAR_REVIEW_REMINDERS: "/calendar/review-reminders/:token",
	APP_ROOT: "/app-legacy",
	APP_IMMERSION: "/app-legacy/immersion",
	APP_IMMERSION_VIDEO: "/app-legacy/immersion/video/:videoId/:youtubeId?",
	APP_IMMERSION_SHORTS: "/app-legacy/immersion/shorts/:videoId",
	APP_VOCABULAIRE: "/app-legacy/vocabulaire",
	APP_PROFIL: "/app-legacy/profil",
	APP_PROFIL_PUBLIC: "/app-legacy/profil/:username",
	APP_CLASSEMENT: "/app-legacy/classement",
	APP_COLLECT: "/app-legacy/collecte",
	APP_COLLECT_ALIAS: "/app-legacy/collect",
	APP_DECK_PERSO: "/app-legacy/deck-perso",
	APP_ALPHABET: "/app-legacy/alphabet",
	APP_QUIZZ_ALPHABET: "/app-legacy/quizz/alphabet",
	APP_DOCS: "/app-legacy/docs/*",
	APP_REVUE: "/app-legacy/revue",
	APP_REVUE_PREVIEW: "/app-legacy/revue-preview",
	PREVIEW_NEW_CONCEPT: "/app/*",
	APP_PROGRESSION: "/app-legacy/progression",
	APP_PARAMETRES: "/app-legacy/parametres",
	PROFIL_ROOT: "/profil",
	PROFIL_PROGRESSION: "/profil/progression",
	PROFIL_INFORMATIONS: "/profil/informations",
	PROFIL_AMIS: "/profil/amis",
	PROFIL_PARAMETRES: "/profil/parametres",
	JOUR_1: "/jour-1",
	JOUR_2: "/jour-2",
	JOUR_3: "/jour-3",
} as const;

const ROUTE_PATH_GROUPS = {
	APP_ALL: "/app-legacy/*",
	PROFIL_ALL: "/profil/*",
	JOUR_ALL: "/jour-*",
} as const;

const APP_GUEST_ALLOWED_ROUTES = [
	ROUTE_PATHS.APP_ROOT,
	ROUTE_PATHS.APP_IMMERSION,
	ROUTE_PATHS.APP_IMMERSION_VIDEO,
	ROUTE_PATHS.APP_IMMERSION_SHORTS,
	ROUTE_PATHS.APP_VOCABULAIRE,
	ROUTE_PATHS.APP_CLASSEMENT,
	ROUTE_PATHS.APP_COLLECT,
	ROUTE_PATHS.APP_COLLECT_ALIAS,
	ROUTE_PATHS.APP_DECK_PERSO,
	ROUTE_PATHS.APP_REVUE,
	ROUTE_PATHS.APP_REVUE_PREVIEW,
] as const;

const APP_PUBLIC_PREVIEW_EXCEPTIONS = [ROUTE_PATHS.APP_DOCS] as const;

const AUTH_SENSITIVE_ROUTE_CLASS_CONTRACT = [
	{ path: ROUTE_PATHS.AUTH, access: ROUTE_AUTH_ACCESS.PUBLIC },
	{ path: ROUTE_PATHS.ONBOARDING, access: ROUTE_AUTH_ACCESS.PUBLIC },
	{ path: ROUTE_PATHS.PASSWORD_RESET, access: ROUTE_AUTH_ACCESS.PUBLIC },
	{
		path: ROUTE_PATHS.CALENDAR_REVIEW_REMINDERS,
		access: ROUTE_AUTH_ACCESS.PUBLIC,
	},
	{ path: ROUTE_PATHS.APP_ROOT, access: ROUTE_AUTH_ACCESS.GUEST_ALLOWED },
	{ path: ROUTE_PATH_GROUPS.APP_ALL, access: ROUTE_AUTH_ACCESS.AUTH_REQUIRED },
	{
		path: ROUTE_PATH_GROUPS.PROFIL_ALL,
		access: ROUTE_AUTH_ACCESS.AUTH_REQUIRED,
	},
	{ path: ROUTE_PATH_GROUPS.JOUR_ALL, access: ROUTE_AUTH_ACCESS.AUTH_REQUIRED },
] as const satisfies readonly RouteAuthContractEntry[];

const AUTH_SENSITIVE_MOUNTED_ROUTE_CONTRACT = [
	{
		path: ROUTE_PATHS.AUTH,
		access: ROUTE_AUTH_ACCESS.PUBLIC,
		scope: "excluded",
	},
	{
		path: ROUTE_PATHS.ONBOARDING,
		access: ROUTE_AUTH_ACCESS.PUBLIC,
		scope: "excluded",
	},
	{
		path: ROUTE_PATHS.PASSWORD_RESET,
		access: ROUTE_AUTH_ACCESS.PUBLIC,
		scope: "excluded",
	},
	{
		path: ROUTE_PATHS.CALENDAR_REVIEW_REMINDERS,
		access: ROUTE_AUTH_ACCESS.PUBLIC,
		scope: "excluded",
	},
	{
		path: ROUTE_PATHS.PREVIEW_NEW_CONCEPT,
		access: ROUTE_AUTH_ACCESS.PUBLIC,
		scope: "excluded",
	},
	{
		path: ROUTE_PATHS.APP_ROOT,
		access: ROUTE_AUTH_ACCESS.GUEST_ALLOWED,
		scope: "webapp-sidebar",
	},
	{
		path: ROUTE_PATHS.APP_IMMERSION,
		access: ROUTE_AUTH_ACCESS.GUEST_ALLOWED,
		scope: "webapp-sidebar",
	},
	{
		path: ROUTE_PATHS.APP_IMMERSION_VIDEO,
		access: ROUTE_AUTH_ACCESS.GUEST_ALLOWED,
		scope: "webapp-sidebar",
	},
	{
		path: ROUTE_PATHS.APP_IMMERSION_SHORTS,
		access: ROUTE_AUTH_ACCESS.GUEST_ALLOWED,
		scope: "webapp-sidebar",
	},
	{
		path: ROUTE_PATHS.APP_VOCABULAIRE,
		access: ROUTE_AUTH_ACCESS.GUEST_ALLOWED,
		scope: "webapp-sidebar",
	},
	{
		path: ROUTE_PATHS.APP_CLASSEMENT,
		access: ROUTE_AUTH_ACCESS.GUEST_ALLOWED,
		scope: "webapp-sidebar",
	},
	{
		path: ROUTE_PATHS.APP_COLLECT,
		access: ROUTE_AUTH_ACCESS.GUEST_ALLOWED,
		scope: "webapp-sidebar",
	},
	{
		path: ROUTE_PATHS.APP_COLLECT_ALIAS,
		access: ROUTE_AUTH_ACCESS.GUEST_ALLOWED,
		scope: "webapp-sidebar",
	},
	{
		path: ROUTE_PATHS.APP_DECK_PERSO,
		access: ROUTE_AUTH_ACCESS.GUEST_ALLOWED,
		scope: "webapp-sidebar",
	},
	{
		path: ROUTE_PATHS.APP_ALPHABET,
		access: ROUTE_AUTH_ACCESS.AUTH_REQUIRED,
		scope: "webapp-sidebar",
	},
	{
		path: ROUTE_PATHS.APP_QUIZZ_ALPHABET,
		access: ROUTE_AUTH_ACCESS.AUTH_REQUIRED,
		scope: "webapp-sidebar",
	},
	{
		path: ROUTE_PATHS.APP_DOCS,
		access: ROUTE_AUTH_ACCESS.AUTH_OPTIONAL_PREVIEW,
		scope: "webapp-sidebar",
	},
	{
		path: ROUTE_PATHS.APP_REVUE,
		access: ROUTE_AUTH_ACCESS.GUEST_ALLOWED,
		scope: "webapp-sidebar",
	},
	{
		path: ROUTE_PATHS.APP_REVUE_PREVIEW,
		access: ROUTE_AUTH_ACCESS.GUEST_ALLOWED,
		scope: "webapp-sidebar",
	},
	{
		path: ROUTE_PATHS.APP_PROFIL,
		access: ROUTE_AUTH_ACCESS.AUTH_REQUIRED,
		scope: "webapp-sidebar",
	},
	{
		path: ROUTE_PATHS.APP_PROFIL_PUBLIC,
		access: ROUTE_AUTH_ACCESS.PUBLIC,
		scope: "webapp-sidebar",
	},
	{
		path: ROUTE_PATHS.APP_PROGRESSION,
		access: ROUTE_AUTH_ACCESS.AUTH_REQUIRED,
		scope: "webapp-sidebar",
	},
	{
		path: ROUTE_PATHS.APP_PARAMETRES,
		access: ROUTE_AUTH_ACCESS.AUTH_REQUIRED,
		scope: "webapp-sidebar",
	},
	{
		path: ROUTE_PATHS.PROFIL_ROOT,
		access: ROUTE_AUTH_ACCESS.AUTH_REQUIRED,
		scope: "webapp-sidebar",
	},
	{
		path: ROUTE_PATHS.PROFIL_PROGRESSION,
		access: ROUTE_AUTH_ACCESS.AUTH_REQUIRED,
		scope: "webapp-sidebar",
	},
	{
		path: ROUTE_PATHS.PROFIL_INFORMATIONS,
		access: ROUTE_AUTH_ACCESS.AUTH_REQUIRED,
		scope: "webapp-sidebar",
	},
	{
		path: ROUTE_PATHS.PROFIL_AMIS,
		access: ROUTE_AUTH_ACCESS.AUTH_REQUIRED,
		scope: "webapp-sidebar",
	},
	{
		path: ROUTE_PATHS.PROFIL_PARAMETRES,
		access: ROUTE_AUTH_ACCESS.AUTH_REQUIRED,
		scope: "webapp-sidebar",
	},
	{
		path: ROUTE_PATHS.JOUR_1,
		access: ROUTE_AUTH_ACCESS.AUTH_REQUIRED,
		scope: "excluded",
	},
	{
		path: ROUTE_PATHS.JOUR_2,
		access: ROUTE_AUTH_ACCESS.AUTH_REQUIRED,
		scope: "excluded",
	},
	{
		path: ROUTE_PATHS.JOUR_3,
		access: ROUTE_AUTH_ACCESS.AUTH_REQUIRED,
		scope: "excluded",
	},
] as const satisfies readonly MountedRouteAuthContractEntry[];

const AUTH_CONTRACT_PATTERN_ALIASES: Readonly<Record<string, string>> = {
	"/jour-*": "/jour-:day",
};

const normalizeContractPattern = (pattern: string): string => {
	return AUTH_CONTRACT_PATTERN_ALIASES[pattern] ?? pattern;
};

const buildAppProfilePath = (username: string | null | undefined): string => {
	const normalizedUsername =
		typeof username === "string" ? username.trim() : "";
	if (normalizedUsername.length === 0) {
		return ROUTE_PATHS.APP_PROFIL;
	}

	return ROUTE_PATHS.APP_PROFIL_PUBLIC.replace(
		":username",
		encodeURIComponent(normalizedUsername),
	);
};

const matchesContractPath = (
	contractPath: string,
	pathname: string,
): boolean => {
	const matcherPath = normalizeContractPattern(contractPath);
	return Boolean(matchPath({ path: matcherPath, end: true }, pathname));
};

const getRouteAuthAccess = (pathname: string): RouteAuthAccess | null => {
	for (const contractEntry of AUTH_SENSITIVE_MOUNTED_ROUTE_CONTRACT) {
		if (matchesContractPath(contractEntry.path, pathname)) {
			return contractEntry.access;
		}
	}

	for (const contractEntry of AUTH_SENSITIVE_ROUTE_CLASS_CONTRACT) {
		if (matchesContractPath(contractEntry.path, pathname)) {
			return contractEntry.access;
		}
	}

	return null;
};

const AUTH_SENSITIVE_WEBAPP_SCOPE_PATTERNS =
	AUTH_SENSITIVE_MOUNTED_ROUTE_CONTRACT.filter(
		(contractEntry) => contractEntry.scope === "webapp-sidebar",
	).map((contractEntry) => contractEntry.path);

const AUTH_SENSITIVE_EXCLUDED_SCOPE_PATTERNS =
	AUTH_SENSITIVE_MOUNTED_ROUTE_CONTRACT.filter(
		(contractEntry) => contractEntry.scope === "excluded",
	).map((contractEntry) => contractEntry.path);

export {
	APP_GUEST_ALLOWED_ROUTES,
	APP_PUBLIC_PREVIEW_EXCEPTIONS,
	AUTH_SENSITIVE_EXCLUDED_SCOPE_PATTERNS,
	AUTH_SENSITIVE_MOUNTED_ROUTE_CONTRACT,
	AUTH_SENSITIVE_ROUTE_CLASS_CONTRACT,
	AUTH_SENSITIVE_WEBAPP_SCOPE_PATTERNS,
	ROUTE_AUTH_ACCESS,
	ROUTE_PATH_GROUPS,
	ROUTE_PATHS,
	buildAppProfilePath,
	getRouteAuthAccess,
	matchesContractPath,
};

export type {
	AuthSensitiveScopeGroup,
	MountedRouteAuthContractEntry,
	RouteAuthAccess,
	RouteAuthContractEntry,
};
