import {
	Check,
	ChevronLeft,
	Download,
	ExternalLink,
	ImageOff,
	Loader2,
	Mic,
	Pencil,
	RotateCcw,
	Save,
	Square,
	Trash2,
	Upload,
	Volume2,
	X,
} from "lucide-react";
import {
	type ChangeEvent,
	type CSSProperties,
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
	type TouchEvent as ReactTouchEvent,
	type WheelEvent as ReactWheelEvent,
	type Ref,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import cardFlipIcon from "@/assets/icons_subttiles/Card-Flip--Streamline-Sharp.png";
import vowelsArabicIcon from "@/assets/icons_subttiles/vowels_arabic.webp";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsEnglishApp } from "@/contexts/AppLocaleContext";
import { buildCollectedCardSourceLinkPath } from "@/data/immersionVideoRouting";
import type { VocabCard as AnkiCard } from "@/data/vocabCards";
import { readActiveUserId } from "@/lib/authPersistence";
import {
	deleteLocalFoundationCardMediaSlot,
	type LocalFoundationCardMediaOverlayRecord,
	resetLocalFoundationCardMediaOverrides,
	resolveLocalFoundationCardMediaOverlayByCardId,
	saveLocalFoundationCardMediaAssets,
} from "@/lib/localFoundationCardMediaStore";
import {
	deleteUserVocabularyCardAudio,
	deleteUserVocabularyCardImage,
	persistUserVocabularyCardMediaAssets,
	resetUserVocabularyCardMedia,
} from "@/services/deckPersoService";

// App light card theme
export const theme = {
	sideBars: "#ddd4c4",
	background: "#f7f6f2",
	backgroundWrap: "#ece5d7",
	borderWrap: "#b8b1a3",
	text: "#000000",
	furigana: "#000000",
	headword: "#0ced8c",
	target: "#09BC8A",
	hr: "#c8c1b3",
	tagBg: "#e1dbcd",
	tagText: "#000000",
	textHint: "#000000",
	textSummary: "rgba(0,0,0,0.72)",
	playCircle: "#09BC8A",
	playSymbol: "#111111",
};

const HTML_BUTTON_BACKGROUND = "#efefef";
const HTML_BUTTON_BACKGROUND_HOVER = "#e3e3e3";

const createHtmlButtonStyle = ({
	hovered = false,
	disabled = false,
	padding = "1px 8px",
	minHeight = "24px",
	width,
	height,
}: {
	hovered?: boolean;
	disabled?: boolean;
	padding?: string;
	minHeight?: string;
	width?: string;
	height?: string;
}): CSSProperties => ({
	fontFamily: "Arial, sans-serif",
	fontSize: "13.3333px",
	fontWeight: 400,
	backgroundColor: hovered
		? HTML_BUTTON_BACKGROUND_HOVER
		: HTML_BUTTON_BACKGROUND,
	color: "#000000",
	border: "1px solid #000000",
	borderRadius: "3px",
	padding,
	minHeight,
	width,
	height,
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	transition: "background-color 0.15s ease, opacity 0.15s ease",
	opacity: disabled ? 0.55 : 1,
});

type ShortsLayoutMetrics = {
	scale: number;
	lineHeightScale: number;
	paddingScale: number;
	buttonScale: number;
	frenchScale: number;
	arabicScale: number;
};

type ShortsIconButtonMetrics = {
	iconButtonSize: number;
	iconSize: number;
};

type ShortsExtraControl =
	| ReactNode
	| ((metrics: ShortsIconButtonMetrics) => ReactNode);

const clampNumber = (value: number, min: number, max: number): number => {
	return Math.min(max, Math.max(min, value));
};

const DEFAULT_SHORTS_LAYOUT: ShortsLayoutMetrics = {
	scale: 1,
	lineHeightScale: 1,
	paddingScale: 1,
	buttonScale: 1,
	frenchScale: 1,
	arabicScale: 1,
};

const computeShortsLayoutMetrics = (
	node: HTMLElement | null,
): ShortsLayoutMetrics => {
	if (!node) {
		return DEFAULT_SHORTS_LAYOUT;
	}

	const rect = node.getBoundingClientRect();
	if (
		!Number.isFinite(rect.width) ||
		!Number.isFinite(rect.height) ||
		rect.width <= 0 ||
		rect.height <= 0
	) {
		return DEFAULT_SHORTS_LAYOUT;
	}

	const BASE_WIDTH = 380;
	const BASE_HEIGHT = (BASE_WIDTH * 16) / 9;
	const rawScale = Math.min(rect.width / BASE_WIDTH, rect.height / BASE_HEIGHT);
	const scale = clampNumber(rawScale, 0.74, 1);

	return {
		scale,
		// Priority order requested: line-height, then paddings, then button,
		// then French type, then Arabic type (least compressed).
		lineHeightScale: clampNumber(scale * 0.84, 0.75, 1),
		paddingScale: clampNumber(scale * 0.9, 0.78, 1),
		buttonScale: clampNumber(scale * 0.94, 0.82, 1),
		frenchScale: clampNumber(scale * 0.96, 0.84, 1),
		arabicScale: clampNumber(scale * 0.985, 0.88, 1),
	};
};

const sameShortsLayout = (
	a: ShortsLayoutMetrics,
	b: ShortsLayoutMetrics,
): boolean => {
	return (
		a.scale === b.scale &&
		a.lineHeightScale === b.lineHeightScale &&
		a.paddingScale === b.paddingScale &&
		a.buttonScale === b.buttonScale &&
		a.frenchScale === b.frenchScale &&
		a.arabicScale === b.arabicScale
	);
};

type CardSourceChipLabel = {
	label: string;
};

const CARD_SOURCE_CHIP_LABELS: Record<
	"foundation" | "collected" | "sent" | "alphabet",
	CardSourceChipLabel
> = {
	foundation: {
		label: "Fondations 2000",
	},
	collected: {
		label: "Collectée",
	},
	sent: {
		label: "Envoyée par mon prof",
	},
	alphabet: {
		label: "Deck Alphabet",
	},
};

const getCardSourceChipLabel = (card: AnkiCard): CardSourceChipLabel => {
	if (card.source === "foundation" || card.sourceType === "foundation") {
		return CARD_SOURCE_CHIP_LABELS.foundation;
	}

	if (
		card.sourceType === "alphabet" ||
		card.tags.some((tag) => tag.toLowerCase() === "alphabet_arabe")
	) {
		return CARD_SOURCE_CHIP_LABELS.alphabet;
	}

	if (card.sourceType === "sent") {
		return CARD_SOURCE_CHIP_LABELS.sent;
	}

	if (card.sourceType === "collected") {
		return CARD_SOURCE_CHIP_LABELS.collected;
	}

	const hasProfTag = card.tags.some((tag) => tag.toLowerCase() === "prof");
	return hasProfTag
		? CARD_SOURCE_CHIP_LABELS.sent
		: CARD_SOURCE_CHIP_LABELS.collected;
};

const isFoundationCard = (card: AnkiCard): boolean =>
	card.source === "foundation" || card.sourceType === "foundation";

type SourceChipTone = "default" | "muted";

const SOURCE_CHIP_TONE_CLASSES: Record<
	SourceChipTone,
	{ label: string; focus: string }
> = {
	default: {
		label: "text-white/30",
		focus: "text-white/35",
	},
	muted: {
		label: "text-white/20",
		focus: "text-white/25",
	},
};

const SourceChip = ({
	card,
	className = "",
	tone = "default",
}: {
	card: AnkiCard;
	className?: string;
	tone?: SourceChipTone;
}) => {
	const chip = getCardSourceChipLabel(card);
	const toneClasses = SOURCE_CHIP_TONE_CLASSES[tone];
	const showFocus = isFoundationCard(card);
	const rawFocus = showFocus ? card.focus?.toString().trim() : null;
	const focusValue = rawFocus
		? rawFocus.startsWith("#")
			? rawFocus
			: `#${rawFocus}`
		: null;

	return (
		<div
			className={`flex w-full flex-shrink-0 items-center justify-between px-5 sm:px-6 pt-0.5 pb-1 ${className}`}
		>
			<span
				className={`inline-flex items-center whitespace-nowrap text-[9px] font-extralight uppercase tracking-[0.18em] sm:text-[10px] ${toneClasses.label}`}
			>
				{chip.label}
			</span>
			{focusValue && (
				<span
					className={`inline-flex items-center whitespace-nowrap text-[9px] font-semibold sm:text-[10px] ${toneClasses.focus}`}
				>
					{focusValue}
				</span>
			)}
		</div>
	);
};

const stripHtml = (s: string) => s.replace(/<\/?[^>]+>/g, "");
const stripTashkeel = (s: string) =>
	s.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "");

const MaskedAssetIcon = ({ size, src }: { size: number; src: string }) => {
	return (
		<span
			aria-hidden="true"
			className="inline-block"
			style={{
				width: `${size}px`,
				height: `${size}px`,
				backgroundColor: "currentColor",
				WebkitMaskImage: `url(${src})`,
				maskImage: `url(${src})`,
				WebkitMaskRepeat: "no-repeat",
				maskRepeat: "no-repeat",
				WebkitMaskPosition: "center",
				maskPosition: "center",
				WebkitMaskSize: "contain",
				maskSize: "contain",
				flexShrink: 0,
			}}
		/>
	);
};

const VowelsIcon = ({ size }: { size: number }) => {
	return <MaskedAssetIcon size={size} src={vowelsArabicIcon} />;
};

const FlipCardIcon = ({ size }: { size: number }) => {
	return <MaskedAssetIcon size={size} src={cardFlipIcon} />;
};

const DelayedTooltipControl = ({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) => {
	return (
		<Tooltip delayDuration={1000}>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent
				side="bottom"
				sideOffset={8}
				className="max-w-[220px] text-center"
			>
				{label}
			</TooltipContent>
		</Tooltip>
	);
};

const extractTargets = (html: string): Set<string> => {
	const targets = new Set<string>();
	const matches = html.match(/<b>([^<]+)<\/b>/g) || [];
	matches.forEach((m) => {
		const word = stripHtml(m);
		const cleaned = stripTashkeel(word).replace(/ـ/g, "");
		targets.add(cleaned);
	});
	return targets;
};

const containsTarget = (word: string, targetSet: Set<string>): boolean => {
	const cleanedWord = stripTashkeel(word).replace(/ـ/g, "");
	for (const target of targetSet) {
		if (cleanedWord.includes(target) || target.includes(cleanedWord)) {
			return true;
		}
	}
	return false;
};

const ArabicWord = ({
	base,
	full,
	isTarget,
	showVowels,
}: {
	base: string;
	full: string;
	isTarget: boolean;
	showVowels: boolean;
}) => {
	const [isHovered, setIsHovered] = useState(false);

	return (
		<button
			type="button"
			tabIndex={-1}
			className="inline-block cursor-default border-0 bg-transparent px-[0.12em]"
			style={{
				color: isTarget ? theme.target : theme.text,
				transition: "color 0.15s ease",
			}}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{showVowels || isHovered ? full : base}
		</button>
	);
};

const ArabicSentence = ({
	sentBase,
	sentFull,
	vocabBase,
	showVowels,
	layoutMetrics = DEFAULT_SHORTS_LAYOUT,
	maxLines,
	trailingControl,
}: {
	sentBase: string;
	sentFull: string;
	vocabBase: string;
	showVowels: boolean;
	layoutMetrics?: ShortsLayoutMetrics;
	maxLines?: number;
	trailingControl?: ReactNode;
}) => {
	const baseWordTokens = sentBase.split(/\s+/).filter(Boolean);
	const explicitTargetFlags = baseWordTokens.map((token) =>
		/<b>[^<]+<\/b>/.test(token),
	);
	const hasExplicitTargets = explicitTargetFlags.some(Boolean);
	const targetSet = extractTargets(sentBase);
	if (!hasExplicitTargets && targetSet.size === 0) {
		targetSet.add(stripTashkeel(vocabBase));
	}

	const baseWords = baseWordTokens.map((token) => stripHtml(token));
	const fullWords = stripHtml(sentFull).split(/\s+/);
	const wordOccurrences = new Map<string, number>();
	const fontSize = clampNumber(30 * layoutMetrics.arabicScale, 20, 38);
	const lineHeight = clampNumber(
		1.24 * layoutMetrics.lineHeightScale,
		1.1,
		1.28,
	);
	const sentenceClampStyles: CSSProperties | undefined =
		typeof maxLines === "number"
			? {
					display: "-webkit-box",
					WebkitBoxOrient: "vertical",
					WebkitLineClamp: maxLines,
					overflow: "hidden",
					textOverflow: "ellipsis",
				}
			: undefined;

	return (
		<div
			className="leading-none"
			dir="rtl"
			lang="ar"
			style={{
				fontSize: `${fontSize}px`,
				lineHeight,
				fontFamily:
					"'Yakout Linotype', 'Scheherazade New', 'Amiri', 'Noto Naskh Arabic', serif",
				textAlign: "center",
				paddingTop: "0.12em",
				paddingBottom: "0.06em",
				...sentenceClampStyles,
			}}
		>
			{baseWords.map((word, i) => {
				const isTarget = hasExplicitTargets
					? explicitTargetFlags[i] === true
					: containsTarget(word, targetSet);
				const wordCount = (wordOccurrences.get(word) ?? 0) + 1;
				wordOccurrences.set(word, wordCount);
				const fullWord = fullWords[i] || word;
				return (
					<ArabicWord
						key={`${word}-${fullWord}-${wordCount}`}
						base={word}
						full={fullWord}
						isTarget={isTarget}
						showVowels={showVowels}
					/>
				);
			})}
			{trailingControl ? (
				<span
					className="inline-flex align-middle"
					style={{ marginInlineStart: "0.2em" }}
				>
					{trailingControl}
				</span>
			) : null}
		</div>
	);
};

const VocabWord = ({
	base,
	full,
	showVowels,
	layoutMetrics = DEFAULT_SHORTS_LAYOUT,
}: {
	base: string;
	full: string;
	showVowels: boolean;
	layoutMetrics?: ShortsLayoutMetrics;
}) => {
	const [isHovered, setIsHovered] = useState(false);
	const fontSize = clampNumber(36 * layoutMetrics.arabicScale, 25, 44);
	const lineHeight = clampNumber(
		1.18 * layoutMetrics.lineHeightScale,
		1.05,
		1.2,
	);

	return (
		<button
			type="button"
			tabIndex={-1}
			className="cursor-default border-0 bg-transparent p-0"
			dir="rtl"
			lang="ar"
			style={{
				fontSize: `${fontSize}px`,
				lineHeight,
				fontFamily:
					"'Yakout Linotype', 'Scheherazade New', 'Amiri', 'Noto Naskh Arabic', serif",
				color: theme.text,
			}}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{showVowels || isHovered ? full : base}
		</button>
	);
};

export interface AudioUrls {
	[key: string]: string;
}

type WindowWithSupabaseAudioConfig = Window & {
	__SUPABASE_CONFIG__?: {
		SUPABASE_URL?: string;
	};
};

const runtimeSupabaseUrl =
	typeof window === "undefined"
		? undefined
		: (window as WindowWithSupabaseAudioConfig).__SUPABASE_CONFIG__
				?.SUPABASE_URL;

const normalizedSupabaseAudioBase = (
	runtimeSupabaseUrl ?? import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.SUPABASE_URL ?? ""
)
	.trim()
	.replace(/\/+$/, "");

const STORAGE_BASE_URL = `${normalizedSupabaseAudioBase}/storage/v1/object/public/arabic-audio/cards`;

export const AUDIO_FILES: AudioUrls = {
	"vocab-1": `${STORAGE_BASE_URL}/card-1-vocab-7dm.mp3`,
	"sentence-1": `${STORAGE_BASE_URL}/card-1-sentence-dxc.mp3`,
	"vocab-2": `${STORAGE_BASE_URL}/card-2-vocab-8ni.mp3`,
	"sentence-2": `${STORAGE_BASE_URL}/card-2-sentence-dxp.mp3`,
	"vocab-3": `${STORAGE_BASE_URL}/card-3-vocab-b3x.mp3`,
	"sentence-3": `${STORAGE_BASE_URL}/card-3-sentence-hl3.mp3`,
	"vocab-4": `${STORAGE_BASE_URL}/card-4-vocab-7er.mp3`,
	"sentence-4": `${STORAGE_BASE_URL}/card-4-sentence-f6m.mp3`,
	"vocab-5": `${STORAGE_BASE_URL}/card-5-vocab-8o3.mp3`,
	"sentence-5": `${STORAGE_BASE_URL}/card-5-sentence-k2c.mp3`,
	"vocab-6": `${STORAGE_BASE_URL}/card-6-vocab-658.mp3`,
	"sentence-6": `${STORAGE_BASE_URL}/card-6-sentence-hm0.mp3`,
	"vocab-7": `${STORAGE_BASE_URL}/card-7-vocab-7ex.mp3`,
	"sentence-7": `${STORAGE_BASE_URL}/card-7-sentence-iuy.mp3`,
	"vocab-8": `${STORAGE_BASE_URL}/card-8-vocab-66k.mp3`,
	"sentence-8": `${STORAGE_BASE_URL}/card-8-sentence-dwz.mp3`,
	"vocab-9": `${STORAGE_BASE_URL}/card-9-vocab-8mu.mp3`,
	"sentence-9": `${STORAGE_BASE_URL}/card-9-sentence-dun.mp3`,
	"vocab-10": `${STORAGE_BASE_URL}/card-10-vocab-8ni.mp3`,
	"sentence-10": `${STORAGE_BASE_URL}/card-10-sentence-f4v.mp3`,
	"vocab-11": `${STORAGE_BASE_URL}/card-11-vocab-8n3.mp3`,
	"sentence-11": `${STORAGE_BASE_URL}/card-11-sentence-gfq.mp3`,
	"vocab-12": `${STORAGE_BASE_URL}/card-12-vocab-8nx.mp3`,
	"sentence-12": `${STORAGE_BASE_URL}/card-12-sentence-mlg.mp3`,
	"vocab-13": `${STORAGE_BASE_URL}/card-13-vocab-4wr.mp3`,
	"sentence-13": `${STORAGE_BASE_URL}/card-13-sentence-dv4.mp3`,
	"vocab-14": `${STORAGE_BASE_URL}/card-14-vocab-7es.mp3`,
	"sentence-14": `${STORAGE_BASE_URL}/card-14-sentence-f5e.mp3`,
	"vocab-15": `${STORAGE_BASE_URL}/card-15-vocab-7f3.mp3`,
	"sentence-15": `${STORAGE_BASE_URL}/card-15-sentence-f4k.mp3`,
	"vocab-16": `${STORAGE_BASE_URL}/card-16-vocab-67d.mp3`,
	"sentence-16": `${STORAGE_BASE_URL}/card-16-sentence-ge3.mp3`,
	"vocab-17": `${STORAGE_BASE_URL}/card-17-vocab-b4o.mp3`,
	"sentence-17": `${STORAGE_BASE_URL}/card-17-sentence-bfb.mp3`,
};

const MAX_MANUAL_CARD_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_MANUAL_CARD_AUDIO_BYTES = 5 * 1024 * 1024;
const MAX_MANUAL_RECORDING_DURATION_MS = 5_000;
const IMAGE_OVERWRITE_CONFIRM_MESSAGE =
	"Remplacer l'image existante ? Vous pouvez la reinitialiser a tout moment.";
const IMAGE_SIZE_LIMIT_MESSAGE = "L'image doit faire 5 Mo maximum.";
const AUDIO_SIZE_LIMIT_MESSAGE = "L'audio doit faire 5 Mo maximum.";
const AUTO_STOP_RECORDING_MESSAGE =
	"Enregistrement arrete automatiquement apres 5 s.";
const COLLECTED_CARD_AUDIO_UPLOAD_ACCEPT =
	"audio/webm,audio/ogg,audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav";
const COLLECTED_CARD_RECORDING_MIME_TYPES = [
	"audio/webm;codecs=opus",
	"audio/webm",
	"audio/mp4",
] as const;
const COLLECTED_CARD_RECORDING_CONSTRAINTS: MediaTrackConstraints = {
	channelCount: 1,
	echoCancellation: true,
	noiseSuppression: true,
	autoGainControl: true,
};

type EditableCardAudioKind = "vocab" | "sentence";

type EditableCardTarget =
	| {
			kind: "collected";
			cardId: string;
	  }
	| {
			kind: "foundation";
			cardId: string;
	  };

type EditableCardMediaDraft = {
	imageUrl: string | null;
	imageFile: File | null;
	imageMarkedForDeletion: boolean;
	vocabAudioUrl: string | null;
	vocabAudioFile: File | null;
	vocabAudioMarkedForDeletion: boolean;
	sentenceAudioUrl: string | null;
	sentenceAudioFile: File | null;
	sentenceAudioMarkedForDeletion: boolean;
};

type MediaOverrideState = {
	image: boolean;
	vocabAudio: boolean;
	sentenceAudio: boolean;
};

const EMPTY_MEDIA_OVERRIDE_STATE: MediaOverrideState = {
	image: false,
	vocabAudio: false,
	sentenceAudio: false,
};

const hasAnyMediaOverride = (state: MediaOverrideState): boolean => {
	return state.image || state.vocabAudio || state.sentenceAudio;
};

const resolveMediaOverrideStateFromOverlay = (
	overlay: LocalFoundationCardMediaOverlayRecord | null | undefined,
): MediaOverrideState => ({
	image: Boolean(overlay?.hasCustomImage),
	vocabAudio: Boolean(overlay?.hasCustomVocabAudio),
	sentenceAudio: Boolean(overlay?.hasCustomSentenceAudio),
});

const resolveMediaOverrideStateFromCard = (
	card: AnkiCard,
): MediaOverrideState => ({
	image: Boolean(card.hasCustomImage || card.imageHidden),
	vocabAudio: Boolean(card.hasCustomVocabAudio || card.vocabAudioHidden),
	sentenceAudio: Boolean(
		card.hasCustomSentenceAudio || card.sentenceAudioHidden,
	),
});

const buildEditableCardMediaDraft = (urls: {
	imageUrl: string | null;
	vocabAudioUrl: string | null;
	sentenceAudioUrl: string | null;
}): EditableCardMediaDraft => ({
	imageUrl: urls.imageUrl,
	imageFile: null,
	imageMarkedForDeletion: false,
	vocabAudioUrl: urls.vocabAudioUrl,
	vocabAudioFile: null,
	vocabAudioMarkedForDeletion: false,
	sentenceAudioUrl: urls.sentenceAudioUrl,
	sentenceAudioFile: null,
	sentenceAudioMarkedForDeletion: false,
});

const buildCardMediaUrls = (
	card: AnkiCard,
	audioUrls: AudioUrls,
): {
	imageUrl: string | null;
	vocabAudioUrl: string | null;
	sentenceAudioUrl: string | null;
} => ({
	imageUrl: card.image ?? null,
	vocabAudioUrl: card.vocabAudioUrl ?? audioUrls[`vocab-${card.id}`] ?? null,
	sentenceAudioUrl:
		card.sentenceAudioUrl ?? audioUrls[`sentence-${card.id}`] ?? null,
});

const resolveEditableCardTarget = (
	card: AnkiCard,
): EditableCardTarget | null => {
	if (card.vocabularyCardId && card.sourceType === "collected") {
		return {
			kind: "collected",
			cardId: card.vocabularyCardId,
		};
	}

	if (
		card.foundationCardId &&
		(card.source === "foundation" || card.sourceType === "foundation")
	) {
		return {
			kind: "foundation",
			cardId: card.foundationCardId,
		};
	}

	return null;
};

const applyLocalFoundationCardMediaOverlay = (
	baseUrls: {
		imageUrl: string | null;
		vocabAudioUrl: string | null;
		sentenceAudioUrl: string | null;
	},
	overlay: LocalFoundationCardMediaOverlayRecord | null | undefined,
): {
	imageUrl: string | null;
	vocabAudioUrl: string | null;
	sentenceAudioUrl: string | null;
} => ({
	imageUrl: overlay?.imageHidden
		? null
		: (overlay?.imageUrl ?? baseUrls.imageUrl),
	vocabAudioUrl: overlay?.vocabAudioHidden
		? null
		: (overlay?.vocabAudioUrl ?? baseUrls.vocabAudioUrl),
	sentenceAudioUrl: overlay?.sentenceAudioHidden
		? null
		: (overlay?.sentenceAudioUrl ?? baseUrls.sentenceAudioUrl),
});

const buildCardMediaDownloadName = (
	card: AnkiCard,
	kind: "image" | "vocab-audio" | "sentence-audio",
	extension: string,
): string => {
	const baseName = (card.vocabDef || card.vocabBase || "carte")
		.normalize("NFD")
		.replace(/[^\w\s-]/g, "")
		.trim()
		.replace(/\s+/g, "-")
		.toLowerCase();
	const suffix =
		kind === "image"
			? "image"
			: kind === "vocab-audio"
				? "vocab-audio"
				: "sentence-audio";
	return `${baseName || "carte"}-${suffix}.${extension}`;
};

const resolveAudioFileExtension = (file: File): string => {
	const explicitExtension = file.name.split(".").pop()?.trim().toLowerCase();
	if (explicitExtension) {
		return explicitExtension;
	}

	if (file.type.includes("ogg")) {
		return "ogg";
	}

	if (file.type.includes("mpeg") || file.type.includes("mp3")) {
		return "mp3";
	}

	if (file.type.includes("wav")) {
		return "wav";
	}

	return "webm";
};

const resolveCollectedCardRecordingMimeType = (): string | null => {
	if (
		typeof MediaRecorder === "undefined" ||
		typeof MediaRecorder.isTypeSupported !== "function"
	) {
		return null;
	}

	for (const mimeType of COLLECTED_CARD_RECORDING_MIME_TYPES) {
		if (MediaRecorder.isTypeSupported(mimeType)) {
			return mimeType;
		}
	}

	return null;
};

const downloadMediaFile = async (
	url: string,
	fileName: string,
): Promise<void> => {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error("Telechargement impossible.");
	}

	const mediaBlob = await response.blob();
	const objectUrl = URL.createObjectURL(mediaBlob);
	const anchor = document.createElement("a");
	anchor.href = objectUrl;
	anchor.download = fileName;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(objectUrl);
};

const MediaActionButton = ({
	icon,
	onClick,
	disabled = false,
	label,
	busy = false,
	tone = "default",
}: {
	icon:
		| "pencil"
		| "reset"
		| "upload"
		| "download"
		| "trash"
		| "close"
		| "mic"
		| "save"
		| "stop";
	onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
	disabled?: boolean;
	label: string;
	busy?: boolean;
	tone?: "default" | "danger" | "recording";
}) => {
	const [isHovered, setIsHovered] = useState(false);
	const IconComponent =
		icon === "pencil"
			? Pencil
			: icon === "reset"
				? RotateCcw
				: icon === "upload"
					? Upload
					: icon === "download"
						? Download
						: icon === "trash"
							? Trash2
							: icon === "mic"
								? Mic
								: icon === "save"
									? Save
									: icon === "stop"
										? Square
										: X;
	return (
		<button
			type="button"
			onClick={onClick}
			onMouseEnter={() => {
				setIsHovered(true);
			}}
			onMouseLeave={() => {
				setIsHovered(false);
			}}
			disabled={disabled}
			aria-label={label}
			className={`disabled:cursor-not-allowed ${tone === "recording" ? "animate-pulse" : ""}`}
			style={createHtmlButtonStyle({
				hovered: isHovered,
				disabled,
				padding: "0",
				width: "24px",
				height: "24px",
			})}
		>
			{busy ? (
				<Loader2 className="h-3.5 w-3.5 animate-spin text-black" />
			) : (
				<IconComponent className="h-3.5 w-3.5 text-black" />
			)}
		</button>
	);
};

const MediaActionLink = ({ href, label }: { href: string; label: string }) => {
	const [isHovered, setIsHovered] = useState(false);
	return (
		<a
			href={href}
			aria-label={label}
			onClick={(event) => {
				event.stopPropagation();
			}}
			onMouseEnter={() => {
				setIsHovered(true);
			}}
			onMouseLeave={() => {
				setIsHovered(false);
			}}
			style={createHtmlButtonStyle({
				hovered: isHovered,
				padding: "0",
				width: "24px",
				height: "24px",
			})}
		>
			<ExternalLink className="h-3.5 w-3.5 text-black" />
		</a>
	);
};

const EditFooterButton = ({
	icon,
	label,
	onClick,
	disabled = false,
	busy = false,
	tone = "default",
}: {
	icon: "close" | "save";
	label: string;
	onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
	disabled?: boolean;
	busy?: boolean;
	tone?: "default" | "accent";
}) => {
	const [isHovered, setIsHovered] = useState(false);
	const IconComponent = icon === "save" ? Save : X;
	return (
		<button
			type="button"
			onClick={onClick}
			onMouseEnter={() => {
				setIsHovered(true);
			}}
			onMouseLeave={() => {
				setIsHovered(false);
			}}
			disabled={disabled}
			className="inline-flex items-center gap-1.5 disabled:cursor-not-allowed"
			style={createHtmlButtonStyle({
				hovered: isHovered,
				disabled,
				padding: "1px 8px",
			})}
		>
			{busy ? (
				<Loader2 className="h-3.5 w-3.5 animate-spin text-black" />
			) : (
				<IconComponent className="h-3.5 w-3.5 text-black" />
			)}
			<span>{label}</span>
		</button>
	);
};

const AudioButton = ({
	variant,
	audioUrl,
	isLoading: externalLoading,
	isMuted = false,
	onMouseMove,
	onMouseLeave,
}: {
	variant?: "vocab" | "sentence";
	audioUrl: string | null;
	isLoading?: boolean;
	isMuted?: boolean;
	onMouseMove?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
	onMouseLeave?: () => void;
}) => {
	const [isPlaying, setIsPlaying] = useState(false);
	const [isHovered, setIsHovered] = useState(false);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	const playAudio = async (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!audioUrl || isPlaying || externalLoading || isMuted) return;

		try {
			if (!audioRef.current) {
				audioRef.current = new Audio(audioUrl);
				audioRef.current.preload = "none";
			} else {
				audioRef.current.src = audioUrl;
				audioRef.current.preload = "none";
			}

			const audio = audioRef.current;
			setIsPlaying(true);
			audio.onended = () => setIsPlaying(false);
			audio.onerror = () => setIsPlaying(false);

			audio.currentTime = 0;
			await audio.play();
		} catch (error) {
			console.error("Error playing audio:", error);
			setIsPlaying(false);
		}
	};

	useEffect(() => {
		if (!isMuted || !audioRef.current) {
			return;
		}

		audioRef.current.pause();
		audioRef.current.currentTime = 0;
		audioRef.current.onended = null;
		audioRef.current.onerror = null;
		setIsPlaying(false);
	}, [isMuted]);

	const isLoading = externalLoading && !audioUrl;

	return (
		<button
			type="button"
			onMouseEnter={() => {
				setIsHovered(true);
			}}
			onMouseLeave={() => {
				setIsHovered(false);
				onMouseLeave?.();
			}}
			className="cursor-pointer disabled:cursor-not-allowed"
			style={createHtmlButtonStyle({
				hovered: isHovered || isPlaying,
				disabled: isLoading || !audioUrl || isMuted,
				padding: "0",
				width: variant === "vocab" ? "28px" : "26px",
				height: variant === "vocab" ? "28px" : "26px",
			})}
			onClick={playAudio}
			onMouseMove={onMouseMove}
			aria-label="Écouter"
			aria-pressed={isPlaying}
			disabled={isLoading || !audioUrl || isMuted}
		>
			{isLoading ? (
				<Loader2 className="h-3.5 w-3.5 animate-spin text-black" />
			) : (
				<Volume2
					className="ml-0.5"
					size={variant === "vocab" ? 14 : 12}
					color="#000000"
				/>
			)}
		</button>
	);
};

export const CardFront = ({
	card,
	showVowels,
	onToggleVowels,
	onFlip,
	onFail: _onFail,
	onPass: _onPass,
	failHint: _failHint,
	passHint: _passHint,
	variant = "default",
	isFlipping: _isFlipping = false,
	layoutMetrics = DEFAULT_SHORTS_LAYOUT,
	showSourceChip = true,
	sourceChipPlacement = "top",
	sourceChipTone = "default",
	shortsFlipLabel,
	shortsVowelsTooltip,
	shortsExtraControl,
	hideShortsUtilityControls = false,
}: {
	card: AnkiCard;
	showVowels: boolean;
	onToggleVowels: () => void;
	onFlip: () => void;
	onFail?: () => void;
	onPass?: () => void;
	failHint?: string;
	passHint?: string;
	variant?: "default" | "shorts";
	isFlipping?: boolean;
	layoutMetrics?: ShortsLayoutMetrics;
	showSourceChip?: boolean;
	sourceChipPlacement?: "top" | "bottom";
	sourceChipTone?: SourceChipTone;
	shortsFlipLabel?: string;
	shortsVowelsTooltip?: string;
	shortsExtraControl?: ShortsExtraControl;
	hideShortsUtilityControls?: boolean;
}) => {
	const isShorts = variant === "shorts";
	const [isShortsVowelsHovered, setIsShortsVowelsHovered] = useState(false);
	const [isShortsFlipHovered, setIsShortsFlipHovered] = useState(false);
	const [isDefaultVowelsHovered, setIsDefaultVowelsHovered] = useState(false);
	const [isDefaultFlipHovered, setIsDefaultFlipHovered] = useState(false);
	const frontPaddingX = Math.round(16 * layoutMetrics.paddingScale);
	const frontPaddingTop = Math.round(22 * layoutMetrics.paddingScale);
	const frontPaddingBottom = Math.round(56 * layoutMetrics.paddingScale);
	const sentenceSpacingTop = Math.round(12 * layoutMetrics.paddingScale);
	const sentenceSpacingBottom = Math.round(14 * layoutMetrics.paddingScale);
	const toolsTopMargin = Math.round(10 * layoutMetrics.paddingScale);
	const iconButtonSize = clampNumber(36 * layoutMetrics.buttonScale, 30, 36);
	const iconSize = clampNumber(16 * layoutMetrics.buttonScale, 13, 16);
	const sourceChipClassName =
		sourceChipPlacement === "bottom"
			? "absolute inset-x-0 bottom-3 z-20 pointer-events-none"
			: "";
	const trimmedShortsFlipLabel = shortsFlipLabel?.trim();
	const hasShortsFlipLabel = Boolean(trimmedShortsFlipLabel);
	const shortsVowelsButton = (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onToggleVowels();
			}}
			onMouseEnter={() => {
				setIsShortsVowelsHovered(true);
			}}
			onMouseLeave={() => {
				setIsShortsVowelsHovered(false);
			}}
			className="flex items-center justify-center"
			style={{
				...createHtmlButtonStyle({
					hovered: isShortsVowelsHovered,
					padding: "0",
					width: `${iconButtonSize}px`,
					height: `${iconButtonSize}px`,
				}),
			}}
			aria-label="Afficher les voyelles"
		>
			<VowelsIcon size={iconSize} />
		</button>
	);
	const shortsVowelsControl = (
		<DelayedTooltipControl label="Afficher les voyelles">
			{shortsVowelsButton}
		</DelayedTooltipControl>
	);
	const shortsFlipControl = hasShortsFlipLabel ? (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onFlip();
			}}
			onMouseEnter={() => {
				setIsShortsFlipHovered(true);
			}}
			onMouseLeave={() => {
				setIsShortsFlipHovered(false);
			}}
			className="flex items-center justify-center"
			style={createHtmlButtonStyle({ hovered: isShortsFlipHovered })}
			aria-label="Retourner la carte"
		>
			{trimmedShortsFlipLabel}
		</button>
	) : (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onFlip();
			}}
			onMouseEnter={() => {
				setIsShortsFlipHovered(true);
			}}
			onMouseLeave={() => {
				setIsShortsFlipHovered(false);
			}}
			className="flex items-center justify-center"
			style={{
				...createHtmlButtonStyle({
					hovered: isShortsFlipHovered,
					padding: "0",
					width: `${iconButtonSize}px`,
					height: `${iconButtonSize}px`,
				}),
			}}
			aria-label="Retourner la carte"
		>
			<FlipCardIcon size={iconSize} />
		</button>
	);
	const shortsFlipButton = hasShortsFlipLabel ? (
		<DelayedTooltipControl label="Retourner la carte">
			{shortsFlipControl}
		</DelayedTooltipControl>
	) : (
		<DelayedTooltipControl label="Retourner la carte">
			{shortsFlipControl}
		</DelayedTooltipControl>
	);
	const resolvedShortsExtraControl =
		typeof shortsExtraControl === "function"
			? shortsExtraControl({ iconButtonSize, iconSize })
			: shortsExtraControl;
	const hasResolvedShortsExtraControl =
		resolvedShortsExtraControl !== null &&
		resolvedShortsExtraControl !== undefined;

	return (
		<div className="absolute inset-0 flex flex-col overflow-hidden">
			{showSourceChip && (
				<SourceChip
					card={card}
					className={sourceChipClassName}
					tone={sourceChipTone}
				/>
			)}
			<div
				data-testid={isShorts ? "shorts-front-content" : undefined}
				className={`relative flex flex-1 flex-col items-center justify-start ${
					isShorts ? "overflow-hidden" : ""
				}`}
				style={{
					background: theme.backgroundWrap,
					paddingInline: `${frontPaddingX}px`,
					paddingTop: `${frontPaddingTop}px`,
					paddingBottom: isShorts ? `${frontPaddingBottom}px` : "1rem",
				}}
			>
				<div
					className="sent-center relative z-30 w-full text-center"
					style={{
						marginBottom: `${sentenceSpacingBottom}px`,
						paddingTop: `${sentenceSpacingTop}px`,
					}}
				>
					<ArabicSentence
						sentBase={card.sentBase}
						sentFull={card.sentFull}
						vocabBase={card.vocabBase}
						showVowels={showVowels}
						layoutMetrics={layoutMetrics}
						maxLines={isShorts ? 5 : undefined}
					/>
				</div>
				{variant === "default" ? (
					<div className="flex flex-col items-center gap-2">
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onToggleVowels();
							}}
							onMouseEnter={() => {
								setIsDefaultVowelsHovered(true);
							}}
							onMouseLeave={() => {
								setIsDefaultVowelsHovered(false);
							}}
							className="flex w-48 items-center justify-center gap-2"
							style={createHtmlButtonStyle({ hovered: isDefaultVowelsHovered })}
						>
							<VowelsIcon size={14} />
							Afficher voyelles
						</button>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onFlip();
							}}
							onMouseEnter={() => {
								setIsDefaultFlipHovered(true);
							}}
							onMouseLeave={() => {
								setIsDefaultFlipHovered(false);
							}}
							className="flex w-48 items-center justify-center gap-2"
							style={createHtmlButtonStyle({ hovered: isDefaultFlipHovered })}
						>
							<FlipCardIcon size={14} />
							Retourner la carte
						</button>
					</div>
				) : !hideShortsUtilityControls || hasResolvedShortsExtraControl ? (
					<div
						className="flex justify-center gap-3"
						style={{ marginTop: `${toolsTopMargin}px` }}
					>
						{hideShortsUtilityControls ? null : shortsVowelsControl}
						{hideShortsUtilityControls ? null : shortsFlipButton}
						{resolvedShortsExtraControl ?? null}
					</div>
				) : null}
			</div>
			{variant === "default" && (
				<div
					className="px-4 py-2 text-center text-xs"
					style={{ background: theme.sideBars, color: theme.textSummary }}
				>
					Vocab. Fondation
				</div>
			)}
		</div>
	);
};

const ImageSection = ({
	image,
	vocabDef,
	sourceLinkUrl = null,
	imageSize = "default",
	imageLoading = "lazy",
	isEditable = false,
	isEditMode = false,
	isImageBusy = false,
	isSaveBusy = false,
	isFooterDisabled = false,
	canResetMedia = false,
	isResetBusy = false,
	onEnterEditMode,
	onResetMedia,
	onCancelEditMode,
	onSaveEditMode,
	onRequestUpload,
	onDownload,
	onDelete,
	onImageChange,
	imageInputRef,
}: {
	image: string | null;
	vocabDef: string;
	sourceLinkUrl?: string | null;
	imageSize?: "default" | "compact" | "review";
	imageLoading?: "lazy" | "eager";
	isEditable?: boolean;
	isEditMode?: boolean;
	isImageBusy?: boolean;
	isSaveBusy?: boolean;
	isFooterDisabled?: boolean;
	canResetMedia?: boolean;
	isResetBusy?: boolean;
	onEnterEditMode?: () => void;
	onResetMedia?: () => void;
	onCancelEditMode?: () => void;
	onSaveEditMode?: () => void;
	onRequestUpload?: () => void;
	onDownload?: () => void;
	onDelete?: () => void;
	onImageChange?: (event: ChangeEvent<HTMLInputElement>) => void;
	imageInputRef?: Ref<HTMLInputElement>;
}) => {
	const minHeight =
		imageSize === "compact"
			? "7rem"
			: imageSize === "review"
				? "9.5rem"
				: "8.5rem";

	const cancelDisabled = isSaveBusy;
	const saveDisabled = isFooterDisabled || isSaveBusy;

	return (
		<div className="mt-3">
			<div
				className="relative overflow-hidden rounded-xl"
				style={{
					border: `1px solid ${theme.borderWrap}`,
					background: image
						? `color-mix(in srgb, ${theme.backgroundWrap} 90%, #fff 10%)`
						: "rgba(255,255,255,0.08)",
					minHeight,
				}}
			>
				<input
					type="file"
					accept="image/*"
					className="hidden"
					ref={imageInputRef}
					onChange={onImageChange}
				/>
				<div className="flex h-full w-full items-center justify-center p-2">
					{image ? (
						<img
							src={image}
							alt={vocabDef}
							loading={imageLoading}
							decoding="async"
							className={
								imageSize === "compact"
									? "h-auto w-auto max-h-24 max-w-[72%] rounded object-contain"
									: imageSize === "review"
										? "h-auto w-auto max-h-32 max-w-[80%] rounded object-contain"
										: "max-h-40 w-auto max-w-full rounded object-contain"
							}
						/>
					) : (
						<ImageOff className="h-5 w-5 text-black/40" />
					)}
				</div>
				{isEditable && isEditMode ? (
					<div className="absolute bottom-2 right-2 flex items-center gap-1">
						<MediaActionButton
							icon="upload"
							onClick={(event) => {
								event.stopPropagation();
								onRequestUpload?.();
							}}
							disabled={isImageBusy}
							label="Téléverser une image"
						/>
						{image ? (
							<>
								<MediaActionButton
									icon="download"
									onClick={(event) => {
										event.stopPropagation();
										onDownload?.();
									}}
									disabled={isImageBusy}
									label="Télécharger l'image"
								/>
								<MediaActionButton
									icon="trash"
									onClick={(event) => {
										event.stopPropagation();
										onDelete?.();
									}}
									disabled={isImageBusy}
									label="Supprimer l'image"
									tone="danger"
								/>
							</>
						) : null}
					</div>
				) : null}
			</div>
			{isEditable ? (
				<div className="mt-2 flex justify-end gap-3">
					{isEditMode ? (
						<>
							<EditFooterButton
								icon="close"
								label="Annuler"
								onClick={(event) => {
									event.stopPropagation();
									onCancelEditMode?.();
								}}
								disabled={cancelDisabled}
							/>
							<EditFooterButton
								icon="save"
								label="Enregistrer"
								onClick={(event) => {
									event.stopPropagation();
									onSaveEditMode?.();
								}}
								disabled={saveDisabled}
								busy={isSaveBusy}
								tone="accent"
							/>
						</>
					) : (
						<>
							{sourceLinkUrl ? (
								<MediaActionLink
									href={sourceLinkUrl}
									label="Revenir à la source exacte"
								/>
							) : null}
							{canResetMedia ? (
								<DelayedTooltipControl label="Réinitialiser">
									<span className="inline-flex">
										<MediaActionButton
											icon="reset"
											onClick={(event) => {
												event.stopPropagation();
												onResetMedia?.();
											}}
											disabled={isFooterDisabled}
											busy={isResetBusy}
											label="Réinitialiser les médias personnalisés"
										/>
									</span>
								</DelayedTooltipControl>
							) : null}
							<MediaActionButton
								icon="pencil"
								onClick={(event) => {
									event.stopPropagation();
									onEnterEditMode?.();
								}}
								disabled={isFooterDisabled}
								label="Modifier les médias de la carte"
							/>
						</>
					)}
				</div>
			) : null}
		</div>
	);
};

export const CardBack = ({
	card,
	isFlipped,
	showVowels,
	onToggleVowels,
	onFlip,
	audioUrls,
	isLoadingAudio,
	flipKey,
	showImage,
	imageLoading = "lazy",
	onVocabAudioMouseMove,
	onVocabAudioMouseLeave,
	onSentenceAudioMouseMove,
	onSentenceAudioMouseLeave,
	onFail,
	onPass,
	failHint,
	passHint,
	actionGradients,
	variant = "default",
	isFlipping = false,
	layoutMetrics = DEFAULT_SHORTS_LAYOUT,
	imageSize = "default",
	showSourceChip = true,
	sourceChipTone = "default",
	shortsFlipLabel,
	shortsVowelsTooltip,
	hideShortsUtilityControls = false,
	hideShortsActionZone = false,
	muteFlipAudio = false,
	audioMuted = false,
}: {
	card: AnkiCard;
	isFlipped: boolean;
	showVowels: boolean;
	onToggleVowels: () => void;
	onFlip: () => void;
	audioUrls: AudioUrls;
	isLoadingAudio: boolean;
	flipKey: number;
	showImage: boolean;
	imageLoading?: "lazy" | "eager";
	onVocabAudioMouseMove: (e: ReactMouseEvent) => void;
	onVocabAudioMouseLeave: () => void;
	onSentenceAudioMouseMove: (e: ReactMouseEvent) => void;
	onSentenceAudioMouseLeave: () => void;
	onFail?: () => void;
	onPass?: () => void;
	failHint?: string;
	passHint?: string;
	actionGradients?: {
		failBase?: string;
		failHover?: string;
		passBase?: string;
		passHover?: string;
	};
	variant?: "default" | "shorts";
	isFlipping?: boolean;
	layoutMetrics?: ShortsLayoutMetrics;
	imageSize?: "default" | "compact" | "review";
	showSourceChip?: boolean;
	sourceChipTone?: SourceChipTone;
	shortsFlipLabel?: string;
	shortsVowelsTooltip?: string;
	hideShortsUtilityControls?: boolean;
	hideShortsActionZone?: boolean;
	muteFlipAudio?: boolean;
	audioMuted?: boolean;
}) => {
	const isEnglishApp = useIsEnglishApp();
	const showTranslationLabel = isEnglishApp
		? "See translation"
		: "Voir la traduction";
	const [showTranslation, setShowTranslation] = useState(false);
	const [allowFallbackScroll, setAllowFallbackScroll] = useState(false);
	const [isEditMode, setIsEditMode] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [recordingKind, setRecordingKind] =
		useState<EditableCardAudioKind | null>(null);
	const [busyKind, setBusyKind] = useState<
		null | "image" | "vocab" | "sentence"
	>(null);
	const [isTranslationButtonHovered, setIsTranslationButtonHovered] =
		useState(false);
	const [isShortsVowelsHovered, setIsShortsVowelsHovered] = useState(false);
	const [isShortsFlipHovered, setIsShortsFlipHovered] = useState(false);
	const [isBackFlipHovered, setIsBackFlipHovered] = useState(false);
	const isShorts = variant === "shorts";
	const editableCardTarget = resolveEditableCardTarget(card);
	const isAuthenticatedUser = readActiveUserId().trim().length > 0;
	const editableCard = editableCardTarget !== null && isAuthenticatedUser;
	const [persistedMediaOverrides, setPersistedMediaOverrides] =
		useState<MediaOverrideState>(() => resolveMediaOverrideStateFromCard(card));
	const hasPersistedMediaOverrides = hasAnyMediaOverride(
		persistedMediaOverrides,
	);
	const imageInputRef = useRef<HTMLInputElement | null>(null);
	const vocabAudioInputRef = useRef<HTMLInputElement | null>(null);
	const sentenceAudioInputRef = useRef<HTMLInputElement | null>(null);
	const [mediaUrls, setMediaUrls] = useState(() =>
		buildCardMediaUrls(card, audioUrls),
	);
	const [mediaDraft, setMediaDraft] = useState(() =>
		buildEditableCardMediaDraft(buildCardMediaUrls(card, audioUrls)),
	);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const recordingAutoStopTimeoutRef = useRef<number | null>(null);
	const recordingStreamRef = useRef<MediaStream | null>(null);
	const recordingChunksRef = useRef<BlobPart[]>([]);
	const recordingKindRef = useRef<EditableCardAudioKind | null>(null);
	const previewUrlsRef = useRef({
		imageUrl: null as string | null,
		vocabAudioUrl: null as string | null,
		sentenceAudioUrl: null as string | null,
	});
	const vocabAudioUrl = isEditMode
		? mediaDraft.vocabAudioUrl
		: mediaUrls.vocabAudioUrl;
	const sentenceAudioUrl = isEditMode
		? mediaDraft.sentenceAudioUrl
		: mediaUrls.sentenceAudioUrl;
	const currentImageUrl = isEditMode ? mediaDraft.imageUrl : mediaUrls.imageUrl;
	const isRecording = recordingKind !== null;
	const sourceLinkUrl =
		card.sourceType === "collected"
			? (card.sourceLinkUrl ??
				buildCollectedCardSourceLinkPath({
					sourceVideoId: card.sourceVideoId ?? null,
					sourceVideoIsShort: card.sourceVideoIsShort ?? null,
					sourceWordStartSeconds: card.sourceWordStartSeconds ?? null,
				}))
			: null;
	const scrollContentRef = useRef<HTMLDivElement | null>(null);
	const overlayTouchYRef = useRef<number | null>(null);
	const autoplayRunRef = useRef(0);
	const sentenceAutoplayRef = useRef<HTMLAudioElement | null>(null);
	const vocabAutoplayRef = useRef<HTMLAudioElement | null>(null);
	const failBaseGradient =
		actionGradients?.failBase ??
		"linear-gradient(to top, rgba(220,38,38,0.14) 0%, rgba(220,38,68,0.02) 45%, rgba(220,38,68,0) 100%)";
	const failHoverGradient =
		actionGradients?.failHover ??
		"linear-gradient(to top, rgba(239,68,68,0.22) 0%, rgba(239,68,68,0.05) 45%, rgba(239,68,68,0) 100%)";
	const passBaseGradient =
		actionGradients?.passBase ??
		"linear-gradient(to top, rgba(5,150,105,0.14) 0%, rgba(5,150,105,0.02) 45%, rgba(5,150,105,0) 100%)";
	const passHoverGradient =
		actionGradients?.passHover ??
		"linear-gradient(to top, rgba(16,185,129,0.22) 0%, rgba(16,185,129,0.05) 45%, rgba(16,185,129,0) 100%)";
	const contentPaddingX = Math.round(16 * layoutMetrics.paddingScale);
	const contentPaddingTop = Math.round(14 * layoutMetrics.paddingScale);
	const contentPaddingY = Math.round(12 * layoutMetrics.paddingScale);
	const sentenceSpacingTop = Math.round(10 * layoutMetrics.paddingScale);
	const actionZoneHeight = clampNumber(22 * layoutMetrics.paddingScale, 18, 22);
	const actionReserveSpace = Math.round(
		clampNumber(74 * layoutMetrics.paddingScale, 58, 74),
	);
	const translationButtonFontSize = clampNumber(
		14 * layoutMetrics.buttonScale,
		11,
		14,
	);
	const translationButtonPaddingX = Math.round(12 * layoutMetrics.paddingScale);
	const translationButtonPaddingY = Math.round(5 * layoutMetrics.paddingScale);
	const translationTextFontSize = clampNumber(
		14 * layoutMetrics.frenchScale,
		12,
		14,
	);
	const vocabDefFontSize = clampNumber(18 * layoutMetrics.frenchScale, 14, 22);
	const detailTopPadding = Math.round(16 * layoutMetrics.paddingScale);
	const detailBottomPadding = Math.round(12 * layoutMetrics.paddingScale);
	const detailHorizontalPadding = Math.round(12 * layoutMetrics.paddingScale);
	const iconButtonSize = clampNumber(36 * layoutMetrics.buttonScale, 30, 36);
	const iconSize = clampNumber(16 * layoutMetrics.buttonScale, 13, 16);
	const trimmedShortsFlipLabel = shortsFlipLabel?.trim();
	const hasShortsFlipLabel = Boolean(trimmedShortsFlipLabel);
	const shortsVowelsButton = (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onToggleVowels();
			}}
			onMouseEnter={() => {
				setIsShortsVowelsHovered(true);
			}}
			onMouseLeave={() => {
				setIsShortsVowelsHovered(false);
			}}
			className="flex items-center justify-center"
			style={{
				...createHtmlButtonStyle({
					hovered: isShortsVowelsHovered,
					padding: "0",
					width: `${iconButtonSize}px`,
					height: `${iconButtonSize}px`,
				}),
			}}
			aria-label="Afficher les voyelles"
		>
			<VowelsIcon size={iconSize} />
		</button>
	);
	const shortsVowelsControl = (
		<DelayedTooltipControl label="Afficher les voyelles">
			{shortsVowelsButton}
		</DelayedTooltipControl>
	);
	const shortsFlipControl = hasShortsFlipLabel ? (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onFlip();
			}}
			onMouseEnter={() => {
				setIsShortsFlipHovered(true);
			}}
			onMouseLeave={() => {
				setIsShortsFlipHovered(false);
			}}
			className="flex items-center justify-center"
			style={createHtmlButtonStyle({ hovered: isShortsFlipHovered })}
			aria-label="Retourner la carte"
		>
			{trimmedShortsFlipLabel}
		</button>
	) : (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onFlip();
			}}
			onMouseEnter={() => {
				setIsShortsFlipHovered(true);
			}}
			onMouseLeave={() => {
				setIsShortsFlipHovered(false);
			}}
			className="flex items-center justify-center"
			style={{
				...createHtmlButtonStyle({
					hovered: isShortsFlipHovered,
					padding: "0",
					width: `${iconButtonSize}px`,
					height: `${iconButtonSize}px`,
				}),
			}}
			aria-label="Retourner la carte"
		>
			<FlipCardIcon size={iconSize} />
		</button>
	);
	const shortsFlipButton = hasShortsFlipLabel ? (
		<DelayedTooltipControl label="Retourner la carte">
			{shortsFlipControl}
		</DelayedTooltipControl>
	) : (
		<DelayedTooltipControl label="Retourner la carte">
			{shortsFlipControl}
		</DelayedTooltipControl>
	);
	const isSaveDisabled = isSaving || isRecording;
	const isImageBusy = busyKind === "image";
	const revokeObjectUrl = (url: string | null) => {
		if (url && url.startsWith("blob:")) {
			URL.revokeObjectURL(url);
		}
	};

	const stopRecordingStream = () => {
		if (recordingStreamRef.current) {
			recordingStreamRef.current.getTracks().forEach((track) => track.stop());
			recordingStreamRef.current = null;
		}
	};

	const clearRecordingAutoStopTimeout = () => {
		if (recordingAutoStopTimeoutRef.current !== null) {
			window.clearTimeout(recordingAutoStopTimeoutRef.current);
			recordingAutoStopTimeoutRef.current = null;
		}
	};

	const stopRecording = async ({
		discard,
		autoStopped,
	}: {
		discard?: boolean;
		autoStopped?: boolean;
	} = {}) => {
		clearRecordingAutoStopTimeout();
		const recorder = mediaRecorderRef.current;
		if (!recorder) {
			setRecordingKind(null);
			return;
		}

		await new Promise<void>((resolve) => {
			recorder.onstop = () => {
				const chunks = recordingChunksRef.current;
				recordingChunksRef.current = [];
				mediaRecorderRef.current = null;
				stopRecordingStream();
				const kind = recordingKindRef.current;
				if (!discard && kind && chunks.length > 0) {
					const mimeType = (recorder.mimeType || "audio/webm").split(";")[0];
					const blob = new Blob(chunks, { type: mimeType });
					const rawExtension = mimeType.split("/")[1] || "webm";
					const tempFile = new File([blob], `recording.${rawExtension}`, {
						type: mimeType,
					});
					const extension = resolveAudioFileExtension(tempFile);
					const file = new File([blob], `recording-${kind}.${extension}`, {
						type: mimeType,
					});
					const previewUrl = URL.createObjectURL(blob);
					setMediaDraft((current) =>
						kind === "vocab"
							? {
									...current,
									vocabAudioFile: file,
									vocabAudioUrl: previewUrl,
									vocabAudioMarkedForDeletion: false,
								}
							: {
									...current,
									sentenceAudioFile: file,
									sentenceAudioUrl: previewUrl,
									sentenceAudioMarkedForDeletion: false,
								},
					);
					if (autoStopped) {
						toast.success(AUTO_STOP_RECORDING_MESSAGE);
					}
				}
				setRecordingKind(null);
				recordingKindRef.current = null;
				resolve();
			};
			recorder.stop();
		});
	};

	const startRecording = async (kind: EditableCardAudioKind) => {
		if (recordingKindRef.current || !editableCard || !isEditMode || isSaving) {
			return;
		}

		if (
			typeof navigator === "undefined" ||
			!navigator.mediaDevices?.getUserMedia
		) {
			toast.error("Microphone indisponible.");
			return;
		}

		if (typeof MediaRecorder === "undefined") {
			toast.error("Enregistrement audio non supporte.");
			return;
		}

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: COLLECTED_CARD_RECORDING_CONSTRAINTS,
			});
			recordingStreamRef.current = stream;
			const preferredMimeType = resolveCollectedCardRecordingMimeType();
			const recorder = preferredMimeType
				? new MediaRecorder(stream, { mimeType: preferredMimeType })
				: new MediaRecorder(stream);
			recordingChunksRef.current = [];
			recorder.ondataavailable = (event) => {
				if (event.data && event.data.size > 0) {
					recordingChunksRef.current.push(event.data);
				}
			};
			recordingKindRef.current = kind;
			setRecordingKind(kind);
			mediaRecorderRef.current = recorder;
			recorder.start();
			clearRecordingAutoStopTimeout();
			recordingAutoStopTimeoutRef.current = window.setTimeout(() => {
				if (recordingKindRef.current === kind) {
					void stopRecording({ autoStopped: true });
				}
			}, MAX_MANUAL_RECORDING_DURATION_MS);
		} catch (error) {
			clearRecordingAutoStopTimeout();
			stopRecordingStream();
			setRecordingKind(null);
			toast.error(
				error instanceof Error
					? error.message
					: "Impossible d'activer le microphone.",
			);
		}
	};

	useEffect(() => {
		const baseUrls = buildCardMediaUrls(card, audioUrls);
		let isCancelled = false;

		setIsEditMode(false);
		setBusyKind(null);
		setIsSaving(false);
		if (recordingKindRef.current) {
			void stopRecording({ discard: true });
		}

		const syncMediaUrls = async () => {
			if (editableCardTarget?.kind === "foundation") {
				const overlaysById =
					await resolveLocalFoundationCardMediaOverlayByCardId([
						editableCardTarget.cardId,
					]);
				if (isCancelled) {
					return;
				}
				const overlay = overlaysById.get(editableCardTarget.cardId);

				const nextUrls = applyLocalFoundationCardMediaOverlay(
					baseUrls,
					overlay,
				);
				setMediaUrls(nextUrls);
				setMediaDraft(buildEditableCardMediaDraft(nextUrls));
				setPersistedMediaOverrides(
					resolveMediaOverrideStateFromOverlay(overlay),
				);
				return;
			}

			setMediaUrls(baseUrls);
			setMediaDraft(buildEditableCardMediaDraft(baseUrls));
			setPersistedMediaOverrides(
				editableCardTarget?.kind === "collected"
					? resolveMediaOverrideStateFromCard(card)
					: EMPTY_MEDIA_OVERRIDE_STATE,
			);
		};

		void syncMediaUrls();

		return () => {
			isCancelled = true;
		};
	}, [
		audioUrls,
		card.foundationCardId,
		card.id,
		card.image,
		card.sentenceAudioUrl,
		card.source,
		card.sourceType,
		card.vocabAudioUrl,
		editableCardTarget?.cardId,
		editableCardTarget?.kind,
	]);

	useEffect(() => {
		recordingKindRef.current = recordingKind;
	}, [recordingKind]);

	useEffect(() => {
		return () => {
			if (recordingAutoStopTimeoutRef.current !== null) {
				window.clearTimeout(recordingAutoStopTimeoutRef.current);
				recordingAutoStopTimeoutRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		const prev = previewUrlsRef.current;
		if (prev.imageUrl !== mediaDraft.imageUrl) {
			revokeObjectUrl(prev.imageUrl);
		}
		if (prev.vocabAudioUrl !== mediaDraft.vocabAudioUrl) {
			revokeObjectUrl(prev.vocabAudioUrl);
		}
		if (prev.sentenceAudioUrl !== mediaDraft.sentenceAudioUrl) {
			revokeObjectUrl(prev.sentenceAudioUrl);
		}
		previewUrlsRef.current = {
			imageUrl: mediaDraft.imageUrl,
			vocabAudioUrl: mediaDraft.vocabAudioUrl,
			sentenceAudioUrl: mediaDraft.sentenceAudioUrl,
		};
	}, [
		mediaDraft.imageUrl,
		mediaDraft.sentenceAudioUrl,
		mediaDraft.vocabAudioUrl,
	]);

	useEffect(() => {
		if (!isShorts) {
			setAllowFallbackScroll(false);
			return;
		}

		const container = scrollContentRef.current;
		if (!container) {
			return;
		}

		const refreshOverflowState = () => {
			const overflow = container.scrollHeight - container.clientHeight;
			setAllowFallbackScroll(overflow > 24);
		};

		refreshOverflowState();

		if (typeof ResizeObserver === "undefined") {
			return;
		}

		const observer = new ResizeObserver(refreshOverflowState);
		observer.observe(container);
		const firstChild = container.firstElementChild;
		if (firstChild instanceof HTMLElement) {
			observer.observe(firstChild);
		}

		return () => {
			observer.disconnect();
		};
	}, [isShorts]);

	const scrollBackContentBy = (deltaY: number): boolean => {
		if (!isShorts || !allowFallbackScroll) {
			return false;
		}

		const container = scrollContentRef.current;
		if (!container) {
			return false;
		}

		const maxScrollTop = Math.max(
			0,
			container.scrollHeight - container.clientHeight,
		);
		if (maxScrollTop <= 0) {
			return false;
		}

		const nextScrollTop = Math.min(
			maxScrollTop,
			Math.max(0, container.scrollTop + deltaY),
		);
		if (nextScrollTop === container.scrollTop) {
			return false;
		}

		container.scrollTop = nextScrollTop;
		return true;
	};

	const handleOverlayWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
		if (!scrollBackContentBy(event.deltaY)) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
	};

	const handleOverlayTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
		overlayTouchYRef.current = event.touches[0]?.clientY ?? null;
	};

	const handleOverlayTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
		const currentTouchY = event.touches[0]?.clientY;
		const previousTouchY = overlayTouchYRef.current;
		if (
			typeof currentTouchY !== "number" ||
			typeof previousTouchY !== "number"
		) {
			return;
		}

		overlayTouchYRef.current = currentTouchY;
		const deltaY = previousTouchY - currentTouchY;
		if (!scrollBackContentBy(deltaY)) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
	};

	const handleOverlayTouchEnd = () => {
		overlayTouchYRef.current = null;
	};

	useEffect(() => {
		autoplayRunRef.current += 1;
		const runId = autoplayRunRef.current;

		const stopAudio = (audioRef: { current: HTMLAudioElement | null }) => {
			if (!audioRef.current) {
				return;
			}
			audioRef.current.pause();
			audioRef.current.currentTime = 0;
			audioRef.current.onended = null;
			audioRef.current.onerror = null;
		};

		if (!isFlipped || muteFlipAudio) {
			stopAudio(sentenceAutoplayRef);
			stopAudio(vocabAutoplayRef);
			return;
		}

		const playClip = async (
			audioRef: { current: HTMLAudioElement | null },
			audioUrl: string | null,
		): Promise<void> => {
			if (!audioUrl || autoplayRunRef.current !== runId) {
				return;
			}

			if (!audioRef.current) {
				audioRef.current = new Audio(audioUrl);
				audioRef.current.preload = "none";
			} else {
				audioRef.current.pause();
				audioRef.current.src = audioUrl;
				audioRef.current.preload = "none";
			}

			const audio = audioRef.current;
			audio.currentTime = 0;

			await audio.play();

			await new Promise<void>((resolve) => {
				audio.onended = () => resolve();
				audio.onerror = () => resolve();
			});

			audio.onended = null;
			audio.onerror = null;
		};

		void (async () => {
			try {
				await playClip(sentenceAutoplayRef, sentenceAudioUrl);
				if (autoplayRunRef.current !== runId) {
					return;
				}
				await playClip(vocabAutoplayRef, vocabAudioUrl);
			} catch {
				return;
			}
		})();

		return () => {
			autoplayRunRef.current += 1;
			stopAudio(sentenceAutoplayRef);
			stopAudio(vocabAutoplayRef);
		};
	}, [isFlipped, muteFlipAudio, sentenceAudioUrl, vocabAudioUrl]);

	const handleEnterEditMode = () => {
		if (!editableCard || isSaving) {
			return;
		}
		setMediaDraft(buildEditableCardMediaDraft(mediaUrls));
		setIsEditMode(true);
	};

	const handleCancelEditMode = async () => {
		if (recordingKindRef.current) {
			await stopRecording({ discard: true });
		}
		setMediaDraft(buildEditableCardMediaDraft(mediaUrls));
		setIsEditMode(false);
	};

	const handleSaveEditMode = async () => {
		if (!editableCardTarget) {
			setIsEditMode(false);
			return;
		}

		const hasUploads = Boolean(
			mediaDraft.imageFile ||
				mediaDraft.vocabAudioFile ||
				mediaDraft.sentenceAudioFile,
		);
		const hasDeletions = Boolean(
			mediaDraft.imageMarkedForDeletion ||
				mediaDraft.vocabAudioMarkedForDeletion ||
				mediaDraft.sentenceAudioMarkedForDeletion,
		);
		if (!hasUploads && !hasDeletions) {
			setIsEditMode(false);
			return;
		}

		setIsSaving(true);
		let nextUrls = { ...mediaUrls };
		let nextOverrides: MediaOverrideState = { ...persistedMediaOverrides };
		let hadError = false;
		try {
			if (hasUploads) {
				const uploadedMediaResult =
					editableCardTarget.kind === "foundation"
						? await saveLocalFoundationCardMediaAssets({
								foundationCardId: editableCardTarget.cardId,
								imageFile: mediaDraft.imageFile,
								vocabAudioFile: mediaDraft.vocabAudioFile,
								sentenceAudioFile: mediaDraft.sentenceAudioFile,
							})
						: await (async () => {
								const result = await persistUserVocabularyCardMediaAssets(
									{
										vocabularyCardId: editableCardTarget.cardId,
										imageFile: mediaDraft.imageFile,
										vocabAudioFile: mediaDraft.vocabAudioFile,
										sentenceAudioFile: mediaDraft.sentenceAudioFile,
									},
									{ mode: "real" },
								);
								if (!result.ok) {
									throw new Error(result.error.message);
								}
								return result.data;
							})();

				if (mediaDraft.imageFile) {
					nextUrls = {
						...nextUrls,
						imageUrl: uploadedMediaResult.imageUrl ?? nextUrls.imageUrl,
					};
					nextOverrides.image = true;
					toast.success(
						mediaUrls.imageUrl
							? "Image de la carte mise a jour."
							: "Image de la carte ajoutee.",
					);
				}
				if (mediaDraft.vocabAudioFile) {
					nextUrls = {
						...nextUrls,
						vocabAudioUrl:
							uploadedMediaResult.vocabAudioUrl ?? nextUrls.vocabAudioUrl,
					};
					nextOverrides.vocabAudio = true;
					toast.success("Audio du vocabulaire mis a jour.");
				}
				if (mediaDraft.sentenceAudioFile) {
					nextUrls = {
						...nextUrls,
						sentenceAudioUrl:
							uploadedMediaResult.sentenceAudioUrl ?? nextUrls.sentenceAudioUrl,
					};
					nextOverrides.sentenceAudio = true;
					toast.success("Audio de la phrase mis a jour.");
				}
			}

			if (mediaDraft.imageMarkedForDeletion && mediaUrls.imageUrl) {
				try {
					const imageDeleteResult =
						editableCardTarget.kind === "foundation"
							? await deleteLocalFoundationCardMediaSlot({
									foundationCardId: editableCardTarget.cardId,
									slot: "image",
								})
							: await (async () => {
									const result = await deleteUserVocabularyCardImage(
										{ vocabularyCardId: editableCardTarget.cardId },
										{ mode: "real" },
									);
									if (!result.ok) {
										throw new Error(result.error.message);
									}
									return result.data;
								})();
					nextUrls = {
						...nextUrls,
						imageUrl: imageDeleteResult.imageUrl,
					};
					nextOverrides.image = true;
					toast.success("Image de la carte supprimee.");
				} catch (error) {
					toast.error(
						error instanceof Error
							? error.message
							: "Impossible de supprimer l'image.",
					);
					hadError = true;
				}
			}

			if (mediaDraft.vocabAudioMarkedForDeletion && mediaUrls.vocabAudioUrl) {
				try {
					const vocabDeleteResult =
						editableCardTarget.kind === "foundation"
							? await deleteLocalFoundationCardMediaSlot({
									foundationCardId: editableCardTarget.cardId,
									slot: "vocab-audio",
								})
							: await (async () => {
									const result = await deleteUserVocabularyCardAudio(
										{
											vocabularyCardId: editableCardTarget.cardId,
											kind: "vocab",
										},
										{ mode: "real" },
									);
									if (!result.ok) {
										throw new Error(result.error.message);
									}
									return result.data;
								})();
					nextUrls = {
						...nextUrls,
						vocabAudioUrl: vocabDeleteResult.vocabAudioUrl,
					};
					nextOverrides.vocabAudio = true;
					toast.success("Audio du vocabulaire supprime.");
				} catch (error) {
					toast.error(
						error instanceof Error
							? error.message
							: "Impossible de supprimer l'audio du vocabulaire.",
					);
					hadError = true;
				}
			}

			if (
				mediaDraft.sentenceAudioMarkedForDeletion &&
				mediaUrls.sentenceAudioUrl
			) {
				try {
					const sentenceDeleteResult =
						editableCardTarget.kind === "foundation"
							? await deleteLocalFoundationCardMediaSlot({
									foundationCardId: editableCardTarget.cardId,
									slot: "sentence-audio",
								})
							: await (async () => {
									const result = await deleteUserVocabularyCardAudio(
										{
											vocabularyCardId: editableCardTarget.cardId,
											kind: "sentence",
										},
										{ mode: "real" },
									);
									if (!result.ok) {
										throw new Error(result.error.message);
									}
									return result.data;
								})();
					nextUrls = {
						...nextUrls,
						sentenceAudioUrl: sentenceDeleteResult.sentenceAudioUrl,
					};
					nextOverrides.sentenceAudio = true;
					toast.success("Audio de la phrase supprime.");
				} catch (error) {
					toast.error(
						error instanceof Error
							? error.message
							: "Impossible de supprimer l'audio de la phrase.",
					);
					hadError = true;
				}
			}

			if (editableCardTarget.kind === "foundation") {
				const overlaysById =
					await resolveLocalFoundationCardMediaOverlayByCardId([
						editableCardTarget.cardId,
					]);
				const overlay = overlaysById.get(editableCardTarget.cardId);
				nextUrls = applyLocalFoundationCardMediaOverlay(
					buildCardMediaUrls(card, audioUrls),
					overlay,
				);
				nextOverrides = resolveMediaOverrideStateFromOverlay(overlay);
			}

			setMediaUrls(nextUrls);
			setMediaDraft(buildEditableCardMediaDraft(nextUrls));
			setPersistedMediaOverrides(nextOverrides);
			if (!hadError) {
				setIsEditMode(false);
			}
		} finally {
			setIsSaving(false);
		}
	};

	const handleResetMedia = async () => {
		if (
			!editableCardTarget ||
			isEditMode ||
			isSaving ||
			!hasPersistedMediaOverrides
		) {
			return;
		}

		setIsSaving(true);
		try {
			if (editableCardTarget.kind === "foundation") {
				await resetLocalFoundationCardMediaOverrides({
					foundationCardId: editableCardTarget.cardId,
				});
				const defaultUrls = buildCardMediaUrls(card, audioUrls);
				setMediaUrls(defaultUrls);
				setMediaDraft(buildEditableCardMediaDraft(defaultUrls));
				setPersistedMediaOverrides(EMPTY_MEDIA_OVERRIDE_STATE);
				toast.success("Médias réinitialisés.");
				return;
			}

			const resetResult = await resetUserVocabularyCardMedia(
				{ vocabularyCardId: editableCardTarget.cardId },
				{ mode: "real" },
			);
			if (!resetResult.ok) {
				throw new Error(resetResult.error.message);
			}

			const defaultUrls = {
				imageUrl:
					resetResult.data.imageUrl ??
					card.defaultImageUrl ??
					card.image ??
					null,
				vocabAudioUrl:
					resetResult.data.vocabAudioUrl ??
					card.defaultVocabAudioUrl ??
					card.vocabAudioUrl ??
					null,
				sentenceAudioUrl:
					resetResult.data.sentenceAudioUrl ??
					card.defaultSentenceAudioUrl ??
					card.sentenceAudioUrl ??
					null,
			};

			setMediaUrls(defaultUrls);
			setMediaDraft(buildEditableCardMediaDraft(defaultUrls));
			setPersistedMediaOverrides(EMPTY_MEDIA_OVERRIDE_STATE);
			toast.success("Médias réinitialisés.");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Impossible de réinitialiser les médias.",
			);
		} finally {
			setIsSaving(false);
		}
	};

	const handleDownloadImage = async () => {
		if (!currentImageUrl) {
			return;
		}

		setBusyKind("image");
		try {
			const downloadFile = isEditMode ? mediaDraft.imageFile : null;
			const extension = downloadFile
				? downloadFile.name.split(".").pop() || "webp"
				: "webp";
			await downloadMediaFile(
				currentImageUrl,
				buildCardMediaDownloadName(card, "image", extension),
			);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Impossible de telecharger l'image.",
			);
		} finally {
			setBusyKind(null);
		}
	};

	const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) {
			return;
		}

		if (file.size > MAX_MANUAL_CARD_IMAGE_BYTES) {
			toast.error(IMAGE_SIZE_LIMIT_MESSAGE);
			return;
		}

		if (currentImageUrl && !window.confirm(IMAGE_OVERWRITE_CONFIRM_MESSAGE)) {
			return;
		}

		const previewUrl = URL.createObjectURL(file);
		setMediaDraft((current) => ({
			...current,
			imageFile: file,
			imageUrl: previewUrl,
			imageMarkedForDeletion: false,
		}));
	};

	const handleDeleteImage = () => {
		setMediaDraft((current) => ({
			...current,
			imageFile: null,
			imageUrl: null,
			imageMarkedForDeletion: true,
		}));
	};

	const handleAudioUpload =
		(kind: "vocab" | "sentence") =>
		async (event: ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			event.target.value = "";
			if (!file) {
				return;
			}

			if (file.size > MAX_MANUAL_CARD_AUDIO_BYTES) {
				toast.error(AUDIO_SIZE_LIMIT_MESSAGE);
				return;
			}

			const previewUrl = URL.createObjectURL(file);
			setMediaDraft((current) =>
				kind === "vocab"
					? {
							...current,
							vocabAudioFile: file,
							vocabAudioUrl: previewUrl,
							vocabAudioMarkedForDeletion: false,
						}
					: {
							...current,
							sentenceAudioFile: file,
							sentenceAudioUrl: previewUrl,
							sentenceAudioMarkedForDeletion: false,
						},
			);
		};

	const handleDeleteAudio = (kind: "vocab" | "sentence") => {
		setMediaDraft((current) =>
			kind === "vocab"
				? {
						...current,
						vocabAudioFile: null,
						vocabAudioUrl: null,
						vocabAudioMarkedForDeletion: true,
					}
				: {
						...current,
						sentenceAudioFile: null,
						sentenceAudioUrl: null,
						sentenceAudioMarkedForDeletion: true,
					},
		);
	};

	const isVocabRecording = recordingKind === "vocab";
	const isSentenceRecording = recordingKind === "sentence";
	const isVocabActionDisabled = isSaving || (isRecording && !isVocabRecording);
	const isSentenceActionDisabled =
		isSaving || (isRecording && !isSentenceRecording);

	return (
		<div className="absolute inset-0 flex min-h-0 flex-col overflow-hidden">
			{showSourceChip && (
				<SourceChip
					card={card}
					className="relative z-30"
					tone={sourceChipTone}
				/>
			)}
			{/* Main content - non-scroll by default, scroll fallback on extreme overflow */}
			<div
				ref={scrollContentRef}
				data-testid={isShorts ? "shorts-back-content" : undefined}
				className={`flex min-h-0 flex-1 flex-col ${
					isShorts && allowFallbackScroll ? "shorts-card-scroll pr-1" : ""
				}`}
				style={{
					background: theme.backgroundWrap,
					paddingInline: `${contentPaddingX}px`,
					paddingTop: `${contentPaddingTop}px`,
					paddingBottom: isShorts
						? hideShortsActionZone
							? `${contentPaddingY}px`
							: `${actionReserveSpace + contentPaddingY}px`
						: `${contentPaddingY}px`,
					overflowY: isShorts
						? allowFallbackScroll
							? "auto"
							: "hidden"
						: "visible",
					scrollbarWidth: isShorts && allowFallbackScroll ? "thin" : undefined,
					scrollbarColor:
						isShorts && allowFallbackScroll
							? "rgba(5,5,6,0.92) transparent"
							: undefined,
					overscrollBehaviorY:
						isShorts && allowFallbackScroll ? "contain" : undefined,
					WebkitOverflowScrolling:
						isShorts && allowFallbackScroll ? "touch" : undefined,
					touchAction: isShorts ? "pan-y" : undefined,
				}}
			>
				<div className="flex min-h-0 flex-col">
					<div
						className="sent-center relative z-30 w-full mb-3 text-center"
						style={{
							paddingTop: `${sentenceSpacingTop}px`,
						}}
					>
						<ArabicSentence
							sentBase={card.sentBase}
							sentFull={card.sentFull}
							vocabBase={card.vocabBase}
							showVowels={showVowels}
							layoutMetrics={layoutMetrics}
							maxLines={isShorts ? 4 : undefined}
							trailingControl={
								isEditMode ? null : (
									<AudioButton
										variant="sentence"
										audioUrl={sentenceAudioUrl}
										isLoading={isLoadingAudio}
										isMuted={audioMuted}
										onMouseMove={onSentenceAudioMouseMove}
										onMouseLeave={onSentenceAudioMouseLeave}
									/>
								)
							}
						/>
					</div>
					{card.sentFrench && (
						<div className="text-center mb-2">
							{!showTranslation ? (
								<button
									type="button"
									onMouseEnter={() => {
										setIsTranslationButtonHovered(true);
									}}
									onMouseLeave={() => {
										setIsTranslationButtonHovered(false);
									}}
									className="font-normal"
									style={{
										...createHtmlButtonStyle({
											hovered: isTranslationButtonHovered,
											padding: `${translationButtonPaddingY}px ${translationButtonPaddingX}px`,
										}),
										fontSize: `${translationButtonFontSize}px`,
									}}
									onPointerDown={(e) => {
										e.stopPropagation();
										setShowTranslation(true);
									}}
									onClick={(e) => {
										e.stopPropagation();
										setShowTranslation(true);
									}}
								>
									{showTranslationLabel}
								</button>
							) : (
								<div
									className="line-clamp-4"
									style={{
										color: theme.textHint,
										fontSize: `${translationTextFontSize}px`,
										lineHeight: clampNumber(
											1.24 * layoutMetrics.lineHeightScale,
											1.12,
											1.26,
										),
										paddingBottom: "0.08em",
									}}
								>
									{card.sentFrench}
								</div>
							)}
						</div>
					)}
					<div className="mt-2" />
					<div
						className="rounded"
						style={{
							background: `color-mix(in srgb, ${theme.backgroundWrap} 85%, #fff 15%)`,
							border: `1px solid ${theme.borderWrap}`,
							paddingTop: `${detailTopPadding}px`,
							paddingBottom: `${detailBottomPadding}px`,
							paddingInline: `${detailHorizontalPadding}px`,
						}}
					>
						<input
							type="file"
							accept={COLLECTED_CARD_AUDIO_UPLOAD_ACCEPT}
							className="hidden"
							ref={vocabAudioInputRef}
							onChange={handleAudioUpload("vocab")}
						/>
						<input
							type="file"
							accept={COLLECTED_CARD_AUDIO_UPLOAD_ACCEPT}
							className="hidden"
							ref={sentenceAudioInputRef}
							onChange={handleAudioUpload("sentence")}
						/>
						{editableCard && isEditMode ? (
							<div className="flex flex-col gap-4">
								<div className="flex items-center justify-between gap-3">
									<div className="flex items-center gap-2">
										<AudioButton
											variant="vocab"
											audioUrl={vocabAudioUrl}
											isLoading={isLoadingAudio}
											isMuted={audioMuted}
											onMouseMove={onVocabAudioMouseMove}
											onMouseLeave={onVocabAudioMouseLeave}
										/>
										<VocabWord
											base={card.vocabBase}
											full={card.vocabFull}
											showVowels={showVowels}
											layoutMetrics={layoutMetrics}
										/>
									</div>
									<div className="flex items-center gap-1">
										{isVocabRecording ? (
											<MediaActionButton
												icon="stop"
												onClick={(event) => {
													event.stopPropagation();
													void stopRecording();
												}}
												disabled={isSaving}
												label="Arrêter l'enregistrement"
												tone="recording"
											/>
										) : (
											<MediaActionButton
												icon="mic"
												onClick={(event) => {
													event.stopPropagation();
													void startRecording("vocab");
												}}
												disabled={isVocabActionDisabled}
												label="Enregistrer l'audio du vocabulaire"
											/>
										)}
										<MediaActionButton
											icon="upload"
											onClick={(event) => {
												event.stopPropagation();
												vocabAudioInputRef.current?.click();
											}}
											disabled={isVocabActionDisabled}
											label="Téléverser l'audio du vocabulaire"
										/>
										{vocabAudioUrl ? (
											<MediaActionButton
												icon="trash"
												onClick={(event) => {
													event.stopPropagation();
													handleDeleteAudio("vocab");
												}}
												disabled={isVocabActionDisabled}
												label="Supprimer l'audio du vocabulaire"
												tone="danger"
											/>
										) : null}
									</div>
								</div>
								<div
									className="h-px w-full"
									style={{ background: "rgba(255,255,255,0.08)" }}
								/>
								<div className="flex items-center justify-between gap-3">
									<div className="flex items-center gap-2">
										<AudioButton
											variant="sentence"
											audioUrl={sentenceAudioUrl}
											isLoading={isLoadingAudio}
											isMuted={audioMuted}
											onMouseMove={onSentenceAudioMouseMove}
											onMouseLeave={onSentenceAudioMouseLeave}
										/>
									</div>
									<div className="flex items-center gap-1">
										{isSentenceRecording ? (
											<MediaActionButton
												icon="stop"
												onClick={(event) => {
													event.stopPropagation();
													void stopRecording();
												}}
												disabled={isSaving}
												label="Arrêter l'enregistrement"
												tone="recording"
											/>
										) : (
											<MediaActionButton
												icon="mic"
												onClick={(event) => {
													event.stopPropagation();
													void startRecording("sentence");
												}}
												disabled={isSentenceActionDisabled}
												label="Enregistrer l'audio de la phrase"
											/>
										)}
										<MediaActionButton
											icon="upload"
											onClick={(event) => {
												event.stopPropagation();
												sentenceAudioInputRef.current?.click();
											}}
											disabled={isSentenceActionDisabled}
											label="Téléverser l'audio de la phrase"
										/>
										{sentenceAudioUrl ? (
											<MediaActionButton
												icon="trash"
												onClick={(event) => {
													event.stopPropagation();
													handleDeleteAudio("sentence");
												}}
												disabled={isSentenceActionDisabled}
												label="Supprimer l'audio de la phrase"
												tone="danger"
											/>
										) : null}
									</div>
								</div>
							</div>
						) : (
							<div className="flex items-center gap-2">
								<AudioButton
									variant="vocab"
									audioUrl={vocabAudioUrl}
									isLoading={isLoadingAudio}
									isMuted={audioMuted}
									onMouseMove={onVocabAudioMouseMove}
									onMouseLeave={onVocabAudioMouseLeave}
								/>
								<VocabWord
									base={card.vocabBase}
									full={card.vocabFull}
									showVowels={showVowels}
									layoutMetrics={layoutMetrics}
								/>
							</div>
						)}
						<div className="mt-2" />
						{card.vocabDef && (
							<div
								className="mt-1 line-clamp-3"
								style={{
									color: theme.textHint,
									lineHeight: clampNumber(
										1.2 * layoutMetrics.lineHeightScale,
										1.14,
										1.24,
									),
									fontSize: `${vocabDefFontSize}px`,
									paddingBottom: "0.1em",
								}}
							>
								{card.vocabDef}
							</div>
						)}
					</div>

					{showImage && (
						<ImageSection
							key={flipKey}
							image={currentImageUrl}
							vocabDef={card.vocabDef}
							sourceLinkUrl={sourceLinkUrl}
							imageSize={imageSize}
							imageLoading={imageLoading}
							isEditable={editableCard}
							isEditMode={isEditMode}
							isImageBusy={isImageBusy}
							isSaveBusy={isSaving}
							isFooterDisabled={isSaveDisabled}
							canResetMedia={hasPersistedMediaOverrides && !isEditMode}
							isResetBusy={isSaving}
							onEnterEditMode={handleEnterEditMode}
							onResetMedia={() => {
								void handleResetMedia();
							}}
							onCancelEditMode={handleCancelEditMode}
							onSaveEditMode={handleSaveEditMode}
							onRequestUpload={() => imageInputRef.current?.click()}
							onDownload={() => {
								void handleDownloadImage();
							}}
							onDelete={() => {
								handleDeleteImage();
							}}
							onImageChange={handleImageUpload}
							imageInputRef={imageInputRef}
						/>
					)}

					{variant === "default" ? (
						<div className="flex justify-center mt-3">
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									onFlip();
								}}
								onMouseEnter={() => {
									setIsBackFlipHovered(true);
								}}
								onMouseLeave={() => {
									setIsBackFlipHovered(false);
								}}
								className="flex items-center gap-1"
								style={createHtmlButtonStyle({ hovered: isBackFlipHovered })}
							>
								<ChevronLeft size={14} />
								Retourner
							</button>
						</div>
					) : hideShortsUtilityControls ? null : (
						<div className="mt-3 flex justify-center gap-3 relative z-20">
							{shortsVowelsControl}
							{shortsFlipControl}
						</div>
					)}
				</div>
			</div>
			{isShorts && !hideShortsActionZone && (
				<div
					className="absolute inset-x-0 bottom-0 z-20"
					style={{
						height: `${actionZoneHeight}%`,
						transition: "opacity 0.3s ease",
						opacity: isFlipping ? 0.4 : 1,
					}}
				>
					<div
						className="absolute inset-0 flex"
						onWheel={handleOverlayWheel}
						onTouchStart={handleOverlayTouchStart}
						onTouchMove={handleOverlayTouchMove}
						onTouchEnd={handleOverlayTouchEnd}
						onTouchCancel={handleOverlayTouchEnd}
					>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onFail?.();
							}}
							aria-label="Échouer la carte"
							data-tutorial="review-fail-button"
							className="relative z-0 flex-1 transition-all duration-250 ease-out"
							style={{
								background: failBaseGradient,
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = failHoverGradient;
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = failBaseGradient;
							}}
						>
							<X
								className="absolute left-1/2 h-10 w-10 -translate-x-1/2 z-20"
								style={{ bottom: "18%", color: "rgba(248,113,113,0.95)" }}
								strokeWidth={2.2}
							/>
							{failHint && (
								<span
									className="absolute left-1/2 -translate-x-1/2 text-[10px] font-medium tracking-[0.01em]"
									style={{ bottom: "4%", color: "rgba(248,113,113,0.78)" }}
								>
									{failHint}
								</span>
							)}
						</button>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onPass?.();
							}}
							aria-label="Valider la carte"
							data-tutorial="review-pass-button"
							className="relative z-0 flex-1 transition-all duration-250 ease-out"
							style={{
								background: passBaseGradient,
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = passHoverGradient;
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = passBaseGradient;
							}}
						>
							<Check
								className="absolute left-1/2 h-10 w-10 -translate-x-1/2 z-20"
								style={{ bottom: "18%", color: "rgba(110,231,183,0.95)" }}
								strokeWidth={2.2}
							/>
							{passHint && (
								<span
									className="absolute left-1/2 -translate-x-1/2 text-[10px] font-medium tracking-[0.01em]"
									style={{ bottom: "4%", color: "rgba(110,231,183,0.78)" }}
								>
									{passHint}
								</span>
							)}
						</button>
					</div>
				</div>
			)}
			{variant === "default" && (
				<div
					className="px-4 py-2 text-center text-xs"
					style={{ background: theme.sideBars, color: theme.textSummary }}
				>
					Vocab. Fondation
				</div>
			)}
		</div>
	);
};

type ReviewMainCardSurfaceProps = {
	card: AnkiCard;
	isFlipped: boolean;
	showVowels: boolean;
	onToggleVowels: () => void;
	onFlip: () => void;
	onFail?: () => void;
	onPass?: () => void;
	failHint?: string;
	passHint?: string;
	audioUrls: AudioUrls;
	isLoadingAudio: boolean;
	flipKey: number;
	showImage: boolean;
	onVocabAudioMouseMove: (e: ReactMouseEvent) => void;
	onVocabAudioMouseLeave: () => void;
	onSentenceAudioMouseMove: (e: ReactMouseEvent) => void;
	onSentenceAudioMouseLeave: () => void;
	isFlipping?: boolean;
	frontOnly?: boolean;
	className?: string;
	imageSize?: "default" | "compact" | "review";
	backImageLoading?: "lazy" | "eager";
	sourceChipPlacement?: "top" | "bottom";
	sourceChipTone?: SourceChipTone;
	showSourceChipOnBack?: boolean;
	shortsFlipLabel?: string;
	shortsVowelsTooltip?: string;
	shortsExtraControl?: ShortsExtraControl;
	hideShortsUtilityControls?: boolean;
	hideShortsActionZone?: boolean;
	muteFlipAudio?: boolean;
	audioMuted?: boolean;
};

export const ReviewMainCardSurface = ({
	card,
	isFlipped,
	showVowels,
	onToggleVowels,
	onFlip,
	onFail,
	onPass,
	failHint,
	passHint,
	audioUrls,
	isLoadingAudio,
	flipKey,
	showImage,
	onVocabAudioMouseMove,
	onVocabAudioMouseLeave,
	onSentenceAudioMouseMove,
	onSentenceAudioMouseLeave,
	isFlipping = false,
	frontOnly = false,
	className = "rounded-[36px]",
	imageSize = "default",
	backImageLoading = "lazy",
	sourceChipPlacement = "top",
	sourceChipTone = "default",
	showSourceChipOnBack = true,
	shortsFlipLabel,
	shortsVowelsTooltip,
	shortsExtraControl,
	hideShortsUtilityControls = false,
	hideShortsActionZone = false,
	muteFlipAudio = false,
	audioMuted = false,
}: ReviewMainCardSurfaceProps) => {
	const surfaceRef = useRef<HTMLDivElement | null>(null);
	const [layoutMetrics, setLayoutMetrics] = useState<ShortsLayoutMetrics>(
		DEFAULT_SHORTS_LAYOUT,
	);

	useEffect(() => {
		const node = surfaceRef.current;
		if (!node) {
			return;
		}

		const updateMetrics = () => {
			const nextLayout = computeShortsLayoutMetrics(node);
			setLayoutMetrics((prev) =>
				sameShortsLayout(prev, nextLayout) ? prev : nextLayout,
			);
		};

		updateMetrics();

		if (typeof ResizeObserver === "undefined") {
			return;
		}

		const observer = new ResizeObserver(updateMetrics);
		observer.observe(node);

		return () => {
			observer.disconnect();
		};
	}, []);

	if (frontOnly) {
		return (
			<div
				ref={surfaceRef}
				className={`absolute inset-0 overflow-hidden cursor-pointer ${className}`}
			>
				<CardFront
					card={card}
					showVowels={false}
					onToggleVowels={() => {}}
					onFlip={() => {}}
					variant="shorts"
					isFlipping={false}
					layoutMetrics={layoutMetrics}
					sourceChipPlacement={sourceChipPlacement}
					sourceChipTone={sourceChipTone}
					shortsFlipLabel={shortsFlipLabel}
					shortsVowelsTooltip={shortsVowelsTooltip}
					shortsExtraControl={shortsExtraControl}
					hideShortsUtilityControls={hideShortsUtilityControls}
				/>
			</div>
		);
	}

	return (
		<div
			ref={surfaceRef}
			className="relative h-full w-full cursor-pointer"
			style={{
				transformStyle: "preserve-3d",
				transition: "transform 0.6s ease",
				transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
			}}
		>
			<div
				data-tutorial="review-card-front"
				className={`absolute inset-0 overflow-hidden z-10 ${className}`}
				style={{
					backfaceVisibility: "hidden",
					WebkitBackfaceVisibility: "hidden",
					background: theme.backgroundWrap,
					border: `1px solid ${theme.borderWrap}`,
					boxShadow: "0 10px 26px -16px rgba(0,0,0,0.28)",
				}}
			>
				<CardFront
					card={card}
					showVowels={showVowels}
					onToggleVowels={onToggleVowels}
					onFlip={onFlip}
					onFail={onFail}
					onPass={onPass}
					failHint={failHint}
					passHint={passHint}
					variant="shorts"
					isFlipping={isFlipping}
					layoutMetrics={layoutMetrics}
					sourceChipPlacement={sourceChipPlacement}
					sourceChipTone={sourceChipTone}
					shortsFlipLabel={shortsFlipLabel}
					shortsVowelsTooltip={shortsVowelsTooltip}
					shortsExtraControl={shortsExtraControl}
					hideShortsUtilityControls={hideShortsUtilityControls}
				/>
			</div>

			<div
				data-tutorial="review-card-back"
				className={`absolute inset-0 overflow-hidden z-10 ${className}`}
				style={{
					backfaceVisibility: "hidden",
					WebkitBackfaceVisibility: "hidden",
					transform: "rotateY(180deg)",
					background: theme.backgroundWrap,
					border: `1px solid ${theme.borderWrap}`,
					boxShadow: "0 10px 26px -16px rgba(0,0,0,0.28)",
				}}
			>
				<CardBack
					card={card}
					isFlipped={isFlipped}
					showVowels={showVowels}
					onToggleVowels={onToggleVowels}
					onFlip={onFlip}
					onFail={onFail}
					onPass={onPass}
					failHint={failHint}
					passHint={passHint}
					audioUrls={audioUrls}
					isLoadingAudio={isLoadingAudio}
					flipKey={flipKey}
					showImage={showImage}
					imageLoading={backImageLoading}
					onVocabAudioMouseMove={onVocabAudioMouseMove}
					onVocabAudioMouseLeave={onVocabAudioMouseLeave}
					onSentenceAudioMouseMove={onSentenceAudioMouseMove}
					onSentenceAudioMouseLeave={onSentenceAudioMouseLeave}
					variant="shorts"
					isFlipping={isFlipping}
					layoutMetrics={layoutMetrics}
					imageSize={imageSize}
					showSourceChip={showSourceChipOnBack}
					sourceChipTone={sourceChipTone}
					shortsFlipLabel={shortsFlipLabel}
					shortsVowelsTooltip={shortsVowelsTooltip}
					hideShortsUtilityControls={hideShortsUtilityControls}
					hideShortsActionZone={hideShortsActionZone}
					muteFlipAudio={muteFlipAudio}
					audioMuted={audioMuted}
				/>
			</div>
		</div>
	);
};
