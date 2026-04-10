import { CLAVIER_ARABE_LABELS } from "@/data/clavierArabe/labels";
import type {
	ClavierArabeKeyboardLayout,
	ClavierArabeKeyboardRow,
} from "@/data/clavierArabe/types";

const CLAVIER_ARABE_DIACRITICS_ROW: ClavierArabeKeyboardRow = {
	id: "diacritics",
	keys: [
		{
			id: "fatha",
			latinKey: "a",
			arabic: "َ",
			phonetic: "fatha",
			category: "diacritic",
		},
		{
			id: "fathatan",
			latinKey: "an",
			arabic: "ً",
			phonetic: "fathatan",
			category: "diacritic",
		},
		{
			id: "damma",
			latinKey: "u",
			arabic: "ُ",
			phonetic: "damma",
			category: "diacritic",
		},
		{
			id: "dammatan",
			latinKey: "un",
			arabic: "ٌ",
			phonetic: "dammatan",
			category: "diacritic",
		},
		{
			id: "kasra",
			latinKey: "i",
			arabic: "ِ",
			phonetic: "kasra",
			category: "diacritic",
		},
		{
			id: "kasratan",
			latinKey: "in",
			arabic: "ٍ",
			phonetic: "kasratan",
			category: "diacritic",
		},
		{
			id: "shadda",
			latinKey: "sh",
			arabic: "ّ",
			phonetic: "shadda",
			category: "diacritic",
		},
		{
			id: "sukun",
			latinKey: "o",
			arabic: "ْ",
			phonetic: "sukun",
			category: "diacritic",
		},
		{
			id: "dagger-alif",
			latinKey: "aa",
			arabic: "ٰ",
			phonetic: "alif-khanjariyya",
			category: "diacritic",
		},
		{
			id: "alif-subscript",
			latinKey: "a-",
			arabic: "ٖ",
			phonetic: "alif-subscript",
			category: "diacritic",
		},
		{
			id: "reverse-damma",
			latinKey: "u-",
			arabic: "ٗ",
			phonetic: "reverse-damma",
			category: "diacritic",
		},
	],
};

const LEXILOGOS_ROWS: readonly ClavierArabeKeyboardRow[] = [
	{
		id: "lexilogos-row-1",
		keys: [
			{ id: "lex-a", latinKey: "a", arabic: "ا", phonetic: "alif" },
			{ id: "lex-b", latinKey: "b", arabic: "ب", phonetic: "ba" },
			{ id: "lex-t", latinKey: "t", arabic: "ت", phonetic: "ta" },
			{ id: "lex-t-ap", latinKey: "'t", arabic: "ث", phonetic: "tha" },
			{ id: "lex-j", latinKey: "j", arabic: "ج", phonetic: "jim" },
			{ id: "lex-H", latinKey: "H", arabic: "ح", phonetic: "ha" },
			{ id: "lex-H-ap", latinKey: "'H", arabic: "خ", phonetic: "kha" },
			{ id: "lex-d", latinKey: "d", arabic: "د", phonetic: "dal" },
			{ id: "lex-d-ap", latinKey: "'d", arabic: "ذ", phonetic: "dhal" },
			{ id: "lex-r", latinKey: "r", arabic: "ر", phonetic: "ra" },
			{ id: "lex-z", latinKey: "z", arabic: "ز", phonetic: "zay" },
			{ id: "lex-s", latinKey: "s", arabic: "س", phonetic: "sin" },
			{ id: "lex-s-ap", latinKey: "'s", arabic: "ش", phonetic: "shin" },
		],
	},
	{
		id: "lexilogos-row-2",
		keys: [
			{ id: "lex-S", latinKey: "S", arabic: "ص", phonetic: "sad" },
			{ id: "lex-D", latinKey: "D", arabic: "ض", phonetic: "dad" },
			{ id: "lex-T", latinKey: "T", arabic: "ط", phonetic: "ta" },
			{ id: "lex-Z", latinKey: "Z", arabic: "ظ", phonetic: "za" },
			{ id: "lex-g", latinKey: "g", arabic: "ع", phonetic: "ayn" },
			{ id: "lex-g-ap", latinKey: "'g", arabic: "غ", phonetic: "ghayn" },
			{ id: "lex-f", latinKey: "f", arabic: "ف", phonetic: "fa" },
			{ id: "lex-q", latinKey: "q", arabic: "ق", phonetic: "qaf" },
			{ id: "lex-k", latinKey: "k", arabic: "ك", phonetic: "kaf" },
			{ id: "lex-l", latinKey: "l", arabic: "ل", phonetic: "lam" },
			{ id: "lex-m", latinKey: "m", arabic: "م", phonetic: "mim" },
			{ id: "lex-n", latinKey: "n", arabic: "ن", phonetic: "nun" },
			{ id: "lex-h", latinKey: "h", arabic: "ه", phonetic: "ha" },
			{ id: "lex-w", latinKey: "w", arabic: "و", phonetic: "waw" },
			{ id: "lex-y", latinKey: "y", arabic: "ي", phonetic: "ya" },
			{ id: "lex-hamza", latinKey: "-", arabic: "ء", phonetic: "hamza" },
		],
	},
	{
		id: "lexilogos-row-3",
		keys: [
			{ id: "lex-aa", latinKey: "aa", arabic: "آ", phonetic: "alif-madda" },
			{
				id: "lex-wasla",
				latinKey: "a'",
				arabic: "ٱ",
				phonetic: "alif-wasla",
			},
			{
				id: "lex-hamza-alif",
				latinKey: "-a",
				arabic: "أ",
				phonetic: "hamza-alif",
			},
			{
				id: "lex-hamza-alif-low",
				latinKey: "a-",
				arabic: "إ",
				phonetic: "hamza-alif-low",
			},
			{
				id: "lex-hamza-waw",
				latinKey: "w-",
				arabic: "ؤ",
				phonetic: "hamza-waw",
			},
			{
				id: "lex-hamza-ya",
				latinKey: "y-",
				arabic: "ئ",
				phonetic: "hamza-ya",
			},
			{
				id: "lex-ta-marbuta",
				latinKey: "h'",
				arabic: "ة",
				phonetic: "ta-marbuta",
			},
			{
				id: "lex-alif-maqsura",
				latinKey: "Y",
				arabic: "ى",
				phonetic: "alif-maqsura",
			},
			{ id: "lex-comma", latinKey: ",", arabic: "،", phonetic: "comma" },
			{ id: "lex-semi", latinKey: ";", arabic: "؛", phonetic: "semicolon" },
			{
				id: "lex-question",
				latinKey: "?",
				arabic: "؟",
				phonetic: "question",
			},
			{
				id: "lex-quote-open",
				latinKey: "«",
				arabic: "«",
				phonetic: "quote-open",
			},
			{
				id: "lex-quote-close",
				latinKey: "»",
				arabic: "»",
				phonetic: "quote-close",
			},
			{ id: "lex-tatweel", latinKey: "_", arabic: "ـ", phonetic: "tatweel" },
			{
				id: "lex-space",
				latinKey: "space",
				arabic: " ",
				phonetic: "space",
				width: "extra-wide",
				category: "control",
			},
		],
	},
] as const;

export const CLAVIER_ARABE_LAYOUTS: Record<string, ClavierArabeKeyboardLayout> =
	{
		azerty: {
			id: "azerty",
			label: CLAVIER_ARABE_LABELS.typing.azerty,
			description: "Disposition arabe pour clavier AZERTY francophone.",
			diacriticsRow: CLAVIER_ARABE_DIACRITICS_ROW,
			rows: LEXILOGOS_ROWS,
		},
		qwerty: {
			id: "qwerty",
			label: CLAVIER_ARABE_LABELS.typing.qwerty,
			description: "Disposition arabe pour clavier QWERTY international.",
			diacriticsRow: CLAVIER_ARABE_DIACRITICS_ROW,
			rows: LEXILOGOS_ROWS,
		},
	};

export const CLAVIER_ARABE_LAYOUT_ORDER = ["azerty", "qwerty"] as const;

export { CLAVIER_ARABE_DIACRITICS_ROW };
