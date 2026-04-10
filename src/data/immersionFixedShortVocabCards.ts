import type { Video } from "../interfaces/video.ts";
import {
	countWordsInPhrase,
	normalizeArabicToken,
	stripArabicDiacritics,
} from "../lib/arabicText.ts";

export const FIXED_SHORTS_CARDS_PER_VIDEO = 3;
export const FIXED_SHORTS_MAX_PHRASE_WORDS = 7;

const DEFAULT_AUDIO_PADDING_MS = {
	preMs: 120,
	postMs: 180,
} as const;

const FIXED_SHORTS_VOCAB_UUID_BY_FIXED_ID: Record<string, string> = {
	"fixed-arur-short-souk-culture-card-1":
		"a0ddb483-4225-492e-9c46-289b3cf9453f",
	"fixed-arur-short-souk-culture-card-2":
		"db46dd59-89a0-466b-a88e-af023cbb6117",
	"fixed-arur-short-souk-culture-card-3":
		"325dbd16-e1cb-417b-92d9-f07f08c6cad4",
	"fixed-arur-short-arabes-aigles-card-1":
		"a0c75f11-69ad-44f3-8d55-9f7a01d3c29c",
	"fixed-arur-short-arabes-aigles-card-2":
		"0d41a432-33dd-4ac2-a650-3ecca8f5f9f5",
	"fixed-arur-short-arabes-aigles-card-3":
		"f89a7f79-f001-4192-ae9a-33cc6f76a6b9",
	"fixed-arur-short-lait-chameau-card-1":
		"5b16a734-1c21-4a5b-bae6-f06e9b6615d6",
	"fixed-arur-short-lait-chameau-card-2":
		"26f79bb1-c570-4198-877c-344fe411f58e",
	"fixed-arur-short-lait-chameau-card-3":
		"1a870d58-def2-4db2-8577-06d136c58585",
	"fixed-arur-short-resto-saoudite-card-1":
		"c2d8dbf1-2d7b-488a-9a86-375777361db2",
	"fixed-arur-short-resto-saoudite-card-2":
		"64e4b1b1-a1bb-4469-9ac2-01b048190419",
	"fixed-arur-short-resto-saoudite-card-3":
		"8d86d11b-1bbf-45cc-89b7-437782a04c4a",
	"fixed-arur-short-kkucw2ht2d4-card-1": "f1d65e56-52f1-47a1-abb1-d3c964dd2c6c",
	"fixed-arur-short-kkucw2ht2d4-card-2": "21f5133d-28af-40f2-8577-414c08d61472",
	"fixed-arur-short-kkucw2ht2d4-card-3": "8a64a821-fcaa-4ef3-bbd4-734698d49aca",
	"fixed-7b2a5626-5ff4-4734-953b-94720bea72ae-card-1":
		"fabdd978-1522-4b84-93bc-c1af3123f4f0",
	"fixed-7b2a5626-5ff4-4734-953b-94720bea72ae-card-2":
		"5daab6f6-5dad-4401-a89e-278efd1dba78",
	"fixed-7b2a5626-5ff4-4734-953b-94720bea72ae-card-3":
		"c9fa499d-8033-4f0c-a109-8cce20b67365",
	"fixed-e4b801ee-0308-4a20-aba6-503bdd27d5a2-card-1":
		"eabfee77-b001-4294-80e2-6267becdcf93",
	"fixed-e4b801ee-0308-4a20-aba6-503bdd27d5a2-card-2":
		"8e55e47e-66ae-4880-ac70-038e427927b3",
	"fixed-e4b801ee-0308-4a20-aba6-503bdd27d5a2-card-3":
		"9edc4cfe-8dd4-4309-b532-01aa2b01da4b",
	"fixed-ca38542c-11b2-4fcc-b155-7f9b657829f1-card-1":
		"92e09718-500a-4a29-928f-1927bec4060e",
	"fixed-ca38542c-11b2-4fcc-b155-7f9b657829f1-card-2":
		"0b714a95-84e0-40f8-bdff-c45a8d027548",
	"fixed-ca38542c-11b2-4fcc-b155-7f9b657829f1-card-3":
		"027bdac4-557c-47b3-ada8-10d4ee716785",
	"fixed-265a2293-be0e-423c-bb48-07b1e205bb49-card-1":
		"ab41590b-c298-4f28-83c4-4142784ada83",
	"fixed-265a2293-be0e-423c-bb48-07b1e205bb49-card-2":
		"2176e85d-e425-4326-b6f7-a8194e1ab064",
	"fixed-265a2293-be0e-423c-bb48-07b1e205bb49-card-3":
		"5a42e3fe-a2ab-400f-887d-9cb145c2627b",
	"fixed-2e5b4842-31b9-445c-8880-2050f0795cbf-card-1":
		"ef959772-2dc1-49a0-b553-fb4ea263e3bf",
	"fixed-2e5b4842-31b9-445c-8880-2050f0795cbf-card-2":
		"87db2386-147e-4835-ade9-36393498b519",
	"fixed-2e5b4842-31b9-445c-8880-2050f0795cbf-card-3":
		"c6de6f10-3d7f-4161-9072-331ef2faf3a8",
	"fixed-35d5dfee-a8db-41a2-b225-736803b649d5-card-1":
		"2976dbfb-8462-42d6-9289-79dd16117de8",
	"fixed-35d5dfee-a8db-41a2-b225-736803b649d5-card-2":
		"212aba41-dc4e-4884-a1ec-9e6b1c681082",
	"fixed-35d5dfee-a8db-41a2-b225-736803b649d5-card-3":
		"da917cb1-ac0a-4822-b9b6-9ede11852d4c",
	"fixed-aed5477d-2951-40fa-90b9-d09537a80848-card-1":
		"3fd51015-996c-4524-893f-3b9139515e16",
	"fixed-aed5477d-2951-40fa-90b9-d09537a80848-card-2":
		"b10ec932-7068-4049-a19f-1ffafbe7e98f",
	"fixed-aed5477d-2951-40fa-90b9-d09537a80848-card-3":
		"fb0ea8b3-7482-4e6e-9149-199224343c1a",
} as const;

const ARABIC_DIACRITICS_REGEX =
	/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/;

export type FixedShortCardSpec = {
	cardId: `card-${number}`;
	wordWithVowels: string;
	wordBare: string;
	wordFr: string;
	phraseAr: string;
	phraseArWithVowels: string;
	phraseFr: string;
	wordStartMs: number;
	wordEndMs: number;
	screenshotMs: number;
	audioPaddingMs?: {
		preMs: number;
		postMs: number;
	};
};

export type FixedShortCardsSpec = {
	sourceVideoPath: string;
	cards: readonly [FixedShortCardSpec, FixedShortCardSpec, FixedShortCardSpec];
};

export type FixedShortVocabularyCardRecord = {
	id: string;
	vocabulary_card_id: string;
	video_id: string;
	word_ar: string;
	word_ar_bare: string;
	word_ar_diacritics: string;
	word_fr: string;
	example_sentence_ar: string;
	example_sentence_ar_diacritics: string;
	example_sentence_fr: string;
	category: string;
	vocabBase: string;
	vocabFull: string;
	sentBase: string;
	sentFull: string;
	audio_url: string;
	image_url: string;
	sentence_audio_url: string | null;
	word_start_ms: number;
	word_end_ms: number;
	screenshot_ms: number;
	audio_padding_pre_ms: number;
	audio_padding_post_ms: number;
	source_type: "fixed_shorts";
	created_at: string;
};

const FIXED_SHORTS_SPECS: Record<string, FixedShortCardsSpec> = {
	"arur-short-souk-culture": {
		sourceVideoPath: "videos/arur-souk-culture.mp4",
		cards: [
			{
				cardId: "card-1",
				wordWithVowels: "تُمُور",
				wordBare: "تمور",
				wordFr: "dattes",
				phraseAr: "أكبر سوق تمور في العالم",
				phraseArWithVowels: "أَكْبَرُ سُوقِ تُمُورٍ فِي الْعَالَمِ",
				phraseFr: "Le plus grand marché aux dattes du monde.",
				wordStartMs: 741,
				wordEndMs: 1121,
				screenshotMs: 930,
			},
			{
				cardId: "card-2",
				wordWithVowels: "دَلَّال",
				wordBare: "دلال",
				wordFr: "crieur",
				phraseAr: "لكي يكون دلال فنان",
				phraseArWithVowels: "لِكَيْ يَكُونَ دَلَّالٌ فَنَّانٌ",
				phraseFr: "Pour être un crieur talentueux.",
				wordStartMs: 3723,
				wordEndMs: 4964,
				screenshotMs: 4344,
			},
			{
				cardId: "card-3",
				wordWithVowels: "التَّوْفِيق",
				wordBare: "التوفيق",
				wordFr: "réussite",
				phraseAr: "التوفيق بالله بعض الناس لديهم",
				phraseArWithVowels: "التَّوْفِيقُ بِاللَّهِ بَعْضُ النَّاسِ لَدَيْهِمْ",
				phraseFr: "Certaines personnes ont la réussite grâce à Allah.",
				wordStartMs: 5845,
				wordEndMs: 6766,
				screenshotMs: 6305,
			},
		],
	},
	"arur-short-arabes-aigles": {
		sourceVideoPath: "videos/arur-arabes-aigles.mp4",
		cards: [
			{
				cardId: "card-1",
				wordWithVowels: "قُدَّام",
				wordBare: "قدام",
				wordFr: "devant",
				phraseAr: "من قدام من هنا",
				phraseArWithVowels: "مِنْ قُدَّامٍ مِنْ هُنَا",
				phraseFr: "Par devant, par ici.",
				wordStartMs: 330,
				wordEndMs: 470,
				screenshotMs: 400,
			},
			{
				cardId: "card-2",
				wordWithVowels: "عَادِي",
				wordBare: "عادي",
				wordFr: "normal",
				phraseAr: "عادي ما يشوف",
				phraseArWithVowels: "عَادِي مَا يَشُوفُ",
				phraseFr: "Normal, il ne voit pas.",
				wordStartMs: 5292,
				wordEndMs: 5493,
				screenshotMs: 5392,
			},
			{
				cardId: "card-3",
				wordWithVowels: "يَشُوف",
				wordBare: "يشوف",
				wordFr: "il voit",
				phraseAr: "عادي ما يشوف ما يشوف",
				phraseArWithVowels: "عَادِي مَا يَشُوفُ مَا يَشُوفُ",
				phraseFr: "Normal, il ne voit pas.",
				wordStartMs: 5630,
				wordEndMs: 5790,
				screenshotMs: 5710,
			},
		],
	},
	"arur-short-lait-chameau": {
		sourceVideoPath: "videos/arur-lait-chameau.mp4",
		cards: [
			{
				cardId: "card-1",
				wordWithVowels: "الْحَلِيب",
				wordBare: "الحليب",
				wordFr: "lait",
				phraseAr: "يدورون الحليب هذا هو",
				phraseArWithVowels: "يَدُورُونَ الْحَلِيبَ هَذَا هُوَ",
				phraseFr: "C'est ce lait-là qu'ils cherchent.",
				wordStartMs: 2780,
				wordEndMs: 3140,
				screenshotMs: 2960,
			},
			{
				cardId: "card-2",
				wordWithVowels: "اللَّكْتُوز",
				wordBare: "اللكتوز",
				wordFr: "lactose",
				phraseAr: "اللكتوز عشان ايش عشان ما تروح",
				phraseArWithVowels: "اللَّكْتُوزُ عَشَانْ اِيشْ عَشَانْ مَا تَرُوحْ",
				phraseFr: "Le lactose : pour ne pas avoir de problème.",
				wordStartMs: 8690,
				wordEndMs: 9330,
				screenshotMs: 9010,
			},
			{
				cardId: "card-3",
				wordWithVowels: "الْحَافِظَة",
				wordBare: "الحافظة",
				wordFr: "conservateur",
				phraseAr: "خالي من المواد الحافظة",
				phraseArWithVowels: "خَالِي مِنَ الْمَوَادِّ الْحَافِظَةِ",
				phraseFr: "Sans conservateurs.",
				wordStartMs: 16950,
				wordEndMs: 18130,
				screenshotMs: 17540,
			},
		],
	},
	"arur-short-resto-saoudite": {
		sourceVideoPath: "videos/arur-resto-arabie-saoudite.mp4",
		cards: [
			{
				cardId: "card-1",
				wordWithVowels: "تَفْعَلُونَهُ",
				wordBare: "تفعلونه",
				wordFr: "vous faites",
				phraseAr: "ما الذي تفعلونه",
				phraseArWithVowels: "مَا الَّذِي تَفْعَلُونَهُ",
				phraseFr: "Qu'est-ce que vous faites ?",
				wordStartMs: 2830,
				wordEndMs: 3580,
				screenshotMs: 3205,
			},
			{
				cardId: "card-2",
				wordWithVowels: "أَهْلًا",
				wordBare: "أهلا",
				wordFr: "bienvenue",
				phraseAr: "أهلا ومرحبا",
				phraseArWithVowels: "أَهْلًا وَمَرْحَبًا",
				phraseFr: "Bienvenue.",
				wordStartMs: 3600,
				wordEndMs: 3760,
				screenshotMs: 3680,
			},
			{
				cardId: "card-3",
				wordWithVowels: "مَرْحَبًا",
				wordBare: "مرحبا",
				wordFr: "bonjour",
				phraseAr: "أهلا ومرحبا بكم",
				phraseArWithVowels: "أَهْلًا وَمَرْحَبًا بِكُمْ",
				phraseFr: "Bonjour et bienvenue.",
				wordStartMs: 3780,
				wordEndMs: 4320,
				screenshotMs: 4050,
			},
		],
	},
	"arur-short-kkucw2ht2d4": {
		sourceVideoPath: "videos/arur-kkuCW2hT2D4.mp4",
		cards: [
			{
				cardId: "card-1",
				wordWithVowels: "شُكْرًا",
				wordBare: "شكرا",
				wordFr: "merci",
				phraseAr: "شكرا",
				phraseArWithVowels: "شُكْرًا",
				phraseFr: "Merci.",
				wordStartMs: 418,
				wordEndMs: 2644,
				screenshotMs: 1531,
				audioPaddingMs: {
					preMs: 80,
					postMs: 120,
				},
			},
			{
				cardId: "card-2",
				wordWithVowels: "لِلْمُشَاهَدَة",
				wordBare: "للمشاهدة",
				wordFr: "pour regarder",
				phraseAr: "شكرا للمشاهدة",
				phraseArWithVowels: "شُكْرًا لِلْمُشَاهَدَةِ",
				phraseFr: "Merci d'avoir regardé.",
				wordStartMs: 3426,
				wordEndMs: 4600,
				screenshotMs: 4020,
			},
			{
				cardId: "card-3",
				wordWithVowels: "مُشَاهَدَة",
				wordBare: "مشاهدة",
				wordFr: "visionnage",
				phraseAr: "شكرا للمشاهدة",
				phraseArWithVowels: "شُكْرًا لِلْمُشَاهَدَةِ",
				phraseFr: "Merci d'avoir regardé.",
				wordStartMs: 4700,
				wordEndMs: 6400,
				screenshotMs: 5550,
			},
		],
	},
	"7b2a5626-5ff4-4734-953b-94720bea72ae": {
		sourceVideoPath: "archived-short://7b2a5626-5ff4-4734-953b-94720bea72ae",
		cards: [
			{
				cardId: "card-1",
				wordWithVowels: "جَسَدِي",
				wordBare: "جسدي",
				wordFr: "mon corps",
				phraseAr: "رب إن جسدي ضعيف",
				phraseArWithVowels: "رَبِّ إِنَّ جَسَدِي ضَعِيفٌ",
				phraseFr: "Mon Seigneur, mon corps est faible.",
				wordStartMs: 3540,
				wordEndMs: 3960,
				screenshotMs: 3750,
			},
			{
				cardId: "card-2",
				wordWithVowels: "أَحْمِي",
				wordBare: "أحمي",
				wordFr: "je protège",
				phraseAr: "لكي أحمي الضعيف",
				phraseArWithVowels: "لِكَيْ أَحْمِيَ الضَّعِيفَ",
				phraseFr: "Pour protéger le faible.",
				wordStartMs: 38046,
				wordEndMs: 38571,
				screenshotMs: 38309,
			},
			{
				cardId: "card-3",
				wordWithVowels: "الضَّعِيف",
				wordBare: "الضعيف",
				wordFr: "le faible",
				phraseAr: "أحمي الضعيف وأنصر المظلوم",
				phraseArWithVowels: "أَحْمِي الضَّعِيفَ وَأَنْصُرُ الْمَظْلُومَ",
				phraseFr: "Je protège le faible et soutiens l'opprimé.",
				wordStartMs: 38571,
				wordEndMs: 39097,
				screenshotMs: 38834,
			},
		],
	},
	"e4b801ee-0308-4a20-aba6-503bdd27d5a2": {
		sourceVideoPath: "archived-short://e4b801ee-0308-4a20-aba6-503bdd27d5a2",
		cards: [
			{
				cardId: "card-1",
				wordWithVowels: "الْبَلْدَة",
				wordBare: "البلدة",
				wordFr: "la ville",
				phraseAr: "اذهب إلى البلدة المجاورة",
				phraseArWithVowels: "اذْهَبْ إِلَى الْبَلْدَةِ الْمُجَاوِرَةِ",
				phraseFr: "Va dans la ville voisine.",
				wordStartMs: 14853,
				wordEndMs: 15260,
				screenshotMs: 15056,
			},
			{
				cardId: "card-2",
				wordWithVowels: "الْعَدُوّ",
				wordBare: "العدو",
				wordFr: "l'ennemi",
				phraseAr: "العدو يقصفنا ولا نجد دواء",
				phraseArWithVowels: "الْعَدُوُّ يَقْصِفُنَا وَلَا نَجِدُ دَوَاءً",
				phraseFr: "L'ennemi nous bombarde et nous ne trouvons pas de remède.",
				wordStartMs: 25370,
				wordEndMs: 25780,
				screenshotMs: 25575,
			},
			{
				cardId: "card-3",
				wordWithVowels: "يَسْتَطِيع",
				wordBare: "يستطيع",
				wordFr: "il peut",
				phraseAr: "بطريقة لا يستطيع الخائن حفظها",
				phraseArWithVowels: "بِطَرِيقَةٍ لَا يَسْتَطِيعُ الْخَائِنُ حِفْظَهَا",
				phraseFr: "D'une manière que le traître ne peut retenir.",
				wordStartMs: 35303,
				wordEndMs: 35737,
				screenshotMs: 35520,
			},
		],
	},
	"ca38542c-11b2-4fcc-b155-7f9b657829f1": {
		sourceVideoPath: "archived-short://ca38542c-11b2-4fcc-b155-7f9b657829f1",
		cards: [
			{
				cardId: "card-1",
				wordWithVowels: "حَارَبَنِي",
				wordBare: "حاربني",
				wordFr: "m'a combattu",
				phraseAr: "كل من حاربني وغدرني",
				phraseArWithVowels: "كُلُّ مَنْ حَارَبَنِي وَغَدَرَنِي",
				phraseFr: "Tous ceux qui m'ont combattu et trahi.",
				wordStartMs: 933,
				wordEndMs: 1587,
				screenshotMs: 1260,
			},
			{
				cardId: "card-2",
				wordWithVowels: "بِالنِّيَّة",
				wordBare: "بالنية",
				wordFr: "avec l'intention",
				phraseAr: "فحاربهم بالنية",
				phraseArWithVowels: "فَحَارِبْهُمْ بِالنِّيَّةِ",
				phraseFr: "Affronte-les avec une intention sincère.",
				wordStartMs: 5053,
				wordEndMs: 5907,
				screenshotMs: 5480,
			},
			{
				cardId: "card-3",
				wordWithVowels: "يَجْعَل",
				wordBare: "يجعل",
				wordFr: "rend",
				phraseAr: "العاقل يجعل من العدو صديقا",
				phraseArWithVowels: "الْعَاقِلُ يَجْعَلُ مِنَ الْعَدُوِّ صَدِيقًا",
				phraseFr: "Le sage fait d'un ennemi un ami.",
				wordStartMs: 25626,
				wordEndMs: 26300,
				screenshotMs: 25963,
			},
		],
	},
	"265a2293-be0e-423c-bb48-07b1e205bb49": {
		sourceVideoPath: "archived-short://265a2293-be0e-423c-bb48-07b1e205bb49",
		cards: [
			{
				cardId: "card-1",
				wordWithVowels: "كِتَابِي",
				wordBare: "كتابي",
				wordFr: "mon livre",
				phraseAr: "أين كتابي",
				phraseArWithVowels: "أَيْنَ كِتَابِي",
				phraseFr: "Où est mon livre ?",
				wordStartMs: 9840,
				wordEndMs: 10800,
				screenshotMs: 10320,
			},
			{
				cardId: "card-2",
				wordWithVowels: "الْعِلْم",
				wordBare: "العلم",
				wordFr: "le savoir",
				phraseAr: "لماذا نقرأ كل هذا العلم",
				phraseArWithVowels: "لِمَاذَا نَقْرَأُ كُلَّ هَذَا الْعِلْمِ",
				phraseFr: "Pourquoi lisons-nous tout ce savoir ?",
				wordStartMs: 19160,
				wordEndMs: 19840,
				screenshotMs: 19500,
			},
			{
				cardId: "card-3",
				wordWithVowels: "الْأُمَّة",
				wordBare: "الأمة",
				wordFr: "la communauté",
				phraseAr: "انتصارنا يعني انتصار الأمة",
				phraseArWithVowels: "انْتِصَارُنَا يَعْنِي انْتِصَارَ الْأُمَّةِ",
				phraseFr: "Notre victoire est celle de la communauté.",
				wordStartMs: 21580,
				wordEndMs: 22160,
				screenshotMs: 21870,
			},
		],
	},
	"2e5b4842-31b9-445c-8880-2050f0795cbf": {
		sourceVideoPath: "archived-short://2e5b4842-31b9-445c-8880-2050f0795cbf",
		cards: [
			{
				cardId: "card-1",
				wordWithVowels: "التَّحَدِّي",
				wordBare: "التحدي",
				wordFr: "le défi",
				phraseAr: "التحدي يبدأ الآن",
				phraseArWithVowels: "التَّحَدِّي يَبْدَأُ الْآنَ",
				phraseFr: "Le défi commence maintenant.",
				wordStartMs: 5399,
				wordEndMs: 6149,
				screenshotMs: 5774,
			},
			{
				cardId: "card-2",
				wordWithVowels: "رِفَاقُكَ",
				wordBare: "رفاقك",
				wordFr: "tes compagnons",
				phraseAr: "رفاقك لقد انضموا إلى التمرين",
				phraseArWithVowels: "رِفَاقُكَ لَقَدِ انْضَمُّوا إِلَى التَّمْرِينِ",
				phraseFr: "Tes compagnons ont rejoint l'entraînement.",
				wordStartMs: 25119,
				wordEndMs: 25766,
				screenshotMs: 25442,
			},
			{
				cardId: "card-3",
				wordWithVowels: "انْضَمُّوا",
				wordBare: "انضموا",
				wordFr: "ils ont rejoint",
				phraseAr: "لقد انضموا سويا إلى التمرين",
				phraseArWithVowels: "لَقَدِ انْضَمُّوا سَوِيًّا إِلَى التَّمْرِينِ",
				phraseFr: "Ils ont rejoint l'entraînement ensemble.",
				wordStartMs: 26413,
				wordEndMs: 27059,
				screenshotMs: 26736,
			},
		],
	},
	"35d5dfee-a8db-41a2-b225-736803b649d5": {
		sourceVideoPath: "archived-short://35d5dfee-a8db-41a2-b225-736803b649d5",
		cards: [
			{
				cardId: "card-1",
				wordWithVowels: "تَعَقَّبُونِي",
				wordBare: "تعقبوني",
				wordFr: "ils m'ont traqué",
				phraseAr: "لقد تعقبوني واكتشفوا مكاننا",
				phraseArWithVowels: "لَقَدْ تَعَقَّبُونِي وَاكْتَشَفُوا مَكَانَنَا",
				phraseFr: "Ils m'ont traqué et ont découvert notre position.",
				wordStartMs: 3495,
				wordEndMs: 4567,
				screenshotMs: 4031,
			},
			{
				cardId: "card-2",
				wordWithVowels: "مَكَانُنَا",
				wordBare: "مكاننا",
				wordFr: "notre position",
				phraseAr: "لقد اكتشفوا مكاننا",
				phraseArWithVowels: "لَقَدِ اكْتَشَفُوا مَكَانَنَا",
				phraseFr: "Ils ont découvert notre position.",
				wordStartMs: 8679,
				wordEndMs: 9171,
				screenshotMs: 8925,
			},
			{
				cardId: "card-3",
				wordWithVowels: "تَضْحِيَتُكَ",
				wordBare: "تضحيتك",
				wordFr: "ton sacrifice",
				phraseAr: "لتكن تضحيتك بصمة عز",
				phraseArWithVowels: "لِتَكُنْ تَضْحِيَتُكَ بَصْمَةَ عِزٍّ",
				phraseFr: "Que ton sacrifice laisse une trace d'honneur.",
				wordStartMs: 11137,
				wordEndMs: 11628,
				screenshotMs: 11382,
			},
		],
	},
	"aed5477d-2951-40fa-90b9-d09537a80848": {
		sourceVideoPath: "archived-short://aed5477d-2951-40fa-90b9-d09537a80848",
		cards: [
			{
				cardId: "card-1",
				wordWithVowels: "هُدْنَة",
				wordBare: "هدنة",
				wordFr: "trêve",
				phraseAr: "بيننا وبين العدو هدنة",
				phraseArWithVowels: "بَيْنَنَا وَبَيْنَ الْعَدُوِّ هُدْنَةٌ",
				phraseFr: "Il y a une trêve entre nous et l'ennemi.",
				wordStartMs: 11194,
				wordEndMs: 11617,
				screenshotMs: 11405,
			},
			{
				cardId: "card-2",
				wordWithVowels: "الْمُقَاتِلِينَ",
				wordBare: "المقاتلين",
				wordFr: "les combattants",
				phraseAr: "لتوزيع الكتب على المقاتلين",
				phraseArWithVowels: "لِتَوْزِيعِ الْكُتُبِ عَلَى الْمُقَاتِلِينَ",
				phraseFr: "Pour distribuer les livres aux combattants.",
				wordStartMs: 14573,
				wordEndMs: 15080,
				screenshotMs: 14826,
			},
			{
				cardId: "card-3",
				wordWithVowels: "احْذَر",
				wordBare: "احذر",
				wordFr: "prends garde",
				phraseAr: "احذر فسم الثعبان قاتل",
				phraseArWithVowels: "احْذَرْ فَسَمُّ الثُّعْبَانِ قَاتِلٌ",
				phraseFr: "Prends garde : le venin du serpent est mortel.",
				wordStartMs: 44680,
				wordEndMs: 45193,
				screenshotMs: 44936,
			},
		],
	},
};

const fixedCardsValidationErrors = (
	specs: Record<string, FixedShortCardsSpec>,
) => {
	const errors: string[] = [];

	for (const [shortId, shortSpec] of Object.entries(specs)) {
		if (!shortSpec.sourceVideoPath.trim()) {
			errors.push(`${shortId}: sourceVideoPath is required.`);
		}

		if (shortSpec.cards.length !== FIXED_SHORTS_CARDS_PER_VIDEO) {
			errors.push(
				`${shortId}: expected exactly ${FIXED_SHORTS_CARDS_PER_VIDEO} cards, received ${shortSpec.cards.length}.`,
			);
		}

		const seenCardIds = new Set<string>();

		for (const card of shortSpec.cards) {
			if (seenCardIds.has(card.cardId)) {
				errors.push(`${shortId}/${card.cardId}: duplicate cardId.`);
			}
			seenCardIds.add(card.cardId);

			if (!card.wordWithVowels.trim() || !card.wordBare.trim()) {
				errors.push(
					`${shortId}/${card.cardId}: wordWithVowels and wordBare are required.`,
				);
			}

			if (
				normalizeArabicToken(stripArabicDiacritics(card.wordWithVowels)) !==
				normalizeArabicToken(card.wordBare)
			) {
				errors.push(
					`${shortId}/${card.cardId}: wordBare must match wordWithVowels without diacritics.`,
				);
			}

			const phraseWordCount = countWordsInPhrase(card.phraseAr);
			if (
				phraseWordCount === 0 ||
				phraseWordCount > FIXED_SHORTS_MAX_PHRASE_WORDS
			) {
				errors.push(
					`${shortId}/${card.cardId}: phraseAr must contain 1-${FIXED_SHORTS_MAX_PHRASE_WORDS} words (received ${phraseWordCount}).`,
				);
			}

			if (!card.phraseArWithVowels.trim()) {
				errors.push(
					`${shortId}/${card.cardId}: phraseArWithVowels is required.`,
				);
			}

			if (
				normalizeArabicToken(stripArabicDiacritics(card.phraseArWithVowels)) !==
				normalizeArabicToken(card.phraseAr)
			) {
				errors.push(
					`${shortId}/${card.cardId}: phraseArWithVowels must match phraseAr without diacritics.`,
				);
			}

			if (!ARABIC_DIACRITICS_REGEX.test(card.wordWithVowels)) {
				errors.push(
					`${shortId}/${card.cardId}: wordWithVowels must contain Arabic diacritics.`,
				);
			}

			if (!ARABIC_DIACRITICS_REGEX.test(card.phraseArWithVowels)) {
				errors.push(
					`${shortId}/${card.cardId}: phraseArWithVowels must contain Arabic diacritics.`,
				);
			}

			if (
				!Number.isFinite(card.wordStartMs) ||
				!Number.isFinite(card.wordEndMs)
			) {
				errors.push(
					`${shortId}/${card.cardId}: word timing values must be finite numbers.`,
				);
			}

			if (card.wordEndMs <= card.wordStartMs) {
				errors.push(
					`${shortId}/${card.cardId}: wordEndMs must be greater than wordStartMs.`,
				);
			}

			if (
				card.screenshotMs < card.wordStartMs ||
				card.screenshotMs > card.wordEndMs
			) {
				errors.push(
					`${shortId}/${card.cardId}: screenshotMs must be inside [wordStartMs, wordEndMs].`,
				);
			}
		}
	}

	return errors;
};

export const IMMERSION_FIXED_SHORT_VOCAB_SPECS = FIXED_SHORTS_SPECS;

const expectedFixedShortCardIds = Object.entries(
	IMMERSION_FIXED_SHORT_VOCAB_SPECS,
).flatMap(([shortId, spec]) =>
	spec.cards.map((card) => `fixed-${shortId}-${card.cardId}`),
);

const missingFixedShortCardUuids = expectedFixedShortCardIds.filter(
	(cardId) => FIXED_SHORTS_VOCAB_UUID_BY_FIXED_ID[cardId] == null,
);

if (missingFixedShortCardUuids.length > 0) {
	throw new Error(
		`Invalid fixed shorts vocab cards dataset: missing vocabulary_card_id uuids for:\n${missingFixedShortCardUuids
			.map((cardId) => `- ${cardId}`)
			.join("\n")}`,
	);
}

export const getImmersionFixedShortCardsValidationErrors = (): string[] =>
	fixedCardsValidationErrors(IMMERSION_FIXED_SHORT_VOCAB_SPECS);

const validationErrors = getImmersionFixedShortCardsValidationErrors();
if (validationErrors.length > 0) {
	throw new Error(
		`Invalid fixed shorts vocab cards dataset:\n${validationErrors
			.map((error) => `- ${error}`)
			.join("\n")}`,
	);
}

const buildShortCardAssetBasePath = (shortId: string): string =>
	`/immersion/shorts/${shortId}/fixed-cards`;

const normalizeVideoPathForLookup = (
	value: string | null | undefined,
): string =>
	(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/^[./]+/, "")
		.replace(/\\/g, "/");

const SHORT_ID_BY_SOURCE_VIDEO_PATH = Object.entries(
	IMMERSION_FIXED_SHORT_VOCAB_SPECS,
).reduce<Record<string, string>>((acc, [shortId, spec]) => {
	const normalizedPath = normalizeVideoPathForLookup(spec.sourceVideoPath);
	if (normalizedPath) {
		acc[normalizedPath] = shortId;
	}
	return acc;
}, {});

export const getFixedShortVocabCardsForVideo = (
	video: Pick<Video, "videoId" | "isShort" | "videoUrl">,
): FixedShortVocabularyCardRecord[] => {
	if (!video.isShort) {
		return [];
	}

	const shortIdFromVideoUrl =
		SHORT_ID_BY_SOURCE_VIDEO_PATH[
			normalizeVideoPathForLookup(video.videoUrl)
		] ?? null;
	const matchedShortId =
		IMMERSION_FIXED_SHORT_VOCAB_SPECS[video.videoId] != null
			? video.videoId
			: shortIdFromVideoUrl;
	if (!matchedShortId) {
		return [];
	}

	const spec = IMMERSION_FIXED_SHORT_VOCAB_SPECS[matchedShortId];
	if (!spec) {
		return [];
	}

	const assetBasePath = buildShortCardAssetBasePath(matchedShortId);

	return spec.cards.map((card) => {
		const cardId = `fixed-${matchedShortId}-${card.cardId}`;
		const vocabularyCardId =
			FIXED_SHORTS_VOCAB_UUID_BY_FIXED_ID[cardId] ?? null;
		if (!vocabularyCardId) {
			throw new Error(
				`Invalid fixed shorts vocab cards dataset: missing vocabulary_card_id uuid for ${cardId}.`,
			);
		}
		const audioPaddingMs = card.audioPaddingMs ?? DEFAULT_AUDIO_PADDING_MS;
		const wordFull = card.wordWithVowels;
		const wordBase = card.wordBare;
		const sentenceBase = card.phraseAr;
		const sentenceFull = card.phraseArWithVowels;

		return {
			id: cardId,
			vocabulary_card_id: vocabularyCardId,
			video_id: video.videoId,
			word_ar: wordFull,
			word_ar_bare: wordBase,
			word_ar_diacritics: wordFull,
			word_fr: card.wordFr,
			example_sentence_ar: sentenceBase,
			example_sentence_ar_diacritics: sentenceFull,
			example_sentence_fr: card.phraseFr,
			category: "Shorts fixes",
			vocabBase: wordBase,
			vocabFull: wordFull,
			sentBase: sentenceBase,
			sentFull: sentenceFull,
			audio_url: `${assetBasePath}/${card.cardId}-vocab.mp3`,
			image_url: `${assetBasePath}/${card.cardId}.png`,
			sentence_audio_url: null,
			word_start_ms: card.wordStartMs,
			word_end_ms: card.wordEndMs,
			screenshot_ms: card.screenshotMs,
			audio_padding_pre_ms: audioPaddingMs.preMs,
			audio_padding_post_ms: audioPaddingMs.postMs,
			source_type: "fixed_shorts",
			created_at: "2026-02-27T00:00:00.000Z",
		};
	});
};
