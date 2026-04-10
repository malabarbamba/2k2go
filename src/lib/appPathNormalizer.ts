const PREVIEW_APP_ROOT_PATH = "/app";
const SIDEBAR_APP_ROOT_PATH = "/app-legacy";
const PREVIEW_FRIENDS_PATH = "/app/amis";
const PROFILE_FRIENDS_PATH = "/profil/amis";
const PREVIEW_APP_FIRST_SEGMENTS = new Set([
	"",
	"absent",
	"bank",
	"contacts",
	"camarades",
	"cgu",
	"arabic-keyboard",
	"clavier-arabe-en-ligne",
	"confidentialite",
	"decks",
	"docs",
	"done",
	"video-immersion-ai",
	"video-immersion",
	"end",
	"immersion-video",
	"notifications",
	"profile",
	"profil",
	"session",
	"settings",
	"why-it-works",
	"pourquoi-ca-marche",
]);

const ABSOLUTE_HTTP_URL_PATTERN = /^https?:\/\//i;

const resolveInternalPath = (
	value: string,
	currentOrigin: string | null,
): string | null => {
	const trimmedValue = value.trim();
	if (!trimmedValue || trimmedValue.startsWith("//")) {
		return null;
	}

	if (trimmedValue.startsWith("/")) {
		return trimmedValue;
	}

	if (!ABSOLUTE_HTTP_URL_PATTERN.test(trimmedValue) || !currentOrigin) {
		return null;
	}

	try {
		const parsedUrl = new URL(trimmedValue);
		const expectedOrigin = new URL(currentOrigin);
		if (
			(parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") ||
			parsedUrl.origin !== expectedOrigin.origin
		) {
			return null;
		}

		return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
	} catch {
		return null;
	}
};

const isPreviewAppPathname = (pathname: string): boolean => {
	if (pathname === PREVIEW_APP_ROOT_PATH) {
		return true;
	}

	if (!pathname.startsWith(`${PREVIEW_APP_ROOT_PATH}/`)) {
		return false;
	}

	const firstPathSegment =
		pathname
			.slice(`${PREVIEW_APP_ROOT_PATH}/`.length)
			.split("/", 1)[0]
			?.toLowerCase() ?? "";

	return PREVIEW_APP_FIRST_SEGMENTS.has(firstPathSegment);
};

export const normalizeAppPathname = (pathname: string): string => {
	const collapsedPathname = pathname.replace(/\/{2,}/g, "/");

	if (
		collapsedPathname === PREVIEW_FRIENDS_PATH ||
		collapsedPathname.startsWith(`${PREVIEW_FRIENDS_PATH}/`)
	) {
		return collapsedPathname.replace(/^\/app\/amis(?=\/|$)/, PROFILE_FRIENDS_PATH);
	}

	if (isPreviewAppPathname(collapsedPathname)) {
		return collapsedPathname;
	}

	if (
		collapsedPathname === PREVIEW_APP_ROOT_PATH ||
		collapsedPathname.startsWith(`${PREVIEW_APP_ROOT_PATH}/`)
	) {
		return collapsedPathname.replace(/^\/app(?=\/|$)/, SIDEBAR_APP_ROOT_PATH);
	}

	return collapsedPathname;
};

export const normalizeAppNavigationTarget = (
	value: string,
	options?: {
		currentOrigin?: string | null;
	},
): string | null => {
	const currentOrigin =
		options?.currentOrigin ??
		(typeof window !== "undefined" ? window.location.origin : null);
	const internalPath = resolveInternalPath(value, currentOrigin);
	if (!internalPath) {
		return null;
	}

	const normalizedUrl = new URL(internalPath, "https://app.local");
	normalizedUrl.pathname = normalizeAppPathname(normalizedUrl.pathname);
	return `${normalizedUrl.pathname}${normalizedUrl.search}${normalizedUrl.hash}`;
};
