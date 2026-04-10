import type { ClavierArabeAutocompleteSeed } from "@/data/clavierArabe/types";

export const CLAVIER_ARABE_AUTOCOMPLETE_SOURCE = {
	mode: "local-only",
	authRequired: false,
	label: "Suggestions locales",
} as const;

export const CLAVIER_ARABE_AUTOCOMPLETE_SEEDS: readonly ClavierArabeAutocompleteSeed[] =
	[
		{
			id: "salam",
			term: "سلام",
			transliteration: "salam",
			category: "salutation",
			localOnly: true,
		},
		{
			id: "marhaban",
			term: "مرحبا",
			transliteration: "marhaban",
			category: "salutation",
			localOnly: true,
		},
		{
			id: "alaykum",
			term: "عليكم",
			transliteration: "alaykum",
			category: "salutation",
			localOnly: true,
		},
		{
			id: "hamdulillah",
			term: "الحمد لله",
			transliteration: "al-hamdu lillah",
			category: "quotidien",
			localOnly: true,
		},
		{
			id: "inshaallah",
			term: "إن شاء الله",
			transliteration: "inshaallah",
			category: "formule",
			localOnly: true,
		},
		{
			id: "mashaallah",
			term: "ما شاء الله",
			transliteration: "mashaallah",
			category: "formule",
			localOnly: true,
		},
		{
			id: "shukran",
			term: "شكرا",
			transliteration: "shukran",
			category: "messagerie",
			localOnly: true,
		},
		{
			id: "afwan",
			term: "عفوا",
			transliteration: "afwan",
			category: "messagerie",
			localOnly: true,
		},
		{
			id: "kayfa-haluka",
			term: "كيف حالك",
			transliteration: "kayfa haluka",
			category: "quotidien",
			localOnly: true,
		},
		{
			id: "ana-bikhayr",
			term: "أنا بخير",
			transliteration: "ana bikhayr",
			category: "quotidien",
			localOnly: true,
		},
		{
			id: "ila-liqa",
			term: "إلى اللقاء",
			transliteration: "ila al-liqa",
			category: "messagerie",
			localOnly: true,
		},
		{
			id: "jazakallahu-khayran",
			term: "جزاك الله خيرا",
			transliteration: "jazakallahu khayran",
			category: "formule",
			localOnly: true,
		},
	]
		.slice()
		.sort((left, right) => left.term.localeCompare(right.term, "ar"));
