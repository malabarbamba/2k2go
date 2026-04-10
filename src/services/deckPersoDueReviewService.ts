import type { PostgrestError } from "@supabase/supabase-js";
import type { ReviewType, VocabCard } from "@/lib/deck-perso-adapters";
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
	SCOPE_MAP,
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

			const requests = reviewTypes.map((type) => {
				const scope = SCOPE_MAP[type];
				return getDueCardsV2(client, {
					p_deck_scope: scope,
					p_limit: limitPerScope,
				});
			});
			const responses = await Promise.all(requests);

			responses.forEach((response, index) => {
				const reviewType = reviewTypes[index];
				if (response.error) {
					throw response.error;
				}

				const rows = Array.isArray(response.data) ? response.data : [];
				rowsByReviewType[reviewType] = rows.map((row) => toJsonCompatible(row));
				dueRowsByReviewType.set(reviewType, rows);
			});

			const vocabularyRowsById = await fetchDueVocabularyRowsById(
				client,
				Array.from(dueRowsByReviewType.values())
					.flatMap((rows) =>
						rows.map((record) => resolveDueVocabularyCardId(record)),
					)
					.filter(
						(value): value is string =>
							typeof value === "string" && value.length > 0,
					),
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

			reviewTypes.forEach((reviewType) => {
				const rows = dueRowsByReviewType.get(reviewType) ?? [];
				rows.forEach((record: GetDueCardsV2Row) => {
					if (isAlphabetDueRecord(record)) {
						return;
					}

					const vocabularyCardId = resolveDueVocabularyCardId(record);
					const enrichedRecord = vocabularyCardId
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

					const card = supabaseCardToVocabCard(enrichedRecord, runningIndex);
					runningIndex += 1;
					cards.push(card);
				});
			});

			return {
				cards: orderFoundationCardsByFocus(cards),
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
			const runtimeVocabularyRowsById = await fetchDueVocabularyRowsById(
				client,
				runtimeRows
					.map((record) => resolveDueVocabularyCardId(record))
					.filter(
						(value): value is string =>
							typeof value === "string" && value.length > 0,
					),
			);
			const runtimeUserMediaRowsById =
				await fetchResolvedUserVocabularyCardMediaById(
					client,
					Array.from(runtimeVocabularyRowsById.keys()),
				);
			const runtimeSourceOccurrencesById =
				await fetchCollectedSourceOccurrencesByVocabularyCardId(
					client,
					Array.from(runtimeVocabularyRowsById.keys()),
				);

			const runtimeCards: VocabCard[] = [];
			let runtimeIndex = 0;

			runtimeRows.forEach((record) => {
				if (isAlphabetDueRecord(record)) {
					return;
				}

				const vocabularyCardId = resolveDueVocabularyCardId(record);
				const enrichedRecord = vocabularyCardId
					? applyCollectedSourceOccurrenceToDueRecord(
							applyUserVocabularyCardMediaToDueVocabularyRow(
								mergeDueRecordWithVocabularyRow(
									record,
									runtimeVocabularyRowsById.get(vocabularyCardId),
								),
								runtimeUserMediaRowsById.get(vocabularyCardId),
							),
							runtimeSourceOccurrencesById.get(vocabularyCardId),
						)
					: record;

				const card = supabaseCardToVocabCard(enrichedRecord, runtimeIndex);
				const reviewType = mapCardToReviewType(card);
				if (!reviewType || !selectedTypes.has(reviewType)) {
					return;
				}

				runtimeIndex += 1;
				runtimeCards.push(card);
			});

			const orderedRuntimeCards = orderFoundationCardsByFocus(runtimeCards);

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
							runtime_count: orderedRuntimeCards.length,
							legacy_error: serializeShadowError(legacyShadowError),
						}
					: summarizeDueCardsDiff(orderedRuntimeCards, legacyCards);

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
						selected_cards: orderedRuntimeCards,
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

			return { ok: true, data: orderedRuntimeCards };
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
