import vocabAudioAvion from "@/assets/homepage_demo_card/1_avion.mp3";
import imgAvion from "@/assets/homepage_demo_card/1_avion.webp";
import vocabAudioApparaitre from "@/assets/homepage_demo_card/3_apparaitre.mp3";
import imgApparaitre from "@/assets/homepage_demo_card/3_apparaitre.webp";
import sentenceAudioShared from "@/assets/homepage_demo_card/sentAudio_for_all_three.mp3";

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
	notes?: string;
	image?: string;
	vocabAudioUrl?: string;
	sentenceAudioUrl?: string;
	defaultImageUrl?: string | null;
	defaultVocabAudioUrl?: string | null;
	defaultSentenceAudioUrl?: string | null;
	hasCustomImage?: boolean;
	hasCustomVocabAudio?: boolean;
	hasCustomSentenceAudio?: boolean;
	imageHidden?: boolean;
	vocabAudioHidden?: boolean;
	sentenceAudioHidden?: boolean;
	source?: "vocabulary" | "foundation";
	sourceType?: "foundation" | "collected" | "sent" | "alphabet";
	remoteId?: string;
	vocabularyCardId?: string;
	foundationCardId?: string;
	sourceVideoId?: string | null;
	sourceVideoIsShort?: boolean | null;
	sourceCueId?: string | null;
	sourceWordIndex?: number | null;
	sourceWordStartSeconds?: number | null;
	sourceWordEndSeconds?: number | null;
	sourceLinkUrl?: string | null;
	nextReviewAt?: string | null;
	status?: string;
}

export const sampleCards: VocabCard[] = [
	{
		id: 1,
		focus: "Vidéo",
		tags: ["Nom", "Transport"],
		sentBase: "<b>الطائرة</b> النووية الأمريكية تظهر.",
		sentFull: "<b>الْطَّائِرَةُ</b> الْنَّوَوِيَّةُ الْأَمْرِيكِيَّةُ تَظْهَرُ.",
		sentFrench: "L'avion nucléaire américain apparaît.",
		vocabBase: "الطائرة",
		vocabFull: "الْطَّائِرَةُ",
		vocabDef: "avion",
		image: imgAvion,
		vocabAudioUrl: vocabAudioAvion,
		sentenceAudioUrl: sentenceAudioShared,
	},
	{
		id: 3,
		focus: "Vidéo",
		tags: ["Verbe", "Présent"],
		sentBase: "الطائرة النووية الأمريكية <b>تظهر</b>.",
		sentFull: "الْطَّائِرَةُ الْنَّوَوِيَّةُ الْأَمْرِيكِيَّةُ <b>تَظْهَرُ</b>.",
		sentFrench: "L'avion nucléaire américain apparaît.",
		vocabBase: "تظهر",
		vocabFull: "تَظْهَرُ",
		vocabDef: "apparaître",
		image: imgApparaitre,
		vocabAudioUrl: vocabAudioApparaitre,
		sentenceAudioUrl: sentenceAudioShared,
	},
];
