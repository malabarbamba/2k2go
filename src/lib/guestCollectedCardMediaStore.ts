import type {
	CollectedCardMediaKind,
	CollectedCardMediaOverlayRecord,
	DeleteCollectedCardMediaSlotParams,
	SaveCollectedCardMediaAssetsParams,
} from "@/lib/collectedCardMedia";
import { getGuestId, initGuestSession, isGuestUser } from "@/lib/guestSession";

const GUEST_COLLECTED_CARD_MEDIA_STORAGE_PREFIX =
	"guest:collected-card-media:v1";

type GuestCollectedCardMediaEntry = {
	vocabularyCardId: string;
	imageDataUrl: string | null;
	vocabAudioDataUrl: string | null;
	sentenceAudioDataUrl: string | null;
	hideImage: boolean;
	hideVocabAudio: boolean;
	hideSentenceAudio: boolean;
	updatedAt: number;
};

const isBrowser = (): boolean => typeof window !== "undefined";

const safeLocalStorage = (): Storage | null => {
	if (!isBrowser()) {
		return null;
	}

	try {
		return window.localStorage;
	} catch {
		return null;
	}
};

const getStorageKey = (guestId: string): string =>
	`${GUEST_COLLECTED_CARD_MEDIA_STORAGE_PREFIX}:${guestId}`;

const toOptionalNonEmptyString = (value: unknown): string | null => {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const toBoolean = (value: unknown): boolean => value === true;

const normalizeEntry = (
	value: unknown,
): GuestCollectedCardMediaEntry | null => {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}

	const record = value as Record<string, unknown>;
	const vocabularyCardId = toOptionalNonEmptyString(record.vocabularyCardId);
	if (!vocabularyCardId) {
		return null;
	}

	return {
		vocabularyCardId,
		imageDataUrl: toOptionalNonEmptyString(record.imageDataUrl),
		vocabAudioDataUrl: toOptionalNonEmptyString(record.vocabAudioDataUrl),
		sentenceAudioDataUrl: toOptionalNonEmptyString(record.sentenceAudioDataUrl),
		hideImage: toBoolean(record.hideImage),
		hideVocabAudio: toBoolean(record.hideVocabAudio),
		hideSentenceAudio: toBoolean(record.hideSentenceAudio),
		updatedAt:
			typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
				? record.updatedAt
				: Date.now(),
	};
};

const loadEntriesByCardId = (
	guestId: string,
): Map<string, GuestCollectedCardMediaEntry> => {
	const storage = safeLocalStorage();
	if (!storage) {
		return new Map();
	}

	try {
		const raw = storage.getItem(getStorageKey(guestId));
		if (!raw) {
			return new Map();
		}

		const parsed = JSON.parse(raw);
		const values = Array.isArray(parsed) ? parsed : [];
		return new Map(
			values
				.map((entry) => normalizeEntry(entry))
				.filter(
					(entry): entry is GuestCollectedCardMediaEntry => entry !== null,
				)
				.map((entry) => [entry.vocabularyCardId, entry]),
		);
	} catch {
		return new Map();
	}
};

const persistEntriesByCardId = (
	guestId: string,
	entriesByCardId: Map<string, GuestCollectedCardMediaEntry>,
): void => {
	const storage = safeLocalStorage();
	if (!storage) {
		throw new Error("Stockage local indisponible sur cet appareil.");
	}

	try {
		storage.setItem(
			getStorageKey(guestId),
			JSON.stringify(Array.from(entriesByCardId.values())),
		);
	} catch {
		throw new Error(
			"Impossible de sauvegarder ces medias localement (espace navigateur insuffisant).",
		);
	}
};

const fileToDataUrl = async (file: File): Promise<string> =>
	new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
		reader.onload = () => {
			const result = typeof reader.result === "string" ? reader.result : null;
			if (!result) {
				reject(new Error("Lecture du fichier impossible."));
				return;
			}
			resolve(result);
		};
		reader.readAsDataURL(file);
	});

const buildGuestStorageRef = (
	guestId: string,
	vocabularyCardId: string,
	kind: CollectedCardMediaKind,
): string => `guest-local://${guestId}/${vocabularyCardId}/${kind}`;

const buildOverlayRecord = (
	guestId: string,
	vocabularyCardId: string,
	entry?: GuestCollectedCardMediaEntry | null,
): CollectedCardMediaOverlayRecord => {
	const imageCustom = Boolean(entry?.imageDataUrl) || Boolean(entry?.hideImage);
	const vocabCustom =
		Boolean(entry?.vocabAudioDataUrl) || Boolean(entry?.hideVocabAudio);
	const sentenceCustom =
		Boolean(entry?.sentenceAudioDataUrl) || Boolean(entry?.hideSentenceAudio);

	return {
		vocabularyCardId,
		imageStorageRef: entry?.imageDataUrl
			? buildGuestStorageRef(guestId, vocabularyCardId, "image")
			: null,
		vocabAudioStorageRef: entry?.vocabAudioDataUrl
			? buildGuestStorageRef(guestId, vocabularyCardId, "vocab-audio")
			: null,
		sentenceAudioStorageRef: entry?.sentenceAudioDataUrl
			? buildGuestStorageRef(guestId, vocabularyCardId, "sentence-audio")
			: null,
		imageUrl: entry?.hideImage ? null : (entry?.imageDataUrl ?? null),
		vocabAudioUrl: entry?.hideVocabAudio
			? null
			: (entry?.vocabAudioDataUrl ?? null),
		sentenceAudioUrl: entry?.hideSentenceAudio
			? null
			: (entry?.sentenceAudioDataUrl ?? null),
		imageHidden: Boolean(entry?.hideImage),
		vocabAudioHidden: Boolean(entry?.hideVocabAudio),
		sentenceAudioHidden: Boolean(entry?.hideSentenceAudio),
		hasCustomImage: imageCustom,
		hasCustomVocabAudio: vocabCustom,
		hasCustomSentenceAudio: sentenceCustom,
	};
};

export const hasGuestCollectedCardMediaContext = (): boolean => {
	if (!isBrowser()) {
		return false;
	}

	return isGuestUser() || getGuestId() !== null;
};

export const resolveGuestCollectedCardMediaOverlayByCardId = async (
	vocabularyCardIds: string[],
): Promise<Map<string, CollectedCardMediaOverlayRecord>> => {
	const guestId = getGuestId();
	if (!guestId) {
		return new Map();
	}

	const entriesByCardId = loadEntriesByCardId(guestId);
	const overlaysByCardId = new Map<string, CollectedCardMediaOverlayRecord>();

	vocabularyCardIds.forEach((vocabularyCardId) => {
		const cardId = vocabularyCardId.trim();
		if (!cardId) {
			return;
		}

		const entry = entriesByCardId.get(cardId);
		if (!entry) {
			return;
		}

		overlaysByCardId.set(cardId, buildOverlayRecord(guestId, cardId, entry));
	});

	return overlaysByCardId;
};

export const saveGuestCollectedCardMediaAssets = async (
	params: SaveCollectedCardMediaAssetsParams,
): Promise<CollectedCardMediaOverlayRecord> => {
	const guestId = initGuestSession();
	const entriesByCardId = loadEntriesByCardId(guestId);
	const currentEntry = entriesByCardId.get(params.vocabularyCardId) ?? null;
	const nextEntry: GuestCollectedCardMediaEntry = {
		vocabularyCardId: params.vocabularyCardId,
		imageDataUrl: currentEntry?.imageDataUrl ?? null,
		vocabAudioDataUrl: currentEntry?.vocabAudioDataUrl ?? null,
		sentenceAudioDataUrl: currentEntry?.sentenceAudioDataUrl ?? null,
		hideImage: currentEntry?.hideImage ?? false,
		hideVocabAudio: currentEntry?.hideVocabAudio ?? false,
		hideSentenceAudio: currentEntry?.hideSentenceAudio ?? false,
		updatedAt: Date.now(),
	};

	if (params.imageFile instanceof File) {
		nextEntry.imageDataUrl = await fileToDataUrl(params.imageFile);
		nextEntry.hideImage = false;
	}
	if (params.vocabAudioFile instanceof File) {
		nextEntry.vocabAudioDataUrl = await fileToDataUrl(params.vocabAudioFile);
		nextEntry.hideVocabAudio = false;
	}
	if (params.sentenceAudioFile instanceof File) {
		nextEntry.sentenceAudioDataUrl = await fileToDataUrl(
			params.sentenceAudioFile,
		);
		nextEntry.hideSentenceAudio = false;
	}

	entriesByCardId.set(params.vocabularyCardId, nextEntry);
	persistEntriesByCardId(guestId, entriesByCardId);
	return buildOverlayRecord(guestId, params.vocabularyCardId, nextEntry);
};

export const deleteGuestCollectedCardMediaSlot = async (
	params: DeleteCollectedCardMediaSlotParams,
): Promise<CollectedCardMediaOverlayRecord> => {
	const guestId = initGuestSession();
	const entriesByCardId = loadEntriesByCardId(guestId);
	const currentEntry = entriesByCardId.get(params.vocabularyCardId) ?? null;
	const nextEntry: GuestCollectedCardMediaEntry = {
		vocabularyCardId: params.vocabularyCardId,
		imageDataUrl: currentEntry?.imageDataUrl ?? null,
		vocabAudioDataUrl: currentEntry?.vocabAudioDataUrl ?? null,
		sentenceAudioDataUrl: currentEntry?.sentenceAudioDataUrl ?? null,
		hideImage: currentEntry?.hideImage ?? false,
		hideVocabAudio: currentEntry?.hideVocabAudio ?? false,
		hideSentenceAudio: currentEntry?.hideSentenceAudio ?? false,
		updatedAt: Date.now(),
	};

	if (params.slot === "image") {
		nextEntry.imageDataUrl = null;
		nextEntry.hideImage = true;
	}
	if (params.slot === "vocab-audio") {
		nextEntry.vocabAudioDataUrl = null;
		nextEntry.hideVocabAudio = true;
	}
	if (params.slot === "sentence-audio") {
		nextEntry.sentenceAudioDataUrl = null;
		nextEntry.hideSentenceAudio = true;
	}

	entriesByCardId.set(params.vocabularyCardId, nextEntry);
	persistEntriesByCardId(guestId, entriesByCardId);
	return buildOverlayRecord(guestId, params.vocabularyCardId, nextEntry);
};
