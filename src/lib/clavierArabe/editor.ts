import {
	type LayoutLinesResult,
	type PreparedText,
	type PreparedTextWithSegments,
	layout as pretextLayout,
	layoutWithLines as pretextLayoutWithLines,
	prepare as pretextPrepare,
	prepareWithSegments as pretextPrepareWithSegments,
} from "@chenglou/pretext";

import { CLAVIER_ARABE_SCORING } from "@/data/clavierArabe/scoring";
import type { ClavierArabeActionId } from "@/data/clavierArabe/types";

const ARABIC_CHARACTER_REGEX = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u;
const LATIN_CHARACTER_REGEX = /[a-z]/i;
const DIGIT_REGEX = /\d/;
const TOKEN_BOUNDARY_REGEX = /[\s.,;:!?()[\]{}"'`~_\-/\\|،؛؟]/;
const ALPHANUMERIC_TOKEN_REGEX = /[a-z0-9]+/gi;
const NUMBER_TOKEN_REGEX = /^\d+$/;
const LATIN_TOKEN_REGEX = /^[a-z]+$/i;
const DIGIT_LATIN_TOKEN_REGEX = /^(?=.*[a-z])(?=.*\d)[a-z0-9]+$/i;
const SHORT_DIGIT_LATIN_TOKEN_REGEX = /^\d[a-z]$/i;
const NETWORK_TOKEN_REGEX = /^\d+g$/i;
const PRODUCT_NUMBER_WORDS = new Set([
	"iphone",
	"galaxy",
	"pixel",
	"windows",
	"playstation",
	"ps",
	"fifa",
]);
const ARABIZI_FALSE_POSITIVE_TOKENS = new Set([
	"3g",
	"4g",
	"5g",
	"7zip",
	"iphone15",
]);
const ARABIZI_CONFIRMATION_LEXICON = new Set([
	"3arabi",
	"3arbia",
	"3arbi",
	"3alaykom",
	"3alaykum",
	"3la",
	"3lik",
	"7abibi",
	"7abibti",
	"7amdoulillah",
	"7amdulillah",
	"7al",
	"7elwa",
	"7lou",
	"9alb",
	"9albi",
	"chokran",
	"hamdoulillah",
	"hamdulillah",
	"inchaallah",
	"inchallah",
	"inshallah",
	"kayfa",
	"kifak",
	"mar7ba",
	"marhaba",
	"salam",
	"slm",
	"shokran",
	"shukran",
	"wallah",
	"ya3ni",
]);

type PretextWhiteSpaceMode = "normal" | "pre-wrap";

export interface ClavierArabeTextareaSelection {
	selectionStart?: number | null;
	selectionEnd?: number | null;
}

export interface ClavierArabeSelectionSnapshot {
	start: number;
	end: number;
}

export interface ClavierArabeSelectionReplacementResult {
	value: string;
	selectionStart: number;
	selectionEnd: number;
	replacedText: string;
	insertedText: string;
}

export interface ClavierArabeEditorContext {
	selection: ClavierArabeSelectionSnapshot;
	selectedText: string;
	beforeSelection: string;
	afterSelection: string;
	currentToken: string;
	tokenStart: number;
	tokenEnd: number;
}

export type ClavierArabeIntentionAction =
	| "arabizi"
	| "correct"
	| "tashkeel"
	| "translate";

export type ClavierArabeInputKind =
	| "arabic"
	| "arabizi"
	| "empty"
	| "latin"
	| "mixed"
	| "other";

export interface ClavierArabeIntentionDetection {
	actionIds: readonly ClavierArabeActionId[];
	arabiziConfidence: number;
	context: ClavierArabeEditorContext;
	hasArabic: boolean;
	hasDigits: boolean;
	hasLatin: boolean;
	inputKind: ClavierArabeInputKind;
	primaryAction: ClavierArabeIntentionAction | null;
	secondaryActions: readonly ClavierArabeIntentionAction[];
}

export interface PhysicalKeyboardEventLike {
	altKey?: boolean;
	code?: string;
	ctrlKey?: boolean;
	key?: string;
	metaKey?: boolean;
	repeat?: boolean;
	shiftKey?: boolean;
}

export interface ClavierArabePhysicalKeyboardSyncState {
	lastPressedKeyId: string | null;
	pressedKeyIds: readonly string[];
}

export interface ClavierArabePretextPrepareOptions {
	whiteSpace?: PretextWhiteSpaceMode;
}

export interface ClavierArabePretextAdapter {
	layout: (
		prepared: PreparedText,
		maxWidth: number,
		lineHeight: number,
	) => { height: number; lineCount: number };
	layoutWithLines: (
		prepared: PreparedTextWithSegments,
		maxWidth: number,
		lineHeight: number,
	) => LayoutLinesResult;
	prepare: (
		text: string,
		font: string,
		options?: ClavierArabePretextPrepareOptions,
	) => PreparedText;
	prepareWithSegments: (
		text: string,
		font: string,
		options?: ClavierArabePretextPrepareOptions,
	) => PreparedTextWithSegments;
}

export interface ClavierArabeAutoGrowMeasurement {
	height: number;
	isClamped: boolean;
	lineCount: number;
	maxHeight: number | null;
	measuredHeight: number;
	minHeight: number;
	visibleLineCount: number;
}

export interface ClavierArabeAutoGrowOptions {
	adapter?: ClavierArabePretextAdapter;
	contentWidth: number;
	font: string;
	lineHeight: number;
	maxRows?: number;
	minRows?: number;
	text: string;
	whiteSpace?: PretextWhiteSpaceMode;
}

export interface ClavierArabeCaretAnchorMeasurement {
	bottom: number;
	caretIndex: number;
	left: number;
	lineCount: number;
	lineIndex: number;
	lineWidth: number;
	right: number;
	top: number;
}

export interface ClavierArabeCaretAnchorOptions {
	adapter?: ClavierArabePretextAdapter;
	caretIndex: number;
	contentWidth: number;
	direction?: "ltr" | "rtl";
	font: string;
	lineHeight: number;
	text: string;
	whiteSpace?: PretextWhiteSpaceMode;
}

export const CLAVIER_ARABE_DEFAULT_PRETEXT_ADAPTER: ClavierArabePretextAdapter =
	{
		layout: pretextLayout,
		layoutWithLines: pretextLayoutWithLines,
		prepare: pretextPrepare,
		prepareWithSegments: pretextPrepareWithSegments,
	};

const clampNumber = (value: number, min: number, max: number): number => {
	return Math.min(Math.max(value, min), max);
};

const clampSelectionIndex = (
	value: number | null | undefined,
	length: number,
) => {
	if (!Number.isFinite(value)) {
		return length;
	}

	return clampNumber(Math.trunc(value), 0, length);
};

const normalizeToken = (token: string): string => token.trim().toLowerCase();

const isTokenBoundary = (character: string | undefined): boolean => {
	if (!character) {
		return true;
	}

	return TOKEN_BOUNDARY_REGEX.test(character);
};

const getAlphaNumericTokens = (value: string): string[] => {
	return value.match(ALPHANUMERIC_TOKEN_REGEX) ?? [];
};

export const normalizeTextareaSelection = (
	value: string,
	selection: ClavierArabeTextareaSelection = {},
): ClavierArabeSelectionSnapshot => {
	const start = clampSelectionIndex(selection.selectionStart, value.length);
	const end = clampSelectionIndex(selection.selectionEnd, value.length);

	return start <= end ? { start, end } : { start: end, end: start };
};

export const replaceTextareaSelection = (options: {
	replacementText: string;
	selectionEnd?: number | null;
	selectionStart?: number | null;
	value: string;
}): ClavierArabeSelectionReplacementResult => {
	const { start, end } = normalizeTextareaSelection(options.value, options);
	const nextValue =
		options.value.slice(0, start) +
		options.replacementText +
		options.value.slice(end);
	const nextCaretIndex = start + options.replacementText.length;

	return {
		value: nextValue,
		selectionStart: nextCaretIndex,
		selectionEnd: nextCaretIndex,
		replacedText: options.value.slice(start, end),
		insertedText: options.replacementText,
	};
};

export const insertTextareaAtCaret = (options: {
	insertText: string;
	selectionEnd?: number | null;
	selectionStart?: number | null;
	value: string;
}): ClavierArabeSelectionReplacementResult => {
	return replaceTextareaSelection({
		value: options.value,
		selectionStart: options.selectionStart,
		selectionEnd: options.selectionEnd,
		replacementText: options.insertText,
	});
};

export const getClavierArabeEditorContext = (options: {
	selectionEnd?: number | null;
	selectionStart?: number | null;
	value: string;
}): ClavierArabeEditorContext => {
	const selection = normalizeTextareaSelection(options.value, options);
	let tokenStart = selection.start;
	let tokenEnd = selection.end;

	while (tokenStart > 0 && !isTokenBoundary(options.value[tokenStart - 1])) {
		tokenStart -= 1;
	}

	while (
		tokenEnd < options.value.length &&
		!isTokenBoundary(options.value[tokenEnd])
	) {
		tokenEnd += 1;
	}

	return {
		selection,
		selectedText: options.value.slice(selection.start, selection.end),
		beforeSelection: options.value.slice(0, selection.start),
		afterSelection: options.value.slice(selection.end),
		currentToken: options.value.slice(tokenStart, tokenEnd),
		tokenStart,
		tokenEnd,
	};
};

export const getArabiziConfidence = (value: string): number => {
	const trimmedValue = value.trim();
	if (!trimmedValue) {
		return 0;
	}

	const tokens = getAlphaNumericTokens(trimmedValue).map(normalizeToken);
	if (tokens.length === 0) {
		return 0;
	}

	let positiveSignals = 0;
	let negativeSignals = 0;
	let digitLetterTokenCount = 0;

	for (const token of tokens) {
		const hasLatin = LATIN_CHARACTER_REGEX.test(token);
		const hasDigits = DIGIT_REGEX.test(token);
		const isFalsePositive =
			ARABIZI_FALSE_POSITIVE_TOKENS.has(token) ||
			NETWORK_TOKEN_REGEX.test(token);

		if (isFalsePositive) {
			negativeSignals += 2.2;
			continue;
		}

		if (DIGIT_LATIN_TOKEN_REGEX.test(token)) {
			if (SHORT_DIGIT_LATIN_TOKEN_REGEX.test(token)) {
				negativeSignals += 1.4;
				continue;
			}

			digitLetterTokenCount += 1;
			positiveSignals += 1.9;

			const arabiziDigitCount = (token.match(/[2356789]/g) ?? []).length;
			positiveSignals += Math.min(arabiziDigitCount * 0.35, 0.8);

			if (ARABIZI_CONFIRMATION_LEXICON.has(token)) {
				positiveSignals += 1.2;
			}

			if (
				/^[2356789][a-z]{2,}$/i.test(token) ||
				/^[a-z]{1,}[2356789][a-z]{1,}$/i.test(token)
			) {
				positiveSignals += 0.3;
			}

			continue;
		}

		if (ARABIZI_CONFIRMATION_LEXICON.has(token)) {
			positiveSignals += 0.45;
			continue;
		}

		if (hasDigits && !hasLatin) {
			negativeSignals += 0.85;
			continue;
		}

		if (hasLatin) {
			negativeSignals += 0.15;
		}
	}

	for (let index = 0; index < tokens.length - 1; index += 1) {
		const currentToken = tokens[index];
		const nextToken = tokens[index + 1];

		if (
			LATIN_TOKEN_REGEX.test(currentToken) &&
			NUMBER_TOKEN_REGEX.test(nextToken)
		) {
			negativeSignals += 0.8;

			if (PRODUCT_NUMBER_WORDS.has(currentToken)) {
				negativeSignals += 1.4;
			}
		}

		if (
			NUMBER_TOKEN_REGEX.test(currentToken) &&
			LATIN_TOKEN_REGEX.test(nextToken)
		) {
			negativeSignals += 0.9;
		}
	}

	if (digitLetterTokenCount === 0) {
		positiveSignals *= 0.45;
	}

	if (positiveSignals <= 0) {
		return 0;
	}

	return clampNumber(
		positiveSignals / (positiveSignals + negativeSignals + 0.6),
		0,
		1,
	);
};

export const detectClavierArabeIntention = (options: {
	selectionEnd?: number | null;
	selectionStart?: number | null;
	value: string;
}): ClavierArabeIntentionDetection => {
	const trimmedValue = options.value.trim();
	const context = getClavierArabeEditorContext(options);
	const hasArabic = ARABIC_CHARACTER_REGEX.test(trimmedValue);
	const hasLatin = LATIN_CHARACTER_REGEX.test(trimmedValue);
	const hasDigits = DIGIT_REGEX.test(trimmedValue);
	const hasEnoughCharacters =
		trimmedValue.length >=
		CLAVIER_ARABE_SCORING.intentDetection.minimumCharacters;
	const arabiziConfidence = hasEnoughCharacters
		? getArabiziConfidence(trimmedValue)
		: 0;

	if (!trimmedValue) {
		return {
			actionIds: [],
			arabiziConfidence,
			context,
			hasArabic,
			hasDigits,
			hasLatin,
			inputKind: "empty",
			primaryAction: null,
			secondaryActions: [],
		};
	}

	if (!hasEnoughCharacters) {
		return {
			actionIds: [],
			arabiziConfidence,
			context,
			hasArabic,
			hasDigits,
			hasLatin,
			inputKind: hasArabic
				? hasLatin || hasDigits
					? "mixed"
					: "arabic"
				: hasLatin
					? hasDigits
						? "mixed"
						: "latin"
					: hasDigits
						? "mixed"
						: "other",
			primaryAction: null,
			secondaryActions: [],
		};
	}

	if (hasArabic) {
		return {
			actionIds: ["correctText", "addDiacritics"],
			arabiziConfidence,
			context,
			hasArabic,
			hasDigits,
			hasLatin,
			inputKind: hasLatin || hasDigits ? "mixed" : "arabic",
			primaryAction: "correct",
			secondaryActions: ["tashkeel"],
		};
	}

	if (!hasLatin) {
		return {
			actionIds: [],
			arabiziConfidence,
			context,
			hasArabic,
			hasDigits,
			hasLatin,
			inputKind: hasDigits ? "mixed" : "other",
			primaryAction: null,
			secondaryActions: [],
		};
	}

	if (
		hasDigits &&
		arabiziConfidence >=
			CLAVIER_ARABE_SCORING.intentDetection.arabiziConfidenceThreshold
	) {
		return {
			actionIds: ["convertArabizi"],
			arabiziConfidence,
			context,
			hasArabic,
			hasDigits,
			hasLatin,
			inputKind: "arabizi",
			primaryAction: "arabizi",
			secondaryActions: [],
		};
	}

	if (hasDigits) {
		return {
			actionIds: [],
			arabiziConfidence,
			context,
			hasArabic,
			hasDigits,
			hasLatin,
			inputKind: "mixed",
			primaryAction: null,
			secondaryActions: [],
		};
	}

	return {
		actionIds: ["translateToArabic"],
		arabiziConfidence,
		context,
		hasArabic,
		hasDigits,
		hasLatin,
		inputKind: "latin",
		primaryAction: "translate",
		secondaryActions: [],
	};
};

export const createEmptyPhysicalKeyboardSyncState =
	(): ClavierArabePhysicalKeyboardSyncState => ({
		lastPressedKeyId: null,
		pressedKeyIds: [],
	});

export const normalizePhysicalKeyboardVisualKeyId = (
	value: string | null | undefined,
): string | null => {
	if (!value) {
		return null;
	}

	const normalizedValue = value.trim().toLowerCase();
	if (!normalizedValue) {
		return null;
	}

	if (normalizedValue === "space" || normalizedValue === "espace") {
		return "space";
	}

	if (normalizedValue === "backspace") {
		return "backspace";
	}

	if (normalizedValue === "enter") {
		return "enter";
	}

	if (
		normalizedValue.length === 1 &&
		LATIN_CHARACTER_REGEX.test(normalizedValue)
	) {
		return normalizedValue;
	}

	return null;
};

export const getPhysicalKeyboardVisualKeyId = (
	eventLike: PhysicalKeyboardEventLike,
): string | null => {
	if (eventLike.ctrlKey || eventLike.altKey || eventLike.metaKey) {
		return null;
	}

	if (eventLike.code === "Space") {
		return "space";
	}

	if (eventLike.code === "Backspace") {
		return "backspace";
	}

	if (eventLike.code === "Enter") {
		return "enter";
	}

	if (eventLike.code?.startsWith("Key") && eventLike.code.length === 4) {
		return normalizePhysicalKeyboardVisualKeyId(eventLike.code.slice(3));
	}

	return normalizePhysicalKeyboardVisualKeyId(eventLike.key);
};

export const applyPhysicalKeyboardKeyDown = (
	state: ClavierArabePhysicalKeyboardSyncState,
	eventLike: PhysicalKeyboardEventLike,
): ClavierArabePhysicalKeyboardSyncState => {
	const keyId = getPhysicalKeyboardVisualKeyId(eventLike);
	if (!keyId) {
		return state;
	}

	if (eventLike.repeat && state.lastPressedKeyId === keyId) {
		return state;
	}

	if (state.pressedKeyIds.includes(keyId)) {
		return {
			lastPressedKeyId: keyId,
			pressedKeyIds: state.pressedKeyIds,
		};
	}

	return {
		lastPressedKeyId: keyId,
		pressedKeyIds: [...state.pressedKeyIds, keyId],
	};
};

export const applyPhysicalKeyboardKeyUp = (
	state: ClavierArabePhysicalKeyboardSyncState,
	eventLike: PhysicalKeyboardEventLike,
): ClavierArabePhysicalKeyboardSyncState => {
	const keyId = getPhysicalKeyboardVisualKeyId(eventLike);
	if (!keyId || !state.pressedKeyIds.includes(keyId)) {
		return state;
	}

	const nextPressedKeyIds = state.pressedKeyIds.filter(
		(pressedKeyId) => pressedKeyId !== keyId,
	);

	return {
		lastPressedKeyId:
			state.lastPressedKeyId === keyId ? null : state.lastPressedKeyId,
		pressedKeyIds: nextPressedKeyIds,
	};
};

export const resetPhysicalKeyboardSyncState =
	createEmptyPhysicalKeyboardSyncState;

export const measureClavierArabeTextareaAutoGrow = (
	options: ClavierArabeAutoGrowOptions,
): ClavierArabeAutoGrowMeasurement => {
	const adapter = options.adapter ?? CLAVIER_ARABE_DEFAULT_PRETEXT_ADAPTER;
	const safeLineHeight = Math.max(1, options.lineHeight);
	const safeMinRows = Math.max(1, options.minRows ?? 1);
	const safeMaxRows =
		typeof options.maxRows === "number"
			? Math.max(safeMinRows, options.maxRows)
			: null;
	const safeWidth = Math.max(0, options.contentWidth);
	const prepared = adapter.prepare(options.text, options.font, {
		whiteSpace: options.whiteSpace ?? "pre-wrap",
	});
	const measurement = adapter.layout(prepared, safeWidth, safeLineHeight);
	const lineCount = Math.max(measurement.lineCount, 1);
	const measuredHeight = Math.max(measurement.height, safeLineHeight);
	const minHeight = safeMinRows * safeLineHeight;
	const maxHeight = safeMaxRows === null ? null : safeMaxRows * safeLineHeight;
	const unclampedHeight = Math.max(measuredHeight, minHeight);
	const height =
		maxHeight === null ? unclampedHeight : Math.min(unclampedHeight, maxHeight);

	return {
		height,
		isClamped: maxHeight !== null && unclampedHeight > maxHeight,
		lineCount,
		maxHeight,
		measuredHeight,
		minHeight,
		visibleLineCount: Math.max(1, Math.round(height / safeLineHeight)),
	};
};

export const measureClavierArabeCaretAnchor = (
	options: ClavierArabeCaretAnchorOptions,
): ClavierArabeCaretAnchorMeasurement => {
	const adapter = options.adapter ?? CLAVIER_ARABE_DEFAULT_PRETEXT_ADAPTER;
	const safeLineHeight = Math.max(1, options.lineHeight);
	const safeWidth = Math.max(0, options.contentWidth);
	const safeCaretIndex = clampSelectionIndex(
		options.caretIndex,
		options.text.length,
	);
	const prefixText = options.text.slice(0, safeCaretIndex);
	const prepared = adapter.prepareWithSegments(prefixText, options.font, {
		whiteSpace: options.whiteSpace ?? "pre-wrap",
	});
	const measurement = adapter.layoutWithLines(
		prepared,
		safeWidth,
		safeLineHeight,
	);
	const lineCount = Math.max(measurement.lineCount, 1);
	const lineIndex = Math.max(measurement.lines.length - 1, 0);
	const lineWidth = measurement.lines.at(-1)?.width ?? 0;
	const left =
		options.direction === "rtl"
			? Math.max(safeWidth - lineWidth, 0)
			: lineWidth;

	return {
		bottom: (lineIndex + 1) * safeLineHeight,
		caretIndex: safeCaretIndex,
		left,
		lineCount,
		lineIndex,
		lineWidth,
		right: Math.max(safeWidth - left, 0),
		top: lineIndex * safeLineHeight,
	};
};
