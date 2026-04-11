import type {
	ClavierArabeActionDefinition,
	ClavierArabeSectionId,
} from "@/data/clavierArabe/types";

export const CLAVIER_ARABE_PAGE_TITLE = "Clavier arabe en ligne";

export const CLAVIER_ARABE_CANONICAL_PUBLIC_LABELS = {
	pageTitle: CLAVIER_ARABE_PAGE_TITLE,
	copyText: "Copier le texte",
	downloadText: "Télécharger en .txt",
	translateToArabic: "Traduire en arabe",
	correctText: "Corriger",
	convertArabizi: "Convertir Arabizi",
	addDiacritics: "Ajouter les voyelles",
	aiAssistant: "Assistant IA",
	copyResult: "Copier le résultat",
	replaceText: "Remplacer le texte",
} as const;

export const CLAVIER_ARABE_COPY_SECTIONS: readonly {
	id: ClavierArabeSectionId;
	label: string;
}[] = [
	{ id: "typing", label: "Saisie" },
	{ id: "copyDownload", label: "Copie et téléchargement" },
	{ id: "contextualActions", label: "Actions contextuelles" },
	{
		id: "quickPhrasesAutocomplete",
		label: "Phrases rapides et autocomplétion",
	},
	{ id: "faqPrivacy", label: "FAQ et confidentialité" },
] as const;

export const CLAVIER_ARABE_LABELS = {
	typing: {
		sectionTitle: "Saisie",
		textareaLabel: "Zone de texte arabe",
		placeholder: "ابدأ الكتابة هنا",
		layoutToggle: "Disposition du clavier",
		azerty: "AZERTY",
		qwerty: "QWERTY",
		diacriticsRow: "Voyelles et signes",
	},
	copyDownload: {
		sectionTitle: "Copie et téléchargement",
		copyText: CLAVIER_ARABE_CANONICAL_PUBLIC_LABELS.copyText,
		downloadText: CLAVIER_ARABE_CANONICAL_PUBLIC_LABELS.downloadText,
		copyResult: CLAVIER_ARABE_CANONICAL_PUBLIC_LABELS.copyResult,
		replaceText: CLAVIER_ARABE_CANONICAL_PUBLIC_LABELS.replaceText,
		copiedFeedback: "Texte copié",
		downloadFilePrefix: "texte-arabe",
	},
	contextualActions: {
		sectionTitle: "Actions contextuelles",
		translateToArabic: CLAVIER_ARABE_CANONICAL_PUBLIC_LABELS.translateToArabic,
		correctText: CLAVIER_ARABE_CANONICAL_PUBLIC_LABELS.correctText,
		convertArabizi: CLAVIER_ARABE_CANONICAL_PUBLIC_LABELS.convertArabizi,
		addDiacritics: CLAVIER_ARABE_CANONICAL_PUBLIC_LABELS.addDiacritics,
		aiAssistant: CLAVIER_ARABE_CANONICAL_PUBLIC_LABELS.aiAssistant,
		resultReady: "Résultat prêt",
	},
	quickPhrasesAutocomplete: {
		sectionTitle: "Phrases rapides et autocomplétion",
		quickPhrasesLabel: "Phrases rapides",
		autocompleteLabel: "Suggestions locales",
		showMore: "Plus de phrases",
		addCustomPhrase: "Ajouter une phrase",
		noSuggestion: "Aucune suggestion locale",
	},
	faqPrivacy: {
		sectionTitle: "FAQ et confidentialité",
		faqLabel: "Questions fréquentes",
		privacyLabel: "Confidentialité",
	},
} as const;

export const CLAVIER_ARABE_ACTIONS: readonly ClavierArabeActionDefinition[] = [
	{
		id: "copyText",
		label: CLAVIER_ARABE_CANONICAL_PUBLIC_LABELS.copyText,
		group: "copy-download",
		requiresText: true,
		outputTarget: "editor",
	},
	{
		id: "downloadText",
		label: CLAVIER_ARABE_CANONICAL_PUBLIC_LABELS.downloadText,
		group: "copy-download",
		requiresText: true,
		outputTarget: "editor",
	},
	{
		id: "translateToArabic",
		label: CLAVIER_ARABE_CANONICAL_PUBLIC_LABELS.translateToArabic,
		group: "contextual",
		requiresText: true,
		outputTarget: "editor",
	},
	{
		id: "correctText",
		label: CLAVIER_ARABE_CANONICAL_PUBLIC_LABELS.correctText,
		group: "contextual",
		requiresText: true,
		outputTarget: "editor",
	},
	{
		id: "convertArabizi",
		label: CLAVIER_ARABE_CANONICAL_PUBLIC_LABELS.convertArabizi,
		group: "contextual",
		requiresText: true,
		outputTarget: "editor",
	},
	{
		id: "addDiacritics",
		label: CLAVIER_ARABE_CANONICAL_PUBLIC_LABELS.addDiacritics,
		group: "contextual",
		requiresText: true,
		outputTarget: "editor",
	},
	{
		id: "aiAssistant",
		label: CLAVIER_ARABE_CANONICAL_PUBLIC_LABELS.aiAssistant,
		group: "contextual",
		requiresText: false,
		outputTarget: "editor",
	},
	{
		id: "copyResult",
		label: CLAVIER_ARABE_CANONICAL_PUBLIC_LABELS.copyResult,
		group: "result",
		requiresText: true,
		outputTarget: "result",
	},
	{
		id: "replaceText",
		label: CLAVIER_ARABE_CANONICAL_PUBLIC_LABELS.replaceText,
		group: "result",
		requiresText: true,
		outputTarget: "result",
	},
] as const;
