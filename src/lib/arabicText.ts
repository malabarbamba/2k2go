const ARABIC_DIACRITICS_REGEX =
	/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const TATWEEL_REGEX = /\u0640/g;
const HTML_TAG_REGEX = /<[^>]*>/g;

export const stripArabicDiacritics = (value: string): string =>
	value.replace(ARABIC_DIACRITICS_REGEX, "").replace(TATWEEL_REGEX, "");

export const normalizeArabicToken = (value: string): string =>
	stripArabicDiacritics(value)
		.replace(/[!?.,;:()[\]{}"'`~_-]/g, " ")
		.replace(/\s+/g, " ")
		.trim();

export const countWordsInPhrase = (value: string): number => {
	const cleaned = normalizeArabicToken(value.replace(HTML_TAG_REGEX, " "));
	if (!cleaned) {
		return 0;
	}

	return cleaned.split(" ").filter(Boolean).length;
};
