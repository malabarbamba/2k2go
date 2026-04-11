export type ClavierArabeLayoutId = "azerty" | "qwerty";

export type ClavierArabeActionId =
	| "copyText"
	| "downloadText"
	| "translateToArabic"
	| "correctText"
	| "convertArabizi"
	| "addDiacritics"
	| "aiAssistant"
	| "copyResult"
	| "replaceText";

export type ClavierArabeSectionId =
	| "typing"
	| "copyDownload"
	| "contextualActions"
	| "quickPhrasesAutocomplete"
	| "faqPrivacy";

export interface ClavierArabeKey {
	id: string;
	latinKey: string;
	arabic: string;
	phonetic: string;
	width?: "standard" | "wide" | "extra-wide";
	category?: "character" | "diacritic" | "control";
	shiftedLatinKey?: string;
}

export interface ClavierArabeKeyboardRow {
	id: string;
	keys: readonly ClavierArabeKey[];
}

export interface ClavierArabeKeyboardLayout {
	id: ClavierArabeLayoutId;
	label: string;
	description: string;
	diacriticsRow: ClavierArabeKeyboardRow;
	rows: readonly ClavierArabeKeyboardRow[];
}

export interface ClavierArabeActionDefinition {
	id: ClavierArabeActionId;
	label: string;
	group: "copy-download" | "contextual" | "result";
	requiresText: boolean;
	outputTarget: "editor" | "result";
}

export interface ClavierArabePhraseVariant {
	id: string;
	value: string;
	label: string;
}

export interface ClavierArabeQuickPhrase {
	id: string;
	label: string;
	insertText: string;
	variants: readonly ClavierArabePhraseVariant[];
}

export interface ClavierArabeQuickPhraseGroup {
	id: string;
	label: string;
	description: string;
	phrases: readonly ClavierArabeQuickPhrase[];
}

export interface ClavierArabeFaqItem {
	id: string;
	question: string;
	answer: string;
}

export interface ClavierArabeAutocompleteSeed {
	id: string;
	term: string;
	transliteration: string;
	category: "salutation" | "quotidien" | "messagerie" | "formule";
	localOnly: true;
}
