import { readActiveUserId } from "@/lib/authPersistence";
import { getGuestId, initGuestSession } from "@/lib/guestSession";

export type LocalFoundationCardMediaKind =
	| "image"
	| "vocab-audio"
	| "sentence-audio";

export type LocalFoundationCardMediaOverlayRecord = {
	foundationCardId: string;
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

type LocalFoundationCardMediaEntry = {
	foundationCardId: string;
	imageDataUrl: string | null;
	vocabAudioDataUrl: string | null;
	sentenceAudioDataUrl: string | null;
	hideImage: boolean;
	hideVocabAudio: boolean;
	hideSentenceAudio: boolean;
	updatedAt: number;
};

type SaveLocalFoundationCardMediaAssetsParams = {
	foundationCardId: string;
	imageFile?: File | null;
	vocabAudioFile?: File | null;
	sentenceAudioFile?: File | null;
};

type DeleteLocalFoundationCardMediaSlotParams = {
	foundationCardId: string;
	slot: LocalFoundationCardMediaKind;
};

type ResetLocalFoundationCardMediaParams = {
	foundationCardId: string;
};

const LOCAL_FOUNDATION_CARD_MEDIA_STORAGE_PREFIX =
	"local:foundation-card-media:v1";

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

const toOptionalNonEmptyString = (value: unknown): string | null => {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const toBoolean = (value: unknown): boolean => value === true;

const getStorageKey = (scope: string): string =>
	`${LOCAL_FOUNDATION_CARD_MEDIA_STORAGE_PREFIX}:${scope}`;

const resolveLocalFoundationCardMediaReadScope = (): string | null => {
	const activeUserId = readActiveUserId().trim();
	if (activeUserId) {
		return `user:${activeUserId}`;
	}

	const guestId = getGuestId();
	return guestId ? `guest:${guestId}` : null;
};

const resolveLocalFoundationCardMediaWriteScope = (): string => {
	const activeUserId = readActiveUserId().trim();
	if (activeUserId) {
		return `user:${activeUserId}`;
	}

	return `guest:${initGuestSession()}`;
};

const normalizeEntry = (
	value: unknown,
): LocalFoundationCardMediaEntry | null => {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}

	const record = value as Record<string, unknown>;
	const foundationCardId = toOptionalNonEmptyString(record.foundationCardId);
	if (!foundationCardId) {
		return null;
	}

	return {
		foundationCardId,
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

const loadEntriesByFoundationCardId = (
	scope: string,
): Map<string, LocalFoundationCardMediaEntry> => {
	const storage = safeLocalStorage();
	if (!storage) {
		return new Map();
	}

	try {
		const raw = storage.getItem(getStorageKey(scope));
		if (!raw) {
			return new Map();
		}

		const parsed = JSON.parse(raw);
		const values = Array.isArray(parsed) ? parsed : [];
		return new Map(
			values
				.map((entry) => normalizeEntry(entry))
				.filter(
					(entry): entry is LocalFoundationCardMediaEntry => entry !== null,
				)
				.map((entry) => [entry.foundationCardId, entry]),
		);
	} catch {
		return new Map();
	}
};

const persistEntriesByFoundationCardId = (
	scope: string,
	entriesByFoundationCardId: Map<string, LocalFoundationCardMediaEntry>,
): void => {
	const storage = safeLocalStorage();
	if (!storage) {
		throw new Error("Stockage local indisponible sur cet appareil.");
	}

	try {
		storage.setItem(
			getStorageKey(scope),
			JSON.stringify(Array.from(entriesByFoundationCardId.values())),
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

const buildOverlayRecord = (
	foundationCardId: string,
	entry?: LocalFoundationCardMediaEntry | null,
): LocalFoundationCardMediaOverlayRecord => {
	const hasCustomImage =
		Boolean(entry?.imageDataUrl) || Boolean(entry?.hideImage);
	const hasCustomVocabAudio =
		Boolean(entry?.vocabAudioDataUrl) || Boolean(entry?.hideVocabAudio);
	const hasCustomSentenceAudio =
		Boolean(entry?.sentenceAudioDataUrl) || Boolean(entry?.hideSentenceAudio);

	return {
		foundationCardId,
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
		hasCustomImage,
		hasCustomVocabAudio,
		hasCustomSentenceAudio,
	};
};

export const resolveLocalFoundationCardMediaOverlayByCardId = async (
	foundationCardIds: string[],
): Promise<Map<string, LocalFoundationCardMediaOverlayRecord>> => {
	const scope = resolveLocalFoundationCardMediaReadScope();
	if (!scope) {
		return new Map();
	}

	const entriesByFoundationCardId = loadEntriesByFoundationCardId(scope);
	const overlaysByFoundationCardId = new Map<
		string,
		LocalFoundationCardMediaOverlayRecord
	>();

	foundationCardIds.forEach((rawFoundationCardId) => {
		const foundationCardId = rawFoundationCardId.trim();
		if (!foundationCardId) {
			return;
		}

		const entry = entriesByFoundationCardId.get(foundationCardId);
		if (!entry) {
			return;
		}

		overlaysByFoundationCardId.set(
			foundationCardId,
			buildOverlayRecord(foundationCardId, entry),
		);
	});

	return overlaysByFoundationCardId;
};

export const saveLocalFoundationCardMediaAssets = async (
	params: SaveLocalFoundationCardMediaAssetsParams,
): Promise<LocalFoundationCardMediaOverlayRecord> => {
	const foundationCardId = params.foundationCardId.trim();
	if (!foundationCardId) {
		throw new Error("Impossible de sauvegarder sans identifiant de carte.");
	}

	const scope = resolveLocalFoundationCardMediaWriteScope();
	const entriesByFoundationCardId = loadEntriesByFoundationCardId(scope);
	const currentEntry = entriesByFoundationCardId.get(foundationCardId) ?? null;
	const nextEntry: LocalFoundationCardMediaEntry = {
		foundationCardId,
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

	entriesByFoundationCardId.set(foundationCardId, nextEntry);
	persistEntriesByFoundationCardId(scope, entriesByFoundationCardId);
	return buildOverlayRecord(foundationCardId, nextEntry);
};

export const deleteLocalFoundationCardMediaSlot = async (
	params: DeleteLocalFoundationCardMediaSlotParams,
): Promise<LocalFoundationCardMediaOverlayRecord> => {
	const foundationCardId = params.foundationCardId.trim();
	if (!foundationCardId) {
		throw new Error("Impossible de supprimer sans identifiant de carte.");
	}

	const scope = resolveLocalFoundationCardMediaWriteScope();
	const entriesByFoundationCardId = loadEntriesByFoundationCardId(scope);
	const currentEntry = entriesByFoundationCardId.get(foundationCardId) ?? null;
	const nextEntry: LocalFoundationCardMediaEntry = {
		foundationCardId,
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

	entriesByFoundationCardId.set(foundationCardId, nextEntry);
	persistEntriesByFoundationCardId(scope, entriesByFoundationCardId);
	return buildOverlayRecord(foundationCardId, nextEntry);
};

export const resetLocalFoundationCardMediaOverrides = async (
	params: ResetLocalFoundationCardMediaParams,
): Promise<LocalFoundationCardMediaOverlayRecord> => {
	const foundationCardId = params.foundationCardId.trim();
	if (!foundationCardId) {
		throw new Error("Impossible de reinitialiser sans identifiant de carte.");
	}

	const scope = resolveLocalFoundationCardMediaWriteScope();
	const entriesByFoundationCardId = loadEntriesByFoundationCardId(scope);
	entriesByFoundationCardId.delete(foundationCardId);
	persistEntriesByFoundationCardId(scope, entriesByFoundationCardId);

	return buildOverlayRecord(foundationCardId, null);
};
