import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
	hasGuestCollectedCardMediaContext,
	resolveGuestCollectedCardMediaOverlayByCardId,
} from "@/lib/guestCollectedCardMediaStore";

export const COLLECTED_CARD_MEDIA_BUCKET = "collected-card-media";
export const COLLECTED_CARD_MEDIA_EDGE_FUNCTION = "collected-card-media";
export const COLLECTED_CARD_MEDIA_IMAGE_WEBP_QUALITY = 0.74;
export const COLLECTED_CARD_MEDIA_IMAGE_MAX_DIMENSION = 1920;

const STORAGE_REF_PREFIX = "storage://";

type CollectedCardMediaObjectRef = {
	bucketId: string;
	objectPath: string;
};

type CollectedCardMediaResolveResponse = {
	records?: unknown;
};

type CollectedCardMediaMutationResponse = {
	record?: unknown;
};

export type CollectedCardMediaFunctionClient = Pick<
	SupabaseClient<Database>,
	"functions"
>;
export type CollectedCardMediaKind = "image" | "vocab-audio" | "sentence-audio";

export type SaveCollectedCardMediaAssetsParams = {
	vocabularyCardId: string;
	imageFile?: File | null;
	vocabAudioFile?: File | null;
	sentenceAudioFile?: File | null;
};

export type DeleteCollectedCardMediaSlotParams = {
	vocabularyCardId: string;
	slot: CollectedCardMediaKind;
};

export type CollectedCardMediaOverlayRecord = {
	vocabularyCardId: string;
	imageStorageRef: string | null;
	vocabAudioStorageRef: string | null;
	sentenceAudioStorageRef: string | null;
	imageUrl: string | null;
	vocabAudioUrl: string | null;
	sentenceAudioUrl: string | null;
	imageHidden: boolean;
	vocabAudioHidden: boolean;
	sentenceAudioHidden: boolean;
	hasCustomImage: boolean;
	hasCustomVocabAudio: boolean;
	hasCustomSentenceAudio: boolean;
};

const normalizeObjectPath = (value: string): string =>
	value.replace(/^\/+/, "").trim();

const decodePathSegment = (value: string): string => {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
};

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const toOptionalNonEmptyString = (value: unknown): string | null => {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const toBoolean = (value: unknown): boolean => value === true;

const normalizeCardIds = (vocabularyCardIds: string[]): string[] => {
	const seen = new Set<string>();
	const normalizedIds: string[] = [];

	vocabularyCardIds.forEach((rawId) => {
		const cardId = typeof rawId === "string" ? rawId.trim() : "";
		if (!cardId || seen.has(cardId)) {
			return;
		}

		seen.add(cardId);
		normalizedIds.push(cardId);
	});

	return normalizedIds;
};

const parseStorageRef = (value: string): CollectedCardMediaObjectRef | null => {
	if (!value.startsWith(STORAGE_REF_PREFIX)) {
		return null;
	}

	const withoutPrefix = value.slice(STORAGE_REF_PREFIX.length);
	const slashIndex = withoutPrefix.indexOf("/");
	if (slashIndex <= 0) {
		return null;
	}

	const bucketId = withoutPrefix.slice(0, slashIndex).trim();
	const objectPath = normalizeObjectPath(withoutPrefix.slice(slashIndex + 1));
	if (!bucketId || !objectPath) {
		return null;
	}

	return { bucketId, objectPath };
};

const parseSupabaseStorageUrl = (
	value: string,
): CollectedCardMediaObjectRef | null => {
	try {
		const parsedUrl = new URL(value);
		const segments = parsedUrl.pathname.split("/").filter(Boolean);
		const objectSegmentIndex = segments.findIndex(
			(segment) => segment === "object",
		);

		if (objectSegmentIndex < 0) {
			return null;
		}

		const mode = segments[objectSegmentIndex + 1];
		if (mode !== "public" && mode !== "authenticated" && mode !== "sign") {
			return null;
		}

		const bucketId = decodePathSegment(
			segments[objectSegmentIndex + 2] ?? "",
		).trim();
		const objectPath = normalizeObjectPath(
			segments
				.slice(objectSegmentIndex + 3)
				.map((segment) => decodePathSegment(segment))
				.join("/"),
		);

		if (!bucketId || !objectPath) {
			return null;
		}

		return { bucketId, objectPath };
	} catch {
		return null;
	}
};

const parseDefaultBucketPath = (
	value: string,
): CollectedCardMediaObjectRef | null => {
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	if (trimmed.startsWith(`${COLLECTED_CARD_MEDIA_BUCKET}/`)) {
		const objectPath = normalizeObjectPath(
			trimmed.slice(COLLECTED_CARD_MEDIA_BUCKET.length + 1),
		);
		if (!objectPath) {
			return null;
		}

		return {
			bucketId: COLLECTED_CARD_MEDIA_BUCKET,
			objectPath,
		};
	}

	if (trimmed.includes("/")) {
		return {
			bucketId: COLLECTED_CARD_MEDIA_BUCKET,
			objectPath: normalizeObjectPath(trimmed),
		};
	}

	return null;
};

const getInvokeMethod = (client: CollectedCardMediaFunctionClient) => {
	const functions = client.functions;
	return functions && typeof functions.invoke === "function"
		? functions.invoke.bind(functions)
		: null;
};

export const buildCollectedCardMediaStorageRef = (
	objectPath: string,
	bucketId = COLLECTED_CARD_MEDIA_BUCKET,
): string =>
	`${STORAGE_REF_PREFIX}${bucketId}/${normalizeObjectPath(objectPath)}`;

export const buildCollectedCardMediaObjectPath = (
	userId: string,
	vocabularyCardId: string,
	kind: CollectedCardMediaKind,
	extension: string,
): string => {
	const normalizedExtension = extension.replace(/^\.+/, "").trim() || "bin";
	return `${userId}/${vocabularyCardId}/${kind}-${Date.now()}-${crypto.randomUUID()}.${normalizedExtension}`;
};

export const resolveCollectedCardMediaObjectRef = (
	rawMediaRef: string,
): CollectedCardMediaObjectRef | null => {
	const trimmed = rawMediaRef.trim();
	if (!trimmed) {
		return null;
	}

	return (
		parseStorageRef(trimmed) ??
		(isHttpUrl(trimmed) ? parseSupabaseStorageUrl(trimmed) : null) ??
		parseDefaultBucketPath(trimmed)
	);
};

export const normalizeCollectedCardMediaOverlayRecord = (
	value: unknown,
): CollectedCardMediaOverlayRecord | null => {
	if (!value || typeof value !== "object") {
		return null;
	}

	const record = value as Record<string, unknown>;
	const vocabularyCardId = toOptionalNonEmptyString(record.vocabularyCardId);
	if (!vocabularyCardId) {
		return null;
	}

	return {
		vocabularyCardId,
		imageStorageRef: toOptionalNonEmptyString(record.imageStorageRef),
		vocabAudioStorageRef: toOptionalNonEmptyString(record.vocabAudioStorageRef),
		sentenceAudioStorageRef: toOptionalNonEmptyString(
			record.sentenceAudioStorageRef,
		),
		imageUrl: toOptionalNonEmptyString(record.imageUrl),
		vocabAudioUrl: toOptionalNonEmptyString(record.vocabAudioUrl),
		sentenceAudioUrl: toOptionalNonEmptyString(record.sentenceAudioUrl),
		imageHidden: toBoolean(record.imageHidden),
		vocabAudioHidden: toBoolean(record.vocabAudioHidden),
		sentenceAudioHidden: toBoolean(record.sentenceAudioHidden),
		hasCustomImage: toBoolean(record.hasCustomImage),
		hasCustomVocabAudio: toBoolean(record.hasCustomVocabAudio),
		hasCustomSentenceAudio: toBoolean(record.hasCustomSentenceAudio),
	};
};

const requireCollectedCardMediaRecord = (
	value: unknown,
	action: string,
): CollectedCardMediaOverlayRecord => {
	const record = normalizeCollectedCardMediaOverlayRecord(value);
	if (!record) {
		throw new Error(
			`Collected card media ${action} returned an invalid response.`,
		);
	}

	return record;
};

export const saveCollectedCardMediaAssets = async (
	client: CollectedCardMediaFunctionClient,
	params: SaveCollectedCardMediaAssetsParams,
): Promise<CollectedCardMediaOverlayRecord> => {
	const invoke = getInvokeMethod(client);
	if (!invoke) {
		throw new Error("Collected card media function client is unavailable.");
	}

	const formData = new FormData();
	formData.set("action", "save");
	formData.set("vocabularyCardId", params.vocabularyCardId);
	if (params.imageFile instanceof File) {
		formData.set("imageFile", params.imageFile);
	}
	if (params.vocabAudioFile instanceof File) {
		formData.set("vocabAudioFile", params.vocabAudioFile);
	}
	if (params.sentenceAudioFile instanceof File) {
		formData.set("sentenceAudioFile", params.sentenceAudioFile);
	}

	const { data, error } = await invoke<CollectedCardMediaMutationResponse>(
		COLLECTED_CARD_MEDIA_EDGE_FUNCTION,
		{
			body: formData,
		},
	);

	if (error) {
		throw error;
	}

	return requireCollectedCardMediaRecord(data?.record, "save");
};

export const deleteCollectedCardMediaSlot = async (
	client: CollectedCardMediaFunctionClient,
	params: DeleteCollectedCardMediaSlotParams,
): Promise<CollectedCardMediaOverlayRecord> => {
	const invoke = getInvokeMethod(client);
	if (!invoke) {
		throw new Error("Collected card media function client is unavailable.");
	}

	const { data, error } = await invoke<CollectedCardMediaMutationResponse>(
		COLLECTED_CARD_MEDIA_EDGE_FUNCTION,
		{
			body: {
				action: "delete-slot",
				vocabularyCardId: params.vocabularyCardId,
				slot: params.slot,
			},
		},
	);

	if (error) {
		throw error;
	}

	return requireCollectedCardMediaRecord(data?.record, "delete-slot");
};

export const applyCollectedCardMediaOverlayToCard = <
	TCard extends Record<string, unknown>,
>(
	card: TCard,
	overlay: CollectedCardMediaOverlayRecord | null | undefined,
): TCard => {
	if (!overlay) {
		return card;
	}

	const nextCard: Record<string, unknown> = { ...card };

	const applySlot = (
		urlKey: "image_url" | "audio_url" | "sentence_audio_url",
		hidden: boolean,
		resolvedUrl: string | null,
	) => {
		if (hidden) {
			nextCard[urlKey] = null;
			return;
		}

		if (resolvedUrl !== null) {
			nextCard[urlKey] = resolvedUrl;
		}
	};

	applySlot("image_url", overlay.imageHidden, overlay.imageUrl);
	applySlot("audio_url", overlay.vocabAudioHidden, overlay.vocabAudioUrl);
	applySlot(
		"sentence_audio_url",
		overlay.sentenceAudioHidden,
		overlay.sentenceAudioUrl,
	);

	return nextCard as TCard;
};

const mergeCollectedCardMediaOverlayRecord = (
	base: CollectedCardMediaOverlayRecord | null | undefined,
	override: CollectedCardMediaOverlayRecord,
): CollectedCardMediaOverlayRecord => {
	const baseRecord =
		base ??
		({
			vocabularyCardId: override.vocabularyCardId,
			imageStorageRef: null,
			vocabAudioStorageRef: null,
			sentenceAudioStorageRef: null,
			imageUrl: null,
			vocabAudioUrl: null,
			sentenceAudioUrl: null,
			imageHidden: false,
			vocabAudioHidden: false,
			sentenceAudioHidden: false,
			hasCustomImage: false,
			hasCustomVocabAudio: false,
			hasCustomSentenceAudio: false,
		} satisfies CollectedCardMediaOverlayRecord);

	const mergeSlot = (
		hidden: boolean,
		hasCustom: boolean,
		storageRef: string | null,
		url: string | null,
		baseHidden: boolean,
		baseHasCustom: boolean,
		baseStorageRef: string | null,
		baseUrl: string | null,
	) => {
		if (hidden) {
			return {
				hidden: true,
				hasCustom: hasCustom || true,
				storageRef: null,
				url: null,
			};
		}

		if (storageRef !== null || url !== null || hasCustom) {
			return {
				hidden: false,
				hasCustom: hasCustom || storageRef !== null || url !== null,
				storageRef,
				url,
			};
		}

		return {
			hidden: baseHidden,
			hasCustom: baseHasCustom,
			storageRef: baseStorageRef,
			url: baseUrl,
		};
	};

	const image = mergeSlot(
		override.imageHidden,
		override.hasCustomImage,
		override.imageStorageRef,
		override.imageUrl,
		baseRecord.imageHidden,
		baseRecord.hasCustomImage,
		baseRecord.imageStorageRef,
		baseRecord.imageUrl,
	);
	const vocabAudio = mergeSlot(
		override.vocabAudioHidden,
		override.hasCustomVocabAudio,
		override.vocabAudioStorageRef,
		override.vocabAudioUrl,
		baseRecord.vocabAudioHidden,
		baseRecord.hasCustomVocabAudio,
		baseRecord.vocabAudioStorageRef,
		baseRecord.vocabAudioUrl,
	);
	const sentenceAudio = mergeSlot(
		override.sentenceAudioHidden,
		override.hasCustomSentenceAudio,
		override.sentenceAudioStorageRef,
		override.sentenceAudioUrl,
		baseRecord.sentenceAudioHidden,
		baseRecord.hasCustomSentenceAudio,
		baseRecord.sentenceAudioStorageRef,
		baseRecord.sentenceAudioUrl,
	);

	return {
		vocabularyCardId: override.vocabularyCardId,
		imageStorageRef: image.storageRef,
		vocabAudioStorageRef: vocabAudio.storageRef,
		sentenceAudioStorageRef: sentenceAudio.storageRef,
		imageUrl: image.url,
		vocabAudioUrl: vocabAudio.url,
		sentenceAudioUrl: sentenceAudio.url,
		imageHidden: image.hidden,
		vocabAudioHidden: vocabAudio.hidden,
		sentenceAudioHidden: sentenceAudio.hidden,
		hasCustomImage: image.hasCustom,
		hasCustomVocabAudio: vocabAudio.hasCustom,
		hasCustomSentenceAudio: sentenceAudio.hasCustom,
	};
};

export const resolveCollectedCardMediaOverlayByCardId = async (
	client: CollectedCardMediaFunctionClient,
	vocabularyCardIds: string[],
): Promise<Map<string, CollectedCardMediaOverlayRecord>> => {
	const overlaysById = new Map<string, CollectedCardMediaOverlayRecord>();
	const normalizedIds = normalizeCardIds(vocabularyCardIds);
	if (normalizedIds.length === 0) {
		return overlaysById;
	}

	const invoke = getInvokeMethod(client);
	if (!invoke) {
		return overlaysById;
	}

	try {
		const { data, error } = await invoke<CollectedCardMediaResolveResponse>(
			COLLECTED_CARD_MEDIA_EDGE_FUNCTION,
			{
				body: {
					action: "resolve-cards",
					vocabularyCardIds: normalizedIds,
				},
			},
		);

		if (error) {
			console.error("Unable to resolve collected card media overlays:", error);
			return overlaysById;
		}

		const rawRecords = Array.isArray(data?.records) ? data.records : [];
		rawRecords
			.map((record) => normalizeCollectedCardMediaOverlayRecord(record))
			.filter(
				(record): record is CollectedCardMediaOverlayRecord => record !== null,
			)
			.forEach((record) => {
				overlaysById.set(record.vocabularyCardId, record);
			});
	} catch (error) {
		console.error("Unable to resolve collected card media overlays:", error);
	}

	if (hasGuestCollectedCardMediaContext()) {
		const guestOverlaysById =
			await resolveGuestCollectedCardMediaOverlayByCardId(normalizedIds);
		guestOverlaysById.forEach((overlay, vocabularyCardId) => {
			overlaysById.set(
				vocabularyCardId,
				mergeCollectedCardMediaOverlayRecord(
					overlaysById.get(vocabularyCardId),
					overlay,
				),
			);
		});
	}

	return overlaysById;
};

const loadImageElement = async (file: File): Promise<HTMLImageElement> =>
	new Promise((resolve, reject) => {
		const objectUrl = URL.createObjectURL(file);
		const image = new Image();

		const cleanup = () => {
			URL.revokeObjectURL(objectUrl);
		};

		image.onload = () => {
			cleanup();
			resolve(image);
		};

		image.onerror = () => {
			cleanup();
			reject(new Error("Impossible de charger l'image selectionnee."));
		};

		image.src = objectUrl;
	});

const fitWithinDimensions = (
	width: number,
	height: number,
	maxDimension: number,
): { width: number; height: number } => {
	if (width <= maxDimension && height <= maxDimension) {
		return { width, height };
	}

	if (width >= height) {
		const ratio = maxDimension / width;
		return {
			width: maxDimension,
			height: Math.max(1, Math.round(height * ratio)),
		};
	}

	const ratio = maxDimension / height;
	return {
		width: Math.max(1, Math.round(width * ratio)),
		height: maxDimension,
	};
};

const toWebpBlob = async (
	canvas: HTMLCanvasElement,
	quality: number,
): Promise<Blob> => {
	const webpBlob = await new Promise<Blob | null>((resolve) => {
		canvas.toBlob(resolve, "image/webp", quality);
	});

	if (!webpBlob) {
		throw new Error("Compression WEBP impossible.");
	}

	return webpBlob;
};

export const compressCollectedCardImageToWebp = async (
	file: File,
): Promise<File> => {
	const image = await loadImageElement(file);
	const naturalWidth = image.naturalWidth || image.width;
	const naturalHeight = image.naturalHeight || image.height;
	const { width, height } = fitWithinDimensions(
		naturalWidth,
		naturalHeight,
		COLLECTED_CARD_MEDIA_IMAGE_MAX_DIMENSION,
	);

	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;

	const context = canvas.getContext("2d");
	if (!context) {
		throw new Error("Le canevas image est indisponible.");
	}

	context.drawImage(image, 0, 0, width, height);
	const webpBlob = await toWebpBlob(
		canvas,
		COLLECTED_CARD_MEDIA_IMAGE_WEBP_QUALITY,
	);

	const baseName = file.name.replace(/\.[^.]+$/, "") || "collected-card-image";
	return new File([webpBlob], `${baseName}.webp`, {
		type: "image/webp",
		lastModified: Date.now(),
	});
};
