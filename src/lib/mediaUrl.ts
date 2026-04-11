const DEFAULT_PUBLIC_APP_ORIGIN = "https://2k2go.github.io";

type RuntimeMediaConfig = {
	PUBLIC_APP_ORIGIN?: unknown;
	SITE_URL?: unknown;
	AUTH_EMAIL_SITE_URL?: unknown;
};

type WindowWithRuntimeMediaConfig = Window & {
	__SUPABASE_CONFIG__?: RuntimeMediaConfig;
};

const toOptionalNonEmptyString = (value: unknown): string | null => {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const isLocalDevelopmentOrigin = (origin: string): boolean => {
	try {
		const parsed = new URL(origin);
		return (
			parsed.hostname === "localhost" ||
			parsed.hostname === "127.0.0.1" ||
			parsed.hostname === "0.0.0.0"
		);
	} catch {
		return false;
	}
};

const isBundledAssetPath = (value: string): boolean =>
	value.startsWith("/src/assets/") || value.startsWith("/assets/");

const resolveConfiguredPublicAppOrigin = (): string | null => {
	if (typeof window === "undefined") {
		return null;
	}

	const runtimeConfig = (window as WindowWithRuntimeMediaConfig)
		.__SUPABASE_CONFIG__;

	return (
		toOptionalNonEmptyString(runtimeConfig?.PUBLIC_APP_ORIGIN) ??
		toOptionalNonEmptyString(runtimeConfig?.SITE_URL) ??
		toOptionalNonEmptyString(runtimeConfig?.AUTH_EMAIL_SITE_URL) ??
		toOptionalNonEmptyString(import.meta.env.VITE_PUBLIC_APP_ORIGIN) ??
		toOptionalNonEmptyString(import.meta.env.VITE_SITE_URL)
	);
};

const resolveCurrentWindowOrigin = (): string | null => {
	if (typeof window === "undefined") {
		return null;
	}

	return toOptionalNonEmptyString(window.location.origin);
};

export const resolvePublicAppOrigin = (): string => {
	if (typeof window === "undefined") {
		return DEFAULT_PUBLIC_APP_ORIGIN;
	}

	const currentOrigin = toOptionalNonEmptyString(window.location.origin);
	if (!currentOrigin || isLocalDevelopmentOrigin(currentOrigin)) {
		return resolveConfiguredPublicAppOrigin() ?? DEFAULT_PUBLIC_APP_ORIGIN;
	}

	return currentOrigin;
};

export const resolveMediaUrl = (value: unknown): string | null => {
	const normalizedValue = toOptionalNonEmptyString(value);
	if (!normalizedValue) {
		return null;
	}

	if (
		normalizedValue.startsWith("data:") ||
		normalizedValue.startsWith("blob:") ||
		/^https?:\/\//i.test(normalizedValue)
	) {
		return normalizedValue;
	}

	if (normalizedValue.startsWith("//")) {
		return `https:${normalizedValue}`;
	}

	if (normalizedValue.startsWith("/")) {
		const currentOrigin = resolveCurrentWindowOrigin();
		// Bundled Vite assets should stay on the current app origin; persisted
		// media paths like /immersion/... are resolved against the public media host.
		if (currentOrigin && isBundledAssetPath(normalizedValue)) {
			return new URL(normalizedValue, currentOrigin).toString();
		}

		return new URL(normalizedValue, resolvePublicAppOrigin()).toString();
	}

	return normalizedValue;
};
