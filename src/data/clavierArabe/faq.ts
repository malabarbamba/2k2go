import type { ClavierArabeFaqItem } from "@/data/clavierArabe/types";

export const CLAVIER_ARABE_FAQ_ITEMS: readonly ClavierArabeFaqItem[] = [
	{
		id: "use-keyboard",
		question: "Comment utiliser ce clavier ?",
		answer:
			"Tapez avec votre clavier physique ou cliquez sur les touches virtuelles pour composer du texte arabe dans la zone de saisie.",
	},
	{
		id: "copy-text",
		question: "Comment copier mon texte ?",
		answer:
			"Utilisez le bouton Copier le texte pour envoyer votre phrase vers WhatsApp, un email, un document ou toute autre application.",
	},
	{
		id: "change-layout",
		question: "Comment changer la disposition du clavier ?",
		answer:
			"Le basculeur AZERTY ou QWERTY reste visible, et votre preference de disposition est memorisee dans ce navigateur.",
	},
	{
		id: "assistant",
		question: "A quoi sert l'assistant ?",
		answer:
			"Assistant IA sert de point d'entree pour corriger, traduire ou proposer une reformulation sans quitter la page.",
	},
] as const;
