"use client";
import {
	IconArrowLeft,
	IconArrowRight,
	IconCopy,
	IconEraser,
	IconLanguage,
} from "@tabler/icons-react";
import type React from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { CLAVIER_ARABE_LAYOUTS } from "@/data/clavierArabe/keyboardLayouts";
import type { ClavierArabeKey } from "@/data/clavierArabe/types";
import {
	type ArabicKeyboardConvertQuotaStatus,
	getArabicKeyboardConvertQuotaStatus,
	markArabicKeyboardConvertQuotaReached,
	recordArabicKeyboardConvertUsage,
} from "@/lib/arabicKeyboardConvertQuota";
import {
	measureClavierArabeCaretAnchor,
	measureClavierArabeTextareaAutoGrow,
} from "@/lib/clavierArabe/editor";
import { cn } from "@/lib/utils";
import { requestArabicKeyboardAction } from "@/services/arabicKeyboardService";

// Sound sprite definitions from config.json [startMs, durationMs]
// Key down sounds - half duration for a snappy press sound
const SOUND_DEFINES_DOWN: Record<string, [number, number]> = {
	Escape: [2894, 113],
	F1: [3610, 98],
	F2: [4210, 90],
	F3: [4758, 90],
	F4: [5250, 100],
	F5: [5831, 105],
	F6: [6396, 105],
	F7: [6900, 105],
	F8: [7443, 111],
	F9: [7955, 91],
	F10: [8504, 105],
	F11: [9046, 94],
	F12: [9582, 96],
	Backquote: [12476, 100],
	Digit1: [12946, 96],
	Digit2: [13470, 95],
	Digit3: [13963, 100],
	Digit4: [14481, 102],
	Digit5: [14994, 94],
	Digit6: [15505, 109],
	Digit7: [15990, 97],
	Digit8: [16529, 92],
	Digit9: [17012, 103],
	Digit0: [17550, 87],
	Minus: [18052, 93],
	Equal: [18553, 89],
	Backspace: [19065, 110],
	Tab: [21734, 119],
	KeyQ: [22245, 95],
	KeyW: [22790, 89],
	KeyE: [23317, 83],
	KeyR: [23817, 92],
	KeyT: [24297, 92],
	KeyY: [24811, 93],
	KeyU: [25313, 95],
	KeyI: [25795, 91],
	KeyO: [26309, 84],
	KeyP: [26804, 83],
	BracketLeft: [27330, 85],
	BracketRight: [27883, 99],
	Backslash: [28393, 100],
	CapsLock: [31011, 126],
	KeyA: [31542, 85],
	KeyS: [32031, 88],
	KeyD: [32492, 85],
	KeyF: [32973, 87],
	KeyG: [33453, 94],
	KeyH: [33986, 93],
	KeyJ: [34425, 88],
	KeyK: [34932, 90],
	KeyL: [35410, 95],
	Semicolon: [35914, 95],
	Quote: [36428, 87],
	Enter: [36902, 117],
	ShiftLeft: [38136, 133],
	KeyZ: [38694, 80],
	KeyX: [39148, 76],
	KeyC: [39632, 95],
	KeyV: [40136, 94],
	KeyB: [40621, 107],
	KeyN: [41103, 90],
	KeyM: [41610, 93],
	Comma: [42110, 92],
	Period: [42594, 90],
	Slash: [43105, 95],
	ShiftRight: [43565, 137],
	Fn: [44251, 110],
	ControlLeft: [45327, 83],
	AltLeft: [45750, 82],
	MetaLeft: [46199, 100],
	Space: [51541, 144],
	MetaRight: [47929, 75],
	AltRight: [49329, 82],
	ArrowUp: [44251, 110],
	ArrowLeft: [49837, 88],
	ArrowDown: [50333, 90],
	ArrowRight: [50783, 111],
};

// Key up sounds - shorter duration, offset for the release "thock"
// Uses the tail end of each sound sample for a lighter release effect
const SOUND_DEFINES_UP: Record<string, [number, number]> = {
	Escape: [2894 + 120, 100],
	F1: [3610 + 100, 90],
	F2: [4210 + 95, 80],
	F3: [4758 + 95, 80],
	F4: [5250 + 105, 90],
	F5: [5831 + 110, 95],
	F6: [6396 + 110, 95],
	F7: [6900 + 110, 95],
	F8: [7443 + 115, 100],
	F9: [7955 + 95, 80],
	F10: [8504 + 110, 95],
	F11: [9046 + 100, 85],
	F12: [9582 + 100, 85],
	Backquote: [12476 + 105, 90],
	Digit1: [12946 + 100, 85],
	Digit2: [13470 + 100, 85],
	Digit3: [13963 + 105, 90],
	Digit4: [14481 + 110, 90],
	Digit5: [14994 + 100, 85],
	Digit6: [15505 + 115, 100],
	Digit7: [15990 + 100, 90],
	Digit8: [16529 + 95, 85],
	Digit9: [17012 + 110, 90],
	Digit0: [17550 + 90, 80],
	Minus: [18052 + 100, 85],
	Equal: [18553 + 90, 85],
	Backspace: [19065 + 115, 100],
	Tab: [21734 + 125, 110],
	KeyQ: [22245 + 100, 85],
	KeyW: [22790 + 90, 85],
	KeyE: [23317 + 85, 80],
	KeyR: [23817 + 95, 85],
	KeyT: [24297 + 95, 85],
	KeyY: [24811 + 100, 85],
	KeyU: [25313 + 100, 85],
	KeyI: [25795 + 95, 85],
	KeyO: [26309 + 85, 80],
	KeyP: [26804 + 85, 80],
	BracketLeft: [27330 + 85, 80],
	BracketRight: [27883 + 105, 90],
	Backslash: [28393 + 105, 90],
	CapsLock: [31011 + 135, 110],
	KeyA: [31542 + 90, 80],
	KeyS: [32031 + 90, 80],
	KeyD: [32492 + 85, 80],
	KeyF: [32973 + 90, 80],
	KeyG: [33453 + 100, 85],
	KeyH: [33986 + 95, 85],
	KeyJ: [34425 + 90, 85],
	KeyK: [34932 + 95, 85],
	KeyL: [35410 + 100, 85],
	Semicolon: [35914 + 100, 85],
	Quote: [36428 + 90, 80],
	Enter: [36902 + 125, 105],
	ShiftLeft: [38136 + 140, 120],
	KeyZ: [38694 + 85, 75],
	KeyX: [39148 + 80, 70],
	KeyC: [39632 + 100, 85],
	KeyV: [40136 + 100, 85],
	KeyB: [40621 + 115, 95],
	KeyN: [41103 + 95, 85],
	KeyM: [41610 + 100, 85],
	Comma: [42110 + 95, 85],
	Period: [42594 + 95, 85],
	Slash: [43105 + 100, 85],
	ShiftRight: [43565 + 145, 125],
	Fn: [44251 + 115, 100],
	ControlLeft: [45327 + 85, 80],
	AltLeft: [45750 + 85, 80],
	MetaLeft: [46199 + 105, 90],
	Space: [51541 + 150, 130],
	MetaRight: [47929 + 75, 70],
	AltRight: [49329 + 85, 80],
	ArrowUp: [44251 + 115, 100],
	ArrowLeft: [49837 + 90, 85],
	ArrowDown: [50333 + 95, 80],
	ArrowRight: [50783 + 115, 100],
};

// Map key codes to display labels
const KEY_DISPLAY_LABELS: Record<string, string> = {
	Escape: "esc",
	Backspace: "delete",
	Tab: "tab",
	Enter: "return",
	ShiftLeft: "shift",
	ShiftRight: "shift",
	ControlLeft: "control",
	ControlRight: "control",
	AltLeft: "option",
	AltRight: "option",
	MetaLeft: "command",
	MetaRight: "command",
	Space: "space",
	CapsLock: "caps",
	ArrowUp: "↑",
	ArrowDown: "↓",
	ArrowLeft: "←",
	ArrowRight: "→",
	Backquote: "`",
	Minus: "-",
	Equal: "=",
	BracketLeft: "[",
	BracketRight: "]",
	Backslash: "\\",
	Semicolon: ";",
	Quote: "'",
	Comma: ",",
	Period: ".",
	Slash: "/",
};

const getKeyDisplayLabel = (keyCode: string): string => {
	if (KEY_DISPLAY_LABELS[keyCode]) return KEY_DISPLAY_LABELS[keyCode];
	if (keyCode.startsWith("Key")) return keyCode.slice(3);
	if (keyCode.startsWith("Digit")) return keyCode.slice(5);
	if (keyCode.startsWith("F") && keyCode.length <= 3) return keyCode;
	return keyCode;
};

export type KeyboardMode = "simplified" | "normal";
export type KeyboardOutputMode = "phonetic" | "arabic";

const PREVIEW_ICON_BUTTON_CLASS =
	"inline-flex h-5 w-5 items-center justify-center text-stone-300 transition-colors hover:text-stone-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-200 disabled:cursor-not-allowed disabled:text-stone-500";

const ARABIC_KEY_LABEL_CLASS = "text-[12px] leading-none text-red-600";
const LATIN_KEY_LABEL_CLASS = "text-[5px] leading-none text-neutral-600";
const DIACRITIC_KEY_LABEL_CLASS = "text-[18px] leading-none text-red-600";
const DIACRITIC_DOTTED_CIRCLE = "◌";

const PHONETIC_SUGGESTION_TEXT = "salam...";
const ARABIC_SUGGESTION_TEXT = "سلام...";
const CARET_BLINK_INTERVAL_MS = 530;
const PREVIEW_DEFAULT_WIDTH_PX = 448;
const PREVIEW_FONT =
	"900 24px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
const PREVIEW_LINE_HEIGHT_PX = 32;
const PREVIEW_MIN_ROWS = 2;
const PREVIEW_HISTORY_LIMIT = 10;
const INLINE_COMPLETION_MIN_CHARS = 2;
const INLINE_COMPLETION_DEBOUNCE_MS = 380;
const INLINE_COMPLETION_MAX_SUFFIX_CHARS = 64;
const HOLD_BACKSPACE_INITIAL_DELAY_MS = 360;
const HOLD_BACKSPACE_REPEAT_INTERVAL_MS = 48;
const KEYBOARD_MAX_SCALE = 2;
const KEYBOARD_SCALE_GUTTER_PX = 4;
const PHONETIC_TO_ARABIC_GATEWAY_ERROR_MESSAGE =
	"La conversion phonetique -> arabe a echoue. Reessaie dans un instant.";

type PhoneticToArabicConversionResult =
	| { ok: true; outputText: string }
	| { ok: false; errorMessage: string; errorCode?: string };

const AUTHENTICATED_DAILY_LIMIT_ERROR_CODE = "ARABIZI_DAILY_LIMIT_REACHED";
const AUTHENTICATED_DAILY_LIMIT_MESSAGE =
	"Limite atteinte pour aujourd'hui. Reviens demain.";
const GUEST_DAILY_LIMIT_MESSAGE =
	"Connecte-toi pour utiliser gratuitement le clavier arabe, ou attends demain.";

const getArabicConvertLimitMessage = (
	status: Pick<ArabicKeyboardConvertQuotaStatus, "isAuthenticated">,
): string =>
	status.isAuthenticated
		? AUTHENTICATED_DAILY_LIMIT_MESSAGE
		: GUEST_DAILY_LIMIT_MESSAGE;

const containsArabicScript = (value: string): boolean =>
	/[\u0600-\u06FF]/.test(value);

type KeyPressOptions = {
	inputValue?: string;
	displayLabel?: string;
	replaceLastInput?: boolean;
	resetSimplifiedSequence?: boolean;
	setPendingPrefix?: string | null;
	setReplaceableToken?: string | null;
	suppressDefaultInput?: boolean;
};

type VisualLetterKeyDefinition = {
	keyCode: string;
	latinLabel: string;
};

const LEGACY_SIMPLIFIED_LAYOUT = CLAVIER_ARABE_LAYOUTS.azerty;

const NORMAL_ARABIC_KEY_LABELS: Record<string, string> = {
	KeyQ: "ض",
	KeyW: "ص",
	KeyE: "ث",
	KeyR: "ق",
	KeyT: "ف",
	KeyY: "غ",
	KeyU: "ع",
	KeyI: "ه",
	KeyO: "خ",
	KeyP: "ح",
	KeyA: "ش",
	KeyS: "س",
	KeyD: "ي",
	KeyF: "ب",
	KeyG: "ل",
	KeyH: "ا",
	KeyJ: "ت",
	KeyK: "ن",
	KeyL: "م",
	KeyZ: "ئ",
	KeyX: "ء",
	KeyC: "ؤ",
	KeyV: "ر",
	KeyB: "لا",
	KeyN: "ى",
	KeyM: "ة",
};

const NORMAL_KEY_INPUT_VALUES: Record<string, string> = {
	...NORMAL_ARABIC_KEY_LABELS,
	Backquote: "ذ",
	BracketLeft: "ج",
	BracketRight: "د",
	Semicolon: "؛",
	Quote: "ط",
	Comma: "،",
	Slash: "؟",
	Space: " ",
	Enter: "\n",
	Minus: "-",
	Equal: "=",
	Period: ".",
	Digit0: "0",
	Digit1: "1",
	Digit2: "2",
	Digit3: "3",
	Digit4: "4",
	Digit5: "5",
	Digit6: "6",
	Digit7: "7",
	Digit8: "8",
	Digit9: "9",
};

const NORMAL_PHONETIC_INPUT_VALUES: Record<string, string> = {
	Backquote: "`",
	Minus: "-",
	Equal: "=",
	BracketLeft: "[",
	BracketRight: "]",
	Backslash: "\\",
	Semicolon: ";",
	Quote: "'",
	Comma: ",",
	Period: ".",
	Slash: "/",
	Space: " ",
	Enter: "\n",
	KeyQ: "a",
	KeyW: "z",
	KeyE: "e",
	KeyR: "r",
	KeyT: "t",
	KeyY: "y",
	KeyU: "u",
	KeyI: "i",
	KeyO: "o",
	KeyP: "p",
	KeyA: "q",
	KeyS: "s",
	KeyD: "d",
	KeyF: "f",
	KeyG: "g",
	KeyH: "h",
	KeyJ: "j",
	KeyK: "k",
	KeyL: "l",
	KeyZ: "w",
	KeyX: "x",
	KeyC: "c",
	KeyV: "v",
	KeyB: "b",
	KeyN: "n",
	KeyM: "m",
};

const NORMAL_TOP_ROW_KEYS: readonly VisualLetterKeyDefinition[] = [
	{ keyCode: "KeyQ", latinLabel: "A" },
	{ keyCode: "KeyW", latinLabel: "Z" },
	{ keyCode: "KeyE", latinLabel: "E" },
	{ keyCode: "KeyR", latinLabel: "R" },
	{ keyCode: "KeyT", latinLabel: "T" },
	{ keyCode: "KeyY", latinLabel: "Y" },
	{ keyCode: "KeyU", latinLabel: "U" },
	{ keyCode: "KeyI", latinLabel: "I" },
	{ keyCode: "KeyO", latinLabel: "O" },
	{ keyCode: "KeyP", latinLabel: "P" },
];

const NORMAL_HOME_ROW_KEYS: readonly VisualLetterKeyDefinition[] = [
	{ keyCode: "KeyA", latinLabel: "Q" },
	{ keyCode: "KeyS", latinLabel: "S" },
	{ keyCode: "KeyD", latinLabel: "D" },
	{ keyCode: "KeyF", latinLabel: "F" },
	{ keyCode: "KeyG", latinLabel: "G" },
	{ keyCode: "KeyH", latinLabel: "H" },
	{ keyCode: "KeyJ", latinLabel: "J" },
	{ keyCode: "KeyK", latinLabel: "K" },
	{ keyCode: "KeyL", latinLabel: "L" },
];

const NORMAL_BOTTOM_ROW_KEYS: readonly VisualLetterKeyDefinition[] = [
	{ keyCode: "KeyZ", latinLabel: "W" },
	{ keyCode: "KeyX", latinLabel: "X" },
	{ keyCode: "KeyC", latinLabel: "C" },
	{ keyCode: "KeyV", latinLabel: "V" },
	{ keyCode: "KeyB", latinLabel: "B" },
	{ keyCode: "KeyN", latinLabel: "N" },
	{ keyCode: "KeyM", latinLabel: "M" },
];

const NORMAL_VISUAL_KEY_LABELS: Record<string, string> = Object.fromEntries(
	[
		...NORMAL_TOP_ROW_KEYS,
		...NORMAL_HOME_ROW_KEYS,
		...NORMAL_BOTTOM_ROW_KEYS,
	].map(({ keyCode, latinLabel }) => [keyCode, latinLabel]),
);

const LEGACY_SIMPLIFIED_TRANLITERATION_KEYS = LEGACY_SIMPLIFIED_LAYOUT.rows
	.flatMap((row) => row.keys)
	.filter((key) => key.latinKey !== "space");

const SIMPLIFIED_SINGLE_CHAR_TRANSLITERATIONS: Record<string, string> =
	Object.fromEntries(
		LEGACY_SIMPLIFIED_TRANLITERATION_KEYS.filter(
			(key) => key.latinKey.length === 1,
		).map((key) => [key.latinKey, key.arabic]),
	);

const SIMPLIFIED_MULTI_CHAR_TRANSLITERATIONS: Record<string, string> =
	Object.fromEntries(
		LEGACY_SIMPLIFIED_TRANLITERATION_KEYS.filter(
			(key) => key.latinKey.length > 1,
		).map((key) => [key.latinKey, key.arabic]),
	);

const SIMPLIFIED_PENDING_PREFIXES = new Set(
	Object.keys(SIMPLIFIED_MULTI_CHAR_TRANSLITERATIONS)
		.filter(
			(token) =>
				token.length === 2 &&
				!SIMPLIFIED_SINGLE_CHAR_TRANSLITERATIONS[token[0]],
		)
		.map((token) => token[0]),
);

const SIMPLIFIED_REPLACEABLE_TOKENS = new Set(
	Object.keys(SIMPLIFIED_MULTI_CHAR_TRANSLITERATIONS)
		.filter(
			(token) =>
				token.length === 2 &&
				Boolean(SIMPLIFIED_SINGLE_CHAR_TRANSLITERATIONS[token[0]]),
		)
		.map((token) => token[0]),
);

const getNormalKeyPressOptions = (
	event: KeyboardEvent,
	outputMode: KeyboardOutputMode,
): KeyPressOptions => {
	const keyCode = event.code;

	if (outputMode === "phonetic") {
		const phoneticValue =
			event.key.length === 1
				? event.key
				: NORMAL_PHONETIC_INPUT_VALUES[keyCode];

		return {
			inputValue: phoneticValue,
			displayLabel:
				NORMAL_VISUAL_KEY_LABELS[keyCode] ?? getKeyDisplayLabel(keyCode),
		};
	}

	return {
		inputValue: NORMAL_KEY_INPUT_VALUES[keyCode],
		displayLabel:
			NORMAL_VISUAL_KEY_LABELS[keyCode] ?? getKeyDisplayLabel(keyCode),
	};
};

const normalizeSimplifiedPhysicalToken = (
	event: KeyboardEvent,
): string | null => {
	if (event.key === " ") {
		return "space";
	}

	if (event.key === "Enter") {
		return "enter";
	}

	if (event.key === "Backspace") {
		return "backspace";
	}

	if (event.key === "Escape") {
		return "escape";
	}

	if (event.key.length !== 1) {
		return null;
	}

	return event.key;
};

const getSimplifiedKeyPressOptions = (options: {
	event: KeyboardEvent;
	pendingPrefix: string | null;
	replaceableToken: string | null;
	outputMode: KeyboardOutputMode;
}): KeyPressOptions | null => {
	const token = normalizeSimplifiedPhysicalToken(options.event);
	if (!token) {
		return {
			resetSimplifiedSequence: true,
			setPendingPrefix: null,
			setReplaceableToken: null,
			suppressDefaultInput: true,
		};
	}

	if (token === "space") {
		return {
			inputValue: " ",
			displayLabel: "space",
			resetSimplifiedSequence: true,
			setPendingPrefix: null,
			setReplaceableToken: null,
			suppressDefaultInput: true,
		};
	}

	if (token === "enter") {
		return {
			inputValue: "\n",
			displayLabel: "return",
			resetSimplifiedSequence: true,
			setPendingPrefix: null,
			setReplaceableToken: null,
			suppressDefaultInput: true,
		};
	}

	if (token === "backspace") {
		return {
			displayLabel: "delete",
			resetSimplifiedSequence: true,
			setPendingPrefix: null,
			setReplaceableToken: null,
			suppressDefaultInput: true,
		};
	}

	if (token === "escape") {
		return {
			displayLabel: "esc",
			resetSimplifiedSequence: true,
			setPendingPrefix: null,
			setReplaceableToken: null,
			suppressDefaultInput: true,
		};
	}

	if (options.pendingPrefix) {
		const prefixedToken = `${options.pendingPrefix}${token}`;
		if (SIMPLIFIED_MULTI_CHAR_TRANSLITERATIONS[prefixedToken]) {
			return {
				inputValue:
					options.outputMode === "arabic"
						? SIMPLIFIED_MULTI_CHAR_TRANSLITERATIONS[prefixedToken]
						: prefixedToken,
				displayLabel: prefixedToken,
				resetSimplifiedSequence: true,
				setPendingPrefix: null,
				setReplaceableToken: null,
				suppressDefaultInput: true,
			};
		}
	}

	if (options.replaceableToken) {
		const combinedToken = `${options.replaceableToken}${token}`;
		if (SIMPLIFIED_MULTI_CHAR_TRANSLITERATIONS[combinedToken]) {
			return {
				inputValue:
					options.outputMode === "arabic"
						? SIMPLIFIED_MULTI_CHAR_TRANSLITERATIONS[combinedToken]
						: combinedToken,
				displayLabel: combinedToken,
				replaceLastInput: true,
				resetSimplifiedSequence: true,
				setPendingPrefix: null,
				setReplaceableToken: null,
				suppressDefaultInput: true,
			};
		}
	}

	if (SIMPLIFIED_PENDING_PREFIXES.has(token)) {
		return {
			displayLabel: token,
			resetSimplifiedSequence: true,
			setPendingPrefix: token,
			setReplaceableToken: null,
			suppressDefaultInput: true,
		};
	}

	if (SIMPLIFIED_SINGLE_CHAR_TRANSLITERATIONS[token]) {
		return {
			inputValue:
				options.outputMode === "arabic"
					? SIMPLIFIED_SINGLE_CHAR_TRANSLITERATIONS[token]
					: token,
			displayLabel: token,
			resetSimplifiedSequence: true,
			setPendingPrefix: null,
			setReplaceableToken: SIMPLIFIED_REPLACEABLE_TOKENS.has(token)
				? token
				: null,
			suppressDefaultInput: true,
		};
	}

	return {
		resetSimplifiedSequence: true,
		setPendingPrefix: null,
		setReplaceableToken: null,
		suppressDefaultInput: true,
	};
};

interface KeyboardContextType {
	playSoundDown: (keyCode: string) => void;
	playSoundUp: (keyCode: string) => void;
	pressedKeys: Set<string>;
	setPressed: (keyCode: string, options?: KeyPressOptions) => void;
	setReleased: (keyCode: string) => void;
	isPreviewInputLocked: boolean;
	setPreviewInputLocked: (locked: boolean) => void;
	setInlineCompletionInterceptor: (
		handler: ((event: KeyboardEvent) => boolean) | null,
	) => void;
	undoPreviewText: () => void;
	typedPreview: string;
	clearPreviewText: () => void;
	replacePreviewText: (nextValue: string) => void;
	outputMode: KeyboardOutputMode;
	setOutputMode: (mode: KeyboardOutputMode) => void;
}

const KeyboardContext = createContext<KeyboardContextType | null>(null);

const useKeyboardSound = () => {
	const context = useContext(KeyboardContext);
	if (!context) {
		throw new Error("useKeyboardSound must be used within KeyboardProvider");
	}
	return context;
};

const getDefaultInputValueForKeyCode = (
	keyCode: string,
	outputMode: KeyboardOutputMode,
): string | undefined => {
	if (outputMode === "phonetic") {
		return NORMAL_PHONETIC_INPUT_VALUES[keyCode];
	}

	return NORMAL_KEY_INPUT_VALUES[keyCode];
};

const SIMPLIFIED_TRANSLITERATION_TOKENS = [
	...Object.keys(SIMPLIFIED_MULTI_CHAR_TRANSLITERATIONS),
	...Object.keys(SIMPLIFIED_SINGLE_CHAR_TRANSLITERATIONS),
].sort((a, b) => b.length - a.length);

type FrancophoneGlossaryEntry = {
	arabic: string;
	variants: string[];
};

const FRENCH_ARABIZI_GLOSSARY: readonly FrancophoneGlossaryEntry[] = [
	{
		arabic: "سلام",
		variants: ["salam", "salaam", "salem", "slem", "selem", "slm"],
	},
	{
		arabic: "السلام عليكم",
		variants: [
			"salam aleykoum",
			"assalam alaykoum",
			"assalamou alaykoum",
			"as salam alaykoum",
			"salam alaykoum",
			"salam aleikoum",
			"salam alikoum",
			"salam alaykum",
			"salam alaikum",
			"assalamu alaykum",
			"as salamu alaykum",
			"salam 3alaykoum",
			"salam 3likoum",
		],
	},
	{
		arabic: "وعليكم السلام",
		variants: [
			"wa alaykoum salam",
			"wa aleykoum salam",
			"wa aleikoum salam",
			"oua aleykoum salam",
			"wa alikoum salam",
			"wa alaykum salam",
			"wa alaikum salam",
			"walaykoum salam",
			"walikoum salam",
			"wa 3alaykoum salam",
			"wa 3likoum salam",
		],
	},
	{
		arabic: "السلام عليكم ورحمة الله وبركاته",
		variants: [
			"salam aleykoum wa rahmatoullah wa barakatouh",
			"salam alaykoum wa rahmatoullah wa barakatouh",
			"assalamu alaikum wa rahmatullahi wa barakatuh",
			"assalamou aleykoum wa rahmatoullah wa barakatouh",
			"salam 3alaykoum wa rahmatoullah wa barakatouh",
		],
	},
	{
		arabic: "بسم الله",
		variants: [
			"bismillah",
			"bismilah",
			"bismi llah",
			"bismi lah",
			"besmillah",
			"besmellah",
		],
	},
	{
		arabic: "الحمد لله",
		variants: [
			"alhamdulillah",
			"hamdoulillah",
			"hamdoulilah",
			"hamdulillah",
			"hamdoullah",
			"hamdoulah",
			"elhamdoulillah",
			"al hamdulillah",
			"el hamdoulilah",
			"7amdoulilah",
			"7amdoullah",
		],
	},
	{
		arabic: "إن شاء الله",
		variants: [
			"inchallah",
			"inchaallah",
			"inch allah",
			"inshallah",
			"in sha allah",
			"insha allah",
			"inshaallah",
			"nchallah",
			"incha2allah",
		],
	},
	{
		arabic: "ما شاء الله",
		variants: [
			"machallah",
			"machaallah",
			"macha allah",
			"mashallah",
			"mashaallah",
			"ma sha allah",
			"masha allah",
			"macha2allah",
		],
	},
	{
		arabic: "اللهم بارك",
		variants: [
			"allahouma barek",
			"allahoumma barek",
			"allahoma barek",
			"allahumma barik",
			"allahuma barik",
		],
	},
	{
		arabic: "بارك الله فيك",
		variants: [
			"barakallahoufik",
			"barakallahofik",
			"barakallah fik",
			"barak allah fik",
			"barakallahou fik",
			"barak allahou fik",
			"barakallahu fik",
			"barakallahufik",
			"baraka allahu fik",
		],
	},
	{
		arabic: "بارك الله فيكم",
		variants: [
			"barakallahoufikoum",
			"barakallahou fikoum",
			"barakallahoufikom",
			"barak allah fikoum",
			"barak allah fikom",
			"barakallahu fikum",
		],
	},
	{
		arabic: "جزاك الله خيرًا",
		variants: [
			"jazakallah khair",
			"jazakallah kheir",
			"jazakallah khayran",
			"jazakallahou khayran",
			"jazaka allah khair",
			"jazaakallah khair",
			"jazak allah khair",
			"jazak allah kheir",
			"jazakallahou khair",
			"jazakallahou kheir",
			"jazakallahu khairan",
			"jazakallahu kheiran",
		],
	},
	{
		arabic: "جزاكم الله خيرًا",
		variants: [
			"jazakoum allah khair",
			"jazakoum allah kheir",
			"jazakum allah khair",
			"jazakum allah kheir",
			"jazakumullahu khairan",
			"jazakumullahu kheiran",
		],
	},
	{
		arabic: "أستغفر الله",
		variants: [
			"astaghfirullah",
			"astaghfiroullah",
			"staghfirullah",
			"staghfoullah",
			"starfoullah",
			"starfallah",
			"astarfirullah",
			"astaghfirlah",
			"astaghfir allah",
		],
	},
	{
		arabic: "سبحان الله",
		variants: [
			"subhanallah",
			"soubhanallah",
			"subhan allah",
			"soubhan allah",
			"sub7anallah",
			"soub7anallah",
			"sobhanallah",
			"soubanallah",
		],
	},
	{
		arabic: "الله أكبر",
		variants: [
			"allahu akbar",
			"allahou akbar",
			"allaho akbar",
			"allahuakbar",
			"allah akbar",
		],
	},
	{
		arabic: "لا حول ولا قوة إلا بالله",
		variants: [
			"la hawla wa la quwwata illa billah",
			"la hawla wala quwwata illa billah",
			"lahawla wala quwwata illa billah",
			"la hawla wala kuwwata illa billah",
			"la hawla wa la kuwwata illa billah",
		],
	},
	{
		arabic: "لا إله إلا الله",
		variants: [
			"la ilaha illa allah",
			"la ilaha illallah",
			"la ilaha illa lah",
			"la ilaha ila allah",
		],
	},
	{
		arabic: "إن لله وإنا إليه راجعون",
		variants: [
			"inna lillahi wa inna ilayhi rajioun",
			"innalillah wa inna ilayhi rajioun",
			"inna lillah wa inna ilayhi rajioun",
			"ina lilah wa ina ilayhi rajioun",
		],
	},
	{
		arabic: "الله يبارك فيك",
		variants: [
			"allah y barek fik",
			"allah ybarek fik",
			"allahybarekfik",
			"allah yebarek fik",
			"allah ibarek fik",
		],
	},
	{
		arabic: "وإياك",
		variants: ["wa iyyak", "wa iyak", "waiyak", "wayyak", "wa iyyaki"],
	},
	{
		arabic: "اللهم صل على محمد",
		variants: [
			"allahumma salli ala muhammad",
			"allahoumma salli ala muhammad",
			"allahuma salli ala muhammad",
			"allahumma salli 3ala muhammad",
			"allahouma salli 3la muhammad",
		],
	},
	{
		arabic: "صلى الله عليه وسلم",
		variants: [
			"sallallahu alayhi wa sallam",
			"sallalahu alayhi wa sallam",
			"salla allahu alayhi wa sallam",
			"sallallahu 3alayhi wa sallam",
		],
	},
	{
		arabic: "عيد مبارك",
		variants: [
			"eid mubarak",
			"aid mubarak",
			"eid moubarak",
			"aid moubarak",
			"3iid mubaarak",
		],
	},
	{
		arabic: "عيدك مبارك",
		variants: ["eidak mubarak"],
	},
	{
		arabic: "عيد سعيد",
		variants: ["eid saeed", "eid sa3iid"],
	},
	{
		arabic: "عيد مبروك",
		variants: ["aid mabrouk", "eid mabrouk"],
	},
	{
		arabic: "رمضان كريم",
		variants: ["ramadan kareem", "ramadan karim", "ramzaan kariim"],
	},
	{
		arabic: "رمضان مبارك",
		variants: [
			"ramadan mubarak",
			"ramadan moubarak",
			"ramadan moubarik",
			"ramadhaan mubaarak",
			"ramadan al mubarak",
		],
	},
	{
		arabic: "الله أكرم",
		variants: ["allahu akram", "alla akram"],
	},
	{
		arabic: "الله يرحمه",
		variants: [
			"allah y rahmo",
			"allah y rahmou",
			"allah yerhamo",
			"allah yarhamouh",
			"allah yarhamhou",
			"allahou yourhamhou",
			"rahimahoullah",
			"yarhamhoullah",
			"rahmatou allahi 3aleyhi",
		],
	},
	{
		arabic: "الله يرحمها",
		variants: ["allah y rahma", "allah yerhama", "allah yarhamha"],
	},
	{
		arabic: "الله يرحمهم",
		variants: ["allah yarhamhoum"],
	},
	{
		arabic: "الله يرحمهن",
		variants: ["allah yarhamhunna"],
	},
	{
		arabic: "شفاك الله",
		variants: [
			"allah y chafik",
			"allah yachfik",
			"allah yashfeek",
			"chafak allah",
		],
	},
	{
		arabic: "الله يشافيها",
		variants: ["allah y chafiha"],
	},
	{
		arabic: "كل سنة وانت طيب",
		variants: [
			"kol sana wenta tayyeb",
			"koll sana wenta tayyeb",
			"kolle sana wenta tayyeb",
			"kol sana wenta teeb",
		],
	},
	{
		arabic: "كل سنة وانتي طيبة",
		variants: ["kul sana wenti tayyeba"],
	},
	{
		arabic: "كل سنة وانتو طيبين",
		variants: ["kul sana wentu tayyebeen"],
	},
	{
		arabic: "كل عام وأنت بخير",
		variants: ["kul 3am wa inta bikhair"],
	},
	{
		arabic: "كل عام وأنتم بخير",
		variants: ["kul 3am w antm be7eer", "kolle3am wentom bekheer"],
	},
	{
		arabic: "وبالصحة والسلامة",
		variants: ["besse77a wessalaama"],
	},
	{
		arabic: "تقبل الله منا ومنكم",
		variants: ["tagabbal allahu minna wa minkum"],
	},
	{
		arabic: "آمين",
		variants: ["amin", "ameen", "amiin", "amine"],
	},
	{
		arabic: "يا رب",
		variants: [
			"yarab",
			"ya rab",
			"yarabb",
			"ya rabb",
			"ya rabbi",
			"yarabbi",
			"yarbi",
		],
	},
	{
		arabic: "مرحبًا",
		variants: ["marhaba", "marhaban", "merhba", "mrhba"],
	},
	{
		arabic: "أهلًا وسهلًا",
		variants: ["ahlan wa sahlan", "ahlanwasahlan", "ehlan wa sahlan"],
	},
];

const normalizeLatinCompletionKey = (value: string): string =>
	value
		.toLowerCase()
		.replace(/[’']/g, "")
		.replace(/[-_]/g, " ")
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.replace(/\s+/g, " ")
		.trim();

const normalizeArabicCompletionKey = (value: string): string =>
	value.replace(/\s+/g, " ").trim();

const LATIN_GLOSSARY_COMPLETION_PHRASES = Array.from(
	new Set(
		FRENCH_ARABIZI_GLOSSARY.flatMap((entry) =>
			entry.variants.map(normalizeLatinCompletionKey),
		),
	),
)
	.filter((candidate) => candidate.length > 0)
	.sort((left, right) => left.length - right.length);

const LATIN_GLOSSARY_COMPLETION_TOKENS = Array.from(
	new Set(
		LATIN_GLOSSARY_COMPLETION_PHRASES.flatMap((phrase) => phrase.split(" ")),
	),
)
	.filter((token) => token.length >= INLINE_COMPLETION_MIN_CHARS)
	.sort((left, right) => left.length - right.length);

const ARABIC_GLOSSARY_COMPLETION_PHRASES = Array.from(
	new Set(
		FRENCH_ARABIZI_GLOSSARY.map((entry) =>
			normalizeArabicCompletionKey(entry.arabic),
		),
	),
)
	.filter((candidate) => candidate.length > 0)
	.sort((left, right) => left.length - right.length);

const ARABIC_GLOSSARY_COMPLETION_TOKENS = Array.from(
	new Set(
		ARABIC_GLOSSARY_COMPLETION_PHRASES.flatMap((phrase) => phrase.split(" ")),
	),
)
	.filter((token) => token.length >= 2)
	.sort((left, right) => left.length - right.length);

const findInlineCompletionSuffix = (
	normalizedInput: string,
	phraseCandidates: readonly string[],
	tokenCandidates: readonly string[],
	minChars: number,
): string => {
	if (normalizedInput.length < minChars) {
		return "";
	}

	const phraseMatch = phraseCandidates.find(
		(candidate) =>
			candidate.startsWith(normalizedInput) &&
			candidate.length > normalizedInput.length,
	);
	if (phraseMatch) {
		return phraseMatch.slice(normalizedInput.length);
	}

	const currentToken = normalizedInput.split(" ").at(-1) ?? "";
	if (currentToken.length < minChars) {
		return "";
	}

	const tokenMatch = tokenCandidates.find(
		(candidate) =>
			candidate.startsWith(currentToken) &&
			candidate.length > currentToken.length,
	);

	return tokenMatch ? tokenMatch.slice(currentToken.length) : "";
};

const getGlossaryInlineCompletionSuffix = (
	typedValue: string,
	outputMode: KeyboardOutputMode,
): string => {
	if (!typedValue || /\s$/.test(typedValue)) {
		return "";
	}

	if (outputMode === "phonetic") {
		const normalizedInput = normalizeLatinCompletionKey(typedValue);
		const suffix = findInlineCompletionSuffix(
			normalizedInput,
			LATIN_GLOSSARY_COMPLETION_PHRASES,
			LATIN_GLOSSARY_COMPLETION_TOKENS,
			INLINE_COMPLETION_MIN_CHARS,
		);

		return suffix.length <= INLINE_COMPLETION_MAX_SUFFIX_CHARS ? suffix : "";
	}

	const normalizedInput = normalizeArabicCompletionKey(typedValue);
	const suffix = findInlineCompletionSuffix(
		normalizedInput,
		ARABIC_GLOSSARY_COMPLETION_PHRASES,
		ARABIC_GLOSSARY_COMPLETION_TOKENS,
		2,
	);

	return suffix.length <= INLINE_COMPLETION_MAX_SUFFIX_CHARS ? suffix : "";
};

const normalizeCompletionCacheKey = (
	value: string,
	outputMode: KeyboardOutputMode,
): string =>
	outputMode === "phonetic"
		? normalizeLatinCompletionKey(value)
		: normalizeArabicCompletionKey(value);

const extractInlineCompletionSuffixFromProvider = (options: {
	baseText: string;
	outputMode: KeyboardOutputMode;
	providerOutputText: string;
}): string => {
	const normalizedBaseText = normalizeCompletionCacheKey(
		options.baseText,
		options.outputMode,
	);
	const normalizedProviderText = normalizeCompletionCacheKey(
		options.providerOutputText,
		options.outputMode,
	);

	if (!normalizedBaseText || !normalizedProviderText) {
		return "";
	}

	if (
		normalizedProviderText.length <= normalizedBaseText.length ||
		!normalizedProviderText.startsWith(normalizedBaseText)
	) {
		return "";
	}

	const suffix = normalizedProviderText.slice(normalizedBaseText.length);
	if (!suffix || suffix.length > INLINE_COMPLETION_MAX_SUFFIX_CHARS) {
		return "";
	}

	return suffix;
};

const normalizeGlossaryLookup = (value: string): string =>
	value
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[’']/g, "")
		.replace(/[-_]/g, " ")
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.replace(/\s+/g, " ")
		.trim();

const escapeRegexToken = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const FRENCH_ARABIZI_PHRASE_LOOKUP = new Map<string, string>();
const FRENCH_ARABIZI_TOKEN_LOOKUP = new Map<string, string>();

for (const entry of FRENCH_ARABIZI_GLOSSARY) {
	for (const variant of entry.variants) {
		const normalizedVariant = normalizeGlossaryLookup(variant);
		if (!normalizedVariant) {
			continue;
		}

		FRENCH_ARABIZI_PHRASE_LOOKUP.set(normalizedVariant, entry.arabic);
		if (!normalizedVariant.includes(" ")) {
			FRENCH_ARABIZI_TOKEN_LOOKUP.set(normalizedVariant, entry.arabic);
		}
	}
}

const FRENCH_ARABIZI_PHRASE_REPLACEMENTS = Array.from(
	FRENCH_ARABIZI_PHRASE_LOOKUP.entries(),
)
	.filter(([variant]) => variant.includes(" "))
	.sort((left, right) => right[0].length - left[0].length)
	.map(([variant, replacement]) => ({
		replacement,
		regex: new RegExp(
			`(?<![\\p{L}\\p{N}])${variant
				.split(" ")
				.map(escapeRegexToken)
				.join("[\\s'’_-]+")}(?![\\p{L}\\p{N}])`,
			"giu",
		),
	}));

const applyFrancophoneGlossary = (value: string): string => {
	const normalizedFullValue = normalizeGlossaryLookup(value);
	if (!normalizedFullValue) {
		return value;
	}

	const directPhraseMatch =
		FRENCH_ARABIZI_PHRASE_LOOKUP.get(normalizedFullValue);
	if (directPhraseMatch) {
		return directPhraseMatch;
	}

	const phraseAdjustedValue = FRENCH_ARABIZI_PHRASE_REPLACEMENTS.reduce(
		(currentValue, { regex, replacement }) =>
			currentValue.replace(regex, replacement),
		value,
	);

	const chunks = phraseAdjustedValue.split(/(\s+)/);
	return chunks
		.map((chunk) => {
			if (!chunk.trim()) {
				return chunk;
			}

			const prefixMatch = chunk.match(/^[^\p{L}\p{N}]*/u);
			const suffixMatch = chunk.match(/[^\p{L}\p{N}]*$/u);
			const prefix = prefixMatch?.[0] ?? "";
			const suffix = suffixMatch?.[0] ?? "";
			const token = chunk.slice(prefix.length, chunk.length - suffix.length);
			const normalizedToken = normalizeGlossaryLookup(token);

			if (!normalizedToken) {
				return chunk;
			}

			const glossaryMatch = FRENCH_ARABIZI_TOKEN_LOOKUP.get(normalizedToken);
			if (!glossaryMatch) {
				return chunk;
			}

			return `${prefix}${glossaryMatch}${suffix}`;
		})
		.join("");
};

const transliteratePhoneticFallback = (value: string): string => {
	const glossaryAdjustedValue = applyFrancophoneGlossary(value);
	let cursor = 0;
	let result = "";

	while (cursor < glossaryAdjustedValue.length) {
		const remaining = glossaryAdjustedValue.slice(cursor);
		const matchedToken = SIMPLIFIED_TRANSLITERATION_TOKENS.find((token) =>
			remaining.startsWith(token),
		);

		if (matchedToken) {
			result +=
				SIMPLIFIED_MULTI_CHAR_TRANSLITERATIONS[matchedToken] ??
				SIMPLIFIED_SINGLE_CHAR_TRANSLITERATIONS[matchedToken] ??
				matchedToken;
			cursor += matchedToken.length;
			continue;
		}

		result += remaining[0];
		cursor += 1;
	}

	return result;
};

const buildPhoneticToArabicGatewayContext = (
	originalPhoneticText: string,
	localArabicAttempt: string,
): string => {
	return [
		"Texte phonetique original:",
		originalPhoneticText,
		"Tentative arabe locale a corriger:",
		localArabicAttempt,
		"Consigne: produire la meilleure version finale en alphabet arabe. Utiliser la tentative locale comme brouillon a corriger, sans traduire vers une autre langue.",
	].join("\n\n");
};

const convertPhoneticToArabicText = async (
	phoneticValue: string,
): Promise<PhoneticToArabicConversionResult> => {
	const trimmedValue = phoneticValue.trim();
	if (!trimmedValue) {
		return { ok: true, outputText: phoneticValue };
	}

	const localArabicAttempt = transliteratePhoneticFallback(phoneticValue);

	try {
		const result = await requestArabicKeyboardAction({
			action: "arabizi",
			text: phoneticValue,
			context: buildPhoneticToArabicGatewayContext(
				phoneticValue,
				localArabicAttempt,
			),
		});

		if (!result.ok) {
			return {
				ok: false,
				errorCode: result.error.code,
				errorMessage:
					result.error.message || PHONETIC_TO_ARABIC_GATEWAY_ERROR_MESSAGE,
			};
		}

		if (
			result.data.outputText.trim() &&
			containsArabicScript(result.data.outputText)
		) {
			return { ok: true, outputText: result.data.outputText };
		}
	} catch {
		return {
			ok: false,
			errorCode: AUTHENTICATED_DAILY_LIMIT_ERROR_CODE,
			errorMessage: PHONETIC_TO_ARABIC_GATEWAY_ERROR_MESSAGE,
		};
	}

	return {
		ok: false,
		errorMessage: PHONETIC_TO_ARABIC_GATEWAY_ERROR_MESSAGE,
	};
};

const KeyboardProvider = ({
	children,
	enableSound = false,
	mode,
	containerRef,
	defaultOutputMode,
	controlledOutputMode,
	onOutputModeChange,
}: {
	children: React.ReactNode;
	enableSound?: boolean;
	mode: KeyboardMode;
	containerRef: React.RefObject<HTMLDivElement | null>;
	defaultOutputMode: KeyboardOutputMode;
	controlledOutputMode?: KeyboardOutputMode;
	onOutputModeChange?: (mode: KeyboardOutputMode) => void;
}) => {
	const audioContextRef = useRef<AudioContext | null>(null);
	const audioBufferRef = useRef<AudioBuffer | null>(null);
	const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
	const [typedPreview, setTypedPreview] = useState("");
	const [isPreviewInputLocked, setPreviewInputLocked] = useState(false);
	const [internalOutputMode, setInternalOutputMode] =
		useState<KeyboardOutputMode>(defaultOutputMode);
	const [simplifiedPendingPrefix, setSimplifiedPendingPrefix] = useState<
		string | null
	>(null);
	const [simplifiedReplaceableToken, setSimplifiedReplaceableToken] = useState<
		string | null
	>(null);
	const [soundLoaded, setSoundLoaded] = useState(false);
	const [isVisible, setIsVisible] = useState(false);
	const inlineCompletionInterceptorRef = useRef<
		((event: KeyboardEvent) => boolean) | null
	>(null);
	const previewHistoryRef = useRef<string[]>([]);

	const pushPreviewHistory = useCallback((previousValue: string) => {
		previewHistoryRef.current = [
			...previewHistoryRef.current,
			previousValue,
		].slice(-PREVIEW_HISTORY_LIMIT);
	}, []);

	const clearPreviewText = useCallback(() => {
		setTypedPreview((previousValue) => {
			if (!previousValue) {
				return previousValue;
			}

			pushPreviewHistory(previousValue);
			return "";
		});
		setSimplifiedPendingPrefix(null);
		setSimplifiedReplaceableToken(null);
	}, [pushPreviewHistory]);

	const replacePreviewText = useCallback(
		(nextValue: string) => {
			setTypedPreview((previousValue) => {
				const trimmedNextValue = nextValue.slice(-140);
				if (trimmedNextValue === previousValue) {
					return previousValue;
				}

				pushPreviewHistory(previousValue);
				return trimmedNextValue;
			});
			setSimplifiedPendingPrefix(null);
			setSimplifiedReplaceableToken(null);
		},
		[pushPreviewHistory],
	);

	const undoPreviewText = useCallback(() => {
		setTypedPreview((previousValue) => {
			const history = previewHistoryRef.current;
			const nextValue = history.at(-1);
			if (nextValue === undefined) {
				return previousValue;
			}

			previewHistoryRef.current = history.slice(0, -1);
			return nextValue;
		});
		setSimplifiedPendingPrefix(null);
		setSimplifiedReplaceableToken(null);
	}, []);

	const setInlineCompletionInterceptor = useCallback(
		(handler: ((event: KeyboardEvent) => boolean) | null) => {
			inlineCompletionInterceptorRef.current = handler;
		},
		[],
	);

	useEffect(() => {
		setInternalOutputMode(defaultOutputMode);
	}, [defaultOutputMode]);

	const outputMode = controlledOutputMode ?? internalOutputMode;

	const setOutputMode = useCallback(
		(nextMode: KeyboardOutputMode) => {
			if (controlledOutputMode === undefined) {
				setInternalOutputMode(nextMode);
			}

			onOutputModeChange?.(nextMode);
		},
		[controlledOutputMode, onOutputModeChange],
	);

	const appendPreviewText = useCallback(
		(keyCode: string, options?: KeyPressOptions) => {
			if (keyCode === "Escape") {
				setTypedPreview((previousValue) => {
					if (!previousValue) {
						return previousValue;
					}

					pushPreviewHistory(previousValue);
					return "";
				});
				setSimplifiedPendingPrefix(null);
				setSimplifiedReplaceableToken(null);
				return;
			}

			if (keyCode === "Backspace") {
				setTypedPreview((previousValue) => {
					const nextValue = previousValue.slice(0, -1);
					if (nextValue === previousValue) {
						return previousValue;
					}

					pushPreviewHistory(previousValue);
					return nextValue;
				});
				setSimplifiedPendingPrefix(null);
				setSimplifiedReplaceableToken(null);
				return;
			}

			const nextValue =
				options?.inputValue ??
				(options?.suppressDefaultInput
					? undefined
					: getDefaultInputValueForKeyCode(keyCode, outputMode));

			if (options?.replaceLastInput && nextValue) {
				setTypedPreview((previousValue) => {
					const computedValue =
						`${previousValue.slice(0, -1)}${nextValue}`.slice(-140);
					if (computedValue === previousValue) {
						return previousValue;
					}

					pushPreviewHistory(previousValue);
					return computedValue;
				});
				setSimplifiedPendingPrefix(options.setPendingPrefix ?? null);
				setSimplifiedReplaceableToken(options.setReplaceableToken ?? null);
				return;
			}

			if (!nextValue) {
				if (options?.resetSimplifiedSequence) {
					setSimplifiedPendingPrefix(options.setPendingPrefix ?? null);
					setSimplifiedReplaceableToken(options.setReplaceableToken ?? null);
				}
				return;
			}

			setTypedPreview((previousValue) => {
				const computedValue = `${previousValue}${nextValue}`.slice(-140);
				if (computedValue === previousValue) {
					return previousValue;
				}

				pushPreviewHistory(previousValue);
				return computedValue;
			});
			setSimplifiedPendingPrefix(options?.setPendingPrefix ?? null);
			setSimplifiedReplaceableToken(options?.setReplaceableToken ?? null);
		},
		[outputMode, pushPreviewHistory],
	);

	useEffect(() => {
		if (!enableSound) return;

		const initAudio = async () => {
			try {
				audioContextRef.current = new AudioContext();
				const response = await fetch("/sounds/sound.ogg");
				if (!response.ok) {
					console.warn("Sound file not available");
					return;
				}
				const arrayBuffer = await response.arrayBuffer();
				audioBufferRef.current =
					await audioContextRef.current.decodeAudioData(arrayBuffer);
				setSoundLoaded(true);
			} catch (error) {
				console.warn("Failed to load sound:", error);
			}
		};

		initAudio();

		return () => {
			audioContextRef.current?.close();
		};
	}, [enableSound]);

	const playSoundDown = useCallback(
		(keyCode: string) => {
			if (!enableSound || !soundLoaded) return;
			if (!audioContextRef.current || !audioBufferRef.current) return;

			const soundDef = SOUND_DEFINES_DOWN[keyCode];
			if (!soundDef) return;

			const [startMs, durationMs] = soundDef;
			const startTime = startMs / 1000;
			const duration = durationMs / 1000;

			if (audioContextRef.current.state === "suspended") {
				audioContextRef.current.resume();
			}

			const source = audioContextRef.current.createBufferSource();
			source.buffer = audioBufferRef.current;
			source.connect(audioContextRef.current.destination);
			source.start(0, startTime, duration);
		},
		[enableSound, soundLoaded],
	);

	const playSoundUp = useCallback(
		(keyCode: string) => {
			if (!enableSound || !soundLoaded) return;
			if (!audioContextRef.current || !audioBufferRef.current) return;

			const soundDef = SOUND_DEFINES_UP[keyCode];
			if (!soundDef) return;

			const [startMs, durationMs] = soundDef;
			const startTime = startMs / 1000;
			const duration = durationMs / 1000;

			if (audioContextRef.current.state === "suspended") {
				audioContextRef.current.resume();
			}

			const source = audioContextRef.current.createBufferSource();
			source.buffer = audioBufferRef.current;
			source.connect(audioContextRef.current.destination);
			source.start(0, startTime, duration);
		},
		[enableSound, soundLoaded],
	);

	const setPressed = useCallback(
		(keyCode: string, options?: KeyPressOptions) => {
			if (isPreviewInputLocked) {
				return;
			}

			setPressedKeys((prev) => new Set(prev).add(keyCode));
			appendPreviewText(keyCode, options);
		},
		[appendPreviewText, isPreviewInputLocked],
	);

	const setReleased = useCallback((keyCode: string) => {
		setPressedKeys((prev) => {
			const next = new Set(prev);
			next.delete(keyCode);
			return next;
		});
	}, []);

	useEffect(() => {
		const element = containerRef.current;
		if (!element) return;

		const observer = new IntersectionObserver(
			([entry]) => {
				setIsVisible(entry.isIntersecting);
			},
			{ threshold: 0.1 },
		);

		observer.observe(element);

		return () => {
			observer.disconnect();
		};
	}, [containerRef]);

	useEffect(() => {
		if (!isVisible) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (isPreviewInputLocked) {
				return;
			}

			const keyCode = e.code;
			if (inlineCompletionInterceptorRef.current?.(e)) {
				return;
			}
			if ((e.ctrlKey || e.metaKey) && !e.shiftKey && keyCode === "KeyZ") {
				e.preventDefault();
				undoPreviewText();
				return;
			}
			if (e.repeat && keyCode !== "Backspace") return;

			const keyPressOptions =
				outputMode === "phonetic"
					? getNormalKeyPressOptions(e, "phonetic")
					: mode === "simplified"
						? getSimplifiedKeyPressOptions({
								event: e,
								pendingPrefix: simplifiedPendingPrefix,
								replaceableToken: simplifiedReplaceableToken,
								outputMode,
							})
						: getNormalKeyPressOptions(e, outputMode);
			if (!e.repeat) {
				playSoundDown(keyCode);
			}
			setPressed(keyCode, keyPressOptions ?? undefined);
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			const keyCode = e.code;
			playSoundUp(keyCode);
			setReleased(keyCode);
		};

		document.addEventListener("keydown", handleKeyDown);
		document.addEventListener("keyup", handleKeyUp);

		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			document.removeEventListener("keyup", handleKeyUp);
		};
	}, [
		isVisible,
		isPreviewInputLocked,
		mode,
		outputMode,
		playSoundDown,
		playSoundUp,
		setPressed,
		setReleased,
		simplifiedPendingPrefix,
		simplifiedReplaceableToken,
		undoPreviewText,
	]);

	return (
		<KeyboardContext.Provider
			value={{
				playSoundDown,
				playSoundUp,
				pressedKeys,
				setPressed,
				setReleased,
				isPreviewInputLocked,
				setPreviewInputLocked,
				setInlineCompletionInterceptor,
				undoPreviewText,
				typedPreview,
				clearPreviewText,
				replacePreviewText,
				outputMode,
				setOutputMode,
			}}
		>
			{children}
		</KeyboardContext.Provider>
	);
};

const PreviewIconAction = ({
	title,
	dataTestId,
	onClick,
	disabled,
	children,
}: {
	title: string;
	dataTestId: string;
	onClick: () => void;
	disabled?: boolean;
	children: React.ReactNode;
}) => (
	<Tooltip>
		<TooltipTrigger asChild>
			<button
				type="button"
				onClick={onClick}
				data-testid={dataTestId}
				className={PREVIEW_ICON_BUTTON_CLASS}
				title={title}
				disabled={disabled}
			>
				{children}
			</button>
		</TooltipTrigger>
		<TooltipContent side="bottom" sideOffset={8} className="text-center">
			{title}
		</TooltipContent>
	</Tooltip>
);

const KeystrokePreview = ({
	compactSpacing = false,
}: {
	compactSpacing?: boolean;
}) => {
	const {
		typedPreview,
		outputMode,
		clearPreviewText,
		replacePreviewText,
		setInlineCompletionInterceptor,
		isPreviewInputLocked,
		setPreviewInputLocked,
		undoPreviewText,
	} = useKeyboardSound();
	const { user, loading: authLoading } = useAuth();
	const [isCopied, setIsCopied] = useState(false);
	const [isTranslating, setIsTranslating] = useState(false);
	const [isCaretVisible, setIsCaretVisible] = useState(true);
	const [isPreviewActive, setIsPreviewActive] = useState(false);
	const [remoteCompletionSuffix, setRemoteCompletionSuffix] = useState("");
	const completionRequestIdRef = useRef(0);
	const completionCacheRef = useRef<Map<string, string>>(new Map());
	const previewTextMeasureRef = useRef<HTMLDivElement | null>(null);
	const [previewContentWidth, setPreviewContentWidth] = useState(
		PREVIEW_DEFAULT_WIDTH_PX,
	);
	const [convertQuotaStatus, setConvertQuotaStatus] =
		useState<ArabicKeyboardConvertQuotaStatus>(() =>
			getArabicKeyboardConvertQuotaStatus(null),
		);
	const quotaUserId = authLoading ? null : (user?.id ?? null);

	useEffect(() => {
		if (authLoading) {
			return;
		}

		setConvertQuotaStatus(
			getArabicKeyboardConvertQuotaStatus(user?.id ?? null),
		);
	}, [authLoading, user?.id]);

	useLayoutEffect(() => {
		const element = previewTextMeasureRef.current;
		if (!element) {
			return;
		}

		const updateWidth = (nextWidth: number) => {
			const safeWidth =
				nextWidth > 0 ? Math.round(nextWidth) : PREVIEW_DEFAULT_WIDTH_PX;
			setPreviewContentWidth((previousWidth) =>
				previousWidth === safeWidth ? previousWidth : safeWidth,
			);
		};

		updateWidth(element.getBoundingClientRect().width);

		if (typeof ResizeObserver === "undefined") {
			return;
		}

		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) {
				return;
			}

			updateWidth(entry.contentRect.width);
		});

		observer.observe(element);

		return () => {
			observer.disconnect();
		};
	}, []);

	const hasTypedText = typedPreview.length > 0;
	const glossaryCompletionSuffix = useMemo(
		() =>
			hasTypedText
				? getGlossaryInlineCompletionSuffix(typedPreview, outputMode)
				: "",
		[hasTypedText, outputMode, typedPreview],
	);
	const inlineCompletionSuffix =
		glossaryCompletionSuffix || remoteCompletionSuffix;
	const isTranslateQuotaReached = !authLoading && convertQuotaStatus.reached;
	const translateQuotaMessage =
		getArabicConvertLimitMessage(convertQuotaStatus);

	const acceptInlineCompletion = useCallback(() => {
		if (
			isPreviewInputLocked ||
			!isPreviewActive ||
			!hasTypedText ||
			!inlineCompletionSuffix
		) {
			return;
		}

		replacePreviewText(`${typedPreview}${inlineCompletionSuffix}`);
		setRemoteCompletionSuffix("");
	}, [
		hasTypedText,
		inlineCompletionSuffix,
		isPreviewInputLocked,
		isPreviewActive,
		replacePreviewText,
		typedPreview,
	]);

	const handlePreviewUndoCapture = useCallback(
		(event: React.KeyboardEvent<HTMLButtonElement>) => {
			if (
				(event.ctrlKey || event.metaKey) &&
				!event.shiftKey &&
				event.code === "KeyZ"
			) {
				event.preventDefault();
				undoPreviewText();
			}
		},
		[undoPreviewText],
	);

	useEffect(() => {
		const intervalId = window.setInterval(() => {
			setIsCaretVisible((previousValue) => !previousValue);
		}, CARET_BLINK_INTERVAL_MS);

		return () => window.clearInterval(intervalId);
	}, []);

	useEffect(() => {
		if (!isCopied) return;

		const timeoutId = window.setTimeout(() => {
			setIsCopied(false);
		}, 2000);

		return () => window.clearTimeout(timeoutId);
	}, [isCopied]);

	useEffect(() => {
		if (!isPreviewActive || !hasTypedText) {
			setRemoteCompletionSuffix("");
			return;
		}

		if (glossaryCompletionSuffix) {
			setRemoteCompletionSuffix("");
			return;
		}

		if (/\s$/.test(typedPreview)) {
			setRemoteCompletionSuffix("");
			return;
		}

		const normalizedCompletionKey = normalizeCompletionCacheKey(
			typedPreview,
			outputMode,
		);
		const minimumChars = INLINE_COMPLETION_MIN_CHARS;
		if (normalizedCompletionKey.length < minimumChars) {
			setRemoteCompletionSuffix("");
			return;
		}

		const cacheKey = `${outputMode}:${normalizedCompletionKey}`;
		const cachedSuffix = completionCacheRef.current.get(cacheKey);
		if (cachedSuffix !== undefined) {
			setRemoteCompletionSuffix(cachedSuffix);
			return;
		}

		const requestId = completionRequestIdRef.current + 1;
		completionRequestIdRef.current = requestId;

		const timeoutId = window.setTimeout(async () => {
			try {
				const result = await requestArabicKeyboardAction({
					action: "complete",
					text: typedPreview,
					context: `inline_completion_mode:${outputMode}`,
				});

				if (requestId !== completionRequestIdRef.current) {
					return;
				}

				if (!result.ok) {
					completionCacheRef.current.set(cacheKey, "");
					setRemoteCompletionSuffix("");
					return;
				}

				const providerSuffix = extractInlineCompletionSuffixFromProvider({
					baseText: typedPreview,
					outputMode,
					providerOutputText: result.data.outputText,
				});

				completionCacheRef.current.set(cacheKey, providerSuffix);
				setRemoteCompletionSuffix(providerSuffix);
			} catch {
				if (requestId !== completionRequestIdRef.current) {
					return;
				}

				completionCacheRef.current.set(cacheKey, "");
				setRemoteCompletionSuffix("");
			}
		}, INLINE_COMPLETION_DEBOUNCE_MS);

		return () => window.clearTimeout(timeoutId);
	}, [
		hasTypedText,
		glossaryCompletionSuffix,
		isPreviewActive,
		outputMode,
		typedPreview,
	]);

	useEffect(() => {
		if (
			isPreviewInputLocked ||
			!isPreviewActive ||
			!hasTypedText ||
			!inlineCompletionSuffix
		) {
			setInlineCompletionInterceptor(null);
			return;
		}

		const handleInlineCompletionAccept = (event: KeyboardEvent) => {
			if (
				event.key !== "Tab" &&
				event.key !== "ArrowRight" &&
				event.key !== "Enter"
			) {
				return false;
			}

			event.preventDefault();
			acceptInlineCompletion();
			return true;
		};

		setInlineCompletionInterceptor(handleInlineCompletionAccept);

		return () => {
			setInlineCompletionInterceptor(null);
		};
	}, [
		acceptInlineCompletion,
		hasTypedText,
		inlineCompletionSuffix,
		isPreviewInputLocked,
		isPreviewActive,
		setInlineCompletionInterceptor,
	]);

	const handleCopy = async () => {
		if (!typedPreview) return;

		try {
			await navigator.clipboard.writeText(typedPreview);
			setIsCopied(true);
		} catch {
			setIsCopied(false);
		}
	};

	const handleTranslate = async () => {
		if (!typedPreview || outputMode !== "phonetic") {
			return;
		}

		if (isTranslateQuotaReached) {
			toast.error(translateQuotaMessage);
			return;
		}

		setIsTranslating(true);
		setPreviewInputLocked(true);
		try {
			const translatedResult = await convertPhoneticToArabicText(typedPreview);
			if (!translatedResult.ok) {
				if (
					translatedResult.errorCode === AUTHENTICATED_DAILY_LIMIT_ERROR_CODE &&
					!authLoading
				) {
					setConvertQuotaStatus(
						markArabicKeyboardConvertQuotaReached(user?.id ?? null),
					);
				}

				toast.error(translatedResult.errorMessage);
				return;
			}

			replacePreviewText(translatedResult.outputText);
			setRemoteCompletionSuffix("");

			if (!authLoading) {
				const nextQuotaStatus = recordArabicKeyboardConvertUsage(quotaUserId);
				setConvertQuotaStatus(nextQuotaStatus);
				if (nextQuotaStatus.reached) {
					toast.error(getArabicConvertLimitMessage(nextQuotaStatus));
				}
			}
		} finally {
			setPreviewInputLocked(false);
			setIsTranslating(false);
		}
	};

	const handleClear = () => {
		clearPreviewText();
		setRemoteCompletionSuffix("");
	};

	const previewText = hasTypedText
		? typedPreview
		: outputMode === "phonetic"
			? PHONETIC_SUGGESTION_TEXT
			: ARABIC_SUGGESTION_TEXT;
	const previewDirection = hasTypedText
		? containsArabicScript(typedPreview)
			? "rtl"
			: "ltr"
		: outputMode === "arabic"
			? "rtl"
			: "ltr";
	const previewLayoutText = hasTypedText
		? `${typedPreview}${inlineCompletionSuffix}`
		: previewText;
	const previewMeasurement = useMemo(() => {
		try {
			return measureClavierArabeTextareaAutoGrow({
				text: previewLayoutText || " ",
				font: PREVIEW_FONT,
				contentWidth: previewContentWidth,
				lineHeight: PREVIEW_LINE_HEIGHT_PX,
				minRows: PREVIEW_MIN_ROWS,
				whiteSpace: "pre-wrap",
			});
		} catch {
			return null;
		}
	}, [previewContentWidth, previewLayoutText]);
	const previewHeightPx =
		previewMeasurement?.height ?? PREVIEW_LINE_HEIGHT_PX * PREVIEW_MIN_ROWS;
	const previewCaretStyle = useMemo<React.CSSProperties>(() => {
		const baseStyle = {
			height: `${PREVIEW_LINE_HEIGHT_PX}px`,
		};

		if (!isPreviewActive) {
			return baseStyle;
		}

		if (!hasTypedText) {
			return {
				...baseStyle,
				insetInlineStart: 0,
				top: 0,
			};
		}

		try {
			const anchor = measureClavierArabeCaretAnchor({
				text: typedPreview,
				caretIndex: typedPreview.length,
				font: PREVIEW_FONT,
				contentWidth: previewContentWidth,
				lineHeight: PREVIEW_LINE_HEIGHT_PX,
				direction: previewDirection,
				whiteSpace: "pre-wrap",
			});
			return {
				...baseStyle,
				left: `${Math.max(0, Math.min(anchor.left, previewContentWidth))}px`,
				top: `${anchor.top}px`,
			};
		} catch {
			return {
				...baseStyle,
				insetInlineStart: 0,
				top: 0,
			};
		}
	}, [
		hasTypedText,
		isPreviewActive,
		previewContentWidth,
		previewDirection,
		typedPreview,
	]);
	const previewInlineAcceptStyle = useMemo<React.CSSProperties | null>(() => {
		if (
			isPreviewInputLocked ||
			!isPreviewActive ||
			!hasTypedText ||
			!inlineCompletionSuffix
		) {
			return null;
		}

		try {
			const anchor = measureClavierArabeCaretAnchor({
				text: `${typedPreview}${inlineCompletionSuffix}`,
				caretIndex: `${typedPreview}${inlineCompletionSuffix}`.length,
				font: PREVIEW_FONT,
				contentWidth: previewContentWidth,
				lineHeight: PREVIEW_LINE_HEIGHT_PX,
				direction: previewDirection,
				whiteSpace: "pre-wrap",
			});

			return {
				left: `${Math.max(0, Math.min(anchor.left + 6, previewContentWidth - 20))}px`,
				top: `${Math.max(anchor.top + 5, 0)}px`,
			};
		} catch {
			return null;
		}
	}, [
		hasTypedText,
		inlineCompletionSuffix,
		isPreviewInputLocked,
		isPreviewActive,
		previewContentWidth,
		previewDirection,
		typedPreview,
	]);
	const shouldShowPreviewCaret = isPreviewActive && !isPreviewInputLocked;
	const previewStatusMessage = isTranslateQuotaReached
		? translateQuotaMessage
		: null;
	const InlineAcceptIcon =
		outputMode === "arabic" ? IconArrowLeft : IconArrowRight;

	return (
		<div
			className={cn(
				"relative flex w-full flex-col items-center justify-center",
				compactSpacing ? "gap-0 pt-0 pb-1" : "gap-1 py-1",
			)}
		>
			<div
				ref={previewTextMeasureRef}
				className="relative w-[28rem] max-w-full"
			>
				<button
					type="button"
					data-testid="keyboard-preview-text"
					aria-label="Zone de saisie clavier arabe"
					aria-busy={isPreviewInputLocked}
					disabled={isPreviewInputLocked}
					tabIndex={isPreviewInputLocked ? -1 : 0}
					onFocus={() => setIsPreviewActive(true)}
					onBlur={() => setIsPreviewActive(false)}
					onKeyDownCapture={handlePreviewUndoCapture}
					dir={previewDirection}
					className={cn(
						"w-full border-none bg-transparent p-0 text-start font-mono text-2xl font-black leading-8 focus-visible:outline-none",
						hasTypedText ? "text-stone-100" : "text-stone-200/35",
						isPreviewInputLocked &&
							(hasTypedText ? "text-stone-100/35" : "text-stone-200/20"),
					)}
				>
					<span
						data-testid="keyboard-preview-content"
						className="relative block whitespace-pre-wrap break-words"
						style={{
							minHeight: `${PREVIEW_LINE_HEIGHT_PX * PREVIEW_MIN_ROWS}px`,
							height: `${previewHeightPx}px`,
						}}
					>
						{hasTypedText ? (
							<>
								<span>{typedPreview}</span>
								{inlineCompletionSuffix ? (
									<span
										data-testid="keyboard-inline-suggestion"
										className="text-stone-300/45"
									>
										{inlineCompletionSuffix}
									</span>
								) : null}
							</>
						) : (
							<span data-testid="keyboard-placeholder-text">{previewText}</span>
						)}
						{shouldShowPreviewCaret ? (
							<span
								data-testid="keyboard-caret"
								aria-hidden="true"
								className={cn(
									"pointer-events-none absolute w-px transition-opacity",
									hasTypedText ? "bg-stone-100" : "bg-stone-300/70",
									isCaretVisible ? "opacity-100" : "opacity-0",
								)}
								style={previewCaretStyle}
							/>
						) : null}
					</span>
					<span
						data-testid="keyboard-preview-raw-value"
						aria-hidden="true"
						hidden
					>
						{typedPreview}
					</span>
				</button>
				{isPreviewInputLocked ? (
					<div
						data-testid="keyboard-preview-loading-overlay"
						className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[10px] bg-stone-950/45 backdrop-blur-[1px]"
					>
						<div className="flex items-center gap-2 rounded-full border border-stone-200/10 bg-stone-900/70 px-3 py-1.5 text-[11px] font-medium text-stone-100/90 shadow-sm">
							<span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-stone-400/35 border-t-stone-100" />
							<span>Conversion...</span>
						</div>
					</div>
				) : null}
				{previewInlineAcceptStyle ? (
					<button
						type="button"
						data-testid="keyboard-inline-accept"
						aria-label="Valider l'autocomplétion"
						title="Valider l'autocomplétion"
						onMouseDown={(event) => {
							event.preventDefault();
							acceptInlineCompletion();
						}}
						className="absolute inline-flex h-5 w-5 items-center justify-center rounded-full text-stone-300/60 transition-colors hover:text-stone-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-200"
						style={previewInlineAcceptStyle}
					>
						<InlineAcceptIcon className="h-3.5 w-3.5" />
					</button>
				) : null}
			</div>
			<div
				className={cn(
					"flex items-center gap-2",
					compactSpacing ? "mt-0" : "mt-1 h-5",
				)}
			>
				<PreviewIconAction
					title="Copier le texte"
					dataTestId="keyboard-copy-action"
					onClick={handleCopy}
					disabled={!hasTypedText || isPreviewInputLocked}
				>
					<IconCopy className="h-3.5 w-3.5" />
					<span className="sr-only">Copier le texte</span>
				</PreviewIconAction>
				<PreviewIconAction
					title="Supprimer le texte"
					dataTestId="keyboard-clear-action"
					onClick={handleClear}
					disabled={!hasTypedText || isPreviewInputLocked}
				>
					<IconEraser className="h-3.5 w-3.5" />
					<span className="sr-only">Supprimer le texte</span>
				</PreviewIconAction>
				<PreviewIconAction
					title="Convertir phonétique → arabe"
					dataTestId="keyboard-translate-action"
					onClick={handleTranslate}
					disabled={
						!hasTypedText ||
						outputMode !== "phonetic" ||
						isTranslateQuotaReached ||
						isPreviewInputLocked ||
						isTranslating
					}
				>
					<IconLanguage className="h-3.5 w-3.5" />
					<span className="sr-only">Convertir phonétique → arabe</span>
				</PreviewIconAction>
			</div>
			{compactSpacing ? (
				previewStatusMessage ? (
					<p
						data-testid="keyboard-copy-feedback"
						className="text-[10px] leading-none text-stone-300"
					>
						{previewStatusMessage}
					</p>
				) : isCopied ? (
					<p
						data-testid="keyboard-copy-feedback"
						className="text-[10px] leading-none text-stone-300"
					>
						Copié avec succès
					</p>
				) : null
			) : (
				<p
					data-testid="keyboard-copy-feedback"
					className="h-4 text-[11px] text-stone-300"
				>
					{previewStatusMessage ?? (isCopied ? "Copié avec succès" : "")}
				</p>
			)}
		</div>
	);
};

export const Keyboard = ({
	className,
	enableSound = false,
	mode = "normal",
	showPreview = false,
	compactSpacing = false,
	defaultOutputMode = "arabic",
	outputMode,
	onOutputModeChange,
}: {
	className?: string;
	enableSound?: boolean;
	mode?: KeyboardMode;
	showPreview?: boolean;
	compactSpacing?: boolean;
	defaultOutputMode?: KeyboardOutputMode;
	outputMode?: KeyboardOutputMode;
	onOutputModeChange?: (mode: KeyboardOutputMode) => void;
}) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const keyboardBaseRef = useRef<HTMLDivElement>(null);
	const [containerWidth, setContainerWidth] = useState(0);
	const [keyboardBaseWidth, setKeyboardBaseWidth] = useState(0);

	useLayoutEffect(() => {
		const containerElement = containerRef.current;
		const keyboardBaseElement = keyboardBaseRef.current;
		if (!containerElement || !keyboardBaseElement) {
			return;
		}

		const updateContainerWidth = (nextWidth: number) => {
			const safeWidth = nextWidth > 0 ? Math.round(nextWidth) : 0;
			setContainerWidth((previousWidth) =>
				previousWidth === safeWidth ? previousWidth : safeWidth,
			);
		};

		const updateKeyboardBaseWidth = () => {
			const nextWidth = Math.round(keyboardBaseElement.scrollWidth);
			setKeyboardBaseWidth((previousWidth) =>
				previousWidth === nextWidth ? previousWidth : nextWidth,
			);
		};

		updateContainerWidth(containerElement.getBoundingClientRect().width);
		updateKeyboardBaseWidth();

		if (typeof ResizeObserver === "undefined") {
			return;
		}

		const containerObserver = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) {
				return;
			}

			updateContainerWidth(entry.contentRect.width);
		});

		const keyboardBaseObserver = new ResizeObserver(() => {
			updateKeyboardBaseWidth();
		});

		containerObserver.observe(containerElement);
		keyboardBaseObserver.observe(keyboardBaseElement);

		return () => {
			containerObserver.disconnect();
			keyboardBaseObserver.disconnect();
		};
	}, []);

	const keyboardScale = useMemo(() => {
		if (containerWidth <= 0 || keyboardBaseWidth <= 0) {
			return 1;
		}

		const availableWidth = Math.max(
			containerWidth - KEYBOARD_SCALE_GUTTER_PX,
			0,
		);
		if (availableWidth <= 0) {
			return 1;
		}

		return Math.min(KEYBOARD_MAX_SCALE, availableWidth / keyboardBaseWidth);
	}, [containerWidth, keyboardBaseWidth]);

	return (
		<KeyboardProvider
			enableSound={enableSound}
			mode={mode}
			containerRef={containerRef}
			defaultOutputMode={defaultOutputMode}
			controlledOutputMode={outputMode}
			onOutputModeChange={onOutputModeChange}
		>
			<div
				ref={containerRef}
				className={cn("mx-auto w-full max-w-full", className)}
			>
				<div className="flex w-full justify-center overflow-hidden">
					<div style={{ zoom: keyboardScale }}>
						<div
							ref={keyboardBaseRef}
							className="flex w-fit flex-col items-center"
						>
							{showPreview && (
								<KeystrokePreview compactSpacing={compactSpacing} />
							)}
							<Keypad mode={mode} />
						</div>
					</div>
				</div>
			</div>
		</KeyboardProvider>
	);
};

export const Keypad = ({ mode }: { mode: KeyboardMode }) => {
	if (mode === "simplified") {
		return <SimplifiedKeypad />;
	}

	return <NormalKeypad />;
};

const NormalLetterKey = ({
	keyCode,
	latinLabel,
}: {
	keyCode: string;
	latinLabel: string;
}) => {
	const arabicLabel = NORMAL_ARABIC_KEY_LABELS[keyCode] ?? latinLabel;

	return (
		<Key keyCode={keyCode} pressDisplayLabel={latinLabel}>
			<span className={ARABIC_KEY_LABEL_CLASS}>{arabicLabel}</span>
			<span className={LATIN_KEY_LABEL_CLASS}>{latinLabel}</span>
		</Key>
	);
};

const NormalSymbolKey = ({
	keyCode,
	arabicLabel,
	latinLabel,
	className,
	childrenClassName,
}: {
	keyCode: string;
	arabicLabel: string;
	latinLabel: string;
	className?: string;
	childrenClassName?: string;
}) => (
	<Key
		keyCode={keyCode}
		pressDisplayLabel={latinLabel}
		className={className}
		childrenClassName={childrenClassName}
	>
		<span className={ARABIC_KEY_LABEL_CLASS}>{arabicLabel}</span>
		<span className={LATIN_KEY_LABEL_CLASS}>{latinLabel}</span>
	</Key>
);

const NormalKeypad = () => {
	const diacriticRow = LEGACY_SIMPLIFIED_LAYOUT.diacriticsRow;

	return (
		<div className="h-full w-fit rounded-xl bg-neutral-200 p-1 shadow-sm ring-1 shadow-black/5 ring-black/5">
			<Row>
				{diacriticRow.keys.map((keyDefinition) => (
					<SharedDiacriticKey
						key={keyDefinition.id}
						keyDefinition={keyDefinition}
					/>
				))}
			</Row>
			<Row>
				{NORMAL_TOP_ROW_KEYS.map(({ keyCode, latinLabel }) => (
					<NormalLetterKey
						key={keyCode}
						keyCode={keyCode}
						latinLabel={latinLabel}
					/>
				))}
				<NormalSymbolKey keyCode="BracketLeft" arabicLabel="ج" latinLabel="[" />
				<NormalSymbolKey
					keyCode="BracketRight"
					arabicLabel="د"
					latinLabel="]"
				/>
				<NormalSymbolKey
					keyCode="Backspace"
					arabicLabel="⌫"
					latinLabel="suppr"
					className="w-10"
					childrenClassName="items-end justify-end pr-[4px] pb-[2px]"
				/>
			</Row>
			<Row>
				{NORMAL_HOME_ROW_KEYS.map(({ keyCode, latinLabel }) => (
					<NormalLetterKey
						key={keyCode}
						keyCode={keyCode}
						latinLabel={latinLabel}
					/>
				))}
				<NormalSymbolKey keyCode="Semicolon" arabicLabel="؛" latinLabel=";" />
				<NormalSymbolKey keyCode="Quote" arabicLabel="ط" latinLabel="'" />
				<NormalSymbolKey
					keyCode="Enter"
					arabicLabel="↵"
					latinLabel="entrée"
					className="w-10"
					childrenClassName="items-end justify-end pr-[4px] pb-[2px]"
				/>
			</Row>
			<Row>
				{NORMAL_BOTTOM_ROW_KEYS.map(({ keyCode, latinLabel }) => (
					<NormalLetterKey
						key={keyCode}
						keyCode={keyCode}
						latinLabel={latinLabel}
					/>
				))}
				<NormalSymbolKey keyCode="Comma" arabicLabel="،" latinLabel="," />
				<NormalSymbolKey keyCode="Period" arabicLabel="." latinLabel="." />
				<NormalSymbolKey keyCode="Slash" arabicLabel="؟" latinLabel="/" />
			</Row>
		</div>
	);
};

const getSimplifiedSoundKeyCode = (
	key: ClavierArabeKey,
): string | undefined => {
	if (key.latinKey === ",") {
		return "Comma";
	}

	if (key.latinKey === ";") {
		return "Semicolon";
	}

	if (key.latinKey === "?") {
		return "Slash";
	}

	if (key.latinKey === "-") {
		return "Minus";
	}

	const firstLetter = key.latinKey.match(/[a-z]/i)?.[0];
	return firstLetter ? `Key${firstLetter.toUpperCase()}` : undefined;
};

const SharedDiacriticKey = ({
	keyDefinition,
}: {
	keyDefinition: ClavierArabeKey;
}) => {
	const { outputMode } = useKeyboardSound();

	return (
		<Key
			keyCode={`diacritic-${keyDefinition.id}`}
			soundKeyCode={getSimplifiedSoundKeyCode(keyDefinition)}
			pressInputValue={
				outputMode === "arabic" ? keyDefinition.arabic : keyDefinition.latinKey
			}
			pressDisplayLabel={keyDefinition.latinKey}
			className="w-8"
		>
			<span className={DIACRITIC_KEY_LABEL_CLASS}>
				{`${DIACRITIC_DOTTED_CIRCLE}${keyDefinition.arabic}`}
			</span>
			<span className={LATIN_KEY_LABEL_CLASS}>{keyDefinition.latinKey}</span>
		</Key>
	);
};

const SimplifiedLegacyKey = ({
	keyDefinition,
}: {
	keyDefinition: ClavierArabeKey;
}) => {
	const { outputMode } = useKeyboardSound();

	const widthClassName =
		keyDefinition.width === "extra-wide"
			? "w-20"
			: keyDefinition.width === "wide"
				? "w-10"
				: keyDefinition.category === "diacritic"
					? "w-8"
					: "w-8";

	const isDiacritic = keyDefinition.category === "diacritic";

	return (
		<Key
			keyCode={`simplified-${keyDefinition.id}`}
			soundKeyCode={getSimplifiedSoundKeyCode(keyDefinition)}
			pressInputValue={
				outputMode === "arabic" ? keyDefinition.arabic : keyDefinition.latinKey
			}
			pressDisplayLabel={keyDefinition.latinKey}
			dataTestId={`simplified-key-${keyDefinition.id}`}
			className={widthClassName}
		>
			<span
				className={
					isDiacritic ? DIACRITIC_KEY_LABEL_CLASS : ARABIC_KEY_LABEL_CLASS
				}
			>
				{isDiacritic
					? `${DIACRITIC_DOTTED_CIRCLE}${keyDefinition.arabic}`
					: keyDefinition.arabic}
			</span>
			<span className={LATIN_KEY_LABEL_CLASS}>{keyDefinition.latinKey}</span>
		</Key>
	);
};

const SimplifiedKeypad = () => {
	const simplifiedRows = [
		LEGACY_SIMPLIFIED_LAYOUT.diacriticsRow,
		...LEGACY_SIMPLIFIED_LAYOUT.rows,
	].map((row) => ({
		...row,
		keys: row.keys.filter((key) => key.latinKey !== "space"),
	}));

	return (
		<div className="h-full w-fit rounded-xl bg-neutral-200 p-1 shadow-sm ring-1 shadow-black/5 ring-black/5">
			{simplifiedRows.map((row) => (
				<Row key={row.id} rtl>
					{row.keys.map((keyDefinition) => (
						<SimplifiedLegacyKey
							key={keyDefinition.id}
							keyDefinition={keyDefinition}
						/>
					))}
				</Row>
			))}
		</div>
	);
};

const Row = ({
	children,
	rtl = false,
}: {
	children: React.ReactNode;
	rtl?: boolean;
}) => (
	<div
		className={cn(
			"mb-[2px] flex w-full shrink-0 gap-[2px]",
			rtl && "flex-row-reverse",
		)}
	>
		{children}
	</div>
);

const Key = ({
	className,
	childrenClassName,
	containerClassName,
	children,
	dataTestId,
	keyCode,
	pressDisplayLabel,
	pressInputValue,
	soundKeyCode,
}: {
	className?: string;
	childrenClassName?: string;
	containerClassName?: string;
	children?: React.ReactNode;
	dataTestId?: string;
	keyCode?: string;
	pressDisplayLabel?: string;
	pressInputValue?: string;
	soundKeyCode?: string;
}) => {
	const {
		playSoundDown,
		playSoundUp,
		pressedKeys,
		setPressed,
		setReleased,
		isPreviewInputLocked,
		outputMode,
	} = useKeyboardSound();
	const interactionKey = keyCode ?? soundKeyCode ?? pressDisplayLabel ?? null;
	const resolvedSoundKeyCode = soundKeyCode ?? keyCode ?? undefined;
	const isPressed = interactionKey ? pressedKeys.has(interactionKey) : false;
	const holdRepeatTimeoutRef = useRef<number | null>(null);
	const holdRepeatIntervalRef = useRef<number | null>(null);

	const buildPressOptions = useCallback(
		(): KeyPressOptions => ({
			inputValue:
				pressInputValue ??
				(keyCode
					? getDefaultInputValueForKeyCode(keyCode, outputMode)
					: undefined),
			displayLabel: pressDisplayLabel,
		}),
		[keyCode, outputMode, pressDisplayLabel, pressInputValue],
	);

	const clearHoldRepeat = useCallback(() => {
		if (holdRepeatTimeoutRef.current !== null) {
			window.clearTimeout(holdRepeatTimeoutRef.current);
			holdRepeatTimeoutRef.current = null;
		}

		if (holdRepeatIntervalRef.current !== null) {
			window.clearInterval(holdRepeatIntervalRef.current);
			holdRepeatIntervalRef.current = null;
		}
	}, []);

	const startBackspaceHoldRepeat = useCallback(() => {
		if (interactionKey !== "Backspace") {
			return;
		}

		clearHoldRepeat();
		holdRepeatTimeoutRef.current = window.setTimeout(() => {
			setPressed(interactionKey, buildPressOptions());
			holdRepeatIntervalRef.current = window.setInterval(() => {
				setPressed(interactionKey, buildPressOptions());
			}, HOLD_BACKSPACE_REPEAT_INTERVAL_MS);
		}, HOLD_BACKSPACE_INITIAL_DELAY_MS);
	}, [buildPressOptions, clearHoldRepeat, interactionKey, setPressed]);

	useEffect(() => clearHoldRepeat, [clearHoldRepeat]);

	const handleMouseDown = () => {
		if (isPreviewInputLocked) {
			return;
		}

		if (interactionKey) {
			if (resolvedSoundKeyCode) {
				playSoundDown(resolvedSoundKeyCode);
			}
			setPressed(interactionKey, buildPressOptions());
			startBackspaceHoldRepeat();
		}
	};

	const handleMouseUp = () => {
		clearHoldRepeat();
		if (interactionKey && isPressed) {
			if (resolvedSoundKeyCode) {
				playSoundUp(resolvedSoundKeyCode);
			}
			setReleased(interactionKey);
		}
	};

	const handleMouseLeave = () => {
		clearHoldRepeat();
		if (interactionKey && isPressed) {
			setReleased(interactionKey);
		}
	};

	return (
		<div className={cn("rounded-[4px] p-[0.5px]", containerClassName)}>
			<button
				type="button"
				data-testid={dataTestId}
				disabled={isPreviewInputLocked}
				onMouseDown={handleMouseDown}
				onMouseUp={handleMouseUp}
				onMouseLeave={handleMouseLeave}
				className={cn(
					"flex h-6 w-6 cursor-pointer items-center justify-center rounded-[3.5px] bg-gray-100 shadow-[0px_0px_1px_0px_rgba(0,0,0,0.5),0px_1px_1px_0px_rgba(0,0,0,0.1),0px_1px_0px_0px_rgba(255,255,255,1)_inset] transition-transform duration-75 active:scale-[0.98]",
					isPreviewInputLocked &&
						"cursor-not-allowed opacity-60 active:scale-100",
					isPressed &&
						"scale-[0.98] bg-gray-100/80 shadow-[0px_0px_1px_0px_rgba(0,0,0,0.5),0px_1px_1px_0px_rgba(0,0,0,0.1),0px_1px_0px_0px_rgba(255,255,255,0.5)]",
					className,
				)}
			>
				<div
					className={cn(
						"flex h-full w-full flex-col items-center justify-center text-[5px] text-neutral-700",
						childrenClassName,
					)}
				>
					{children}
				</div>
			</button>
		</div>
	);
};
