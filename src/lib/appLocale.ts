export type AppLocale = "fr" | "en";

export const APP_LOCALE_STORAGE_KEY = "app_locale";

export const FRENCH_DEFAULT_COUNTRY_CODES = new Set([
	"FR",
	"BE",
	"CH",
	"DZ",
	"MA",
	"TN",
]);

export function isAppLocale(value: unknown): value is AppLocale {
	return value === "fr" || value === "en";
}

export function resolveLocaleFromCountryCode(
	countryCode: string | null | undefined,
): AppLocale | null {
	if (typeof countryCode !== "string") {
		return null;
	}

	const normalizedCountryCode = countryCode.trim().toUpperCase();
	if (normalizedCountryCode.length !== 2) {
		return null;
	}

	return FRENCH_DEFAULT_COUNTRY_CODES.has(normalizedCountryCode) ? "fr" : "en";
}

export function resolveLocaleFromLanguageTag(
	languageTag: string | null | undefined,
): AppLocale | null {
	if (typeof languageTag !== "string") {
		return null;
	}

	const normalizedLanguageTag = languageTag.trim().toLowerCase();
	if (!normalizedLanguageTag) {
		return null;
	}

	return normalizedLanguageTag.startsWith("fr") ? "fr" : "en";
}

export function readStoredAppLocale(): AppLocale | null {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		const rawValue = window.localStorage.getItem(APP_LOCALE_STORAGE_KEY);
		return isAppLocale(rawValue) ? rawValue : null;
	} catch {
		return null;
	}
}

export function writeStoredAppLocale(locale: AppLocale): void {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, locale);
	} catch {
		// Ignore localStorage write failures.
	}
}

export function detectNavigatorLocale(): AppLocale {
	if (typeof navigator === "undefined") {
		return "en";
	}

	const candidateLanguages = Array.isArray(navigator.languages)
		? navigator.languages
		: [];
	const firstMatch = candidateLanguages
		.map((language) => resolveLocaleFromLanguageTag(language))
		.find((locale) => locale !== null);

	return firstMatch ?? resolveLocaleFromLanguageTag(navigator.language) ?? "en";
}
