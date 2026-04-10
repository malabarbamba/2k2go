import type { ClavierArabeQuickPhraseGroup } from "@/data/clavierArabe/types";

export const CLAVIER_ARABE_QUICK_PHRASE_GROUPS: readonly ClavierArabeQuickPhraseGroup[] =
	[
		{
			id: "salutations",
			label: "salutations",
			description: "Formules pour saluer ou repondre rapidement.",
			phrases: [
				{
					id: "salam-alaykum",
					label: "سلام عليكم",
					insertText: "سلام عليكم",
					variants: [
						{ id: "salam-short", label: "سلام عليكم", value: "سلام عليكم" },
						{
							id: "salam-standard",
							label: "السلام عليكم",
							value: "السلام عليكم",
						},
						{
							id: "salam-complete",
							label: "السلام عليكم ورحمة الله وبركاته",
							value: "السلام عليكم ورحمة الله وبركاته",
						},
					],
				},
				{
					id: "wa-alaykum-salam",
					label: "وعليكم السلام",
					insertText: "وعليكم السلام",
					variants: [
						{
							id: "reply-standard",
							label: "وعليكم السلام",
							value: "وعليكم السلام",
						},
						{
							id: "reply-complete",
							label: "وعليكم السلام ورحمة الله وبركاته",
							value: "وعليكم السلام ورحمة الله وبركاته",
						},
					],
				},
			],
		},
		{
			id: "quotidien",
			label: "quotidien",
			description: "Expressions utiles pour les echanges de tous les jours.",
			phrases: [
				{
					id: "hamdulillah",
					label: "الحمد لله",
					insertText: "الحمد لله",
					variants: [
						{ id: "hamdulillah-short", label: "الحمد لله", value: "الحمد لله" },
						{
							id: "hamdulillah-complete",
							label: "الحمد لله رب العالمين",
							value: "الحمد لله رب العالمين",
						},
					],
				},
				{
					id: "inshaallah",
					label: "إن شاء الله",
					insertText: "إن شاء الله",
					variants: [
						{
							id: "inshaallah-default",
							label: "إن شاء الله",
							value: "إن شاء الله",
						},
					],
				},
				{
					id: "barakallahu-fik",
					label: "بارك الله فيك",
					insertText: "بارك الله فيك",
					variants: [
						{
							id: "baraka-short",
							label: "بارك الله فيك",
							value: "بارك الله فيك",
						},
						{
							id: "baraka-extended",
							label: "بارك الله فيك وجزاك خيرا",
							value: "بارك الله فيك وجزاك خيرا",
						},
					],
				},
			],
		},
		{
			id: "messagerie",
			label: "messagerie",
			description: "Reponses courtes pour messages et reseaux sociaux.",
			phrases: [
				{
					id: "marhaban",
					label: "مرحبا",
					insertText: "مرحبا",
					variants: [
						{ id: "marhaban-default", label: "مرحبا", value: "مرحبا" },
						{
							id: "marhaban-kif-hal",
							label: "مرحبا كيف الحال؟",
							value: "مرحبا كيف الحال؟",
						},
					],
				},
				{
					id: "shukran",
					label: "شكرا",
					insertText: "شكرا",
					variants: [
						{ id: "shukran-default", label: "شكرا", value: "شكرا" },
						{ id: "shukran-jazilan", label: "شكرا جزيلا", value: "شكرا جزيلا" },
					],
				},
				{
					id: "ila-liqa",
					label: "إلى اللقاء",
					insertText: "إلى اللقاء",
					variants: [
						{ id: "bye-default", label: "إلى اللقاء", value: "إلى اللقاء" },
						{
							id: "bye-soon",
							label: "إلى اللقاء قريبا",
							value: "إلى اللقاء قريبا",
						},
					],
				},
			],
		},
		{
			id: "formules-utiles",
			label: "formules utiles",
			description: "Formules religieuses et polies a inserer vite.",
			phrases: [
				{
					id: "mashaallah",
					label: "ما شاء الله",
					insertText: "ما شاء الله",
					variants: [
						{
							id: "mashaallah-default",
							label: "ما شاء الله",
							value: "ما شاء الله",
						},
						{
							id: "mashaallah-tabarakallah",
							label: "ما شاء الله تبارك الله",
							value: "ما شاء الله تبارك الله",
						},
					],
				},
				{
					id: "jazakallahu-khayran",
					label: "جزاك الله خيرا",
					insertText: "جزاك الله خيرا",
					variants: [
						{
							id: "jazakallahu-default",
							label: "جزاك الله خيرا",
							value: "جزاك الله خيرا",
						},
						{
							id: "jazakallahu-baraka",
							label: "جزاك الله خيرا وبارك الله فيك",
							value: "جزاك الله خيرا وبارك الله فيك",
						},
					],
				},
				{
					id: "bismillah",
					label: "بسم الله",
					insertText: "بسم الله",
					variants: [
						{ id: "bismillah-default", label: "بسم الله", value: "بسم الله" },
						{
							id: "bismillah-complete",
							label: "بسم الله الرحمن الرحيم",
							value: "بسم الله الرحمن الرحيم",
						},
					],
				},
			],
		},
	] as const;
