import type { PostgrestError } from "@supabase/supabase-js";
import { foundation2kDeck } from "@/data/foundation2kDeck";
import {
	resolveFoundationDeckMediaByFrequencyRank,
	resolveFoundationDeckMedia,
} from "@/lib/foundationDeckMedia";
import {
	stripHarakat,
	type ReviewType,
	type VocabCard,
} from "@/lib/deck-perso-adapters";
import type { GetDueCardsV2Row } from "@/lib/supabase/rpc";
import {
	deckPersoDueReviewInternals,
	type BinaryReviewRating,
	type ServiceResult,
	type SubmitReviewSchedulerPayload,
} from "@/services/deckPersoService";

export type ReviewMutationOptions = {
	mode: "preview" | "real";
};

const {
	DUE_SUNSET_GUARD_BLOCKED_ERROR_MESSAGE,
	CLIENT_UNAVAILABLE_ERROR,
	SHADOW_DIFF_REASON_CODES,
	resolveClient,
	resolveCardKey,
	resolveAccountKey,
	createServiceError,
	fromPostgrestError,
	fromUnknownError,
	toJsonCompatible,
	isBrowserOffline,
	getOrCreateClientReviewId,
	enqueueReviewSubmission,
	fetchDueVocabularyRowsById,
	fetchResolvedUserVocabularyCardMediaById,
	fetchCollectedSourceOccurrencesByVocabularyCardId,
	resolveDueVocabularyCardId,
	isAlphabetDueRecord,
	applyCollectedSourceOccurrenceToDueRecord,
	applyUserVocabularyCardMediaToDueVocabularyRow,
	mergeDueRecordWithVocabularyRow,
	orderFoundationCardsByFocus,
	mapCardToReviewType,
	resolveSchedulerShadowDiffContext,
	isDeckPersoSchedulerRollbackToLegacyEnabled,
	isDeckPersoSchedulerLegacyFallbackSunsetGuardEnabled,
	shouldFallbackToLegacyDueFetch,
	shouldAllowLegacyFallbackOnTransportFailure,
	shouldAllowLegacyFallbackOnInvalidRuntimePayload,
	resolveActiveWeightsVersion,
	insertSchedulerShadowDiffEvent,
	serializeShadowOutput,
	serializeShadowError,
	normalizeSchedulerQueueRows,
	summarizeDueCardsDiff,
	guardPreviewMode,
	submitReviewNow,
	getDueCardsV2,
	supabaseCardToVocabCard,
	parseSchedulerDueResponse,
} = deckPersoDueReviewInternals;

type FoundationDeckMediaRow = {
	id: string;
	word_ar: string | null;
	word_fr: string | null;
	frequency_rank?: number | null;
};

type CanonicalReviewCardRow = {
	id: string;
	term: string | null;
	translation: string | null;
	transliteration: string | null;
	example_term: string | null;
	example_translation: string | null;
	frequency_rank: number | null;
	image_url: string | null;
	audio_url: string | null;
	sentence_audio_url: string | null;
};

type FoundationDeckContentRecord = {
	category: string | null;
	exampleSentenceAr: string;
	exampleSentenceFr: string;
	wordAr: string;
	wordFr: string;
};

const toOptionalNonEmptyString = (value: unknown): string | null => {
	if (typeof value !== "string") {
		return null;
	}

	const trimmedValue = value.trim();
	return trimmedValue.length > 0 ? trimmedValue : null;
};

const normalizeFoundationWordKey = (value: unknown): string => {
	const normalizedValue = toOptionalNonEmptyString(value);
	if (!normalizedValue) {
		return "";
	}

	return stripHarakat(normalizedValue).replace(/\s+/g, " ").trim();
};

const foundationDeckContentByWordKey = new Map<string, FoundationDeckContentRecord>();

foundation2kDeck.forEach((card) => {
	const key = normalizeFoundationWordKey(card.wordAr);
	if (!key || foundationDeckContentByWordKey.has(key)) {
		return;
	}

	foundationDeckContentByWordKey.set(key, {
		category: card.category,
		exampleSentenceAr: card.exampleSentenceAr,
		exampleSentenceFr: card.exampleSentenceFr,
		wordAr: card.wordAr,
		wordFr: card.wordFr,
	});
});

const resolveFoundationDeckContentRecord = (
	wordAr: string | null | undefined,
): FoundationDeckContentRecord | null => {
	const key = normalizeFoundationWordKey(wordAr);
	return key ? (foundationDeckContentByWordKey.get(key) ?? null) : null;
};

const hasMissingReviewCardMedia = (card: VocabCard): boolean =>
	!toOptionalNonEmptyString(card.image) ||
		!toOptionalNonEmptyString(card.vocabAudioUrl) ||
		!toOptionalNonEmptyString(card.sentenceAudioUrl);

const isFoundationReviewCard = (card: VocabCard): boolean =>
	card.source === "foundation" || card.sourceType === "foundation";

const buildResolvedMediaValue = ({
	existingValue,
	fallbackValue,
	hidden,
	overlayValue,
}: {
	existingValue: string | null | undefined;
	fallbackValue: string | null | undefined;
	hidden: boolean;
	overlayValue: string | null | undefined;
}): string | null => {
	if (hidden) {
		return null;
	}

	return (
		toOptionalNonEmptyString(existingValue) ??
		toOptionalNonEmptyString(overlayValue) ??
		toOptionalNonEmptyString(fallbackValue)
	);
};

const chunkIds = (ids: string[], chunkSize = 200): string[][] => {
	if (ids.length === 0) {
		return [];
	}

	const chunks: string[][] = [];
	for (let index = 0; index < ids.length; index += chunkSize) {
		chunks.push(ids.slice(index, index + chunkSize));
	}

	return chunks;
};

const countAvailableMediaFields = (row: {
	image_url?: string | null;
	audio_url?: string | null;
	sentence_audio_url?: string | null;
}): number => {
	let total = 0;
	if (toOptionalNonEmptyString(row.image_url)) {
		total += 1;
	}
	if (toOptionalNonEmptyString(row.audio_url)) {
		total += 1;
	}
	if (toOptionalNonEmptyString(row.sentence_audio_url)) {
		total += 1;
	}

	return total;
};

const fetchCanonicalReviewCardRowsById = async (
	client: Parameters<typeof fetchDueVocabularyRowsById>[0],
	cardIds: string[],
): Promise<Map<string, CanonicalReviewCardRow>> => {
	const rowsById = new Map<string, CanonicalReviewCardRow>();
	const normalizedIds = Array.from(
		new Set(
			cardIds
				.map((value) => toOptionalNonEmptyString(value))
				.filter((value): value is string => value !== null),
		),
	);
	if (normalizedIds.length === 0) {
		return rowsById;
	}

	const fromMethod = (client as unknown as {
		from?: (table: string) => any;
	}).from;
	const from = typeof fromMethod === "function" ? fromMethod.bind(client) : null;
	if (!from) {
		return rowsById;
	}

	for (const idChunk of chunkIds(normalizedIds)) {
		try {
			const { data, error } = await from("cards_v1")
				.select(
					"id,term,translation,transliteration,example_term,example_translation,frequency_rank,image_url,audio_url,sentence_audio_url",
				)
				.in("id", idChunk);

			if (error) {
				console.error("Unable to load canonical review card media rows:", error);
				return rowsById;
			}

			(data ?? []).forEach((row: CanonicalReviewCardRow) => {
				const rowId = toOptionalNonEmptyString(row.id);
				if (rowId) {
					rowsById.set(rowId, row);
				}
			});
		} catch (error) {
			console.error("Unable to load canonical review card media rows:", error);
			return rowsById;
		}
	}

	return rowsById;
};

const enrichDueRowsWithResolvedMedia = async (
	client: Parameters<typeof fetchDueVocabularyRowsById>[0],
	rows: GetDueCardsV2Row[],
): Promise<GetDueCardsV2Row[]> => {
	if (rows.length === 0) {
		return rows;
	}

	const vocabularyCardIds = rows
		.map((record) => resolveDueVocabularyCardId(record))
		.filter(
			(value): value is string => typeof value === "string" && value.length > 0,
		);
	const vocabularyRowsById = await fetchDueVocabularyRowsById(
		client,
		vocabularyCardIds,
	);
	const userMediaRowsById = await fetchResolvedUserVocabularyCardMediaById(
		client,
		Array.from(vocabularyRowsById.keys()),
	);
	const sourceOccurrencesById =
		await fetchCollectedSourceOccurrencesByVocabularyCardId(
			client,
			Array.from(vocabularyRowsById.keys()),
		);

	const foundationCardIds = Array.from(
		new Set(
			rows
				.map((record) =>
					toOptionalNonEmptyString(
						(record as { foundation_card_id?: unknown }).foundation_card_id,
					),
				)
				.filter((value): value is string => value !== null),
		),
	);

	const fromMethod = (client as unknown as {
		from?: (table: string) => any;
	}).from;
	const from = typeof fromMethod === "function" ? fromMethod.bind(client) : null;

	const foundationRowsById = new Map<string, FoundationDeckMediaRow>();
	const mediaCardByWordAr = new Map<string, Record<string, unknown>>();
	const mediaCardByVocabularyId = new Map<string, Record<string, unknown>>();

	if (from && foundationCardIds.length > 0) {
		for (const idChunk of chunkIds(foundationCardIds)) {
			const { data, error } = await from("foundation_deck")
				.select("id,word_ar,word_fr")
				.in("id", idChunk);
			if (error) {
				console.error("Unable to load foundation rows for due media:", error);
				break;
			}

			(data ?? []).forEach((row: FoundationDeckMediaRow) => {
				const foundationId = toOptionalNonEmptyString(row.id);
				if (foundationId) {
					foundationRowsById.set(foundationId, row);
				}
			});
		}

		const foundationWords = Array.from(
			new Set(
				Array.from(foundationRowsById.values())
					.map((row) => toOptionalNonEmptyString(row.word_ar))
					.filter((value): value is string => value !== null),
			),
		);

		for (const wordChunk of chunkIds(foundationWords)) {
			const { data, error } = await from("vocabulary_cards")
				.select(
					"id,word_ar,word_fr,transliteration,example_sentence_ar,example_sentence_fr,audio_url,sentence_audio_url,image_url,category",
				)
				.in("word_ar", wordChunk);
			if (error) {
				console.error("Unable to load vocabulary media rows for foundation due cards:", error);
				break;
			}

			(data ?? []).forEach((row: Record<string, unknown>) => {
				const vocabularyCardId = toOptionalNonEmptyString(row.id);
				const wordAr = toOptionalNonEmptyString(row.word_ar);
				if (!vocabularyCardId || !wordAr) {
					return;
				}

				mediaCardByVocabularyId.set(vocabularyCardId, row);
				const currentMediaRow = mediaCardByWordAr.get(wordAr);
				if (
					!currentMediaRow ||
					countAvailableMediaFields(row) >
						countAvailableMediaFields(currentMediaRow)
				) {
					mediaCardByWordAr.set(wordAr, row);
				}
			});
		}
	}

	const foundationUserMediaByVocabularyId =
		mediaCardByVocabularyId.size > 0
			? await fetchResolvedUserVocabularyCardMediaById(
					client,
					Array.from(mediaCardByVocabularyId.keys()),
				)
			: new Map();

	return rows.map((record) => {
		const vocabularyCardId = resolveDueVocabularyCardId(record);
		const baseEnrichedRecord = vocabularyCardId
			? applyCollectedSourceOccurrenceToDueRecord(
					applyUserVocabularyCardMediaToDueVocabularyRow(
						mergeDueRecordWithVocabularyRow(
							record,
							vocabularyRowsById.get(vocabularyCardId),
						),
						userMediaRowsById.get(vocabularyCardId),
					),
					sourceOccurrencesById.get(vocabularyCardId),
				)
			: record;

		const foundationCardId = toOptionalNonEmptyString(
			(record as { foundation_card_id?: unknown }).foundation_card_id,
		);
		if (!foundationCardId) {
			return baseEnrichedRecord;
		}

		const foundationRow = foundationRowsById.get(foundationCardId);
		const wordArFromRecord = toOptionalNonEmptyString(
			(baseEnrichedRecord as { word_ar?: unknown }).word_ar,
		);
		const foundationWordAr =
			wordArFromRecord ?? toOptionalNonEmptyString(foundationRow?.word_ar);
		if (!foundationWordAr) {
			return baseEnrichedRecord;
		}

		const fallbackMediaRow = mediaCardByWordAr.get(foundationWordAr);
		if (!fallbackMediaRow) {
			return {
				...(baseEnrichedRecord as Record<string, unknown>),
				word_ar: wordArFromRecord ?? foundationWordAr,
				word_fr:
					toOptionalNonEmptyString(
						(baseEnrichedRecord as { word_fr?: unknown }).word_fr,
					) ?? toOptionalNonEmptyString(foundationRow?.word_fr),
			} as GetDueCardsV2Row;
		}

		const fallbackVocabularyCardId = toOptionalNonEmptyString(fallbackMediaRow.id);
		const fallbackUserMedia = fallbackVocabularyCardId
			? foundationUserMediaByVocabularyId.get(fallbackVocabularyCardId)
			: null;

		const mergedWithFoundationMedia = {
			...(baseEnrichedRecord as Record<string, unknown>),
			word_ar: wordArFromRecord ?? foundationWordAr,
			word_fr:
				toOptionalNonEmptyString(
					(baseEnrichedRecord as { word_fr?: unknown }).word_fr,
				) ??
				toOptionalNonEmptyString(foundationRow?.word_fr) ??
				toOptionalNonEmptyString(fallbackMediaRow.word_fr),
			example_sentence_ar:
				toOptionalNonEmptyString(
					(baseEnrichedRecord as { example_sentence_ar?: unknown })
						.example_sentence_ar,
				) ?? toOptionalNonEmptyString(fallbackMediaRow.example_sentence_ar),
			example_sentence_fr:
				toOptionalNonEmptyString(
					(baseEnrichedRecord as { example_sentence_fr?: unknown })
						.example_sentence_fr,
				) ?? toOptionalNonEmptyString(fallbackMediaRow.example_sentence_fr),
			audio_url:
				toOptionalNonEmptyString(
					(baseEnrichedRecord as { audio_url?: unknown }).audio_url,
				) ??
				fallbackUserMedia?.vocabAudioUrl ??
				toOptionalNonEmptyString(fallbackMediaRow.audio_url),
			sentence_audio_url:
				toOptionalNonEmptyString(
					(baseEnrichedRecord as { sentence_audio_url?: unknown })
						.sentence_audio_url,
				) ??
				fallbackUserMedia?.sentenceAudioUrl ??
				toOptionalNonEmptyString(fallbackMediaRow.sentence_audio_url),
			image_url:
				toOptionalNonEmptyString(
					(baseEnrichedRecord as { image_url?: unknown }).image_url,
				) ??
				fallbackUserMedia?.imageUrl ??
				toOptionalNonEmptyString(fallbackMediaRow.image_url),
			category:
				toOptionalNonEmptyString(
					(baseEnrichedRecord as { category?: unknown }).category,
				) ?? toOptionalNonEmptyString(fallbackMediaRow.category),
		} as GetDueCardsV2Row;

		return mergedWithFoundationMedia;
	});
};

const hydrateReviewCardsWithResolvedMedia = async (
	client: Parameters<typeof fetchDueVocabularyRowsById>[0],
	cards: VocabCard[],
): Promise<VocabCard[]> => {
	const cardsNeedingHydration = cards.filter(hasMissingReviewCardMedia);
	if (cardsNeedingHydration.length === 0) {
		return cards;
	}

	const canonicalCardRowsById = await fetchCanonicalReviewCardRowsById(
		client,
		cardsNeedingHydration
			.map((card) => toOptionalNonEmptyString(card.schedulerCardId))
			.filter((value): value is string => value !== null),
	);

	const vocabularyCardIds = Array.from(
		new Set(
			cardsNeedingHydration
				.map((card) => toOptionalNonEmptyString(card.vocabularyCardId))
				.filter((value): value is string => value !== null),
		),
	);
	const vocabularyRowsById = await fetchDueVocabularyRowsById(
		client,
		vocabularyCardIds,
	);
	const vocabularyUserMediaById = await fetchResolvedUserVocabularyCardMediaById(
		client,
		Array.from(vocabularyRowsById.keys()),
	);

	const foundationCardIds = Array.from(
		new Set(
			cardsNeedingHydration
				.filter(isFoundationReviewCard)
				.map((card) => toOptionalNonEmptyString(card.foundationCardId))
				.filter((value): value is string => value !== null),
		),
	);

	const fromMethod = (client as unknown as {
		from?: (table: string) => any;
	}).from;
	const from = typeof fromMethod === "function" ? fromMethod.bind(client) : null;

	const foundationRowsById = new Map<string, FoundationDeckMediaRow>();
	const foundationMediaCardByWordKey = new Map<string, Record<string, unknown>>();
	const foundationMediaCardByVocabularyId = new Map<string, Record<string, unknown>>();

	if (from && foundationCardIds.length > 0) {
		for (const idChunk of chunkIds(foundationCardIds)) {
			const { data, error } = await from("foundation_deck")
				.select("id,word_ar,word_fr,frequency_rank")
				.in("id", idChunk);
			if (error) {
				console.error("Unable to hydrate foundation review cards:", error);
				break;
			}

			(data ?? []).forEach((row: FoundationDeckMediaRow) => {
				const foundationId = toOptionalNonEmptyString(row.id);
				if (foundationId) {
					foundationRowsById.set(foundationId, row);
				}
			});
		}

		const foundationWords = Array.from(
			new Set(
				cardsNeedingHydration
					.filter(isFoundationReviewCard)
					.map((card) => {
						const foundationRow = card.foundationCardId
							? foundationRowsById.get(card.foundationCardId)
							: undefined;
						return (
							toOptionalNonEmptyString(foundationRow?.word_ar) ??
							toOptionalNonEmptyString(card.vocabFull) ??
							toOptionalNonEmptyString(card.vocabBase)
						);
					})
					.filter((value): value is string => value !== null),
			),
		);

		for (const wordChunk of chunkIds(foundationWords)) {
			const { data, error } = await from("vocabulary_cards")
				.select(
					"id,word_ar,word_fr,transliteration,example_sentence_ar,example_sentence_fr,audio_url,sentence_audio_url,image_url,category",
				)
				.in("word_ar", wordChunk);
			if (error) {
				console.error(
					"Unable to load fallback vocabulary media for foundation review cards:",
					error,
				);
				break;
			}

			(data ?? []).forEach((row: Record<string, unknown>) => {
				const vocabularyCardId = toOptionalNonEmptyString(row.id);
				const wordKey = normalizeFoundationWordKey(row.word_ar);
				if (!vocabularyCardId || !wordKey) {
					return;
				}

				foundationMediaCardByVocabularyId.set(vocabularyCardId, row);
				const currentRow = foundationMediaCardByWordKey.get(wordKey);
				if (
					!currentRow ||
					countAvailableMediaFields(row) > countAvailableMediaFields(currentRow)
				) {
					foundationMediaCardByWordKey.set(wordKey, row);
				}
			});
		}
	}

	const foundationUserMediaByVocabularyId =
		foundationMediaCardByVocabularyId.size > 0
			? await fetchResolvedUserVocabularyCardMediaById(
					client,
					Array.from(foundationMediaCardByVocabularyId.keys()),
				)
			: new Map();

	return cards.map((card) => {
		if (!hasMissingReviewCardMedia(card)) {
			return card;
		}

		const canonicalCardRow = toOptionalNonEmptyString(card.schedulerCardId)
			? (canonicalCardRowsById.get(card.schedulerCardId as string) ?? null)
			: null;

		if (isFoundationReviewCard(card)) {
			const foundationRow = card.foundationCardId
				? foundationRowsById.get(card.foundationCardId)
				: undefined;
			const foundationWordAr =
				toOptionalNonEmptyString(card.vocabFull) ??
				toOptionalNonEmptyString(card.vocabBase) ??
				toOptionalNonEmptyString(foundationRow?.word_ar);
			if (!foundationWordAr) {
				return card;
			}

			const foundationContent = resolveFoundationDeckContentRecord(
				foundationWordAr,
			);
			const foundationSentenceAr =
				toOptionalNonEmptyString(card.sentFull) ??
				toOptionalNonEmptyString(foundationContent?.exampleSentenceAr);
			const foundationMedia = resolveFoundationDeckMedia(
				foundationWordAr,
				stripHarakat(foundationWordAr),
				foundationSentenceAr,
			);
			const foundationMediaByRank = resolveFoundationDeckMediaByFrequencyRank(
				typeof foundationRow?.frequency_rank === "number"
					? foundationRow.frequency_rank
					: typeof canonicalCardRow?.frequency_rank === "number"
						? canonicalCardRow.frequency_rank
					: null,
			);
			const fallbackMediaRow = foundationMediaCardByWordKey.get(
				normalizeFoundationWordKey(foundationWordAr),
			);
			const fallbackVocabularyCardId = toOptionalNonEmptyString(
				fallbackMediaRow?.id,
			);
			const fallbackUserMedia = fallbackVocabularyCardId
				? (foundationUserMediaByVocabularyId.get(fallbackVocabularyCardId) ?? null)
				: null;
			const resolvedVocabFull =
				toOptionalNonEmptyString(card.vocabFull) ??
				foundationWordAr ??
				foundationContent?.wordAr ??
				card.vocabFull;
			const resolvedSentFull =
				toOptionalNonEmptyString(card.sentFull) ??
				toOptionalNonEmptyString(foundationContent?.exampleSentenceAr) ??
				toOptionalNonEmptyString(fallbackMediaRow?.example_sentence_ar) ??
				card.sentFull;

			return {
				...card,
				vocabFull: resolvedVocabFull,
				vocabBase:
					toOptionalNonEmptyString(card.vocabBase) ?? stripHarakat(resolvedVocabFull),
				vocabDef:
					toOptionalNonEmptyString(card.vocabDef) ??
					toOptionalNonEmptyString(canonicalCardRow?.translation) ??
					toOptionalNonEmptyString(foundationRow?.word_fr) ??
					toOptionalNonEmptyString(foundationContent?.wordFr) ??
					toOptionalNonEmptyString(fallbackMediaRow?.word_fr) ??
					card.vocabDef,
				sentFull: resolvedSentFull,
				sentBase:
					toOptionalNonEmptyString(card.sentBase) ?? stripHarakat(resolvedSentFull),
				sentFrench:
					toOptionalNonEmptyString(card.sentFrench) ??
					toOptionalNonEmptyString(canonicalCardRow?.example_translation) ??
					toOptionalNonEmptyString(foundationContent?.exampleSentenceFr) ??
					toOptionalNonEmptyString(fallbackMediaRow?.example_sentence_fr) ??
					card.sentFrench,
				image: buildResolvedMediaValue({
					existingValue: card.image,
					fallbackValue:
						toOptionalNonEmptyString(canonicalCardRow?.image_url) ??
						toOptionalNonEmptyString(fallbackMediaRow?.image_url) ??
						foundationMediaByRank.imageUrl ??
						foundationMedia.imageUrl ??
						null,
					hidden: fallbackUserMedia?.imageHidden ?? false,
					overlayValue: fallbackUserMedia?.imageUrl ?? null,
				}),
				vocabAudioUrl: buildResolvedMediaValue({
					existingValue: card.vocabAudioUrl,
					fallbackValue:
						toOptionalNonEmptyString(canonicalCardRow?.audio_url) ??
						toOptionalNonEmptyString(fallbackMediaRow?.audio_url) ??
						foundationMediaByRank.vocabAudioUrl ??
						foundationMedia.vocabAudioUrl ??
						null,
					hidden: fallbackUserMedia?.vocabAudioHidden ?? false,
					overlayValue: fallbackUserMedia?.vocabAudioUrl ?? null,
				}),
				sentenceAudioUrl: buildResolvedMediaValue({
					existingValue: card.sentenceAudioUrl,
					fallbackValue:
						toOptionalNonEmptyString(canonicalCardRow?.sentence_audio_url) ??
						toOptionalNonEmptyString(fallbackMediaRow?.sentence_audio_url) ??
						foundationMediaByRank.sentenceAudioUrl ??
						foundationMedia.sentenceAudioUrl ??
						null,
					hidden: fallbackUserMedia?.sentenceAudioHidden ?? false,
					overlayValue: fallbackUserMedia?.sentenceAudioUrl ?? null,
				}),
				defaultImageUrl:
					card.defaultImageUrl ??
					toOptionalNonEmptyString(canonicalCardRow?.image_url) ??
					toOptionalNonEmptyString(fallbackMediaRow?.image_url) ??
					foundationMediaByRank.imageUrl ??
					foundationMedia.imageUrl ??
					null,
				defaultVocabAudioUrl:
					card.defaultVocabAudioUrl ??
					toOptionalNonEmptyString(canonicalCardRow?.audio_url) ??
					toOptionalNonEmptyString(fallbackMediaRow?.audio_url) ??
					foundationMediaByRank.vocabAudioUrl ??
					foundationMedia.vocabAudioUrl ??
					null,
				defaultSentenceAudioUrl:
					card.defaultSentenceAudioUrl ??
					toOptionalNonEmptyString(canonicalCardRow?.sentence_audio_url) ??
					toOptionalNonEmptyString(fallbackMediaRow?.sentence_audio_url) ??
					foundationMediaByRank.sentenceAudioUrl ??
					foundationMedia.sentenceAudioUrl ??
					null,
				hasCustomImage:
					card.hasCustomImage ?? (fallbackUserMedia?.hasCustomImage ?? false),
				hasCustomVocabAudio:
					card.hasCustomVocabAudio ??
					(fallbackUserMedia?.hasCustomVocabAudio ?? false),
				hasCustomSentenceAudio:
					card.hasCustomSentenceAudio ??
					(fallbackUserMedia?.hasCustomSentenceAudio ?? false),
				imageHidden:
					card.imageHidden ?? (fallbackUserMedia?.imageHidden ?? false),
				vocabAudioHidden:
					card.vocabAudioHidden ?? (fallbackUserMedia?.vocabAudioHidden ?? false),
				sentenceAudioHidden:
					card.sentenceAudioHidden ??
					(fallbackUserMedia?.sentenceAudioHidden ?? false),
			};
		}

		const vocabularyCardId = toOptionalNonEmptyString(card.vocabularyCardId);
		if (!vocabularyCardId) {
			return card;
		}

		const vocabularyRow = vocabularyRowsById.get(vocabularyCardId);
		const userMedia = vocabularyUserMediaById.get(vocabularyCardId);

		return {
			...card,
			vocabFull:
				toOptionalNonEmptyString(card.vocabFull) ??
				toOptionalNonEmptyString(canonicalCardRow?.term) ??
				card.vocabFull,
			vocabBase:
				toOptionalNonEmptyString(card.vocabBase) ??
				toOptionalNonEmptyString(canonicalCardRow?.term)?.replace(
					/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g,
					"",
				) ??
				card.vocabBase,
			vocabDef:
				toOptionalNonEmptyString(card.vocabDef) ??
				toOptionalNonEmptyString(canonicalCardRow?.translation) ??
				card.vocabDef,
			sentFull:
				toOptionalNonEmptyString(card.sentFull) ??
				toOptionalNonEmptyString(canonicalCardRow?.example_term) ??
				card.sentFull,
			sentFrench:
				toOptionalNonEmptyString(card.sentFrench) ??
				toOptionalNonEmptyString(canonicalCardRow?.example_translation) ??
				card.sentFrench,
			image: buildResolvedMediaValue({
				existingValue: card.image,
				fallbackValue:
					toOptionalNonEmptyString(canonicalCardRow?.image_url) ??
					toOptionalNonEmptyString(vocabularyRow?.image_url),
				hidden: userMedia?.imageHidden ?? false,
				overlayValue: userMedia?.imageUrl ?? null,
			}),
			vocabAudioUrl: buildResolvedMediaValue({
				existingValue: card.vocabAudioUrl,
				fallbackValue:
					toOptionalNonEmptyString(canonicalCardRow?.audio_url) ??
					toOptionalNonEmptyString(vocabularyRow?.audio_url),
				hidden: userMedia?.vocabAudioHidden ?? false,
				overlayValue: userMedia?.vocabAudioUrl ?? null,
			}),
			sentenceAudioUrl: buildResolvedMediaValue({
				existingValue: card.sentenceAudioUrl,
				fallbackValue:
					toOptionalNonEmptyString(canonicalCardRow?.sentence_audio_url) ??
					toOptionalNonEmptyString(vocabularyRow?.sentence_audio_url),
				hidden: userMedia?.sentenceAudioHidden ?? false,
				overlayValue: userMedia?.sentenceAudioUrl ?? null,
			}),
			defaultImageUrl:
				card.defaultImageUrl ??
				toOptionalNonEmptyString(canonicalCardRow?.image_url) ??
				toOptionalNonEmptyString(vocabularyRow?.image_url),
			defaultVocabAudioUrl:
				card.defaultVocabAudioUrl ??
				toOptionalNonEmptyString(canonicalCardRow?.audio_url) ??
				toOptionalNonEmptyString(vocabularyRow?.audio_url),
			defaultSentenceAudioUrl:
				card.defaultSentenceAudioUrl ??
				toOptionalNonEmptyString(canonicalCardRow?.sentence_audio_url) ??
				toOptionalNonEmptyString(vocabularyRow?.sentence_audio_url),
			hasCustomImage:
				card.hasCustomImage ?? (userMedia?.hasCustomImage ?? false),
			hasCustomVocabAudio:
				card.hasCustomVocabAudio ?? (userMedia?.hasCustomVocabAudio ?? false),
			hasCustomSentenceAudio:
				card.hasCustomSentenceAudio ??
				(userMedia?.hasCustomSentenceAudio ?? false),
			imageHidden: card.imageHidden ?? (userMedia?.imageHidden ?? false),
			vocabAudioHidden:
				card.vocabAudioHidden ?? (userMedia?.vocabAudioHidden ?? false),
			sentenceAudioHidden:
				card.sentenceAudioHidden ?? (userMedia?.sentenceAudioHidden ?? false),
		};
	});
};

export async function fetchDueCardsByReviewTypes(
	reviewTypes: ReviewType[],
	limitPerScope = 40,
): Promise<ServiceResult<VocabCard[]>> {
	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	if (reviewTypes.length === 0) {
		return { ok: true, data: [] };
	}

	try {
		const selectedTypes = new Set<ReviewType>(reviewTypes);

		const fetchLegacyDueCards = async (): Promise<{
			cards: VocabCard[];
			rowsByReviewType: Record<string, unknown[]>;
		}> => {
			const cards: VocabCard[] = [];
			let runningIndex = 0;
			const rowsByReviewType: Record<string, unknown[]> = {};
			const dueRowsByReviewType = new Map<ReviewType, GetDueCardsV2Row[]>();

			const response = await getDueCardsV2(client, {
				p_limit: Math.max(1, limitPerScope * Math.max(reviewTypes.length, 1)),
			});
			if (response.error) {
				throw response.error;
			}

			const rows = Array.isArray(response.data) ? response.data : [];
			reviewTypes.forEach((reviewType) => {
				dueRowsByReviewType.set(reviewType, []);
				rowsByReviewType[reviewType] = [];
			});

			rows.forEach((row) => {
				const card = supabaseCardToVocabCard(row, 0);
				const reviewType = mapCardToReviewType(card);
				if (!reviewType || !selectedTypes.has(reviewType)) {
					return;
				}

				const existingRows = dueRowsByReviewType.get(reviewType) ?? [];
				existingRows.push(row);
				dueRowsByReviewType.set(reviewType, existingRows);
				rowsByReviewType[reviewType].push(toJsonCompatible(row));
			});

			const allDueRows = Array.from(dueRowsByReviewType.values()).flat();
			const enrichedRows = await enrichDueRowsWithResolvedMedia(
				client,
				allDueRows,
			);
			const enrichedRowsQueue = [...enrichedRows];

			reviewTypes.forEach((reviewType) => {
				const rows = dueRowsByReviewType.get(reviewType) ?? [];
				rows.forEach(() => {
					const record = enrichedRowsQueue.shift();
					if (!record) {
						return;
					}
					if (isAlphabetDueRecord(record)) {
						return;
					}

					const card = supabaseCardToVocabCard(record, runningIndex);
					runningIndex += 1;
					cards.push(card);
				});
			});

			const orderedCards = orderFoundationCardsByFocus(cards);
			return {
				cards: await hydrateReviewCardsWithResolvedMedia(client, orderedCards),
				rowsByReviewType,
			};
		};

		const invoke = (
			client as unknown as {
				functions?: {
					invoke?: (
						name: string,
						options?: { body?: Record<string, unknown> },
					) => Promise<{ data: unknown; error: unknown }>;
				};
			}
		).functions?.invoke;
		const canUseRuntimeDueScheduler =
			typeof invoke === "function" &&
			!isDeckPersoSchedulerRollbackToLegacyEnabled();

		const shadowDiffContext = canUseRuntimeDueScheduler
			? await resolveSchedulerShadowDiffContext(client)
			: { userId: null, enabled: false };

		if (canUseRuntimeDueScheduler) {
			const legacyFallbackSunsetGuardEnabled =
				isDeckPersoSchedulerLegacyFallbackSunsetGuardEnabled();
			const queueLimit = Math.max(
				1,
				Math.min(
					50,
					Math.floor(limitPerScope * Math.max(reviewTypes.length, 1)),
				),
			);
			const requestNowUtc = new Date().toISOString();
			const runtimeRequestPayload = {
				schema_version: 1,
				now_utc: requestNowUtc,
				queue_limit: queueLimit,
				include_new_candidates: true,
				candidate_new_limit: queueLimit,
			};

			let runtimeInvokeData: unknown = null;
			let runtimeInvokeError: unknown = null;
			try {
				const invokeResult = await invoke("scheduler-due-v1", {
					body: runtimeRequestPayload,
				});
				runtimeInvokeData = invokeResult.data;
				runtimeInvokeError = invokeResult.error;
			} catch (invokeError) {
				runtimeInvokeError = invokeError;
			}

			if (runtimeInvokeError) {
				if (shouldFallbackToLegacyDueFetch(runtimeInvokeError)) {
					const bypassSunsetGuard =
						shouldAllowLegacyFallbackOnTransportFailure(runtimeInvokeError);
					if (!legacyFallbackSunsetGuardEnabled && !bypassSunsetGuard) {
						if (shadowDiffContext.enabled && shadowDiffContext.userId) {
							const weightsVersion = await resolveActiveWeightsVersion(
								client,
								shadowDiffContext.userId,
							);

							await insertSchedulerShadowDiffEvent(client, {
								userId: shadowDiffContext.userId,
								operation: "due_fetch",
								primaryPath: "runtime_edge",
								occurredAt: requestNowUtc,
								requestNowUtc,
								weightsVersion,
								schedulerInputs: {
									review_types: reviewTypes,
									limit_per_scope: limitPerScope,
									queue_limit: queueLimit,
									runtime_request: runtimeRequestPayload,
								},
								runtimeOutput: serializeShadowOutput(null, runtimeInvokeError),
								legacyOutput: serializeShadowOutput(null),
								diffSummary: {
									matches: false,
									reason:
										SHADOW_DIFF_REASON_CODES.RUNTIME_DUE_FALLBACK_BLOCKED_BY_SUNSET_GUARD,
									runtime_error: serializeShadowError(runtimeInvokeError),
								},
							});
						}

						return {
							ok: false,
							error: createServiceError(
								"RPC_ERROR",
								DUE_SUNSET_GUARD_BLOCKED_ERROR_MESSAGE,
								true,
							),
						};
					}

					const legacyFallbackResult = await fetchLegacyDueCards();

					if (shadowDiffContext.enabled && shadowDiffContext.userId) {
						const weightsVersion = await resolveActiveWeightsVersion(
							client,
							shadowDiffContext.userId,
						);

						await insertSchedulerShadowDiffEvent(client, {
							userId: shadowDiffContext.userId,
							operation: "due_fetch",
							primaryPath: "legacy_sql",
							occurredAt: requestNowUtc,
							requestNowUtc,
							weightsVersion,
							schedulerInputs: {
								review_types: reviewTypes,
								limit_per_scope: limitPerScope,
								queue_limit: queueLimit,
								runtime_request: runtimeRequestPayload,
							},
							runtimeOutput: serializeShadowOutput(null, runtimeInvokeError),
							legacyOutput: serializeShadowOutput({
								rows_by_review_type: legacyFallbackResult.rowsByReviewType,
								selected_cards: legacyFallbackResult.cards,
							}),
							diffSummary: {
								matches: false,
								reason: SHADOW_DIFF_REASON_CODES.RUNTIME_DUE_FALLBACK_TO_LEGACY,
								legacy_count: legacyFallbackResult.cards.length,
								runtime_error: serializeShadowError(runtimeInvokeError),
							},
						});
					}

					return { ok: true, data: legacyFallbackResult.cards };
				}

				throw runtimeInvokeError;
			}

			let runtimeResponse: ReturnType<typeof parseSchedulerDueResponse> | null =
				null;
			let runtimeParseError: unknown = null;
			try {
				runtimeResponse = parseSchedulerDueResponse(runtimeInvokeData);
			} catch (parseError) {
				runtimeParseError = parseError;
			}

			if (!runtimeResponse) {
				const bypassSunsetGuard =
					shouldAllowLegacyFallbackOnInvalidRuntimePayload({
						runtimePayload: runtimeInvokeData,
						runtimeParseError,
					});
				if (!legacyFallbackSunsetGuardEnabled && !bypassSunsetGuard) {
					if (shadowDiffContext.enabled && shadowDiffContext.userId) {
						const weightsVersion = await resolveActiveWeightsVersion(
							client,
							shadowDiffContext.userId,
						);

						await insertSchedulerShadowDiffEvent(client, {
							userId: shadowDiffContext.userId,
							operation: "due_fetch",
							primaryPath: "runtime_edge",
							occurredAt: requestNowUtc,
							requestNowUtc,
							weightsVersion,
							schedulerInputs: {
								review_types: reviewTypes,
								limit_per_scope: limitPerScope,
								queue_limit: queueLimit,
								runtime_request: runtimeRequestPayload,
							},
							runtimeOutput: serializeShadowOutput(
								{ invoke_response: runtimeInvokeData },
								runtimeParseError,
							),
							legacyOutput: serializeShadowOutput(null),
							diffSummary: {
								matches: false,
								reason:
									SHADOW_DIFF_REASON_CODES.RUNTIME_DUE_FALLBACK_BLOCKED_BY_SUNSET_GUARD,
								runtime_error: serializeShadowError(runtimeParseError),
							},
						});
					}

					return {
						ok: false,
						error: createServiceError(
							"RPC_ERROR",
							DUE_SUNSET_GUARD_BLOCKED_ERROR_MESSAGE,
							true,
						),
					};
				}

				const legacyFallbackResult = await fetchLegacyDueCards();

				if (shadowDiffContext.enabled && shadowDiffContext.userId) {
					const weightsVersion = await resolveActiveWeightsVersion(
						client,
						shadowDiffContext.userId,
					);

					await insertSchedulerShadowDiffEvent(client, {
						userId: shadowDiffContext.userId,
						operation: "due_fetch",
						primaryPath: "legacy_sql",
						occurredAt: requestNowUtc,
						requestNowUtc,
						weightsVersion,
						schedulerInputs: {
							review_types: reviewTypes,
							limit_per_scope: limitPerScope,
							queue_limit: queueLimit,
							runtime_request: runtimeRequestPayload,
						},
						runtimeOutput: serializeShadowOutput(
							{ invoke_response: runtimeInvokeData },
							runtimeParseError,
						),
						legacyOutput: serializeShadowOutput({
							rows_by_review_type: legacyFallbackResult.rowsByReviewType,
							selected_cards: legacyFallbackResult.cards,
						}),
						diffSummary: {
							matches: false,
							reason: SHADOW_DIFF_REASON_CODES.RUNTIME_DUE_INVALID_PAYLOAD,
							legacy_count: legacyFallbackResult.cards.length,
							runtime_error: serializeShadowError(runtimeParseError),
						},
					});
				}

				return { ok: true, data: legacyFallbackResult.cards };
			}

			const runtimeRows = normalizeSchedulerQueueRows(runtimeResponse);
			const enrichedRuntimeRows = await enrichDueRowsWithResolvedMedia(
				client,
				runtimeRows,
			);

			const runtimeCards: VocabCard[] = [];
			let runtimeIndex = 0;

			enrichedRuntimeRows.forEach((record) => {
				if (isAlphabetDueRecord(record)) {
					return;
				}

				const card = supabaseCardToVocabCard(record, runtimeIndex);
				const reviewType = mapCardToReviewType(card);
				if (!reviewType || !selectedTypes.has(reviewType)) {
					return;
				}

				runtimeIndex += 1;
				runtimeCards.push(card);
			});

			const orderedRuntimeCards = orderFoundationCardsByFocus(runtimeCards);
			const hydratedRuntimeCards = await hydrateReviewCardsWithResolvedMedia(
				client,
				orderedRuntimeCards,
			);

			if (shadowDiffContext.enabled && shadowDiffContext.userId) {
				let legacyCards: VocabCard[] = [];
				let legacyRowsByReviewType: Record<string, unknown[]> = {};
				let legacyShadowError: unknown = null;

				try {
					const legacyResult = await fetchLegacyDueCards();
					legacyCards = legacyResult.cards;
					legacyRowsByReviewType = legacyResult.rowsByReviewType;
				} catch (legacyError) {
					legacyShadowError = legacyError;
				}

				const weightsVersion = await resolveActiveWeightsVersion(
					client,
					shadowDiffContext.userId,
				);

				const diffSummary = legacyShadowError
					? {
							matches: false,
							reason: SHADOW_DIFF_REASON_CODES.LEGACY_DUE_SHADOW_FAILED,
							runtime_count: hydratedRuntimeCards.length,
							legacy_error: serializeShadowError(legacyShadowError),
						}
					: summarizeDueCardsDiff(hydratedRuntimeCards, legacyCards);

				await insertSchedulerShadowDiffEvent(client, {
					userId: shadowDiffContext.userId,
					operation: "due_fetch",
					primaryPath: "runtime_edge",
					occurredAt: requestNowUtc,
					requestNowUtc,
					weightsVersion,
					schedulerInputs: {
						review_types: reviewTypes,
						limit_per_scope: limitPerScope,
						queue_limit: queueLimit,
						runtime_request: runtimeRequestPayload,
					},
					runtimeOutput: serializeShadowOutput({
						invoke_response: runtimeResponse,
						selected_cards: hydratedRuntimeCards,
					}),
					legacyOutput: serializeShadowOutput(
						{
							rows_by_review_type: legacyRowsByReviewType,
							selected_cards: legacyCards,
						},
						legacyShadowError,
					),
					diffSummary,
				});
			}

			return { ok: true, data: hydratedRuntimeCards };
		}

		const legacyResult = await fetchLegacyDueCards();
		return { ok: true, data: legacyResult.cards };
	} catch (error) {
		return {
			ok: false,
			error:
				error &&
				typeof error === "object" &&
				"code" in (error as PostgrestError)
					? fromPostgrestError(error as PostgrestError)
					: fromUnknownError(error),
		};
	}
}

export async function submitReviewForCard(
	card: VocabCard,
	rating: BinaryReviewRating,
	options: ReviewMutationOptions,
): Promise<ServiceResult<SubmitReviewSchedulerPayload | null>> {
	const previewGuard = guardPreviewMode("Soumettre une revue", options?.mode);
	if (previewGuard) {
		return { ok: false, error: previewGuard };
	}

	const cardKey = resolveCardKey(card);
	if (!cardKey) {
		return {
			ok: false,
			error: createServiceError(
				"UNKNOWN",
				"Carte introuvable côté serveur.",
				false,
			),
		};
	}

	const client = resolveClient();
	const accountKey = await resolveAccountKey(client);

	if (!client || isBrowserOffline()) {
		const clientReviewId = getOrCreateClientReviewId(cardKey);
		enqueueReviewSubmission(accountKey, cardKey, card, rating, clientReviewId);
		return {
			ok: false,
			error: createServiceError(
				"RPC_ERROR",
				"Connexion indisponible. Revue mise en attente pour synchronisation.",
				true,
			),
		};
	}

	const result = await submitReviewNow(card, rating);
	if (!result.ok && result.error.retryable) {
		const clientReviewId = getOrCreateClientReviewId(cardKey);
		enqueueReviewSubmission(accountKey, cardKey, card, rating, clientReviewId);
	}
	return result;
}

export type { BinaryReviewRating };
