/**
 * Service for video vocabulary cards.
 *
 * Shorts can be served from fixed in-repo cards (3 cards).
 * Other videos continue to use backend cards.
 */

import { getFixedShortVocabCardsForVideo } from "@/data/immersionFixedShortVocabCards";
import { buildCollectedCardSourceLinkPath } from "@/data/immersionVideoRouting";
import { supabase } from "@/integrations/supabase/client";
import type { Video } from "@/interfaces/video";
import {
	applyCollectedCardMediaOverlayToCard,
	resolveCollectedCardMediaOverlayByCardId,
} from "@/lib/collectedCardMedia";
import { repairMojibake } from "@/lib/textEncoding";

// Types - use any cast since vocabulary_cards may not be in generated types
type VocabularyCardsRow = any;

const sanitizeTextField = (value: unknown): unknown => {
	if (typeof value !== "string") {
		return value;
	}
	return repairMojibake(value);
};

const sanitizeOptionalNumberField = (value: unknown): number | null => {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		return null;
	}

	return value;
};

const sanitizeOptionalBooleanField = (value: unknown): boolean | null =>
	typeof value === "boolean" ? value : null;

const sanitizeVocabularyCard = (card: VocabularyCard): VocabularyCard => {
	if (!card || typeof card !== "object") {
		return card;
	}

	return {
		...card,
		id: sanitizeTextField(card.id),
		vocabulary_card_id: sanitizeTextField(card.vocabulary_card_id),
		word_ar: sanitizeTextField(card.word_ar),
		word_ar_bare: sanitizeTextField(card.word_ar_bare),
		word_ar_diacritics: sanitizeTextField(card.word_ar_diacritics),
		word_fr: sanitizeTextField(card.word_fr),
		example_sentence_ar: sanitizeTextField(card.example_sentence_ar),
		example_sentence_ar_diacritics: sanitizeTextField(
			card.example_sentence_ar_diacritics,
		),
		example_sentence_fr: sanitizeTextField(card.example_sentence_fr),
		sentBase: sanitizeTextField(card.sentBase),
		sentFull: sanitizeTextField(card.sentFull),
		vocabBase: sanitizeTextField(card.vocabBase),
		vocabFull: sanitizeTextField(card.vocabFull),
		category: sanitizeTextField(card.category),
		image_url: sanitizeTextField(card.image_url),
		audio_url: sanitizeTextField(card.audio_url),
		sentence_audio_url: sanitizeTextField(card.sentence_audio_url),
		transliteration: sanitizeTextField(card.transliteration),
		source_video_id: sanitizeTextField(card.source_video_id),
		source_video_is_short: sanitizeOptionalBooleanField(
			card.source_video_is_short,
		),
		source_cue_id: sanitizeTextField(card.source_cue_id),
		source_word_index: sanitizeOptionalNumberField(card.source_word_index),
		source_word_start_seconds: sanitizeOptionalNumberField(
			card.source_word_start_seconds,
		),
		source_word_end_seconds: sanitizeOptionalNumberField(
			card.source_word_end_seconds,
		),
		source_link_url: sanitizeTextField(card.source_link_url),
	};
};

const resolveVocabularyCardId = (card: VocabularyCard): string | null => {
	const explicitCardId =
		typeof card.vocabulary_card_id === "string"
			? card.vocabulary_card_id.trim()
			: "";
	if (explicitCardId.length > 0) {
		return explicitCardId;
	}

	const fallbackCardId = typeof card.id === "string" ? card.id.trim() : "";
	return fallbackCardId.length > 0 ? fallbackCardId : null;
};

type CollectedSourceOccurrenceRow = {
	vocabulary_card_id?: unknown;
	source_video_id?: unknown;
	source_video_youtube_id?: unknown;
	source_video_is_short?: unknown;
	source_cue_id?: unknown;
	source_word_index?: unknown;
	source_word_start_seconds?: unknown;
	source_word_end_seconds?: unknown;
};

type SourceVideoRouteRow = {
	id?: unknown;
	source_video_id?: unknown;
};

const normalizeOptionalString = (value: unknown): string | null => {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const buildCollectedSourceOccurrencePatch = (
	row: CollectedSourceOccurrenceRow | null | undefined,
): Record<string, unknown> => {
	const sourceVideoId = normalizeOptionalString(row?.source_video_id);
	const sourceVideoYoutubeId = normalizeOptionalString(
		row?.source_video_youtube_id,
	);
	const sourceVideoIsShort = sanitizeOptionalBooleanField(
		row?.source_video_is_short,
	);
	const sourceWordStartSeconds = sanitizeOptionalNumberField(
		row?.source_word_start_seconds,
	);
	const sourceCueIdValue = row?.source_cue_id;
	const sourceCueId =
		typeof sourceCueIdValue === "number" && Number.isFinite(sourceCueIdValue)
			? String(sourceCueIdValue)
			: normalizeOptionalString(sourceCueIdValue);

	return {
		source_video_id: sourceVideoId,
		source_video_is_short: sourceVideoIsShort,
		source_cue_id: sourceCueId,
		source_word_index: sanitizeOptionalNumberField(row?.source_word_index),
		source_word_start_seconds: sourceWordStartSeconds,
		source_word_end_seconds: sanitizeOptionalNumberField(
			row?.source_word_end_seconds,
		),
		source_link_url: buildCollectedCardSourceLinkPath({
			sourceVideoId,
			sourceVideoYoutubeId,
			sourceVideoIsShort,
			sourceWordStartSeconds,
		}),
	};
};

const hydrateCollectedCardSourceMetadata = async (
	cards: VocabularyCard[],
): Promise<VocabularyCard[]> => {
	const vocabularyCardIds = cards
		.map((card) => resolveVocabularyCardId(card))
		.filter((cardId): cardId is string => cardId !== null);

	if (vocabularyCardIds.length === 0) {
		return cards;
	}

	const sourceRowsById = new Map<string, CollectedSourceOccurrenceRow>();
	const cardIdChunks: string[][] = [];
	for (let index = 0; index < vocabularyCardIds.length; index += 100) {
		cardIdChunks.push(vocabularyCardIds.slice(index, index + 100));
	}

	try {
		for (const cardIdChunk of cardIdChunks) {
			const { data, error } = await (supabase as any)
				.from("user_card_state")
				.select(
					"vocabulary_card_id,source_video_id,source_video_is_short,source_cue_id,source_word_index,source_word_start_seconds,source_word_end_seconds",
				)
				.in("vocabulary_card_id", cardIdChunk);

			if (error) {
				return cards;
			}

			(data ?? []).forEach((row: CollectedSourceOccurrenceRow) => {
				const vocabularyCardId = normalizeOptionalString(
					row.vocabulary_card_id,
				);
				if (!vocabularyCardId || sourceRowsById.has(vocabularyCardId)) {
					return;
				}

				sourceRowsById.set(vocabularyCardId, row);
			});
		}
	} catch {
		return cards;
	}

	if (sourceRowsById.size === 0) {
		return cards;
	}

	const shortSourceVideoIds = Array.from(
		new Set(
			Array.from(sourceRowsById.values())
				.filter(
					(row) =>
						sanitizeOptionalBooleanField(row.source_video_is_short) === true,
				)
				.map((row) => normalizeOptionalString(row.source_video_id))
				.filter((value): value is string => value !== null),
		),
	);

	const sourceVideoYoutubeIdById = new Map<string, string>();
	if (shortSourceVideoIds.length > 0) {
		const sourceVideoIdChunks: string[][] = [];
		for (let index = 0; index < shortSourceVideoIds.length; index += 100) {
			sourceVideoIdChunks.push(shortSourceVideoIds.slice(index, index + 100));
		}

		try {
			for (const sourceVideoIdChunk of sourceVideoIdChunks) {
				const { data, error } = await (supabase as any)
					.from("videos")
					.select("id,source_video_id")
					.in("id", sourceVideoIdChunk);

				if (error) {
					break;
				}

				(data ?? []).forEach((row: SourceVideoRouteRow) => {
					const sourceVideoId = normalizeOptionalString(row.id);
					const sourceVideoYoutubeId = normalizeOptionalString(
						row.source_video_id,
					);
					if (!sourceVideoId || !sourceVideoYoutubeId) {
						return;
					}

					sourceVideoYoutubeIdById.set(sourceVideoId, sourceVideoYoutubeId);
				});
			}
		} catch {
			// Ignore route-id enrichment failures and fall back to the raw stored id.
		}
	}

	return cards.map((card) => {
		const vocabularyCardId = resolveVocabularyCardId(card);
		if (!vocabularyCardId) {
			return card;
		}

		const sourceRow = sourceRowsById.get(vocabularyCardId);
		if (!sourceRow) {
			return card;
		}

		const sourceVideoId = normalizeOptionalString(sourceRow.source_video_id);
		const sourceVideoYoutubeId = sourceVideoId
			? (sourceVideoYoutubeIdById.get(sourceVideoId) ?? null)
			: null;

		return sanitizeVocabularyCard({
			...card,
			...buildCollectedSourceOccurrencePatch({
				...sourceRow,
				source_video_youtube_id: sourceVideoYoutubeId,
			}),
		} as VocabularyCard);
	});
};

const hydrateCollectedCardReadState = async (
	cards: VocabularyCard[],
): Promise<VocabularyCard[]> => {
	const cardsWithSourceMetadata =
		await hydrateCollectedCardSourceMetadata(cards);
	return hydrateCollectedCardMediaOverlays(cardsWithSourceMetadata);
};

const hydrateCollectedCardMediaOverlays = async (
	cards: VocabularyCard[],
): Promise<VocabularyCard[]> => {
	const vocabularyCardIds = cards
		.map((card) => resolveVocabularyCardId(card))
		.filter((cardId): cardId is string => cardId !== null);

	if (vocabularyCardIds.length === 0) {
		return cards;
	}

	const overlaysById = await resolveCollectedCardMediaOverlayByCardId(
		supabase,
		vocabularyCardIds,
	);
	if (overlaysById.size === 0) {
		return cards;
	}

	return cards.map((card) => {
		const vocabularyCardId = resolveVocabularyCardId(card);
		if (!vocabularyCardId) {
			return card;
		}

		return sanitizeVocabularyCard(
			applyCollectedCardMediaOverlayToCard(
				card as Record<string, unknown>,
				overlaysById.get(vocabularyCardId),
			) as VocabularyCard,
		);
	});
};

// Types pour les mots extraits par OpenAI
export interface ExtractedWord {
	arabic: string;
	french: string;
	example: string;
	category: "Business" | "Culture" | "Quotidien" | "Voyage" | "Santé";
}

// Re-export the generated type for convenience
export type VocabularyCard = VocabularyCardsRow;

const TARGET_VOCAB_CARDS_PER_VIDEO = 5;
const TARGET_VOCAB_CARDS_PER_SHORT_VIDEO = 3;

const VIDEO_UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuidVideoId = (value: string): boolean =>
	VIDEO_UUID_PATTERN.test(value);

const resolvedVideoIdCache = new Map<string, string | null>();

const trimToTargetCards = (
	cards: VocabularyCard[],
	targetCards: number,
): VocabularyCard[] => cards.slice(0, targetCards);

const buildVideoLookupKey = (
	video: Pick<Video, "videoId" | "youtubeId" | "videoUrl" | "title">,
): string => {
	return [
		video.videoId ?? "",
		video.youtubeId ?? "",
		video.videoUrl ?? "",
		video.title ?? "",
	].join("|");
};

type VideoIdQuery = {
	limit: (count: number) => {
		maybeSingle: () => Promise<{
			data: { id?: unknown } | null;
			error: { code?: string; message: string } | null;
		}>;
	};
};

const fetchSingleVideoId = async (
	query: VideoIdQuery,
): Promise<string | null> => {
	const { data, error } = await query.limit(1).maybeSingle();

	if (error && error.code !== "PGRST116") {
		throw new Error(`Failed to resolve video mapping: ${error.message}`);
	}

	if (!data || typeof data.id !== "string") {
		return null;
	}

	return data.id;
};

export async function resolveBackendVideoId(
	video: Pick<Video, "videoId" | "youtubeId" | "videoUrl" | "title">,
): Promise<string | null> {
	if (isUuidVideoId(video.videoId)) {
		return video.videoId;
	}

	const cacheKey = buildVideoLookupKey(video);
	if (resolvedVideoIdCache.has(cacheKey)) {
		return resolvedVideoIdCache.get(cacheKey) ?? null;
	}

	const sourceKey = (video.videoId ?? "").trim();
	if (sourceKey.length > 0) {
		const bySourceKey = await fetchSingleVideoId(
			(supabase as any)
				.from("videos")
				.select("id")
				.eq("is_published", true)
				.eq("source_key", sourceKey),
		);
		if (bySourceKey) {
			resolvedVideoIdCache.set(cacheKey, bySourceKey);
			return bySourceKey;
		}
	}

	const youtubeId = (video.youtubeId ?? "").trim();
	if (youtubeId.length > 0) {
		const byYoutubeId = await fetchSingleVideoId(
			(supabase as any)
				.from("videos")
				.select("id")
				.eq("is_published", true)
				.eq("source_video_id", youtubeId),
		);
		if (byYoutubeId) {
			resolvedVideoIdCache.set(cacheKey, byYoutubeId);
			return byYoutubeId;
		}
	}

	const videoUrl = (video.videoUrl ?? "").trim();
	if (videoUrl.length > 0) {
		const byVideoUrl = await fetchSingleVideoId(
			(supabase as any)
				.from("videos")
				.select("id")
				.eq("is_published", true)
				.eq("video_url", videoUrl),
		);
		if (byVideoUrl) {
			resolvedVideoIdCache.set(cacheKey, byVideoUrl);
			return byVideoUrl;
		}
	}

	resolvedVideoIdCache.set(cacheKey, null);
	return null;
}

// Type pour la réponse de l'Edge Function
export interface GenerateVocabCardsResponse {
	success: boolean;
	message: string;
	cards?: VocabularyCard[];
	words?: ExtractedWord[];
	error?: string;
	code?: string;
}

// Type pour les erreurs
export interface VocabCardsError extends Error {
	code?: string;
}

/**
 * Génère les cartes de vocabulaire pour une vidéo en utilisant OpenAI
 *
 * @param videoId - L'ID de la vidéo à traiter
 * @returns Une promesse avec les cartes générées
 *
 * @throws {VocabCardsError} Si la génération échoue
 *
 * @example
 * ```typescript
 * try {
 *   const result = await generateVocabCards('video-uuid');
 *   console.log(`Généré ${result.cards.length} cartes`);
 *   result.words.forEach(word => {
 *     console.log(`${word.arabic} - ${word.french}`);
 *   });
 * } catch (error) {
 *   console.error('Erreur:', error.message);
 * }
 * ```
 */
export async function generateVocabCards(
	videoId: string,
): Promise<GenerateVocabCardsResponse> {
	try {
		// Appeler l'Edge Function Supabase
		const { data, error } =
			await supabase.functions.invoke<GenerateVocabCardsResponse>(
				"generate-vocab-cards",
				{
					body: { videoId },
				},
			);

		if (error) {
			throw new Error(`Edge Function error: ${error.message}`);
		}

		if (!data) {
			throw new Error("No data returned from Edge Function");
		}

		// Vérifier si c'est une erreur
		if (data.error) {
			const errorObj = new Error(data.error) as VocabCardsError;
			errorObj.code = data.code;
			throw errorObj;
		}

		return data;
	} catch (error) {
		if (error instanceof Error) {
			throw error;
		}

		throw new Error("Unknown error occurred while generating vocabulary cards");
	}
}

/**
 * Récupère les cartes de vocabulaire d'une vidéo
 *
 * @param videoId - L'ID de la vidéo
 * @returns Une promesse avec les cartes de vocabulaire
 */
export async function getVocabCards(
	videoId: string,
): Promise<VocabularyCard[]> {
	const { data, error } = await (supabase as any)
		.from("vocabulary_cards")
		.select("*")
		.eq("video_id", videoId)
		.order("created_at", { ascending: true });

	if (error) {
		throw new Error(`Failed to fetch vocabulary cards: ${error.message}`);
	}

	const rows = data || [];
	return hydrateCollectedCardReadState(rows.map(sanitizeVocabularyCard));
}

export async function getVocabCardsForVideo(
	video: Pick<
		Video,
		"videoId" | "youtubeId" | "videoUrl" | "title" | "isShort"
	>,
): Promise<VocabularyCard[]> {
	const fixedShortCards = getFixedShortVocabCardsForVideo({
		videoId: video.videoId,
		isShort: video.isShort,
		videoUrl: video.videoUrl,
	});

	if (fixedShortCards.length > 0) {
		return hydrateCollectedCardReadState(
			trimToTargetCards(
				fixedShortCards.map(sanitizeVocabularyCard),
				TARGET_VOCAB_CARDS_PER_SHORT_VIDEO,
			),
		);
	}

	const resolvedVideoId = await resolveBackendVideoId(video);
	if (!resolvedVideoId) {
		return [];
	}

	const targetCards = video.isShort
		? TARGET_VOCAB_CARDS_PER_SHORT_VIDEO
		: TARGET_VOCAB_CARDS_PER_VIDEO;

	return trimToTargetCards(await getVocabCards(resolvedVideoId), targetCards);
}

/**
 * Vérifie si une vidéo a des cartes de vocabulaire générées
 *
 * @param videoId - L'ID de la vidéo
 * @returns true si les cartes sont générées, false sinon
 */
export async function hasVocabCards(videoId: string): Promise<boolean> {
	const { count, error } = await (supabase as any)
		.from("vocabulary_cards")
		.select("id", { count: "exact", head: true })
		.eq("video_id", videoId);

	if (error) {
		return false;
	}

	return (count || 0) > 0;
}

/**
 * Type d'erreur pour la génération de cartes
 */
export class VocabCardsGenerationError extends Error {
	constructor(
		message: string,
		public code?: string,
		public originalError?: unknown,
	) {
		super(message);
		this.name = "VocabCardsGenerationError";
	}
}

/**
 * Codes d'erreur possibles
 */
export const VOCAB_CARDS_ERROR_CODES = {
	OPENAI_ERROR: "OPENAI_ERROR",
	VIDEO_ERROR: "VIDEO_ERROR",
	INTERNAL_ERROR: "INTERNAL_ERROR",
	NO_SUBTITLES: "NO_SUBTITLES",
} as const;
