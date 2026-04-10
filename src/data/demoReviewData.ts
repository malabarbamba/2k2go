// Demo data for deck-perso-visual-demo page
// 7 cards distributed across 3 review types

import imgEcole from "@/assets/cards/1k_ecole.avif";
import imgIlEcrit from "@/assets/cards/1k_il_ecrit.avif";
import imgLivre from "@/assets/cards/1k_livre.avif";

export type ReviewType = "foundation" | "collected" | "sent";

export interface DemoCard {
	id: number;
	word: string;
	vocabBase: string;
	vocabFull: string;
	vocabDef: string;
	sentBase: string;
	sentFull: string;
	sentFrench: string;
	score: number;
	color: string;
	reviewType: ReviewType;
	image?: string;
	focus?: string;
	tags: string[];
	/** Date when the card was added/created - used for sorting */
	createdAt: Date;
}

// VocabCard type for CardsReview component
export interface VocabCard {
	id: number | string;
	focus?: string;
	tags: string[];
	sentBase: string;
	sentFull: string;
	sentFrench: string;
	vocabBase: string;
	vocabFull: string;
	vocabDef: string;
	image?: string;
}

// Gradient colors for mastery levels
const COLORS = {
	high: "#2ee6a4", // Green - well mastered
	medium: "#e6c92e", // Yellow - intermediate
	low: "#e65a2e", // Orange - learning
};

// 7 demo cards for the visual demo
// Dates are spread across different time periods to demonstrate sorting
const now = new Date();
const daysAgo = (days: number) =>
	new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

export const DEMO_CARDS: DemoCard[] = [
	// === 5 cards in "Revues Fondations 2000" ===
	{
		id: 1,
		word: "كِتَاب",
		vocabBase: "كتاب",
		vocabFull: "كِتَابٌ",
		vocabDef: "livre",
		sentBase: "هذا <b>كتاب</b> جميل",
		sentFull: "هَذَا <b>كِتَابٌ</b> جَمِيلٌ",
		sentFrench: "C'est un beau livre",
		score: 9.2,
		color: COLORS.high,
		reviewType: "foundation",
		image: imgLivre,
		focus: "1",
		tags: ["Nom", "Fréquent"],
		createdAt: daysAgo(2), // Très récent
	},
	{
		id: 2,
		word: "مَدْرَسَة",
		vocabBase: "المدرسة",
		vocabFull: "الْمَدْرَسَةِ",
		vocabDef: "école",
		sentBase: "أذهب إلى <b>المدرسة</b>",
		sentFull: "أَذْهَبُ إِلَى <b>الْمَدْرَسَةِ</b>",
		sentFrench: "Je vais à l'école",
		score: 8.5,
		color: COLORS.high,
		reviewType: "foundation",
		image: imgEcole,
		focus: "2",
		tags: ["Nom", "Lieu"],
		createdAt: daysAgo(1), // Le plus récent
	},
	{
		id: 3,
		word: "يَوْم",
		vocabBase: "يوم",
		vocabFull: "يَوْمٌ",
		vocabDef: "jour",
		sentBase: "<b>اليوم</b> جميل",
		sentFull: "<b>الْيَوْمُ</b> جَمِيلٌ",
		sentFrench: "Aujourd'hui est beau",
		score: 7.8,
		color: COLORS.medium,
		reviewType: "foundation",
		focus: "3",
		tags: ["Nom", "Temps"],
		createdAt: daysAgo(5), // Récent
	},
	{
		id: 4,
		word: "شُكْرًا",
		vocabBase: "شكرا",
		vocabFull: "شُكْرًا",
		vocabDef: "merci",
		sentBase: "<b>شكرا</b> جزيلا",
		sentFull: "<b>شُكْرًا</b> جَزِيلًا",
		sentFrench: "Merci beaucoup",
		score: 6.5,
		color: COLORS.medium,
		reviewType: "foundation",
		focus: "4",
		tags: ["Expression"],
		createdAt: daysAgo(10), // Moyennement récent
	},
	{
		id: 5,
		word: "مَاء",
		vocabBase: "ماء",
		vocabFull: "مَاءٌ",
		vocabDef: "eau",
		sentBase: "أشرب <b>الماء</b>",
		sentFull: "أَشْرَبُ <b>الْمَاءَ</b>",
		sentFrench: "Je bois de l'eau",
		score: 5.2,
		color: COLORS.low,
		reviewType: "foundation",
		focus: "5",
		tags: ["Nom"],
		createdAt: daysAgo(30), // Ancien
	},

	// === 1 card in "Revues collectées (vidéos)" ===
	{
		id: 6,
		word: "سَيَّارَة",
		vocabBase: "سيارة",
		vocabFull: "سَيَّارَةٌ",
		vocabDef: "voiture",
		sentBase: "هذه <b>سيارة</b> سريعة",
		sentFull: "هَذِهِ <b>سَيَّارَةٌ</b> سَرِيعَةٌ",
		sentFrench: "C'est une voiture rapide",
		score: 4.8,
		color: COLORS.low,
		reviewType: "collected",
		tags: ["Nom", "Transport"],
		createdAt: daysAgo(3), // Très récent
	},

	// === 1 card in "Revues envoyées par mon prof" ===
	{
		id: 7,
		word: "يَكْتُبُ",
		vocabBase: "يكتب",
		vocabFull: "يَكْتُبُ",
		vocabDef: "il écrit",
		sentBase: "هو <b>يكتب</b> رسالة",
		sentFull: "هُوَ <b>يَكْتُبُ</b> رِسَالَةً",
		sentFrench: "Il écrit une lettre",
		score: 3.5,
		color: COLORS.low,
		reviewType: "sent",
		image: imgIlEcrit,
		tags: ["Verbe", "Présent"],
		createdAt: daysAgo(60), // Très ancien
	},
];

// Get cards by review type
export const getCardsByReviewType = (reviewType: ReviewType): DemoCard[] => {
	return DEMO_CARDS.filter((card) => card.reviewType === reviewType);
};

// Get all cards for selected review types
export const getCardsForReviewTypes = (
	reviewTypes: ReviewType[],
): DemoCard[] => {
	return DEMO_CARDS.filter((card) => reviewTypes.includes(card.reviewType));
};

// Convert DemoCard to VocabCard format for CardsReview
export const demoCardToVocabCard = (card: DemoCard) => ({
	id: card.id,
	focus: card.focus,
	tags: card.tags,
	sentBase: card.sentBase,
	sentFull: card.sentFull,
	sentFrench: card.sentFrench,
	vocabBase: card.vocabBase,
	vocabFull: card.vocabFull,
	vocabDef: card.vocabDef,
	image: card.image,
});
