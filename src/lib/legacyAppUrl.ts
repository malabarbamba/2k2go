const LEGACY_APP_ROOT_PATH = "/app";
const CANONICAL_APP_ROOT_PATH = "/app-legacy";
const LEGACY_FRIENDS_PATH = "/app/amis";
const CANONICAL_FRIENDS_PATH = "/profil/amis";
const PREVIEW_APP_FIRST_SEGMENTS = new Set([
	"",
	"absent",
	"bank",
	"camarades",
	"cgu",
	"clavier-arabe-en-ligne",
	"confidentialite",
	"decks",
	"docs",
	"done",
	"end",
	"notifications",
	"profile",
	"profil",
	"session",
	"settings",
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
	if (pathname === LEGACY_APP_ROOT_PATH) {
		return true;
	}

	if (!pathname.startsWith(`${LEGACY_APP_ROOT_PATH}/`)) {
		return false;
	}

	const firstPathSegment =
		pathname
			.slice(`${LEGACY_APP_ROOT_PATH}/`.length)
			.split("/", 1)[0]
			?.toLowerCase() ?? "";

	return PREVIEW_APP_FIRST_SEGMENTS.has(firstPathSegment);
};

export const normalizeLegacyAppPathname = (pathname: string): string => {
	const collapsedPathname = pathname.replace(/\/{2,}/g, "/");

	if (
		collapsedPathname === LEGACY_FRIENDS_PATH ||
		collapsedPathname.startsWith(`${LEGACY_FRIENDS_PATH}/`)
	) {
		return collapsedPathname.replace(
			/^\/app\/amis(?=\/|$)/,
			CANONICAL_FRIENDS_PATH,
		);
	}

	if (isPreviewAppPathname(collapsedPathname)) {
		return collapsedPathname;
	}

	if (
		collapsedPathname === LEGACY_APP_ROOT_PATH ||
		collapsedPathname.startsWith(`${LEGACY_APP_ROOT_PATH}/`)
	) {
		return collapsedPathname.replace(/^\/app(?=\/|$)/, CANONICAL_APP_ROOT_PATH);
	}

	return collapsedPathname;
};

export const normalizeLegacyAppNavigationTarget = (
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

	const normalizedUrl = new URL(internalPath, "https://arabeurgence.local");
	normalizedUrl.pathname = normalizeLegacyAppPathname(normalizedUrl.pathname);
	return `${normalizedUrl.pathname}${normalizedUrl.search}${normalizedUrl.hash}`;
};
