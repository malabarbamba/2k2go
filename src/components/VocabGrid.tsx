import { BookOpen, Eye, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { VocabGridData, VocabGrouping } from "@/lib/vocabGrid";

type SortOption = "score" | "seen" | "unseen" | "alpha";

type VocabGridProps = {
	data: VocabGridData | null;
	loading?: boolean;
	error?: string | null;
	groupings?: VocabGrouping[];
	searchQuery?: string;
	categoryFilter?: string | null;
	maxRows?: number;
	isExampleData?: boolean;
	showEmptyState?: boolean;
	gridOnly?: boolean;
	hideUnseenUnits?: boolean;
	gridJustify?: "start" | "center";
};

const sortOptions: Array<{ value: SortOption; label: string }> = [
	{ value: "score", label: "Score" },
	{ value: "seen", label: "Vus" },
	{ value: "unseen", label: "Non vus" },
	{ value: "alpha", label: "A-Z" },
];

const sampleUnitsAcrossRange = <T,>(items: T[], targetCount: number): T[] => {
	if (targetCount <= 0) {
		return [];
	}

	if (items.length <= targetCount) {
		return items;
	}

	if (targetCount === 1) {
		return [items[0]];
	}

	return Array.from({ length: targetCount }, (_, index) => {
		const ratio = index / (targetCount - 1);
		const itemIndex = Math.round(ratio * (items.length - 1));
		return items[itemIndex];
	});
};

// Kanji Grid gradient colors (26 colors from red to green)
const KANJI_GRADIENT_COLORS = [
	"#e62e2e",
	"#e6442e",
	"#e65a2e",
	"#e6702e",
	"#e6872e",
	"#e69d2e",
	"#e6b32e",
	"#e6c92e",
	"#e6df2e",
	"#d8e62e",
	"#c2e62e",
	"#abe62e",
	"#95e62e",
	"#7fe62e",
	"#69e62e",
	"#53e62e",
	"#3de62e",
	"#2ee635",
	"#2ee64c",
	"#2ee662",
	"#2ee678",
	"#2ee68e",
	"#2ee6a4",
	"#2ee6ba",
	"#2ee6d0",
	"#2ee6e6",
];

const UNSEEN_COLOR = KANJI_GRADIENT_COLORS[0];
const TEXT_COLOR = "#000000";

// Example data for new users (overlay mode like Stripe) - 275 words with varied mastery levels
const EXAMPLE_DATA: VocabGridData = {
	units: [
		// === NIVEAU TRÈS MAÎTRISÉ (bleu/cyan) - score 8-10 ===
		{
			word: "كِتَاب",
			vocabBase: "livre",
			vocabFull: "livre",
			score: 9.8,
			avgInterval: 48,
			seenCount: 15,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[25],
			category: "noms",
		},
		{
			word: "مَدْرَسَة",
			vocabBase: "école",
			vocabFull: "école",
			score: 9.6,
			avgInterval: 46,
			seenCount: 14,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[24],
			category: "noms",
		},
		{
			word: "بَيْت",
			vocabBase: "maison",
			vocabFull: "maison, foyer",
			score: 9.5,
			avgInterval: 44,
			seenCount: 13,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[24],
			category: "noms",
		},
		{
			word: "سَلَام",
			vocabBase: "paix",
			vocabFull: "paix, salut",
			score: 9.4,
			avgInterval: 42,
			seenCount: 13,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[23],
			category: "noms",
		},
		{
			word: "شُكْرًا",
			vocabBase: "merci",
			vocabFull: "merci",
			score: 9.3,
			avgInterval: 40,
			seenCount: 12,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[23],
			category: "expressions",
		},
		{
			word: "مَاء",
			vocabBase: "eau",
			vocabFull: "eau",
			score: 9.2,
			avgInterval: 38,
			seenCount: 12,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[22],
			category: "noms",
		},
		{
			word: "يَوْم",
			vocabBase: "jour",
			vocabFull: "jour",
			score: 9.1,
			avgInterval: 36,
			seenCount: 11,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[22],
			category: "temps",
		},
		{
			word: "لَيْل",
			vocabBase: "nuit",
			vocabFull: "nuit",
			score: 9.0,
			avgInterval: 35,
			seenCount: 11,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[21],
			category: "temps",
		},
		{
			word: "شَمْس",
			vocabBase: "soleil",
			vocabFull: "soleil",
			score: 8.9,
			avgInterval: 33,
			seenCount: 10,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[21],
			category: "nature",
		},
		{
			word: "قَمَر",
			vocabBase: "lune",
			vocabFull: "lune",
			score: 8.8,
			avgInterval: 32,
			seenCount: 10,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[21],
			category: "nature",
		},
		{
			word: "طَعَام",
			vocabBase: "nourriture",
			vocabFull: "nourriture, repas",
			score: 8.7,
			avgInterval: 30,
			seenCount: 10,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[20],
			category: "noms",
		},
		{
			word: "عَمَل",
			vocabBase: "travail",
			vocabFull: "travail, œuvre",
			score: 8.6,
			avgInterval: 29,
			seenCount: 9,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[20],
			category: "noms",
		},
		{
			word: "وَاحِد",
			vocabBase: "un",
			vocabFull: "un",
			score: 8.5,
			avgInterval: 28,
			seenCount: 9,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[20],
			category: "nombres",
		},
		{
			word: "صَدِيق",
			vocabBase: "ami",
			vocabFull: "ami(e)",
			score: 8.4,
			avgInterval: 27,
			seenCount: 9,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[19],
			category: "noms",
		},
		{
			word: "كَلَام",
			vocabBase: "parole",
			vocabFull: "parole, discours",
			score: 8.3,
			avgInterval: 26,
			seenCount: 8,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[19],
			category: "noms",
		},
		{
			word: "بَاب",
			vocabBase: "porte",
			vocabFull: "porte",
			score: 8.2,
			avgInterval: 25,
			seenCount: 8,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[19],
			category: "noms",
		},
		{
			word: "نَاس",
			vocabBase: "gens",
			vocabFull: "gens, personnes",
			score: 8.1,
			avgInterval: 24,
			seenCount: 8,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[18],
			category: "noms",
		},
		{
			word: "وَقْت",
			vocabBase: "temps",
			vocabFull: "temps, moment",
			score: 8.0,
			avgInterval: 23,
			seenCount: 8,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[18],
			category: "noms",
		},

		// === NIVEAU BIEN MAÎTRISÉ (vert) - score 6-8 ===
		{
			word: "عَائِلَة",
			vocabBase: "famille",
			vocabFull: "famille",
			score: 7.9,
			avgInterval: 22,
			seenCount: 7,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[18],
			category: "noms",
		},
		{
			word: "صَوْت",
			vocabBase: "voix",
			vocabFull: "voix, son",
			score: 7.8,
			avgInterval: 21,
			seenCount: 7,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[17],
			category: "noms",
		},
		{
			word: "لُغَة",
			vocabBase: "langue",
			vocabFull: "langue, langage",
			score: 7.7,
			avgInterval: 20,
			seenCount: 7,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[17],
			category: "noms",
		},
		{
			word: "اِثْنَان",
			vocabBase: "deux",
			vocabFull: "deux",
			score: 7.6,
			avgInterval: 19,
			seenCount: 7,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[17],
			category: "nombres",
		},
		{
			word: "تَعَلُّم",
			vocabBase: "apprendre",
			vocabFull: "apprentissage",
			score: 7.5,
			avgInterval: 18,
			seenCount: 6,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[16],
			category: "verbes",
		},
		{
			word: "دَرْس",
			vocabBase: "leçon",
			vocabFull: "leçon, cours",
			score: 7.4,
			avgInterval: 17,
			seenCount: 6,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[16],
			category: "noms",
		},
		{
			word: "جَدِيد",
			vocabBase: "nouveau",
			vocabFull: "nouveau, neuf",
			score: 7.3,
			avgInterval: 16,
			seenCount: 6,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[16],
			category: "adjectifs",
		},
		{
			word: "قَدِيم",
			vocabBase: "ancien",
			vocabFull: "ancien, vieux",
			score: 7.2,
			avgInterval: 15,
			seenCount: 6,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[15],
			category: "adjectifs",
		},
		{
			word: "كَبِير",
			vocabBase: "grand",
			vocabFull: "grand, âgé",
			score: 7.1,
			avgInterval: 15,
			seenCount: 6,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[15],
			category: "adjectifs",
		},
		{
			word: "صَغِير",
			vocabBase: "petit",
			vocabFull: "petit, jeune",
			score: 7.0,
			avgInterval: 14,
			seenCount: 6,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[16],
			category: "adjectifs",
		},
		{
			word: "مُعَلِّم",
			vocabBase: "professeur",
			vocabFull: "enseignant",
			score: 6.9,
			avgInterval: 14,
			seenCount: 5,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[15],
			category: "noms",
		},
		{
			word: "طَالِب",
			vocabBase: "étudiant",
			vocabFull: "étudiant, élève",
			score: 6.8,
			avgInterval: 13,
			seenCount: 5,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[15],
			category: "noms",
		},
		{
			word: "ثَلَاثَة",
			vocabBase: "trois",
			vocabFull: "trois",
			score: 6.7,
			avgInterval: 13,
			seenCount: 5,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[15],
			category: "nombres",
		},
		{
			word: "طَوِيل",
			vocabBase: "long",
			vocabFull: "long, grand",
			score: 6.6,
			avgInterval: 12,
			seenCount: 5,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[14],
			category: "adjectifs",
		},
		{
			word: "قَصِير",
			vocabBase: "court",
			vocabFull: "court, petit",
			score: 6.5,
			avgInterval: 12,
			seenCount: 5,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[14],
			category: "adjectifs",
		},
		{
			word: "جَمِيل",
			vocabBase: "beau",
			vocabFull: "beau, joli",
			score: 6.4,
			avgInterval: 11,
			seenCount: 5,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[14],
			category: "adjectifs",
		},
		{
			word: "قَبِيح",
			vocabBase: "laid",
			vocabFull: "laid, moche",
			score: 6.3,
			avgInterval: 11,
			seenCount: 5,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[13],
			category: "adjectifs",
		},
		{
			word: "قَهْوَة",
			vocabBase: "café",
			vocabFull: "café",
			score: 6.2,
			avgInterval: 10,
			seenCount: 5,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[13],
			category: "nourriture",
		},
		{
			word: "خُبْز",
			vocabBase: "pain",
			vocabFull: "pain",
			score: 6.1,
			avgInterval: 10,
			seenCount: 5,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[13],
			category: "nourriture",
		},
		{
			word: "لَحْم",
			vocabBase: "viande",
			vocabFull: "viande",
			score: 6.0,
			avgInterval: 10,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[14],
			category: "nourriture",
		},

		// === NIVEAU INTERMÉDIAIRE (jaune/vert) - score 4-6 ===
		{
			word: "سَيَّارَة",
			vocabBase: "voiture",
			vocabFull: "voiture",
			score: 5.9,
			avgInterval: 9,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[13],
			category: "transport",
		},
		{
			word: "حَلِيب",
			vocabBase: "lait",
			vocabFull: "lait",
			score: 5.8,
			avgInterval: 9,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[13],
			category: "nourriture",
		},
		{
			word: "سُكَّر",
			vocabBase: "sucre",
			vocabFull: "sucre",
			score: 5.7,
			avgInterval: 9,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[12],
			category: "nourriture",
		},
		{
			word: "مِلْح",
			vocabBase: "sel",
			vocabFull: "sel",
			score: 5.6,
			avgInterval: 8,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[12],
			category: "nourriture",
		},
		{
			word: "فَاكِهَة",
			vocabBase: "fruit",
			vocabFull: "fruit",
			score: 5.5,
			avgInterval: 8,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[12],
			category: "nourriture",
		},
		{
			word: "خُضَر",
			vocabBase: "légumes",
			vocabFull: "légumes",
			score: 5.4,
			avgInterval: 8,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[12],
			category: "nourriture",
		},
		{
			word: "تُفَّاح",
			vocabBase: "pomme",
			vocabFull: "pomme",
			score: 5.3,
			avgInterval: 8,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[11],
			category: "nourriture",
		},
		{
			word: "مَوْز",
			vocabBase: "banane",
			vocabFull: "banane",
			score: 5.2,
			avgInterval: 8,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[11],
			category: "nourriture",
		},
		{
			word: "بُرْتُقَال",
			vocabBase: "orange",
			vocabFull: "orange",
			score: 5.1,
			avgInterval: 7,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[11],
			category: "nourriture",
		},
		{
			word: "طَمَاطِم",
			vocabBase: "tomates",
			vocabFull: "tomates",
			score: 5.0,
			avgInterval: 7,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[11],
			category: "nourriture",
		},
		{
			word: "بَصَل",
			vocabBase: "oignon",
			vocabFull: "oignon",
			score: 4.9,
			avgInterval: 7,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[11],
			category: "nourriture",
		},
		{
			word: "ثُوم",
			vocabBase: "ail",
			vocabFull: "ail",
			score: 4.8,
			avgInterval: 7,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[10],
			category: "nourriture",
		},
		{
			word: "أَرُز",
			vocabBase: "riz",
			vocabFull: "riz",
			score: 4.7,
			avgInterval: 7,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[10],
			category: "nourriture",
		},
		{
			word: "قِطَار",
			vocabBase: "train",
			vocabFull: "train",
			score: 4.6,
			avgInterval: 6,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[10],
			category: "transport",
		},
		{
			word: "طَائِرَة",
			vocabBase: "avion",
			vocabFull: "avion",
			score: 4.5,
			avgInterval: 6,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[10],
			category: "transport",
		},
		{
			word: "سَفِينَة",
			vocabBase: "bateau",
			vocabFull: "bateau, navire",
			score: 4.4,
			avgInterval: 6,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[9],
			category: "transport",
		},
		{
			word: "دَرَّاجَة",
			vocabBase: "vélo",
			vocabFull: "bicyclette",
			score: 4.3,
			avgInterval: 6,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[9],
			category: "transport",
		},
		{
			word: "حَافِلَة",
			vocabBase: "bus",
			vocabFull: "bus, autocar",
			score: 4.2,
			avgInterval: 5,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[9],
			category: "transport",
		},
		{
			word: "مِرْوَحَة",
			vocabBase: "ventilateur",
			vocabFull: "ventilateur",
			score: 4.1,
			avgInterval: 5,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[9],
			category: "maison",
		},
		{
			word: "تِلْفَاز",
			vocabBase: "télé",
			vocabFull: "télévision",
			score: 4.0,
			avgInterval: 5,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[9],
			category: "maison",
		},

		// === NIVEAU EN APPRENTISSAGE (orange/jaune) - score 2-4 ===
		{
			word: "هَاتِف",
			vocabBase: "téléphone",
			vocabFull: "téléphone",
			score: 3.9,
			avgInterval: 5,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[8],
			category: "technologie",
		},
		{
			word: "كَمْبِيُوتَر",
			vocabBase: "ordinateur",
			vocabFull: "ordinateur",
			score: 3.8,
			avgInterval: 5,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[8],
			category: "technologie",
		},
		{
			word: "إِنْتَرْنِت",
			vocabBase: "internet",
			vocabFull: "internet",
			score: 3.7,
			avgInterval: 4,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[8],
			category: "technologie",
		},
		{
			word: "مَطَار",
			vocabBase: "aéroport",
			vocabFull: "aéroport",
			score: 3.6,
			avgInterval: 4,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[8],
			category: "lieux",
		},
		{
			word: "مِينَاء",
			vocabBase: "port",
			vocabFull: "port",
			score: 3.5,
			avgInterval: 4,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[7],
			category: "lieux",
		},
		{
			word: "مُسْتَشْفَى",
			vocabBase: "hôpital",
			vocabFull: "hôpital",
			score: 3.4,
			avgInterval: 4,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[7],
			category: "lieux",
		},
		{
			word: "صَيْدَلِيَّة",
			vocabBase: "pharmacie",
			vocabFull: "pharmacie",
			score: 3.3,
			avgInterval: 4,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[7],
			category: "lieux",
		},
		{
			word: "مَطْعَم",
			vocabBase: "restaurant",
			vocabFull: "restaurant",
			score: 3.2,
			avgInterval: 4,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[7],
			category: "lieux",
		},
		{
			word: "فُنْدُق",
			vocabBase: "hôtel",
			vocabFull: "hôtel",
			score: 3.1,
			avgInterval: 3,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[6],
			category: "lieux",
		},
		{
			word: "جَامِع",
			vocabBase: "mosquée",
			vocabFull: "mosquée",
			score: 3.0,
			avgInterval: 3,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[6],
			category: "lieux",
		},
		{
			word: "كَنِيسَة",
			vocabBase: "église",
			vocabFull: "église",
			score: 2.9,
			avgInterval: 3,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[6],
			category: "lieux",
		},
		{
			word: "سُوق",
			vocabBase: "marché",
			vocabFull: "marché, bazar",
			score: 2.8,
			avgInterval: 3,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[6],
			category: "lieux",
		},
		{
			word: "بَنْك",
			vocabBase: "banque",
			vocabFull: "banque",
			score: 2.7,
			avgInterval: 3,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[5],
			category: "lieux",
		},
		{
			word: "مَكْتَبَة",
			vocabBase: "bibliothèque",
			vocabFull: "bibliothèque",
			score: 2.6,
			avgInterval: 3,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[5],
			category: "lieux",
		},
		{
			word: "مَصْرِف",
			vocabBase: "caisse",
			vocabFull: "caisse, distributeur",
			score: 2.5,
			avgInterval: 3,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[5],
			category: "lieux",
		},
		{
			word: "شَارِع",
			vocabBase: "rue",
			vocabFull: "rue, avenue",
			score: 2.4,
			avgInterval: 3,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[5],
			category: "lieux",
		},
		{
			word: "جِسْر",
			vocabBase: "pont",
			vocabFull: "pont",
			score: 2.3,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[4],
			category: "lieux",
		},
		{
			word: "نَفَق",
			vocabBase: "tunnel",
			vocabFull: "tunnel",
			score: 2.2,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[4],
			category: "lieux",
		},
		{
			word: "مَرْكَز",
			vocabBase: "centre",
			vocabFull: "centre",
			score: 2.1,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[4],
			category: "lieux",
		},
		{
			word: "حَدِيقَة",
			vocabBase: "jardin",
			vocabFull: "jardin, parc",
			score: 2.0,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[4],
			category: "lieux",
		},

		// === NIVEAU DÉBUTANT (orange/rouge) - score 0.5-2 ===
		{
			word: "غَابَة",
			vocabBase: "forêt",
			vocabFull: "forêt",
			score: 1.9,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[3],
			category: "nature",
		},
		{
			word: "صَحْرَاء",
			vocabBase: "désert",
			vocabFull: "désert",
			score: 1.8,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[3],
			category: "nature",
		},
		{
			word: "وَادِي",
			vocabBase: "vallée",
			vocabFull: "vallée",
			score: 1.7,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[3],
			category: "nature",
		},
		{
			word: "جَبَل",
			vocabBase: "montagne",
			vocabFull: "montagne",
			score: 1.6,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[3],
			category: "nature",
		},
		{
			word: "تَلّ",
			vocabBase: "colline",
			vocabFull: "colline",
			score: 1.5,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[2],
			category: "nature",
		},
		{
			word: "نَهْر",
			vocabBase: "fleuve",
			vocabFull: "fleuve, rivière",
			score: 1.4,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[2],
			category: "nature",
		},
		{
			word: "بَحْر",
			vocabBase: "mer",
			vocabFull: "mer",
			score: 1.3,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[2],
			category: "nature",
		},
		{
			word: "مُحِيط",
			vocabBase: "océan",
			vocabFull: "océan",
			score: 1.2,
			avgInterval: 1,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[1],
			category: "nature",
		},
		{
			word: "شَاطِئ",
			vocabBase: "plage",
			vocabFull: "plage",
			score: 1.1,
			avgInterval: 1,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[1],
			category: "nature",
		},
		{
			word: "جَزِيرَة",
			vocabBase: "île",
			vocabFull: "île",
			score: 1.0,
			avgInterval: 1,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[1],
			category: "nature",
		},
		{
			word: "سَمَاء",
			vocabBase: "ciel",
			vocabFull: "ciel",
			score: 0.9,
			avgInterval: 1,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[0],
			category: "nature",
		},
		{
			word: "سَحَاب",
			vocabBase: "nuage",
			vocabFull: "nuage",
			score: 0.8,
			avgInterval: 1,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[0],
			category: "nature",
		},
		{
			word: "مَطَر",
			vocabBase: "pluie",
			vocabFull: "pluie",
			score: 0.7,
			avgInterval: 1,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[0],
			category: "météo",
		},
		{
			word: "ثَلْج",
			vocabBase: "neige",
			vocabFull: "neige",
			score: 0.6,
			avgInterval: 1,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[0],
			category: "météo",
		},
		{
			word: "رِيح",
			vocabBase: "vent",
			vocabFull: "vent",
			score: 0.5,
			avgInterval: 1,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[0],
			category: "météo",
		},
		{
			word: "حَرَارَة",
			vocabBase: "chaleur",
			vocabFull: "chaleur",
			score: 0.5,
			avgInterval: 1,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[0],
			category: "météo",
		},

		// === ANIMAUX - scores variés ===
		{
			word: "قِطَّة",
			vocabBase: "chat",
			vocabFull: "chat",
			score: 7.0,
			avgInterval: 16,
			seenCount: 6,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[16],
			category: "animaux",
		},
		{
			word: "كَلْب",
			vocabBase: "chien",
			vocabFull: "chien",
			score: 6.8,
			avgInterval: 15,
			seenCount: 6,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[15],
			category: "animaux",
		},
		{
			word: "حِصَان",
			vocabBase: "cheval",
			vocabFull: "cheval",
			score: 5.5,
			avgInterval: 10,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[12],
			category: "animaux",
		},
		{
			word: "بَقَرَة",
			vocabBase: "vache",
			vocabFull: "vache",
			score: 5.0,
			avgInterval: 8,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[11],
			category: "animaux",
		},
		{
			word: "خَرُوف",
			vocabBase: "mouton",
			vocabFull: "mouton",
			score: 4.5,
			avgInterval: 7,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[10],
			category: "animaux",
		},
		{
			word: "مَاعِز",
			vocabBase: "chèvre",
			vocabFull: "chèvre",
			score: 4.0,
			avgInterval: 6,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[9],
			category: "animaux",
		},
		{
			word: "جَمَل",
			vocabBase: "chameau",
			vocabFull: "chameau",
			score: 3.5,
			avgInterval: 5,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[8],
			category: "animaux",
		},
		{
			word: "أَسَد",
			vocabBase: "lion",
			vocabFull: "lion",
			score: 3.0,
			avgInterval: 4,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[6],
			category: "animaux",
		},
		{
			word: "فِيل",
			vocabBase: "éléphant",
			vocabFull: "éléphant",
			score: 2.5,
			avgInterval: 3,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[5],
			category: "animaux",
		},
		{
			word: "نَمِر",
			vocabBase: "tigre",
			vocabFull: "tigre",
			score: 2.0,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[4],
			category: "animaux",
		},
		{
			word: "دُبّ",
			vocabBase: "ours",
			vocabFull: "ours",
			score: 1.5,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[3],
			category: "animaux",
		},
		{
			word: "ذِئْب",
			vocabBase: "loup",
			vocabFull: "loup",
			score: 1.0,
			avgInterval: 1,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[1],
			category: "animaux",
		},
		{
			word: "ثَعْلَب",
			vocabBase: "renard",
			vocabFull: "renard",
			score: 0.8,
			avgInterval: 1,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[0],
			category: "animaux",
		},
		{
			word: "أَرْنَب",
			vocabBase: "lapin",
			vocabFull: "lapin",
			score: 0.6,
			avgInterval: 1,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[0],
			category: "animaux",
		},
		{
			word: "فَأْر",
			vocabBase: "souris",
			vocabFull: "souris",
			score: 0.5,
			avgInterval: 1,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[0],
			category: "animaux",
		},
		{
			word: "طَيْر",
			vocabBase: "oiseau",
			vocabFull: "oiseau",
			score: 4.2,
			avgInterval: 6,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[9],
			category: "animaux",
		},
		{
			word: "دَجَاجَة",
			vocabBase: "poule",
			vocabFull: "poule",
			score: 3.8,
			avgInterval: 5,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[8],
			category: "animaux",
		},
		{
			word: "سَمَكَة",
			vocabBase: "poisson",
			vocabFull: "poisson",
			score: 3.5,
			avgInterval: 5,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[7],
			category: "animaux",
		},
		{
			word: "حَمَام",
			vocabBase: "pigeon",
			vocabFull: "pigeon, colombe",
			score: 2.0,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[4],
			category: "animaux",
		},
		{
			word: "نَحْلَة",
			vocabBase: "abeille",
			vocabFull: "abeille",
			score: 1.5,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[3],
			category: "animaux",
		},

		// === CORPS HUMAIN - scores variés ===
		{
			word: "رَأْس",
			vocabBase: "tête",
			vocabFull: "tête",
			score: 6.0,
			avgInterval: 10,
			seenCount: 5,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[14],
			category: "corps",
		},
		{
			word: "وَجْه",
			vocabBase: "visage",
			vocabFull: "visage, face",
			score: 5.5,
			avgInterval: 9,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[12],
			category: "corps",
		},
		{
			word: "عَيْن",
			vocabBase: "œil",
			vocabFull: "œil",
			score: 5.0,
			avgInterval: 8,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[11],
			category: "corps",
		},
		{
			word: "أَنْف",
			vocabBase: "nez",
			vocabFull: "nez",
			score: 4.5,
			avgInterval: 7,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[10],
			category: "corps",
		},
		{
			word: "فَم",
			vocabBase: "bouche",
			vocabFull: "bouche",
			score: 4.0,
			avgInterval: 6,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[9],
			category: "corps",
		},
		{
			word: "أُذُن",
			vocabBase: "oreille",
			vocabFull: "oreille",
			score: 3.5,
			avgInterval: 5,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[8],
			category: "corps",
		},
		{
			word: "شَعْر",
			vocabBase: "cheveux",
			vocabFull: "cheveux",
			score: 3.0,
			avgInterval: 4,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[6],
			category: "corps",
		},
		{
			word: "يَد",
			vocabBase: "main",
			vocabFull: "main",
			score: 5.8,
			avgInterval: 9,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[13],
			category: "corps",
		},
		{
			word: "إِصْبَع",
			vocabBase: "doigt",
			vocabFull: "doigt",
			score: 4.2,
			avgInterval: 6,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[9],
			category: "corps",
		},
		{
			word: "رِجْل",
			vocabBase: "jambe",
			vocabFull: "jambe, pied",
			score: 5.0,
			avgInterval: 8,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[11],
			category: "corps",
		},
		{
			word: "قَلْب",
			vocabBase: "cœur",
			vocabFull: "cœur",
			score: 4.5,
			avgInterval: 7,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[10],
			category: "corps",
		},
		{
			word: "بَطْن",
			vocabBase: "ventre",
			vocabFull: "ventre",
			score: 3.5,
			avgInterval: 5,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[8],
			category: "corps",
		},
		{
			word: "ظَهْر",
			vocabBase: "dos",
			vocabFull: "dos",
			score: 3.0,
			avgInterval: 4,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[6],
			category: "corps",
		},
		{
			word: "كَتِف",
			vocabBase: "épaule",
			vocabFull: "épaule",
			score: 2.5,
			avgInterval: 3,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[5],
			category: "corps",
		},
		{
			word: "رُكْبَة",
			vocabBase: "genou",
			vocabFull: "genou",
			score: 2.0,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[4],
			category: "corps",
		},

		// === FAMILLE - scores variés ===
		{
			word: "أُمّ",
			vocabBase: "mère",
			vocabFull: "mère",
			score: 7.5,
			avgInterval: 18,
			seenCount: 7,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[17],
			category: "famille",
		},
		{
			word: "أَب",
			vocabBase: "père",
			vocabFull: "père",
			score: 7.3,
			avgInterval: 17,
			seenCount: 6,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[16],
			category: "famille",
		},
		{
			word: "أَخ",
			vocabBase: "frère",
			vocabFull: "frère",
			score: 6.0,
			avgInterval: 10,
			seenCount: 5,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[14],
			category: "famille",
		},
		{
			word: "أُخْت",
			vocabBase: "sœur",
			vocabFull: "sœur",
			score: 5.8,
			avgInterval: 9,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[13],
			category: "famille",
		},
		{
			word: "جَدّ",
			vocabBase: "grand-père",
			vocabFull: "grand-père",
			score: 4.5,
			avgInterval: 7,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[10],
			category: "famille",
		},
		{
			word: "جَدَّة",
			vocabBase: "grand-mère",
			vocabFull: "grand-mère",
			score: 4.2,
			avgInterval: 6,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[9],
			category: "famille",
		},
		{
			word: "عَمّ",
			vocabBase: "oncle",
			vocabFull: "oncle (paternel)",
			score: 3.5,
			avgInterval: 5,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[8],
			category: "famille",
		},
		{
			word: "خَال",
			vocabBase: "oncle",
			vocabFull: "oncle (maternel)",
			score: 3.0,
			avgInterval: 4,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[6],
			category: "famille",
		},
		{
			word: "عَمَّة",
			vocabBase: "tante",
			vocabFull: "tante (paternelle)",
			score: 2.5,
			avgInterval: 3,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[5],
			category: "famille",
		},
		{
			word: "خَالَة",
			vocabBase: "tante",
			vocabFull: "tante (maternelle)",
			score: 2.0,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[4],
			category: "famille",
		},
		{
			word: "اِبْن",
			vocabBase: "fils",
			vocabFull: "fils",
			score: 5.0,
			avgInterval: 8,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[11],
			category: "famille",
		},
		{
			word: "بِنْت",
			vocabBase: "fille",
			vocabFull: "fille",
			score: 4.8,
			avgInterval: 7,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[10],
			category: "famille",
		},
		{
			word: "حَفِيد",
			vocabBase: "petit-fils",
			vocabFull: "petit-fils",
			score: 1.5,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[3],
			category: "famille",
		},
		{
			word: "زَوْج",
			vocabBase: "mari",
			vocabFull: "mari, époux",
			score: 3.5,
			avgInterval: 5,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[8],
			category: "famille",
		},
		{
			word: "زَوْجَة",
			vocabBase: "femme",
			vocabFull: "femme, épouse",
			score: 3.2,
			avgInterval: 4,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[7],
			category: "famille",
		},

		// === COULEURS - scores variés ===
		{
			word: "أَحْمَر",
			vocabBase: "rouge",
			vocabFull: "rouge",
			score: 5.5,
			avgInterval: 10,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[12],
			category: "couleurs",
		},
		{
			word: "أَزْرَق",
			vocabBase: "bleu",
			vocabFull: "bleu",
			score: 5.2,
			avgInterval: 9,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[11],
			category: "couleurs",
		},
		{
			word: "أَخْضَر",
			vocabBase: "vert",
			vocabFull: "vert",
			score: 4.8,
			avgInterval: 8,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[10],
			category: "couleurs",
		},
		{
			word: "أَبْيَض",
			vocabBase: "blanc",
			vocabFull: "blanc",
			score: 4.5,
			avgInterval: 7,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[10],
			category: "couleurs",
		},
		{
			word: "أَسْوَد",
			vocabBase: "noir",
			vocabFull: "noir",
			score: 4.0,
			avgInterval: 6,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[9],
			category: "couleurs",
		},
		{
			word: "أَصْفَر",
			vocabBase: "jaune",
			vocabFull: "jaune",
			score: 3.5,
			avgInterval: 5,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[8],
			category: "couleurs",
		},
		{
			word: "بُرْتُقَالِيّ",
			vocabBase: "orange",
			vocabFull: "orange (couleur)",
			score: 3.0,
			avgInterval: 4,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[6],
			category: "couleurs",
		},
		{
			word: "بُنِّيّ",
			vocabBase: "marron",
			vocabFull: "marron, brun",
			score: 2.5,
			avgInterval: 3,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[5],
			category: "couleurs",
		},
		{
			word: "رَمَادِيّ",
			vocabBase: "gris",
			vocabFull: "gris",
			score: 2.0,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[4],
			category: "couleurs",
		},
		{
			word: "وَرْدِيّ",
			vocabBase: "rose",
			vocabFull: "rose",
			score: 1.5,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[3],
			category: "couleurs",
		},
		{
			word: "بَنَفْسَجِيّ",
			vocabBase: "violet",
			vocabFull: "violet",
			score: 1.0,
			avgInterval: 1,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[1],
			category: "couleurs",
		},

		// === NOMBRES - scores variés ===
		{
			word: "أَرْبَعَة",
			vocabBase: "quatre",
			vocabFull: "quatre",
			score: 6.5,
			avgInterval: 14,
			seenCount: 6,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[15],
			category: "nombres",
		},
		{
			word: "خَمْسَة",
			vocabBase: "cinq",
			vocabFull: "cinq",
			score: 6.0,
			avgInterval: 12,
			seenCount: 5,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[14],
			category: "nombres",
		},
		{
			word: "سِتَّة",
			vocabBase: "six",
			vocabFull: "six",
			score: 5.5,
			avgInterval: 10,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[12],
			category: "nombres",
		},
		{
			word: "سَبْعَة",
			vocabBase: "sept",
			vocabFull: "sept",
			score: 5.0,
			avgInterval: 8,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[11],
			category: "nombres",
		},
		{
			word: "ثَمَانِيَة",
			vocabBase: "huit",
			vocabFull: "huit",
			score: 4.5,
			avgInterval: 7,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[10],
			category: "nombres",
		},
		{
			word: "تِسْعَة",
			vocabBase: "neuf",
			vocabFull: "neuf",
			score: 4.0,
			avgInterval: 6,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[9],
			category: "nombres",
		},
		{
			word: "عَشَرَة",
			vocabBase: "dix",
			vocabFull: "dix",
			score: 3.5,
			avgInterval: 5,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[8],
			category: "nombres",
		},
		{
			word: "عِشْرُون",
			vocabBase: "vingt",
			vocabFull: "vingt",
			score: 3.0,
			avgInterval: 4,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[6],
			category: "nombres",
		},
		{
			word: "ثَلَاثُون",
			vocabBase: "trente",
			vocabFull: "trente",
			score: 2.5,
			avgInterval: 3,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[5],
			category: "nombres",
		},
		{
			word: "أَرْبَعُون",
			vocabBase: "quarante",
			vocabFull: "quarante",
			score: 2.0,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[4],
			category: "nombres",
		},
		{
			word: "خَمْسُون",
			vocabBase: "cinquante",
			vocabFull: "cinquante",
			score: 1.5,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[3],
			category: "nombres",
		},
		{
			word: "مِائَة",
			vocabBase: "cent",
			vocabFull: "cent",
			score: 1.0,
			avgInterval: 1,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[1],
			category: "nombres",
		},
		{
			word: "أَلْف",
			vocabBase: "mille",
			vocabFull: "mille",
			score: 0.8,
			avgInterval: 1,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[0],
			category: "nombres",
		},

		// === TEMPS - scores variés ===
		{
			word: "أُسْبُوع",
			vocabBase: "semaine",
			vocabFull: "semaine",
			score: 5.0,
			avgInterval: 8,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[11],
			category: "temps",
		},
		{
			word: "شَهْر",
			vocabBase: "mois",
			vocabFull: "mois",
			score: 4.5,
			avgInterval: 7,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[10],
			category: "temps",
		},
		{
			word: "سَنَة",
			vocabBase: "année",
			vocabFull: "année",
			score: 4.0,
			avgInterval: 6,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[9],
			category: "temps",
		},
		{
			word: "صَبَاح",
			vocabBase: "matin",
			vocabFull: "matin",
			score: 5.5,
			avgInterval: 10,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[12],
			category: "temps",
		},
		{
			word: "مَسَاء",
			vocabBase: "soir",
			vocabFull: "soir",
			score: 5.0,
			avgInterval: 8,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[11],
			category: "temps",
		},
		{
			word: "الآن",
			vocabBase: "maintenant",
			vocabFull: "maintenant",
			score: 6.0,
			avgInterval: 12,
			seenCount: 5,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[14],
			category: "temps",
		},
		{
			word: "غَداً",
			vocabBase: "demain",
			vocabFull: "demain",
			score: 5.5,
			avgInterval: 10,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[12],
			category: "temps",
		},
		{
			word: "أَمْس",
			vocabBase: "hier",
			vocabFull: "hier",
			score: 5.0,
			avgInterval: 8,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[11],
			category: "temps",
		},
		{
			word: "اليَوْم",
			vocabBase: "aujourd'hui",
			vocabFull: "aujourd'hui",
			score: 6.5,
			avgInterval: 14,
			seenCount: 6,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[15],
			category: "temps",
		},
		{
			word: "بَعْد",
			vocabBase: "après",
			vocabFull: "après, ensuite",
			score: 4.5,
			avgInterval: 7,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[10],
			category: "temps",
		},
		{
			word: "قَبْل",
			vocabBase: "avant",
			vocabFull: "avant",
			score: 4.0,
			avgInterval: 6,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[9],
			category: "temps",
		},
		{
			word: "سَاعَة",
			vocabBase: "heure",
			vocabFull: "heure, horloge",
			score: 5.5,
			avgInterval: 10,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[12],
			category: "temps",
		},
		{
			word: "دَقِيقَة",
			vocabBase: "minute",
			vocabFull: "minute",
			score: 3.5,
			avgInterval: 5,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[8],
			category: "temps",
		},
		{
			word: "ثَانِيَة",
			vocabBase: "seconde",
			vocabFull: "seconde",
			score: 2.5,
			avgInterval: 3,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[5],
			category: "temps",
		},

		// === VERBES COURANTS - scores variés ===
		{
			word: "ذَهَبَ",
			vocabBase: "aller",
			vocabFull: "il est allé",
			score: 7.0,
			avgInterval: 16,
			seenCount: 6,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[16],
			category: "verbes",
		},
		{
			word: "جَاءَ",
			vocabBase: "venir",
			vocabFull: "il est venu",
			score: 6.5,
			avgInterval: 14,
			seenCount: 6,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[15],
			category: "verbes",
		},
		{
			word: "أَكَلَ",
			vocabBase: "manger",
			vocabFull: "il a mangé",
			score: 6.0,
			avgInterval: 12,
			seenCount: 5,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[14],
			category: "verbes",
		},
		{
			word: "شَرِبَ",
			vocabBase: "boire",
			vocabFull: "il a bu",
			score: 5.5,
			avgInterval: 10,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[12],
			category: "verbes",
		},
		{
			word: "نَامَ",
			vocabBase: "dormir",
			vocabFull: "il a dormi",
			score: 5.0,
			avgInterval: 8,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[11],
			category: "verbes",
		},
		{
			word: "قَامَ",
			vocabBase: "se lever",
			vocabFull: "il s'est levé",
			score: 4.5,
			avgInterval: 7,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[10],
			category: "verbes",
		},
		{
			word: "جَلَسَ",
			vocabBase: "s'asseoir",
			vocabFull: "il s'est assis",
			score: 4.0,
			avgInterval: 6,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[9],
			category: "verbes",
		},
		{
			word: "كَتَبَ",
			vocabBase: "écrire",
			vocabFull: "il a écrit",
			score: 6.5,
			avgInterval: 14,
			seenCount: 6,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[15],
			category: "verbes",
		},
		{
			word: "قَرَأَ",
			vocabBase: "lire",
			vocabFull: "il a lu",
			score: 6.0,
			avgInterval: 12,
			seenCount: 5,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[14],
			category: "verbes",
		},
		{
			word: "تَكَلَّمَ",
			vocabBase: "parler",
			vocabFull: "il a parlé",
			score: 5.5,
			avgInterval: 10,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[12],
			category: "verbes",
		},
		{
			word: "سَمِعَ",
			vocabBase: "entendre",
			vocabFull: "il a entendu",
			score: 5.0,
			avgInterval: 8,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[11],
			category: "verbes",
		},
		{
			word: "رَأَى",
			vocabBase: "voir",
			vocabFull: "il a vu",
			score: 5.5,
			avgInterval: 10,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[12],
			category: "verbes",
		},
		{
			word: "فَهِمَ",
			vocabBase: "comprendre",
			vocabFull: "il a compris",
			score: 4.5,
			avgInterval: 7,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[10],
			category: "verbes",
		},
		{
			word: "عَرَفَ",
			vocabBase: "savoir",
			vocabFull: "il a su",
			score: 4.0,
			avgInterval: 6,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[9],
			category: "verbes",
		},
		{
			word: "فَتَحَ",
			vocabBase: "ouvrir",
			vocabFull: "il a ouvert",
			score: 3.5,
			avgInterval: 5,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[8],
			category: "verbes",
		},
		{
			word: "أَغْلَقَ",
			vocabBase: "fermer",
			vocabFull: "il a fermé",
			score: 3.0,
			avgInterval: 4,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[6],
			category: "verbes",
		},
		{
			word: "أَخَذَ",
			vocabBase: "prendre",
			vocabFull: "il a pris",
			score: 5.0,
			avgInterval: 8,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[11],
			category: "verbes",
		},
		{
			word: "أَعْطَى",
			vocabBase: "donner",
			vocabFull: "il a donné",
			score: 4.5,
			avgInterval: 7,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[10],
			category: "verbes",
		},
		{
			word: "بَاعَ",
			vocabBase: "vendre",
			vocabFull: "il a vendu",
			score: 2.5,
			avgInterval: 3,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[5],
			category: "verbes",
		},
		{
			word: "اِشْتَرَى",
			vocabBase: "acheter",
			vocabFull: "il a acheté",
			score: 3.5,
			avgInterval: 5,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[8],
			category: "verbes",
		},

		// === ADJECTIFS - scores variés ===
		{
			word: "جَيِّد",
			vocabBase: "bon",
			vocabFull: "bon, bien",
			score: 6.0,
			avgInterval: 12,
			seenCount: 5,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[14],
			category: "adjectifs",
		},
		{
			word: "سَيِّئ",
			vocabBase: "mauvais",
			vocabFull: "mauvais, mal",
			score: 5.5,
			avgInterval: 10,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[12],
			category: "adjectifs",
		},
		{
			word: "سَعِيد",
			vocabBase: "heureux",
			vocabFull: "heureux",
			score: 5.0,
			avgInterval: 8,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[11],
			category: "adjectifs",
		},
		{
			word: "حَزِين",
			vocabBase: "triste",
			vocabFull: "triste",
			score: 4.5,
			avgInterval: 7,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[10],
			category: "adjectifs",
		},
		{
			word: "غَنِيّ",
			vocabBase: "riche",
			vocabFull: "riche",
			score: 4.0,
			avgInterval: 6,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[9],
			category: "adjectifs",
		},
		{
			word: "فَقِير",
			vocabBase: "pauvre",
			vocabFull: "pauvre",
			score: 3.5,
			avgInterval: 5,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[8],
			category: "adjectifs",
		},
		{
			word: "قَوِيّ",
			vocabBase: "fort",
			vocabFull: "fort, puissant",
			score: 3.0,
			avgInterval: 4,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[6],
			category: "adjectifs",
		},
		{
			word: "ضَعِيف",
			vocabBase: "faible",
			vocabFull: "faible",
			score: 2.5,
			avgInterval: 3,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[5],
			category: "adjectifs",
		},
		{
			word: "سَرِيع",
			vocabBase: "rapide",
			vocabFull: "rapide, vite",
			score: 3.5,
			avgInterval: 5,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[8],
			category: "adjectifs",
		},
		{
			word: "بَطِيء",
			vocabBase: "lent",
			vocabFull: "lent",
			score: 3.0,
			avgInterval: 4,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[6],
			category: "adjectifs",
		},
		{
			word: "صَحِيح",
			vocabBase: "correct",
			vocabFull: "correct, vrai",
			score: 4.0,
			avgInterval: 6,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[9],
			category: "adjectifs",
		},
		{
			word: "خَاطِئ",
			vocabBase: "faux",
			vocabFull: "faux, erroné",
			score: 3.5,
			avgInterval: 5,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[8],
			category: "adjectifs",
		},
		{
			word: "سَاخِن",
			vocabBase: "chaud",
			vocabFull: "chaud",
			score: 3.0,
			avgInterval: 4,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[6],
			category: "adjectifs",
		},
		{
			word: "بَارِد",
			vocabBase: "froid",
			vocabFull: "froid",
			score: 2.5,
			avgInterval: 3,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[5],
			category: "adjectifs",
		},
		{
			word: "نَظِيف",
			vocabBase: "propre",
			vocabFull: "propre",
			score: 2.0,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[4],
			category: "adjectifs",
		},
		{
			word: "وَسِخ",
			vocabBase: "sale",
			vocabFull: "sale",
			score: 1.5,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[3],
			category: "adjectifs",
		},

		// === MÉTIERS - scores variés ===
		{
			word: "طَبِيب",
			vocabBase: "médecin",
			vocabFull: "médecin, docteur",
			score: 5.0,
			avgInterval: 8,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[11],
			category: "métiers",
		},
		{
			word: "مُهَنْدِس",
			vocabBase: "ingénieur",
			vocabFull: "ingénieur",
			score: 4.5,
			avgInterval: 7,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[10],
			category: "métiers",
		},
		{
			word: "مُحَامٍ",
			vocabBase: "avocat",
			vocabFull: "avocat",
			score: 3.5,
			avgInterval: 5,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[8],
			category: "métiers",
		},
		{
			word: "تَاجِر",
			vocabBase: "marchand",
			vocabFull: "marchand, commerçant",
			score: 3.0,
			avgInterval: 4,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[6],
			category: "métiers",
		},
		{
			word: "فَلَّاح",
			vocabBase: "agriculteur",
			vocabFull: "agriculteur",
			score: 2.5,
			avgInterval: 3,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[5],
			category: "métiers",
		},
		{
			word: "صَيَّاد",
			vocabBase: "pêcheur",
			vocabFull: "pêcheur",
			score: 2.0,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[4],
			category: "métiers",
		},
		{
			word: "جُنْدِيّ",
			vocabBase: "soldat",
			vocabFull: "soldat",
			score: 1.5,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[3],
			category: "métiers",
		},
		{
			word: "شُرْطِيّ",
			vocabBase: "policier",
			vocabFull: "policier",
			score: 1.0,
			avgInterval: 1,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[1],
			category: "métiers",
		},
		{
			word: "طَبَّاخ",
			vocabBase: "cuisinier",
			vocabFull: "cuisinier",
			score: 3.5,
			avgInterval: 5,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[8],
			category: "métiers",
		},
		{
			word: "سَائِق",
			vocabBase: "conducteur",
			vocabFull: "conducteur, chauffeur",
			score: 3.0,
			avgInterval: 4,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[6],
			category: "métiers",
		},
		{
			word: "حَلَّاق",
			vocabBase: "coiffeur",
			vocabFull: "coiffeur",
			score: 2.0,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[4],
			category: "métiers",
		},
		{
			word: "خَبَّاز",
			vocabBase: "boulanger",
			vocabFull: "boulanger",
			score: 2.5,
			avgInterval: 3,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[5],
			category: "métiers",
		},
		{
			word: "جَزَّار",
			vocabBase: "boucher",
			vocabFull: "boucher",
			score: 1.5,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[3],
			category: "métiers",
		},
		{
			word: "بَنَّاء",
			vocabBase: "constructeur",
			vocabFull: "constructeur, maçon",
			score: 1.0,
			avgInterval: 1,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[1],
			category: "métiers",
		},

		// === VÊTEMENTS - scores variés ===
		{
			word: "ثَوْب",
			vocabBase: "vêtement",
			vocabFull: "vêtement, robe",
			score: 3.5,
			avgInterval: 5,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[8],
			category: "vêtements",
		},
		{
			word: "قَمِيص",
			vocabBase: "chemise",
			vocabFull: "chemise",
			score: 3.0,
			avgInterval: 4,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[6],
			category: "vêtements",
		},
		{
			word: "بَنْطَال",
			vocabBase: "pantalon",
			vocabFull: "pantalon",
			score: 2.5,
			avgInterval: 3,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[5],
			category: "vêtements",
		},
		{
			word: "فُسْتَان",
			vocabBase: "robe",
			vocabFull: "robe (femme)",
			score: 2.0,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[4],
			category: "vêtements",
		},
		{
			word: "حِذَاء",
			vocabBase: "chaussure",
			vocabFull: "chaussure",
			score: 2.5,
			avgInterval: 3,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[5],
			category: "vêtements",
		},
		{
			word: "قُبَّعَة",
			vocabBase: "chapeau",
			vocabFull: "chapeau",
			score: 1.5,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[3],
			category: "vêtements",
		},
		{
			word: "نَظَّارَة",
			vocabBase: "lunettes",
			vocabFull: "lunettes",
			score: 1.0,
			avgInterval: 1,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[1],
			category: "vêtements",
		},
		{
			word: "سَاعَة",
			vocabBase: "montre",
			vocabFull: "montre, horloge",
			score: 3.0,
			avgInterval: 4,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[6],
			category: "vêtements",
		},

		// === MAISON - scores variés ===
		{
			word: "غُرْفَة",
			vocabBase: "chambre",
			vocabFull: "chambre, pièce",
			score: 5.0,
			avgInterval: 8,
			seenCount: 4,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[11],
			category: "maison",
		},
		{
			word: "مَطْبَخ",
			vocabBase: "cuisine",
			vocabFull: "cuisine",
			score: 4.5,
			avgInterval: 7,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[10],
			category: "maison",
		},
		{
			word: "حَمَّام",
			vocabBase: "salle de bain",
			vocabFull: "salle de bain",
			score: 4.0,
			avgInterval: 6,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[9],
			category: "maison",
		},
		{
			word: "سَقْف",
			vocabBase: "toit",
			vocabFull: "toit, plafond",
			score: 3.0,
			avgInterval: 4,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[6],
			category: "maison",
		},
		{
			word: "جِدَار",
			vocabBase: "mur",
			vocabFull: "mur",
			score: 2.5,
			avgInterval: 3,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[5],
			category: "maison",
		},
		{
			word: "نَافِذَة",
			vocabBase: "fenêtre",
			vocabFull: "fenêtre",
			score: 3.5,
			avgInterval: 5,
			seenCount: 2,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[8],
			category: "maison",
		},
		{
			word: "سُلَّم",
			vocabBase: "escalier",
			vocabFull: "escalier",
			score: 2.0,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[4],
			category: "maison",
		},
		{
			word: "كُرْسِيّ",
			vocabBase: "chaise",
			vocabFull: "chaise",
			score: 4.0,
			avgInterval: 6,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[9],
			category: "maison",
		},
		{
			word: "طَاوِلَة",
			vocabBase: "table",
			vocabFull: "table",
			score: 4.5,
			avgInterval: 7,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[10],
			category: "maison",
		},
		{
			word: "سَرِير",
			vocabBase: "lit",
			vocabFull: "lit",
			score: 4.0,
			avgInterval: 6,
			seenCount: 3,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[9],
			category: "maison",
		},
		{
			word: "دُولَاب",
			vocabBase: "armoire",
			vocabFull: "armoire, placard",
			score: 2.5,
			avgInterval: 3,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[5],
			category: "maison",
		},
		{
			word: "ثَلَّاجَة",
			vocabBase: "réfrigérateur",
			vocabFull: "réfrigérateur",
			score: 2.0,
			avgInterval: 2,
			seenCount: 1,
			unseenCount: 0,
			color: KANJI_GRADIENT_COLORS[4],
			category: "maison",
		},

		// === MOTS NON VUS (blanc) ===
		{
			word: "كَيْفَ",
			vocabBase: "comment",
			vocabFull: "comment",
			score: 0,
			avgInterval: 0,
			seenCount: 0,
			unseenCount: 5,
			color: UNSEEN_COLOR,
			category: "interrogatifs",
		},
		{
			word: "لِمَاذَا",
			vocabBase: "pourquoi",
			vocabFull: "pourquoi",
			score: 0,
			avgInterval: 0,
			seenCount: 0,
			unseenCount: 4,
			color: UNSEEN_COLOR,
			category: "interrogatifs",
		},
		{
			word: "أَيْنَ",
			vocabBase: "où",
			vocabFull: "où",
			score: 0,
			avgInterval: 0,
			seenCount: 0,
			unseenCount: 3,
			color: UNSEEN_COLOR,
			category: "interrogatifs",
		},
		{
			word: "مَتَى",
			vocabBase: "quand",
			vocabFull: "quand",
			score: 0,
			avgInterval: 0,
			seenCount: 0,
			unseenCount: 3,
			color: UNSEEN_COLOR,
			category: "interrogatifs",
		},
		{
			word: "مَنْ",
			vocabBase: "qui",
			vocabFull: "qui",
			score: 0,
			avgInterval: 0,
			seenCount: 0,
			unseenCount: 2,
			color: UNSEEN_COLOR,
			category: "interrogatifs",
		},
		{
			word: "مَاذَا",
			vocabBase: "quoi",
			vocabFull: "quoi, que",
			score: 0,
			avgInterval: 0,
			seenCount: 0,
			unseenCount: 2,
			color: UNSEEN_COLOR,
			category: "interrogatifs",
		},
		{
			word: "كَمْ",
			vocabBase: "combien",
			vocabFull: "combien",
			score: 0,
			avgInterval: 0,
			seenCount: 0,
			unseenCount: 2,
			color: UNSEEN_COLOR,
			category: "interrogatifs",
		},
		{
			word: "أَيّ",
			vocabBase: "quel",
			vocabFull: "quel, laquelle",
			score: 0,
			avgInterval: 0,
			seenCount: 0,
			unseenCount: 1,
			color: UNSEEN_COLOR,
			category: "interrogatifs",
		},
		{
			word: "هَل",
			vocabBase: "est-ce",
			vocabFull: "est-ce que",
			score: 0,
			avgInterval: 0,
			seenCount: 0,
			unseenCount: 3,
			color: UNSEEN_COLOR,
			category: "interrogatifs",
		},
	],
	summary: { total: 275, known: 266, knownPercent: 96.7 },
};

export const VocabGrid = ({
	data,
	loading = false,
	error,
	groupings = [],
	searchQuery = "",
	categoryFilter = null,
	maxRows = 4,
	isExampleData = false,
	showEmptyState = false,
	gridOnly = false,
	hideUnseenUnits = false,
	gridJustify = "start",
}: VocabGridProps) => {
	const [selectedGroup, setSelectedGroup] = useState("all");
	const [sortBy, setSortBy] = useState<SortOption>("score");
	const [isExpanded, setIsExpanded] = useState(true);
	const [containerWidth, setContainerWidth] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);

	const getUnitRenderKey = (
		unit: (typeof filteredUnits)[number],
		index: number,
	): string => {
		if (unit.id && unit.id.length > 0) {
			return unit.id;
		}
		const vocabPart = unit.vocabFull ?? unit.vocabBase ?? "";
		return `${unit.word}::${vocabPart}::${index}`;
	};

	// Track container width to calculate items per row
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const updateWidth = () => {
			setContainerWidth(container.offsetWidth);
		};

		updateWidth();
		const resizeObserver = new ResizeObserver(updateWidth);
		resizeObserver.observe(container);
		return () => resizeObserver.disconnect();
	}, []);

	// Keep width density but strongly reduce tile height for compact bank view.
	const gridItemWidth = 35;
	const gridItemHeight = 20;
	const gridWordFontSize = "15px";
	const gridGap = 2;
	const itemsPerRow =
		containerWidth > 0
			? Math.floor((containerWidth + gridGap) / (gridItemWidth + gridGap))
			: 20;

	// Show empty state if deck has no units and showEmptyState is true
	const isEmptyDeck = data && data.units.length === 0;
	// In preview/example mode, prefer provided data when available; fallback to built-in example deck.
	const displayData =
		data && data.units.length > 0 ? data : isExampleData ? EXAMPLE_DATA : data;

	const availableGroups = useMemo(() => {
		if (groupings.length === 0) return [];
		return groupings.flatMap((grouping) =>
			grouping.groups.map((group) => ({
				key: `${grouping.name}:${group.name}`,
				label: group.name,
				words: group.words ?? [],
			})),
		);
	}, [groupings]);

	const filteredUnits = useMemo(() => {
		if (!displayData) return [];
		let units = [...displayData.units];

		// Filter by search query
		if (searchQuery && searchQuery.trim()) {
			const query = searchQuery.trim().toLowerCase();
			units = units.filter(
				(unit) =>
					unit.word.toLowerCase().includes(query) ||
					unit.vocabBase?.toLowerCase().includes(query) ||
					unit.vocabFull?.toLowerCase().includes(query),
			);
		}

		// Filter by category
		if (categoryFilter) {
			units = units.filter((unit) => unit.category === categoryFilter);
		}

		// Filter by group
		if (selectedGroup !== "all") {
			const group = availableGroups.find((item) => item.key === selectedGroup);
			if (group?.words?.length) {
				const wordSet = new Set(group.words);
				units = units.filter((unit) => wordSet.has(unit.word));
			}
		}

		if (hideUnseenUnits) {
			units = units.filter((unit) => unit.seenCount > 0);
		}

		// Sort - sort by score descending so most mastered (blue) appears first (top-right with rtl direction)
		if (sortBy === "alpha") {
			units.sort((a, b) => a.word.localeCompare(b.word));
		} else if (sortBy === "seen") {
			units.sort((a, b) => b.seenCount - a.seenCount);
		} else if (sortBy === "unseen") {
			units.sort((a, b) => b.unseenCount - a.unseenCount);
		} else {
			// Sort descending: most mastered (blue) first, will appear top-right with rtl direction
			units.sort((a, b) => b.score - a.score);
		}

		return units;
	}, [
		availableGroups,
		displayData,
		selectedGroup,
		sortBy,
		searchQuery,
		categoryFilter,
		hideUnseenUnits,
	]);

	// Calculate stats for current view
	const stats = useMemo(() => {
		if (!displayData) return { total: 0, known: 0, knownPercent: 0 };
		const total = filteredUnits.length;
		const known = filteredUnits.filter((unit) => unit.seenCount > 0).length;
		const knownPercent =
			total === 0 ? 0 : Math.round((known / total) * 1000) / 10;
		return { total, known, knownPercent };
	}, [filteredUnits, displayData]);

	// Calculate visible units based on maxRows (complete rows only)
	const maxVisibleItems = itemsPerRow * maxRows;
	const visibleUnits =
		isExpanded || isExampleData
			? filteredUnits
			: filteredUnits.slice(0, maxVisibleItems);

	// Check if we should show the expand button
	const hasMoreUnits = filteredUnits.length > maxVisibleItems && !isExampleData;

	if (loading) {
		return (
			<div
				className="w-full text-center py-8"
				style={{ fontFamily: "'Yakout Linotype', 'Lateef', serif" }}
			>
				<p className="text-sm text-gray-500">Chargement du vocabulaire...</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="w-full text-center py-8">
				<p className="text-sm text-red-500">{error}</p>
			</div>
		);
	}

	// Show empty state message for users with no deck
	if (showEmptyState && isEmptyDeck) {
		return (
			<div className="w-full text-center py-8">
				<div className="mb-3 rounded border border-amber-200 bg-amber-50 px-4 py-3">
					<p className="text-sm text-amber-800 font-semibold mb-1">
						Ton deck est vide
					</p>
					<p className="text-xs text-amber-700">
						Ajoute des mots à ton deck pour suivre ton apprentissage et
						visualiser ta progression.
					</p>
				</div>
				{/* Example data preview */}
				<p className="text-xs text-muted-foreground mb-3">
					Voici un exemple de ce que tu verras une fois que tu auras commencé à
					apprendre des mots :
				</p>
			</div>
		);
	}

	// Grid-only mode: render just the grid cells, nothing else
	if (gridOnly) {
		const maxGridOnlyItems = Math.max(0, itemsPerRow * maxRows);
		const gridOnlyVisibleUnits = isExampleData
			? sampleUnitsAcrossRange(filteredUnits, maxGridOnlyItems)
			: filteredUnits;

		return (
			<div className="w-full" ref={containerRef}>
				<div
					style={{
						display: "grid",
						gridGap: `${gridGap}px`,
						gridTemplateColumns: `repeat(auto-fit, ${gridItemWidth}px)`,
						justifyContent: gridJustify,
						direction: "rtl",
					}}
				>
					{gridOnlyVisibleUnits.map((unit, index) => {
						const bgColor =
							typeof unit.color === "string" && unit.color.trim().length > 0
								? unit.color
								: UNSEEN_COLOR;
						const score = unit.score;
						return (
							<div
								key={getUnitRenderKey(unit, index)}
								className="grid-item transition-opacity hover:opacity-80"
								style={{
									width: `${gridItemWidth}px`,
									height: `${gridItemHeight}px`,
									background: bgColor,
									cursor: "pointer",
									display: "flex",
									alignItems: "center",
									justifyContent: "flex-start",
									boxSizing: "border-box",
									paddingInline: "2px",
								}}
								title={`${unit.word} - ${unit.vocabFull} | Score: ${score.toFixed(1)}%`}
							>
								<span
									className="kanji-tile"
									style={{
										color: TEXT_COLOR,
										fontFamily: "'Yakout Linotype', 'Lateef', serif",
										display: "block",
										textAlign: "start",
										direction: "rtl",
										width: "100%",
										lineHeight: 1,
										fontSize: gridWordFontSize,
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "clip",
									}}
								>
									<span dir="rtl">{unit.word}</span>
								</span>
							</div>
						);
					})}
				</div>
			</div>
		);
	}

	return (
		<div className="w-full">
			{/* Example Data Overlay Banner */}
			{isExampleData && (
				<div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2">
					<p className="text-xs text-amber-800">
						<span className="font-semibold">Mode exemple</span> - Voici à quoi
						ressemblera ton suivi de vocabulaire quand tu auras appris tes
						premiers mots.
					</p>
				</div>
			)}

			{/* Compact Header - Single line with stats and controls */}
			<div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				{/* Compact stat line */}
				<div className="flex items-center gap-3 text-xs">
					<div className="flex items-center gap-1 text-muted-foreground">
						<BookOpen className="h-3.5 w-3.5" />
						<span>{stats.total} mots</span>
					</div>
					<div className="flex items-center gap-1 text-muted-foreground">
						<Eye className="h-3.5 w-3.5" />
						<span>{stats.known} connus</span>
					</div>
					<div className="flex items-center gap-1 font-semibold text-foreground">
						<TrendingUp className="h-3.5 w-3.5" />
						<span>{stats.knownPercent}%</span>
					</div>
				</div>

				{/* Controls */}
				<div className="flex items-center gap-2">
					{availableGroups.length > 0 && (
						<select
							value={selectedGroup}
							onChange={(event) => setSelectedGroup(event.target.value)}
							className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground hover:bg-accent/5"
						>
							<option value="all">Toutes catégories</option>
							{availableGroups.map((group) => (
								<option key={group.key} value={group.key}>
									{group.label}
								</option>
							))}
						</select>
					)}

					<select
						value={sortBy}
						onChange={(event) => setSortBy(event.target.value as SortOption)}
						className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground hover:bg-accent/5"
					>
						{sortOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</div>
			</div>

			{/* Gradient Legend */}
			<div className="mb-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
				<span>Non maîtrisé</span>
				<div
					className="h-3"
					style={{
						width: "120px",
						background: `linear-gradient(90deg, ${KANJI_GRADIENT_COLORS.join(", ")})`,
					}}
				/>
				<span>Maîtrisé</span>
			</div>

			{/* Grid - Subtle container with rtl direction for right-to-left fill */}
			<div
				className="rounded-lg border border-border/40 bg-muted/20 p-3"
				ref={containerRef}
			>
				<div
					style={{
						display: "grid",
						gridGap: `${gridGap}px`,
						gridTemplateColumns: `repeat(auto-fit, ${gridItemWidth}px)`,
						justifyContent: "start",
						direction: "rtl",
					}}
				>
					{visibleUnits.map((unit, index) => {
						const bgColor =
							typeof unit.color === "string" && unit.color.trim().length > 0
								? unit.color
								: UNSEEN_COLOR;
						const score = unit.score;

						return (
							<div
								key={getUnitRenderKey(unit, index)}
								className="grid-item transition-opacity hover:opacity-80"
								style={{
									width: `${gridItemWidth}px`,
									height: `${gridItemHeight}px`,
									background: bgColor,
									cursor: "pointer",
									display: "flex",
									alignItems: "center",
									justifyContent: "flex-start",
									boxSizing: "border-box",
									paddingInline: "2px",
								}}
								title={`${unit.word} - ${unit.vocabFull} | Score: ${score.toFixed(1)}%`}
							>
								<span
									className="kanji-tile"
									style={{
										color: TEXT_COLOR,
										fontFamily: "'Yakout Linotype', 'Lateef', serif",
										display: "block",
										textAlign: "start",
										direction: "rtl",
										width: "100%",
										lineHeight: 1,
										fontSize: gridWordFontSize,
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "clip",
									}}
								>
									<span dir="rtl">{unit.word}</span>
								</span>
							</div>
						);
					})}
				</div>
			</div>

			{/* Expand button */}
			{hasMoreUnits && (
				<div className="mt-4 flex justify-center">
					<button
						type="button"
						onClick={() => setIsExpanded(!isExpanded)}
						className="text-sm text-[#8b949e] opacity-70 hover:opacity-100 underline underline-offset-2 transition-opacity"
						style={{ fontFamily: "'Segoe UI', sans-serif" }}
					>
						{isExpanded ? "Voir moins" : "Afficher tout"}
					</button>
				</div>
			)}
		</div>
	);
};
