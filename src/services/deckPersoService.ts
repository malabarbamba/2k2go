import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import {
	isDeckPersoSchedulerLegacyFallbackSunsetGuardEnabled,
	isDeckPersoSchedulerRollbackToLegacyEnabled,
} from "@/config/deckPersoSchedulerFlags";
import {
	buildCollectedCardSourceLinkPath,
	buildImmersionShortPath,
	type CollectedCardSourceLinkInput,
} from "@/data/immersionVideoRouting";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Video } from "@/interfaces/video";
import {
	compressCollectedCardImageToWebp,
	deleteCollectedCardMediaSlot,
	resolveCollectedCardMediaOverlayByCardId,
	saveCollectedCardMediaAssets,
} from "@/lib/collectedCardMedia";
import {
	type ReviewType,
	SCOPE_MAP,
	supabaseCardToVocabCard,
	type VocabCard,
} from "@/lib/deck-perso-adapters";
import { resolvePreferredFoundationMedia } from "@/lib/foundationDeckMedia";
import {
	deleteGuestCollectedCardMediaSlot,
	saveGuestCollectedCardMediaAssets,
} from "@/lib/guestCollectedCardMediaStore";
import { getCurrentAuthUserId } from "@/lib/authSessionCache";
import { emitPendingReviewsInvalidated } from "@/lib/pendingReviewsEvents";
import { emitProfileInsightsRefresh } from "@/lib/profileInsightsEvents";
import {
	addCardToPersonalDeckV2,
	collectSubtitleWordToPersonalDeckV1,
	completeReviewPreviewSessionV1,
	type GetDueCardsV2Row,
	getDueCardsV2,
	getDueCountV2,
	logCardFlipV2,
	type SearchCardsV2Row,
	searchCardsV2,
	startReviewPreviewSessionV1,
	submitReviewFsrsV2,
} from "@/lib/supabase/rpc";
import { repairMojibake } from "@/lib/textEncoding";
import {
	parseSchedulerDueResponse,
	parseSchedulerReviewResponse,
	type SchedulerDueResponse,
	type SchedulerReviewResponse,
} from "@/services/schedulerRuntimeSchema";
import { resolveBackendVideoId } from "@/services/vocabCardsService";

type AppSupabaseClient = SupabaseClient<Database>;

type ReviewSessionLeaseRpcClient = {
	rpc: (
		functionName: string,
		args: {
			p_review_session_id: string;
			p_lease_seconds: number;
		},
	) => Promise<{ error: PostgrestError | null }>;
};

export type DeckServiceErrorCode =
	| "CLIENT_UNAVAILABLE"
	| "NOT_AUTHENTICATED"
	| "RPC_ERROR"
	| "UNKNOWN"
	| "PREVIEW_BLOCKED"
	| "DUPLICATE_IN_FLIGHT"
	| "DUPLICATE_REVIEW"
	| "ACTIVE_SESSION_LOCKED";

export interface DeckServiceError {
	code: DeckServiceErrorCode;
	message: string;
	retryable: boolean;
}

export type ServiceResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: DeckServiceError };

export interface BulkCollectResult {
	successes: string[];
	failures: Array<{ cardId: string; error: DeckServiceError }>;
}

export interface CollectSubtitleWordParams {
	video: Pick<Video, "videoId" | "youtubeId" | "videoUrl" | "title">;
	wordAr: string;
	wordFr: string;
	lexiconEntryId?: string | null;
	exampleSentenceAr?: string | null;
	exampleSentenceFr?: string | null;
	sourceVideoIsShort?: boolean | null;
	sourceCueId?: string | null;
	sourceWordIndex?: number | null;
	sourceWordStartSeconds?: number | null;
	sourceWordEndSeconds?: number | null;
	transliteration?: string | null;
	source?: string;
}

export interface CollectSubtitleWordResult {
	vocabularyCardId: string;
	wasCreated: boolean;
}

export interface UserVocabularyCardMediaRecord {
	vocabularyCardId: string;
	imageStorageRef: string | null;
	vocabAudioStorageRef: string | null;
	sentenceAudioStorageRef: string | null;
	imageUrl: string | null;
	vocabAudioUrl: string | null;
	sentenceAudioUrl: string | null;
	imageHidden?: boolean;
	vocabAudioHidden?: boolean;
	sentenceAudioHidden?: boolean;
	hasCustomImage?: boolean;
	hasCustomVocabAudio?: boolean;
	hasCustomSentenceAudio?: boolean;
}

export interface UpsertUserVocabularyCardMediaParams {
	vocabularyCardId: string;
	imageStorageRef?: string | null;
	vocabAudioStorageRef?: string | null;
	sentenceAudioStorageRef?: string | null;
}

export interface PersistUserVocabularyCardMediaAssetsParams {
	vocabularyCardId: string;
	imageFile?: File | null;
	vocabAudioFile?: File | null;
	sentenceAudioFile?: File | null;
}

export interface DeleteUserVocabularyCardImageParams {
	vocabularyCardId: string;
}

export interface DeleteUserVocabularyCardAudioParams {
	vocabularyCardId: string;
	kind: "vocab" | "sentence";
}

export interface ResetUserVocabularyCardMediaParams {
	vocabularyCardId: string;
}

export type BinaryReviewRating = "fail" | "pass";
export type DeckSourceType = "foundation" | "collected" | "sent" | "alphabet";
export type SharedDeckKind = "created" | "imported" | "account";
export type SubmitReviewSchedulerPayload = SchedulerReviewResponse;

export interface SharedDeckSettings {
	sharedDeckId: string;
	deckClientId: string;
	deckKind: SharedDeckKind;
	deckLabel: string;
	isPublic: boolean;
	publishedAt: string | null;
	recipientUserIds: string[];
}

export interface SaveMySharedDeckSettingsInput {
	deckClientId: string;
	deckKind: SharedDeckKind;
	deckLabel: string;
	isPublic: boolean;
	recipientUserIds: string[];
}

export interface CommunitySharedDeckSummary {
	sharedDeckId: string;
	deckClientId: string;
	deckKind: SharedDeckKind;
	deckLabel: string;
	publishedAt: string | null;
	ownerUserId: string;
	authorUsername: string | null;
	authorEmail: string | null;
	authorFirstName: string | null;
	authorLastName: string | null;
	authorAvatarUrl: string | null;
	recipientCount: number;
}

export type ViewableSharedDeckScope = "community" | "shared_with_me";

export interface ViewableSharedDeckSummary {
	sharedDeckId: string;
	deckClientId: string;
	deckKind: SharedDeckKind;
	deckLabel: string;
	isPublic: boolean;
	publishedAt: string | null;
	ownerUserId: string;
	authorUsername: string | null;
	authorEmail: string | null;
	authorFirstName: string | null;
	authorLastName: string | null;
	authorAvatarUrl: string | null;
	recipientCount: number;
	deckCardsCount: number;
	deckRows: DeckContentTableRow[];
	scope: ViewableSharedDeckScope;
}

const FSRS_RATING_BY_RATING: Record<BinaryReviewRating, 1 | 3> = {
	fail: 1,
	pass: 3,
};

const CLIENT_UNAVAILABLE_ERROR: DeckServiceError = {
	code: "CLIENT_UNAVAILABLE",
	message: "Supabase n'est pas configuré côté client.",
	retryable: true,
};

const UNKNOWN_ERROR_MESSAGE = "Une erreur inattendue est survenue. Réessayez.";
const DUE_SUNSET_GUARD_BLOCKED_ERROR_MESSAGE =
	"Le fallback SQL du scheduler due est retire. Activez le sunset guard explicite ou le rollback global.";
const REVIEW_SUNSET_GUARD_BLOCKED_ERROR_MESSAGE =
	"Le fallback SQL du scheduler review est retire. Activez le sunset guard explicite ou le rollback global.";

type MutationMode = "preview" | "real";

interface MutationOptions {
	mode: MutationMode;
}

const CLIENT_REVIEW_ID_STORAGE_KEY = "deck_perso_review_client_ids";
const RECENT_REVIEW_STORAGE_KEY = "deck_perso_recent_review_keys";
const REVIEW_SESSION_ID_STORAGE_KEY = "deck_perso_review_session_id_v1";
const REVIEW_SESSION_LEASE_SECONDS = 90;
const RECENT_REVIEW_TTL_MS = 15000;
const REVIEW_QUEUE_STORAGE_KEY = "deck_perso_review_submit_queue_v1";
const MAX_REVIEW_REPLAY_ATTEMPTS = 5;
const REVIEW_RETRY_BACKOFF_MS = [1000, 3000, 10000, 30000, 60000] as const;
const SCHEDULER_SHADOW_DIFF_EVENTS_TABLE = "scheduler_shadow_diff_events";
const ACTIVE_FSRS_WEIGHTS_TABLE = "user_fsrs_active_weights";
const inFlightReviewKeys = new Set<string>();
let cachedClientReviewIds: Record<string, string> | null = null;
let isReplayOnlineListenerAttached = false;
let replayInProgress: Promise<ReviewReplayResult> | null = null;
interface QueuedReviewItem {
	accountKey: string;
	cardKey: string;
	card: VocabCard;
	rating: BinaryReviewRating;
	clientReviewId: string;
	sequence: number;
	enqueuedAt: number;
	attempts: number;
	nextRetryAt: number;
}

interface ReviewQueueState {
	lastSequence: number;
	items: QueuedReviewItem[];
}

interface SchedulerShadowDiffContext {
	userId: string | null;
	enabled: boolean;
}

type SchedulerShadowDiffOperation = "due_fetch" | "review_submit";

type SchedulerShadowDiffPrimaryPath = "runtime_edge" | "legacy_sql";

interface SchedulerShadowDiffEventArgs {
	userId: string;
	operation: SchedulerShadowDiffOperation;
	primaryPath: SchedulerShadowDiffPrimaryPath;
	occurredAt: string;
	requestNowUtc?: string | null;
	weightsVersion: number | null;
	schedulerInputs: Record<string, unknown>;
	runtimeOutput: unknown;
	legacyOutput: unknown;
	diffSummary: Record<string, unknown>;
}

const SHADOW_DIFF_REASON_CODES = {
	RUNTIME_DUE_FALLBACK_TO_LEGACY: "runtime_due_fallback_to_legacy",
	RUNTIME_DUE_INVALID_PAYLOAD: "runtime_due_invalid_payload",
	RUNTIME_DUE_FALLBACK_BLOCKED_BY_SUNSET_GUARD:
		"runtime_due_fallback_blocked_by_sunset_guard",
	LEGACY_DUE_SHADOW_FAILED: "legacy_due_shadow_failed",
	RUNTIME_REVIEW_FALLBACK_TO_LEGACY: "runtime_review_fallback_to_legacy",
	RUNTIME_REVIEW_INVALID_PAYLOAD: "runtime_review_invalid_payload",
	RUNTIME_REVIEW_FALLBACK_BLOCKED_BY_SUNSET_GUARD:
		"runtime_review_fallback_blocked_by_sunset_guard",
	LEGACY_REVIEW_SHADOW_FAILED: "legacy_review_shadow_failed",
} as const;

const SHARED_DECK_KIND_VALUES: readonly SharedDeckKind[] = [
	"created",
	"imported",
	"account",
];

interface SharedDeckSettingsRpcRow {
	shared_deck_id?: unknown;
	deck_client_id?: unknown;
	deck_kind?: unknown;
	deck_label?: unknown;
	is_public?: unknown;
	published_at?: unknown;
	recipient_user_ids?: unknown;
}

interface CommunitySharedDeckRpcRow {
	shared_deck_id?: unknown;
	deck_client_id?: unknown;
	deck_kind?: unknown;
	deck_label?: unknown;
	is_public?: unknown;
	published_at?: unknown;
	owner_user_id?: unknown;
	author_username?: unknown;
	author_email?: unknown;
	author_first_name?: unknown;
	author_last_name?: unknown;
	author_avatar_url?: unknown;
	recipient_count?: unknown;
	deck_cards_count?: unknown;
	deck_rows_json?: unknown;
}

interface SharedDeckSnapshotRpcRow {
	shared_deck_id?: unknown;
	deck_cards_count?: unknown;
}

export interface ReviewReplayResult {
	processed: number;
	succeeded: number;
	dropped: number;
	deferred: number;
	remaining: number;
}

export type ReviewPreviewSessionStatus = "active" | "completed";

export interface ReviewPreviewSessionState {
	previewSessionId: string | null;
	status: ReviewPreviewSessionStatus;
	shouldShowPreview: boolean;
	completedAt: string | null;
}

function safeLocalStorage(): Storage | null {
	if (typeof window === "undefined") {
		return null;
	}
	try {
		if (window.localStorage) {
			return window.localStorage;
		}
	} catch {
		return null;
	}
	return null;
}

function loadClientReviewIds(): Record<string, string> {
	if (cachedClientReviewIds) {
		return cachedClientReviewIds;
	}
	const storage = safeLocalStorage();
	if (!storage) {
		cachedClientReviewIds = {};
		return cachedClientReviewIds;
	}
	try {
		const raw = storage.getItem(CLIENT_REVIEW_ID_STORAGE_KEY);
		cachedClientReviewIds = raw
			? (JSON.parse(raw) as Record<string, string>)
			: {};
	} catch {
		cachedClientReviewIds = {};
	}
	return cachedClientReviewIds;
}

function persistClientReviewIds(): void {
	const storage = safeLocalStorage();
	if (!storage || !cachedClientReviewIds) {
		return;
	}
	try {
		storage.setItem(
			CLIENT_REVIEW_ID_STORAGE_KEY,
			JSON.stringify(cachedClientReviewIds),
		);
	} catch {
		/* swallow */
	}
}

function getOrCreateClientReviewId(cardKey: string): string {
	const ids = loadClientReviewIds();
	if (ids[cardKey]) {
		return ids[cardKey];
	}
	const newId = generateClientReviewId();
	ids[cardKey] = newId;
	persistClientReviewIds();
	return newId;
}

function clearClientReviewId(cardKey: string): void {
	const ids = loadClientReviewIds();
	if (ids[cardKey]) {
		delete ids[cardKey];
		persistClientReviewIds();
	}
}

function safeSessionStorage(): Storage | null {
	if (typeof window === "undefined") {
		return null;
	}
	try {
		if (window.sessionStorage) {
			return window.sessionStorage;
		}
	} catch {
		return null;
	}
	return null;
}

function setClientReviewId(cardKey: string, clientReviewId: string): void {
	const ids = loadClientReviewIds();
	ids[cardKey] = clientReviewId;
	persistClientReviewIds();
}

function loadRecentReviewKeys(): Record<string, number> {
	const storage = safeLocalStorage();
	if (!storage) {
		return {};
	}
	try {
		const raw = storage.getItem(RECENT_REVIEW_STORAGE_KEY);
		return raw ? (JSON.parse(raw) as Record<string, number>) : {};
	} catch {
		return {};
	}
}

function persistRecentReviewKeys(keys: Record<string, number>): void {
	const storage = safeLocalStorage();
	if (!storage) {
		return;
	}
	try {
		storage.setItem(RECENT_REVIEW_STORAGE_KEY, JSON.stringify(keys));
	} catch {
		/* swallow */
	}
}

function pruneRecentReviewKeys(
	keys: Record<string, number>,
	nowMs: number,
): Record<string, number> {
	const next: Record<string, number> = {};
	Object.entries(keys).forEach(([key, value]) => {
		if (typeof value === "number" && nowMs - value < RECENT_REVIEW_TTL_MS) {
			next[key] = value;
		}
	});
	return next;
}

function hasRecentReview(cardKey: string): boolean {
	const nowMs = Date.now();
	const cleaned = pruneRecentReviewKeys(loadRecentReviewKeys(), nowMs);
	const ts = cleaned[cardKey];
	persistRecentReviewKeys(cleaned);
	return typeof ts === "number";
}

function markRecentReview(cardKey: string): void {
	const nowMs = Date.now();
	const cleaned = pruneRecentReviewKeys(loadRecentReviewKeys(), nowMs);
	cleaned[cardKey] = nowMs;
	persistRecentReviewKeys(cleaned);
}

function isBrowserOffline(): boolean {
	if (typeof navigator === "undefined") {
		return false;
	}
	return navigator.onLine === false;
}

function normalizeQueueState(raw: unknown): ReviewQueueState {
	if (!raw || typeof raw !== "object") {
		return { lastSequence: 0, items: [] };
	}

	const maybeState = raw as {
		lastSequence?: unknown;
		items?: unknown;
	};

	const rawItems = Array.isArray(maybeState.items) ? maybeState.items : [];
	const items: QueuedReviewItem[] = [];

	rawItems.forEach((entry) => {
		if (!entry || typeof entry !== "object") {
			return;
		}
		const candidate = entry as Partial<QueuedReviewItem>;
		if (
			typeof candidate.accountKey !== "string" ||
			typeof candidate.cardKey !== "string" ||
			!candidate.card ||
			typeof candidate.rating !== "string" ||
			typeof candidate.clientReviewId !== "string" ||
			typeof candidate.sequence !== "number" ||
			typeof candidate.enqueuedAt !== "number" ||
			typeof candidate.attempts !== "number" ||
			typeof candidate.nextRetryAt !== "number"
		) {
			return;
		}
		if (candidate.rating !== "fail" && candidate.rating !== "pass") {
			return;
		}
		items.push({
			accountKey: candidate.accountKey,
			cardKey: candidate.cardKey,
			card: candidate.card,
			rating: candidate.rating,
			clientReviewId: candidate.clientReviewId,
			sequence: candidate.sequence,
			enqueuedAt: candidate.enqueuedAt,
			attempts: candidate.attempts,
			nextRetryAt: candidate.nextRetryAt,
		});
	});

	items.sort((a, b) => a.sequence - b.sequence || a.enqueuedAt - b.enqueuedAt);

	return {
		lastSequence:
			typeof maybeState.lastSequence === "number" ? maybeState.lastSequence : 0,
		items,
	};
}

function loadReviewQueueState(): ReviewQueueState {
	const storage = safeLocalStorage();
	if (!storage) {
		return { lastSequence: 0, items: [] };
	}
	try {
		const raw = storage.getItem(REVIEW_QUEUE_STORAGE_KEY);
		if (!raw) {
			return { lastSequence: 0, items: [] };
		}
		return normalizeQueueState(JSON.parse(raw));
	} catch {
		return { lastSequence: 0, items: [] };
	}
}

function persistReviewQueueState(state: ReviewQueueState): void {
	const storage = safeLocalStorage();
	if (!storage) {
		return;
	}
	try {
		storage.setItem(REVIEW_QUEUE_STORAGE_KEY, JSON.stringify(state));
	} catch {
		/* swallow */
	}
}

function resolveRetryDelay(attempts: number): number {
	if (attempts <= 0) {
		return REVIEW_RETRY_BACKOFF_MS[0];
	}
	const index = Math.min(attempts - 1, REVIEW_RETRY_BACKOFF_MS.length - 1);
	return REVIEW_RETRY_BACKOFF_MS[index];
}

function ensureOnlineReplayListener(): void {
	if (typeof window === "undefined" || isReplayOnlineListenerAttached) {
		return;
	}

	window.addEventListener("online", () => {
		void replayQueuedReviews();
	});
	isReplayOnlineListenerAttached = true;
}

async function resolveAccountKey(
	client: AppSupabaseClient | null,
): Promise<string> {
	if (!client) {
		return "anonymous";
	}

	const userId = await getCurrentAuthUserId();
	return userId ?? "anonymous";
}

async function claimActiveReviewSessionLease(
	client: AppSupabaseClient,
	reviewSessionId: string,
): Promise<PostgrestError | null> {
	const rpcClient = client as unknown as ReviewSessionLeaseRpcClient;
	const { error } = await rpcClient.rpc("claim_review_session_lease_v1", {
		p_review_session_id: reviewSessionId,
		p_lease_seconds: REVIEW_SESSION_LEASE_SECONDS,
	});
	return error ?? null;
}

function enqueueReviewSubmission(
	accountKey: string,
	cardKey: string,
	card: VocabCard,
	rating: BinaryReviewRating,
	clientReviewId: string,
): void {
	const state = loadReviewQueueState();
	const existing = state.items.findIndex(
		(item) => item.accountKey === accountKey && item.cardKey === cardKey,
	);
	if (existing >= 0) {
		return;
	}

	const sequence = state.lastSequence + 1;
	const nowMs = Date.now();
	state.items.push({
		accountKey,
		cardKey,
		card,
		rating,
		clientReviewId,
		sequence,
		enqueuedAt: nowMs,
		attempts: 0,
		nextRetryAt: nowMs,
	});
	state.lastSequence = sequence;
	state.items.sort(
		(a, b) => a.sequence - b.sequence || a.enqueuedAt - b.enqueuedAt,
	);
	persistReviewQueueState(state);
	ensureOnlineReplayListener();
}

function guardPreviewMode(
	operation: string,
	mode: MutationMode,
): DeckServiceError | null {
	if (mode !== "real") {
		return createServiceError(
			"PREVIEW_BLOCKED",
			`${operation} est désactivé en mode preview.`,
			false,
		);
	}
	return null;
}

function isDuplicateReviewError(error?: PostgrestError | null): boolean {
	if (!error) {
		return false;
	}
	const haystack =
		`${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
	return (
		haystack.includes("duplicate key") && haystack.includes("client_review")
	);
}

function isMissingLegacySubmitReviewSignature(
	error?: PostgrestError | null,
): boolean {
	if (!error) {
		return false;
	}

	const haystack =
		`${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
	return (
		(error.code === "PGRST202" || haystack.includes("schema cache")) &&
		haystack.includes("submit_review_fsrs_v2") &&
		haystack.includes("p_client_review_id")
	);
}

function extractUnknownErrorText(error: unknown): string {
	if (!error || typeof error !== "object") {
		return "";
	}

	const candidate = error as {
		name?: unknown;
		message?: unknown;
		details?: unknown;
		hint?: unknown;
		code?: unknown;
		context?: unknown;
	};

	const parts: string[] = [];
	if (typeof candidate.name === "string") {
		parts.push(candidate.name);
	}
	if (typeof candidate.message === "string") {
		parts.push(candidate.message);
	}
	if (typeof candidate.details === "string") {
		parts.push(candidate.details);
	}
	if (typeof candidate.hint === "string") {
		parts.push(candidate.hint);
	}
	if (typeof candidate.code === "string") {
		parts.push(candidate.code);
	}
	if (candidate.context !== undefined) {
		try {
			parts.push(JSON.stringify(candidate.context));
		} catch {
			/* swallow */
		}
	}

	return parts.join(" ").toLowerCase();
}

function isInvokeDuplicateReviewError(error: unknown): boolean {
	const haystack = extractUnknownErrorText(error);
	if (!haystack) {
		return false;
	}
	return (
		(haystack.includes("duplicate key") &&
			haystack.includes("client_review")) ||
		haystack.includes("client_review_id_card_mismatch")
	);
}

function isInvokeActiveSessionLockedError(error: unknown): boolean {
	return extractUnknownErrorText(error).includes(
		"active_review_session_locked",
	);
}

function isClientResolutionError(error: unknown): boolean {
	const haystack = extractUnknownErrorText(error);
	if (!haystack) {
		return false;
	}

	return (
		haystack.includes("cannot read properties of undefined") &&
		(haystack.includes("reading 'region'") ||
			haystack.includes("reading 'rest'"))
	);
}

function isInvokeClientResolutionError(error: unknown): boolean {
	return isClientResolutionError(error);
}

function shouldFallbackToLegacySubmitRpc(error: unknown): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}

	if (isInvokeClientResolutionError(error)) {
		return true;
	}

	const haystack = extractUnknownErrorText(error);
	const maybeStatus = (
		error as { status?: unknown; context?: { status?: unknown } }
	).status;
	const maybeContextStatus = (
		error as { status?: unknown; context?: { status?: unknown } }
	).context?.status;
	const status =
		typeof maybeStatus === "number"
			? maybeStatus
			: typeof maybeContextStatus === "number"
				? maybeContextStatus
				: null;

	if (status === 404) {
		return true;
	}

	if (status === 401) {
		return true;
	}

	if (typeof status === "number" && status >= 500) {
		return true;
	}

	return (
		haystack.includes("failed to send a request to the edge function") ||
		haystack.includes("relay error") ||
		haystack.includes("invalid jwt") ||
		haystack.includes("scheduler-review-v1 not found") ||
		haystack.includes("function not found") ||
		haystack.includes("commit_review_failed") ||
		haystack.includes("unable to commit scheduler review") ||
		haystack.includes("scheduler_compute_unavailable") ||
		haystack.includes("scheduler_compute_rejected")
	);
}

function shouldFallbackToLegacyDueFetch(error: unknown): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}

	if (isInvokeClientResolutionError(error)) {
		return true;
	}

	const haystack = extractUnknownErrorText(error);
	const maybeStatus = (
		error as { status?: unknown; context?: { status?: unknown } }
	).status;
	const maybeContextStatus = (
		error as { status?: unknown; context?: { status?: unknown } }
	).context?.status;
	const status =
		typeof maybeStatus === "number"
			? maybeStatus
			: typeof maybeContextStatus === "number"
				? maybeContextStatus
				: null;

	if (status === 404) {
		return true;
	}

	if (status === 401) {
		return true;
	}

	return (
		haystack.includes("failed to send a request to the edge function") ||
		haystack.includes("relay error") ||
		haystack.includes("invalid jwt") ||
		haystack.includes("scheduler-due-v1 not found") ||
		haystack.includes("function not found") ||
		haystack.includes("compute unavailable")
	);
}

function shouldAllowLegacyFallbackOnTransportFailure(error: unknown): boolean {
	if (isInvokeClientResolutionError(error)) {
		return true;
	}

	const haystack = extractUnknownErrorText(error);
	if (!haystack) {
		return false;
	}

	return (
		haystack.includes("failed to send a request to the edge function") ||
		haystack.includes("relay error") ||
		haystack.includes("typeerror: failed to fetch") ||
		haystack.includes("networkerror") ||
		haystack.includes("net::err_failed") ||
		haystack.includes("invalid jwt") ||
		haystack.includes("access-control-allow-origin") ||
		haystack.includes("cors")
	);
}

function shouldAllowLegacyFallbackOnInvalidRuntimePayload(options: {
	runtimePayload: unknown;
	runtimeParseError: unknown;
}): boolean {
	if (
		shouldAllowLegacyFallbackOnTransportFailure(options.runtimePayload) ||
		shouldAllowLegacyFallbackOnTransportFailure(options.runtimeParseError)
	) {
		return true;
	}

	return options.runtimePayload == null;
}

function toJsonCompatible(value: unknown): unknown {
	if (value === undefined || value === null) {
		return null;
	}

	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return value;
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (Array.isArray(value)) {
		return value.map((entry) => toJsonCompatible(entry));
	}

	if (typeof value === "object") {
		const next: Record<string, unknown> = {};
		Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
			next[key] = toJsonCompatible(entry);
		});
		return next;
	}

	return String(value);
}

function serializeShadowError(error: unknown): Record<string, unknown> | null {
	if (!error) {
		return null;
	}

	if (typeof error === "string") {
		return { message: error };
	}

	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack ?? null,
		};
	}

	if (typeof error === "object") {
		const candidate = error as Record<string, unknown>;
		const next: Record<string, unknown> = {};
		["name", "message", "details", "hint", "code", "status", "context"].forEach(
			(key) => {
				if (candidate[key] !== undefined) {
					next[key] = toJsonCompatible(candidate[key]);
				}
			},
		);
		if (Object.keys(next).length > 0) {
			return next;
		}
	}

	return { message: String(error) };
}

function serializeShadowOutput(
	data: unknown,
	error?: unknown,
): Record<string, unknown> {
	return {
		data: toJsonCompatible(data),
		error: serializeShadowError(error),
	};
}

function asNonNegativeIntegerOrNull(value: unknown): number | null {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 0) {
		return null;
	}
	return parsed;
}

function asPositiveIntegerOrNull(value: unknown): number | null {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1) {
		return null;
	}
	return parsed;
}

function toDueDiffKey(card: VocabCard, index: number): string {
	const cardKey = resolveCardKey(card) ?? `index:${index}`;
	const source = typeof card.source === "string" ? card.source : "";
	const status = typeof card.status === "string" ? card.status : "";
	const nextReviewAt =
		typeof card.nextReviewAt === "string" ? card.nextReviewAt : "";
	return `${cardKey}|${source}|${status}|${nextReviewAt}`;
}

function summarizeDueCardsDiff(
	runtimeCards: VocabCard[],
	legacyCards: VocabCard[],
): Record<string, unknown> {
	const runtimeKeys = runtimeCards.map((card, index) =>
		toDueDiffKey(card, index),
	);
	const legacyKeys = legacyCards.map((card, index) =>
		toDueDiffKey(card, index),
	);

	const maxLength = Math.max(runtimeKeys.length, legacyKeys.length);
	let firstMismatchIndex: number | null = null;
	for (let index = 0; index < maxLength; index += 1) {
		if (runtimeKeys[index] !== legacyKeys[index]) {
			firstMismatchIndex = index;
			break;
		}
	}

	return {
		matches: firstMismatchIndex === null,
		first_mismatch_index: firstMismatchIndex,
		runtime_count: runtimeCards.length,
		legacy_count: legacyCards.length,
		runtime_keys: runtimeKeys,
		legacy_keys: legacyKeys,
	};
}

function normalizeReviewResultForDiff(
	payload: unknown,
): Record<string, unknown> | null {
	if (!payload || typeof payload !== "object") {
		return null;
	}

	const candidate = payload as Record<string, unknown>;
	return {
		status:
			typeof candidate.status === "string"
				? candidate.status
				: candidate.status,
		interval_days:
			typeof candidate.interval_days === "number"
				? candidate.interval_days
				: asNonNegativeIntegerOrNull(candidate.interval_days),
		ease_factor:
			typeof candidate.ease_factor === "number"
				? candidate.ease_factor
				: Number(candidate.ease_factor ?? NaN),
		repetitions:
			typeof candidate.repetitions === "number"
				? candidate.repetitions
				: asNonNegativeIntegerOrNull(candidate.repetitions),
		lapses:
			typeof candidate.lapses === "number"
				? candidate.lapses
				: asNonNegativeIntegerOrNull(candidate.lapses),
		next_review_at:
			typeof candidate.next_review_at === "string"
				? candidate.next_review_at
				: null,
		last_reviewed_at:
			typeof candidate.last_reviewed_at === "string"
				? candidate.last_reviewed_at
				: null,
	};
}

function summarizeReviewResultDiff(
	runtimePayload: unknown,
	legacyPayload: unknown,
): Record<string, unknown> {
	const runtimeNormalized = normalizeReviewResultForDiff(runtimePayload);
	const legacyNormalized = normalizeReviewResultForDiff(legacyPayload);

	const fields = [
		"status",
		"interval_days",
		"ease_factor",
		"repetitions",
		"lapses",
		"next_review_at",
		"last_reviewed_at",
	] as const;

	const mismatchedFields = fields.filter(
		(field) => runtimeNormalized?.[field] !== legacyNormalized?.[field],
	);

	return {
		matches: mismatchedFields.length === 0,
		mismatched_fields: mismatchedFields,
		runtime_result: runtimeNormalized,
		legacy_result: legacyNormalized,
	};
}

function serializeServiceResultForShadow<T>(
	result: ServiceResult<T>,
): Record<string, unknown> {
	if (result.ok) {
		return {
			ok: true,
			data: toJsonCompatible(result.data),
		};
	}

	return {
		ok: false,
		error: toJsonCompatible(result.error),
	};
}

async function resolveSchedulerShadowDiffContext(
	client: AppSupabaseClient,
): Promise<SchedulerShadowDiffContext> {
	if (!client.auth) {
		return { userId: null, enabled: false };
	}

	return {
		userId: await getCurrentAuthUserId(),
		enabled: false,
	};
}

async function resolveActiveWeightsVersion(
	client: AppSupabaseClient,
	userId: string,
): Promise<number | null> {
	const fromMethod = (
		client as unknown as {
			from?: (table: string) => {
				select: (columns: string) => {
					eq: (
						column: string,
						value: string,
					) => {
						maybeSingle: () => Promise<{
							data: { active_weights_version?: unknown } | null;
							error: unknown;
						}>;
					};
				};
			};
		}
	).from;
	const from =
		typeof fromMethod === "function" ? fromMethod.bind(client) : null;

	if (!from) {
		return null;
	}

	try {
		const { data, error } = await from(ACTIVE_FSRS_WEIGHTS_TABLE)
			.select("active_weights_version")
			.eq("user_id", userId)
			.maybeSingle();
		if (error) {
			return null;
		}
		return asPositiveIntegerOrNull(data?.active_weights_version);
	} catch {
		return null;
	}
}

async function insertSchedulerShadowDiffEvent(
	client: AppSupabaseClient,
	args: SchedulerShadowDiffEventArgs,
): Promise<void> {
	const fromMethod = (
		client as unknown as {
			from?: (table: string) => {
				insert: (value: Record<string, unknown>) => Promise<{ error: unknown }>;
			};
		}
	).from;
	const from =
		typeof fromMethod === "function" ? fromMethod.bind(client) : null;

	if (!from) {
		return;
	}

	try {
		await from(SCHEDULER_SHADOW_DIFF_EVENTS_TABLE).insert({
			user_id: args.userId,
			operation: args.operation,
			primary_path: args.primaryPath,
			occurred_at: args.occurredAt,
			request_now_utc: args.requestNowUtc ?? null,
			weights_version: args.weightsVersion,
			scheduler_inputs: toJsonCompatible(args.schedulerInputs),
			runtime_output: toJsonCompatible(args.runtimeOutput),
			legacy_output: toJsonCompatible(args.legacyOutput),
			diff_summary: toJsonCompatible(args.diffSummary),
		});
	} catch {
		return;
	}
}

function isActiveSessionLockedError(error?: PostgrestError | null): boolean {
	if (!error) {
		return false;
	}
	const haystack =
		`${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
	return haystack.includes("active_review_session_locked");
}

function resolveCardKey(card: VocabCard): string | null {
	if (card.vocabularyCardId) {
		return card.vocabularyCardId;
	}
	if (card.foundationCardId) {
		return card.foundationCardId;
	}
	if (card.remoteId) {
		return card.remoteId;
	}
	if (typeof card.id === "string") {
		return card.id;
	}
	return null;
}

function resolveClient(): AppSupabaseClient | null {
	return supabase ?? null;
}

function generateClientReviewId(): string {
	const cryptoRef =
		typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
	if (cryptoRef?.randomUUID) {
		return cryptoRef.randomUUID();
	}
	return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

function getOrCreateReviewSessionId(): string {
	const storage = safeSessionStorage();
	if (storage) {
		try {
			const existing = storage.getItem(REVIEW_SESSION_ID_STORAGE_KEY);
			if (existing) {
				return existing;
			}
			const created = generateClientReviewId();
			storage.setItem(REVIEW_SESSION_ID_STORAGE_KEY, created);
			return created;
		} catch {
			return generateClientReviewId();
		}
	}
	return generateClientReviewId();
}

function normalizeCardIds(cardIds: string[]): string[] {
	const deduped: string[] = [];
	const seen = new Set<string>();

	cardIds.forEach((rawId) => {
		if (!rawId) {
			return;
		}
		const cardId = String(rawId);
		if (!cardId || seen.has(cardId)) {
			return;
		}
		seen.add(cardId);
		deduped.push(cardId);
	});

	return deduped;
}

function mapSourceToDeckSourceType(
	source: string,
): Exclude<DeckSourceType, "foundation"> {
	const normalized = source.trim().toLowerCase();
	if (normalized.includes("alphabet")) {
		return "alphabet";
	}
	if (
		normalized.includes("prof") ||
		normalized.includes("teacher") ||
		normalized.includes("sent")
	) {
		return "sent";
	}
	return "collected";
}

function isAlphabetDueRecord(record: GetDueCardsV2Row): boolean {
	if (!record || typeof record !== "object") {
		return false;
	}

	const sourceType = normalizeLowercaseString(
		(record as { source_type?: unknown }).source_type,
	);
	const category = normalizeLowercaseString(
		(record as { category?: unknown }).category,
	);

	return sourceType === "alphabet" || category === ALPHABET_CATEGORY;
}

type SchedulerDueV1Response = SchedulerDueResponse;

function mapCardToReviewType(card: VocabCard): ReviewType | null {
	if (card.source === "foundation" || card.sourceType === "foundation") {
		return "foundation";
	}
	if (card.sourceType === "sent") {
		return "sent";
	}
	if (card.sourceType === "collected") {
		return "collected";
	}
	return null;
}

function parseFoundationFocus(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	const normalized = trimmed.startsWith("#")
		? trimmed.slice(1).trim()
		: trimmed;
	if (!normalized) {
		return null;
	}

	const parsed = Number.parseInt(normalized, 10);
	return Number.isFinite(parsed) ? parsed : null;
}

function compareCardsByFocus(
	left: VocabCard,
	right: VocabCard,
): number {
	const leftFocus = parseFoundationFocus(left.focus);
	const rightFocus = parseFoundationFocus(right.focus);
	if (leftFocus === null && rightFocus === null) {
		return 0;
	}

	if (leftFocus !== null && rightFocus !== null && leftFocus !== rightFocus) {
		return leftFocus - rightFocus;
	}

	if (leftFocus !== null && rightFocus === null) {
		return -1;
	}

	if (leftFocus === null && rightFocus !== null) {
		return 1;
	}

	return 0;
}

function orderFoundationCardsByFocus(cards: VocabCard[]): VocabCard[] {
	const focusCardPositions: number[] = [];
	const focusCards: VocabCard[] = [];

	cards.forEach((card, index) => {
		if (parseFoundationFocus(card.focus) === null) {
			return;
		}
		focusCardPositions.push(index);
		focusCards.push(card);
	});

	if (focusCards.length < 2) {
		return cards;
	}

	const sortedFoundationCards = [...focusCards]
		.map((card, index) => ({ card, index }))
		.sort((left, right) => {
			const leftIsNew = left.card.status?.toLowerCase() === "new";
			const rightIsNew = right.card.status?.toLowerCase() === "new";
			if (leftIsNew && rightIsNew) {
				const focusComparison = compareCardsByFocus(left.card, right.card);
				if (focusComparison !== 0) {
					return focusComparison;
				}
			}

			const focusComparison = compareCardsByFocus(left.card, right.card);
			if (focusComparison !== 0) {
				return focusComparison;
			}
			return left.index - right.index;
		})
		.map((entry) => entry.card);
	const orderedCards = [...cards];

	focusCardPositions.forEach((position, index) => {
		orderedCards[position] = sortedFoundationCards[index];
	});

	return orderedCards;
}

function normalizeSchedulerQueueRows(
	payload: SchedulerDueV1Response,
): GetDueCardsV2Row[] {
	return payload.ordered_queue as GetDueCardsV2Row[];
}

function sanitizeSearchRow(row: SearchCardsV2Row): SearchCardsV2Row {
	if (!row || typeof row !== "object") {
		return row;
	}

	return {
		...row,
		word_ar:
			typeof row.word_ar === "string"
				? repairMojibake(row.word_ar)
				: row.word_ar,
		word_fr:
			typeof row.word_fr === "string"
				? repairMojibake(row.word_fr)
				: row.word_fr,
		category:
			typeof row.category === "string"
				? repairMojibake(row.category)
				: row.category,
		transliteration:
			typeof row.transliteration === "string"
				? repairMojibake(row.transliteration)
				: row.transliteration,
	};
}

function createServiceError(
	code: DeckServiceErrorCode,
	message: string,
	retryable = true,
): DeckServiceError {
	return { code, message, retryable };
}

function fromPostgrestError(error?: PostgrestError | null): DeckServiceError {
	if (!error) {
		return createServiceError("UNKNOWN", UNKNOWN_ERROR_MESSAGE);
	}

	const authLike = /jwt|auth|token|permission/i.test(
		`${error.message} ${error.details ?? ""}`,
	);
	if (authLike || error.code === "PGRST301") {
		return createServiceError(
			"NOT_AUTHENTICATED",
			"Vous devez être connecté pour effectuer cette action.",
			false,
		);
	}

	const validationLike = /invalide|invalid|not found|introuvable/i.test(
		`${error.message} ${error.details ?? ""}`,
	);
	const limitLike = /limite|limit|quota/i.test(
		`${error.message} ${error.details ?? ""}`,
	);

	return createServiceError(
		"RPC_ERROR",
		error.message ?? UNKNOWN_ERROR_MESSAGE,
		!(validationLike || limitLike),
	);
}

const SHARED_DECK_BACKEND_UNAVAILABLE_MESSAGE =
	"Le partage des decks n'est pas encore disponible sur ce serveur. Déploie la migration Supabase dédiée.";
const SHARED_DECK_BACKEND_UNAVAILABLE_STORAGE_KEY =
	"deck_perso_shared_backend_unavailable";
const SHARED_DECK_BACKEND_UNAVAILABLE_TTL_MS = 5 * 60 * 1000;

let isSharedDeckBackendUnavailable = (() => {
	if (typeof window === "undefined") {
		return false;
	}

	try {
		const rawValue = window.localStorage.getItem(
			SHARED_DECK_BACKEND_UNAVAILABLE_STORAGE_KEY,
		);
		if (!rawValue) {
			return false;
		}

		const expiresAt = Number.parseInt(rawValue, 10);
		if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
			return true;
		}

		window.localStorage.removeItem(SHARED_DECK_BACKEND_UNAVAILABLE_STORAGE_KEY);
		return false;
	} catch {
		return false;
	}
})();

function isMissingSharedDeckBackendResource(
	error: PostgrestError | null,
	resourceName: string,
): boolean {
	if (!error) {
		return false;
	}

	const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
	return (
		(error.code === "PGRST202" ||
			error.code === "PGRST205" ||
			message.includes("schema cache")) &&
		message.includes(resourceName.toLowerCase())
	);
}

function markSharedDeckBackendUnavailable(
	error: PostgrestError | null,
): boolean {
	if (!error) {
		return false;
	}

	const resources = [
		"list_community_shared_decks_v1",
		"get_my_shared_deck_settings_v1",
		"upsert_shared_deck_settings_v1",
		"user_shared_decks",
		"user_shared_deck_recipients",
	];

	const isMissingResource = resources.some((resource) =>
		isMissingSharedDeckBackendResource(error, resource),
	);

	if (isMissingResource) {
		isSharedDeckBackendUnavailable = true;
		if (typeof window !== "undefined") {
			try {
				window.localStorage.setItem(
					SHARED_DECK_BACKEND_UNAVAILABLE_STORAGE_KEY,
					String(Date.now() + SHARED_DECK_BACKEND_UNAVAILABLE_TTL_MS),
				);
			} catch {
				// Ignore storage failures.
			}
		}
		return true;
	}

	return false;
}

function createSharedDeckBackendUnavailableError(): DeckServiceError {
	return createServiceError(
		"RPC_ERROR",
		SHARED_DECK_BACKEND_UNAVAILABLE_MESSAGE,
		false,
	);
}

function isMissingListCommunityRpcSignature(
	error: PostgrestError | null,
): boolean {
	return isMissingSharedDeckBackendResource(
		error,
		"list_community_shared_decks_v1",
	);
}

function isMissingGetSharedDeckSettingsRpcSignature(
	error: PostgrestError | null,
): boolean {
	return isMissingSharedDeckBackendResource(
		error,
		"get_my_shared_deck_settings_v1",
	);
}

function isMissingUpsertSharedDeckSettingsRpcSignature(
	error: PostgrestError | null,
): boolean {
	return isMissingSharedDeckBackendResource(
		error,
		"upsert_shared_deck_settings_v1",
	);
}

function fromUnknownError(error: unknown): DeckServiceError {
	if (error instanceof Error) {
		return createServiceError("UNKNOWN", error.message, true);
	}
	return createServiceError("UNKNOWN", UNKNOWN_ERROR_MESSAGE, true);
}

function toOptionalTrimmedString(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function toSharedDeckKind(value: unknown): SharedDeckKind | null {
	if (typeof value !== "string") {
		return null;
	}

	const normalized = value.trim().toLowerCase();
	return SHARED_DECK_KIND_VALUES.includes(normalized as SharedDeckKind)
		? (normalized as SharedDeckKind)
		: null;
}

function normalizeSharedDeckRecipientUserIds(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const deduped = new Set<string>();
	value.forEach((entry) => {
		const recipientUserId = toOptionalTrimmedString(entry);
		if (recipientUserId) {
			deduped.add(recipientUserId);
		}
	});

	return Array.from(deduped);
}

function normalizeSharedDeckSettingsRow(
	row: SharedDeckSettingsRpcRow | null | undefined,
): SharedDeckSettings | null {
	if (!row) {
		return null;
	}

	const sharedDeckId = toOptionalTrimmedString(row.shared_deck_id);
	const deckClientId = toOptionalTrimmedString(row.deck_client_id);
	const deckKind = toSharedDeckKind(row.deck_kind);
	const deckLabel = toOptionalTrimmedString(row.deck_label);

	if (!sharedDeckId || !deckClientId || !deckKind || !deckLabel) {
		return null;
	}

	return {
		sharedDeckId,
		deckClientId,
		deckKind,
		deckLabel,
		isPublic: row.is_public === true,
		publishedAt: toOptionalTrimmedString(row.published_at),
		recipientUserIds: normalizeSharedDeckRecipientUserIds(
			row.recipient_user_ids,
		),
	};
}

function normalizeCommunitySharedDeckRow(
	row: CommunitySharedDeckRpcRow | null | undefined,
): CommunitySharedDeckSummary | null {
	if (!row) {
		return null;
	}

	const sharedDeckId = toOptionalTrimmedString(row.shared_deck_id);
	const deckClientId = toOptionalTrimmedString(row.deck_client_id);
	const deckKind = toSharedDeckKind(row.deck_kind);
	const deckLabel = toOptionalTrimmedString(row.deck_label);
	const ownerUserId = toOptionalTrimmedString(row.owner_user_id);

	if (
		!sharedDeckId ||
		!deckClientId ||
		!deckKind ||
		!deckLabel ||
		!ownerUserId
	) {
		return null;
	}

	return {
		sharedDeckId,
		deckClientId,
		deckKind,
		deckLabel,
		publishedAt: toOptionalTrimmedString(row.published_at),
		ownerUserId,
		authorUsername: toOptionalTrimmedString(row.author_username),
		authorEmail: toOptionalTrimmedString(row.author_email),
		authorFirstName: toOptionalTrimmedString(row.author_first_name),
		authorLastName: toOptionalTrimmedString(row.author_last_name),
		authorAvatarUrl: toOptionalTrimmedString(row.author_avatar_url),
		recipientCount: toNonNegativeInteger(row.recipient_count ?? 0),
	};
}

function normalizeSharedDeckSnapshotRows(
	value: unknown,
): DeckContentTableRow[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const rows: DeckContentTableRow[] = [];

	value.forEach((entry, index) => {
		if (!entry || typeof entry !== "object") {
			return;
		}

		const row = entry as Record<string, unknown>;
		const id = toOptionalTrimmedString(row.id) ?? `shared:${index}`;
		const wordAr = toOptionalTrimmedString(row.wordAr ?? row.word_ar) ?? "";
		const wordFr = toOptionalTrimmedString(row.wordFr ?? row.word_fr) ?? "";

		if (!wordAr && !wordFr) {
			return;
		}

		const asNullableNumber = (candidate: unknown): number | null => {
			if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
				return null;
			}
			return candidate;
		};

		rows.push({
			id,
			wordAr,
			wordFr,
			lastSeenAt: toOptionalTrimmedString(row.lastSeenAt ?? row.last_seen_at),
			seenCount: toNonNegativeInteger(row.seenCount ?? row.seen_count),
			addedAt: toOptionalTrimmedString(row.addedAt ?? row.added_at),
			videoUrl: toOptionalTrimmedString(row.videoUrl ?? row.video_url),
			sourceVideoId: toOptionalTrimmedString(
				row.sourceVideoId ?? row.source_video_id,
			),
			sourceCueId: toOptionalTrimmedString(
				row.sourceCueId ?? row.source_cue_id,
			),
			sourceWordIndex: asNullableNumber(
				row.sourceWordIndex ?? row.source_word_index,
			),
			sourceWordStartSeconds: asNullableNumber(
				row.sourceWordStartSeconds ?? row.source_word_start_seconds,
			),
			sourceWordEndSeconds: asNullableNumber(
				row.sourceWordEndSeconds ?? row.source_word_end_seconds,
			),
			sourceLinkUrl: toOptionalTrimmedString(
				row.sourceLinkUrl ?? row.source_link_url,
			),
			imageUrl: toOptionalTrimmedString(row.imageUrl ?? row.image_url),
			vocabAudioUrl: toOptionalTrimmedString(
				row.vocabAudioUrl ?? row.vocab_audio_url,
			),
			sentenceAudioUrl: toOptionalTrimmedString(
				row.sentenceAudioUrl ?? row.sentence_audio_url,
			),
			hasCustomImage: row.hasCustomImage === true,
			hasCustomVocabAudio: row.hasCustomVocabAudio === true,
			hasCustomSentenceAudio: row.hasCustomSentenceAudio === true,
		});
	});

	return rows;
}

function normalizeViewableSharedDeckRow(
	row: CommunitySharedDeckRpcRow | null | undefined,
	scope: ViewableSharedDeckScope,
): ViewableSharedDeckSummary | null {
	if (!row) {
		return null;
	}

	const sharedDeckId = toOptionalTrimmedString(row.shared_deck_id);
	const deckClientId = toOptionalTrimmedString(row.deck_client_id);
	const deckKind = toSharedDeckKind(row.deck_kind);
	const deckLabel = toOptionalTrimmedString(row.deck_label);
	const ownerUserId = toOptionalTrimmedString(row.owner_user_id);

	if (
		!sharedDeckId ||
		!deckClientId ||
		!deckKind ||
		!deckLabel ||
		!ownerUserId
	) {
		return null;
	}

	const deckRows = normalizeSharedDeckSnapshotRows(row.deck_rows_json);

	return {
		sharedDeckId,
		deckClientId,
		deckKind,
		deckLabel,
		isPublic: row.is_public === true,
		publishedAt: toOptionalTrimmedString(row.published_at),
		ownerUserId,
		authorUsername: toOptionalTrimmedString(row.author_username),
		authorEmail: toOptionalTrimmedString(row.author_email),
		authorFirstName: toOptionalTrimmedString(row.author_first_name),
		authorLastName: toOptionalTrimmedString(row.author_last_name),
		authorAvatarUrl: toOptionalTrimmedString(row.author_avatar_url),
		recipientCount: toNonNegativeInteger(row.recipient_count ?? 0),
		deckCardsCount: Math.max(
			toNonNegativeInteger(row.deck_cards_count ?? 0),
			deckRows.length,
		),
		deckRows,
		scope,
	};
}

function normalizeReviewPreviewSessionState(
	raw: unknown,
): ReviewPreviewSessionState {
	if (!raw || typeof raw !== "object") {
		return {
			previewSessionId: null,
			status: "active",
			shouldShowPreview: true,
			completedAt: null,
		};
	}

	const row = raw as {
		preview_session_id?: unknown;
		previewSessionId?: unknown;
		status?: unknown;
		should_show_preview?: unknown;
		shouldShowPreview?: unknown;
		completed_at?: unknown;
		completedAt?: unknown;
	};

	const previewSessionId =
		typeof row.preview_session_id === "string"
			? row.preview_session_id
			: typeof row.previewSessionId === "string"
				? row.previewSessionId
				: null;

	const statusRaw =
		typeof row.status === "string" ? row.status.trim().toLowerCase() : "active";
	const status: ReviewPreviewSessionStatus =
		statusRaw === "completed" ? "completed" : "active";

	const completedAtRaw =
		typeof row.completed_at === "string"
			? row.completed_at
			: typeof row.completedAt === "string"
				? row.completedAt
				: null;
	const completedAt =
		completedAtRaw && completedAtRaw.length > 0 ? completedAtRaw : null;

	const shouldShowPreviewRaw =
		typeof row.should_show_preview === "boolean"
			? row.should_show_preview
			: typeof row.shouldShowPreview === "boolean"
				? row.shouldShowPreview
				: null;

	return {
		previewSessionId,
		status,
		shouldShowPreview:
			typeof shouldShowPreviewRaw === "boolean"
				? shouldShowPreviewRaw
				: status !== "completed",
		completedAt,
	};
}

interface AddAlphabetDeckRpcRow {
	added_cards: number | null;
	existing_cards: number | null;
	total_cards: number | null;
}

export interface AddAlphabetDeckResult {
	addedCards: number;
	existingCards: number;
	totalCards: number;
}

export interface AddFoundationDeckResult {
	addedCards: number;
	existingCards: number;
	totalCards: number;
}

export interface AddCollectedDeckResult {
	addedCards: number;
	existingCards: number;
	totalCards: number;
}

export interface RemoveDeckFromAccountResult {
	sourceType: DeckSourceType;
	removedCards: number;
}

export interface ManualImportRawWord {
	id: string;
	wordAr: string;
	normalizedWordAr: string;
	translationFr: string | null;
	exampleSentenceAr: string | null;
	createdAt: string | null;
}

export interface ImportManualWordsToPersonalDeckResult {
	matched: number;
	added: number;
	rawWords: ManualImportRawWord[];
	lookupWarningMessage?: string | null;
}

export interface SaveUserVocabularyEnrichmentResult {
	status: string;
	nextReviewAt: string | null;
}

interface ImportManualWordsFunctionResponse {
	matched?: unknown;
	added?: unknown;
	error?: unknown;
	code?: unknown;
}

interface ListUserVocabularyImportsRpcRow {
	id?: string | null;
	word_ar?: string | null;
	normalized_word_ar?: string | null;
	translation_fr?: string | null;
	example_sentence_ar?: string | null;
	created_at?: string | null;
}

interface SaveUserVocabularyEnrichmentRpcRow {
	status?: string | null;
	next_review_at?: string | null;
}

export interface DeckContentTableRow {
	id: string;
	vocabularyCardId?: string | null;
	wordAr: string;
	wordFr: string;
	focusRank?: number | null;
	lastSeenAt: string | null;
	seenCount: number;
	addedAt: string | null;
	videoUrl: string | null;
	sourceVideoId?: string | null;
	sourceVideoIsShort?: boolean | null;
	sourceCueId?: string | null;
	sourceWordIndex?: number | null;
	sourceWordStartSeconds?: number | null;
	sourceWordEndSeconds?: number | null;
	sourceLinkUrl?: string | null;
	imageUrl?: string | null;
	vocabAudioUrl?: string | null;
	sentenceAudioUrl?: string | null;
	hasCustomImage?: boolean;
	hasCustomVocabAudio?: boolean;
	hasCustomSentenceAudio?: boolean;
}

export interface DeckContentPageData {
	rows: DeckContentTableRow[];
	page: number;
	pageSize: number;
	hasNextPage: boolean;
	totalRows: number | null;
}

export interface FetchDeckContentPageOptions {
	page?: number;
	pageSize?: number;
}

interface AlphabetSearchCardState {
	id: string;
	isAdded: boolean;
}

const ALPHABET_SEARCH_QUERY = "a";
const ALPHABET_SEARCH_LIMIT = 1000;
const SEARCH_PAGE_LIMIT = 1000;
const MAX_SEARCH_PAGE_COUNT = 25;
const DECK_CONTENT_PAGE_TIMEOUT_MS = 12000;
const DECK_CONTENT_TOTAL_TIMEOUT_MS = 45000;
const DECK_CONTENT_MAX_PAGE_SIZE = 120;
const DEFAULT_DECK_CONTENT_PAGE_SIZE = 12;
const ALPHABET_CATEGORY = "alphabet_arabe";
const ALPHABET_SOURCE = "dashboard_alphabet_step";
const FOUNDATION_SOURCE = "dashboard_foundation_step";
const COLLECTED_SOURCE = "dashboard_collected_step";
const MANUAL_WORD_IMPORT_FUNCTION = "import-manual-words-v1";
const MANUAL_IMPORT_LOOKUP_WARNING_MESSAGE =
	"Import réussi, mais la liste des mots à enrichir n'a pas pu être chargée pour le moment.";
const USER_VOCABULARY_CARD_MEDIA_TABLE = "user_vocabulary_card_media";
const USER_VOCABULARY_CARD_MEDIA_SELECT_COLUMNS =
	"user_id,vocabulary_card_id,image_url,audio_url,sentence_audio_url,hide_image,hide_audio,hide_sentence_audio";

const normalizeLowercaseString = (value: unknown): string =>
	typeof value === "string" ? value.trim().toLowerCase() : "";

const toManualImportTextOrNull = (value: unknown): string | null => {
	if (typeof value !== "string") {
		return null;
	}

	const trimmedValue = value.trim();
	return trimmedValue.length > 0 ? trimmedValue : null;
};

const sanitizeManualImportWords = (words: string[]): string[] => {
	const seenWords = new Set<string>();
	const sanitizedWords: string[] = [];

	words.forEach((word) => {
		const trimmedWord = toManualImportTextOrNull(word);
		if (!trimmedWord || seenWords.has(trimmedWord)) {
			return;
		}

		seenWords.add(trimmedWord);
		sanitizedWords.push(trimmedWord);
	});

	return sanitizedWords;
};

const normalizeManualImportErrorKey = (value: unknown): string =>
	typeof value === "string" ? value.trim().toUpperCase() : "";

const getManualImportFunctionErrorCode = (payload: unknown): string | null => {
	if (!payload || typeof payload !== "object") {
		return null;
	}

	const errorCode = (payload as { code?: unknown }).code;
	return typeof errorCode === "string" && errorCode.trim().length > 0
		? errorCode.trim()
		: null;
};

const getManualImportFunctionErrorMessage = (
	payload: unknown,
	fallbackMessage: string,
): string => {
	if (payload && typeof payload === "object") {
		for (const key of ["error", "message", "detail"] as const) {
			const errorMessage = (payload as Record<string, unknown>)[key];
			if (typeof errorMessage === "string" && errorMessage.trim().length > 0) {
				return errorMessage.trim();
			}
		}
	}

	return fallbackMessage;
};

const toErrorContextRecord = (
	error: unknown,
): Record<string, unknown> | null => {
	if (!error || typeof error !== "object") {
		return null;
	}

	const context = (error as { context?: unknown }).context;
	if (!context || typeof context !== "object") {
		return null;
	}

	return context as Record<string, unknown>;
};

const getManualImportInvokeErrorStatus = (error: unknown): number | null => {
	if (!error || typeof error !== "object") {
		return null;
	}

	const status = (error as { status?: unknown }).status;
	if (typeof status === "number" && Number.isFinite(status)) {
		return status;
	}

	const context = toErrorContextRecord(error);
	const contextStatus = context?.status;
	return typeof contextStatus === "number" && Number.isFinite(contextStatus)
		? contextStatus
		: null;
};

const getManualImportInvokeErrorPayload = async (
	error: unknown,
): Promise<unknown | null> => {
	const context = toErrorContextRecord(error);
	if (!context) {
		return null;
	}

	const jsonMethod = context.json;
	if (typeof jsonMethod !== "function") {
		return null;
	}

	try {
		const payload = await (jsonMethod as () => Promise<unknown>)();
		return payload;
	} catch {
		return null;
	}
};

const toManualImportServiceError = ({
	code,
	message,
	status,
	fallbackMessage,
}: {
	code?: string | null;
	message?: string | null;
	status?: number | null;
	fallbackMessage?: string;
}): DeckServiceError => {
	const trimmedMessage = message?.trim() ?? "";
	const normalizedCode =
		normalizeManualImportErrorKey(code) ||
		normalizeManualImportErrorKey(trimmedMessage);
	const resolvedMessage =
		trimmedMessage || fallbackMessage || UNKNOWN_ERROR_MESSAGE;

	if (
		status === 401 ||
		normalizedCode === "AUTH_REQUIRED" ||
		normalizedCode.includes("AUTH_REQUIRED") ||
		normalizedCode.includes("AUTHENTIFICATION REQUISE")
	) {
		return createServiceError(
			"NOT_AUTHENTICATED",
			"Vous devez être connecté pour effectuer cette action.",
			false,
		);
	}

	if (normalizedCode === "TRANSLATION_REQUIRED") {
		return createServiceError(
			"RPC_ERROR",
			"La traduction est obligatoire pour enregistrer ce mot.",
			false,
		);
	}

	if (normalizedCode === "CARD_NOT_FOUND") {
		return createServiceError(
			"RPC_ERROR",
			"Ce mot n'est plus disponible pour l'enrichissement.",
			false,
		);
	}

	if (normalizedCode === "CARD_ID_REQUIRED") {
		return createServiceError(
			"RPC_ERROR",
			"Impossible d'identifier le mot à enrichir.",
			false,
		);
	}

	if (normalizedCode === "WORDS_REQUIRED") {
		return createServiceError(
			"RPC_ERROR",
			"Ajoutez au moins un mot arabe avant de lancer l'import.",
			false,
		);
	}

	if (normalizedCode === "TOO_MANY_WORDS") {
		return createServiceError(
			"RPC_ERROR",
			"L'import est limité à 500 mots par envoi.",
			false,
		);
	}

	if (normalizedCode === "INVALID_JSON") {
		return createServiceError(
			"RPC_ERROR",
			"La requête d'import est invalide.",
			false,
		);
	}

	if (normalizedCode === "ORIGIN_NOT_ALLOWED") {
		return createServiceError(
			"RPC_ERROR",
			"Cette requête d'import n'est pas autorisée depuis cette page.",
			false,
		);
	}

	if (normalizedCode === "SUPABASE_CONFIG_MISSING") {
		return createServiceError(
			"RPC_ERROR",
			"Le service d'import n'est pas disponible pour le moment.",
			true,
		);
	}

	if (normalizedCode === "IMPORT_RPC_FAILED") {
		return createServiceError("RPC_ERROR", "Echec de l'import des mots.", true);
	}

	return createServiceError("RPC_ERROR", resolvedMessage, true);
};

const mapManualImportRawWord = (
	row: ListUserVocabularyImportsRpcRow,
): ManualImportRawWord | null => {
	const id = toManualImportTextOrNull(row.id);
	const wordAr = toManualImportTextOrNull(row.word_ar);
	const normalizedWordAr = toManualImportTextOrNull(row.normalized_word_ar);

	if (!id || !wordAr || !normalizedWordAr) {
		return null;
	}

	return {
		id,
		wordAr,
		normalizedWordAr,
		translationFr: toManualImportTextOrNull(row.translation_fr),
		exampleSentenceAr: toManualImportTextOrNull(row.example_sentence_ar),
		createdAt: toManualImportTextOrNull(row.created_at),
	};
};

async function listPendingManualImportWords(
	client: AppSupabaseClient,
	words: string[],
): Promise<ServiceResult<ManualImportRawWord[]>> {
	const sanitizedWords = sanitizeManualImportWords(words);
	if (sanitizedWords.length === 0) {
		return { ok: true, data: [] };
	}

	try {
		const rpcClient = client as unknown as {
			rpc: (
				fn: string,
				args?: Record<string, unknown>,
			) => Promise<{ data: unknown; error: PostgrestError | null }>;
		};

		const { data, error } = await rpcClient.rpc(
			"list_user_vocabulary_imports_by_words_v1",
			{
				p_words: sanitizedWords,
				p_status: "raw",
			},
		);

		if (error) {
			return { ok: false, error: fromPostgrestError(error) };
		}

		const rawWords = Array.isArray(data)
			? data
					.map((row) =>
						mapManualImportRawWord(row as ListUserVocabularyImportsRpcRow),
					)
					.filter((row): row is ManualImportRawWord => row !== null)
			: [];

		return { ok: true, data: rawWords };
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

const withPromiseTimeout = async <T>(
	promise: Promise<T>,
	timeoutMs: number,
	timeoutMessage: string,
): Promise<T> => {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(new Error(timeoutMessage));
		}, timeoutMs);
	});

	try {
		return await Promise.race([promise, timeoutPromise]);
	} finally {
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
		}
	}
};

const extractAlphabetSearchCards = (
	rows: SearchCardsV2Row[] | null,
): AlphabetSearchCardState[] => {
	if (!rows || rows.length === 0) {
		return [];
	}

	const dedupedById = new Map<string, AlphabetSearchCardState>();

	rows.forEach((row) => {
		if (!row || typeof row !== "object") {
			return;
		}

		const cardId =
			typeof row.vocabulary_card_id === "string" ? row.vocabulary_card_id : "";
		if (!cardId) {
			return;
		}

		const sourceType = normalizeLowercaseString(row.source_type);
		const category = normalizeLowercaseString(row.category);
		const isAlphabetCard =
			sourceType === "alphabet" || category === ALPHABET_CATEGORY;

		if (!isAlphabetCard) {
			return;
		}

		dedupedById.set(cardId, {
			id: cardId,
			isAdded: Boolean(row.is_added),
		});
	});

	return Array.from(dedupedById.values());
};

const searchAlphabetCards = async (
	client: AppSupabaseClient,
): Promise<ServiceResult<AlphabetSearchCardState[]>> => {
	const categorySearch = await searchCardsV2(client, {
		p_query: ALPHABET_SEARCH_QUERY,
		p_limit: ALPHABET_SEARCH_LIMIT,
		p_source_types: ["alphabet"],
	});

	if (!categorySearch.error) {
		const cards = extractAlphabetSearchCards(categorySearch.data);
		if (cards.length > 0) {
			return { ok: true, data: cards };
		}
	}

	const preferredSourceSearch = await searchCardsV2(client, {
		p_query: ALPHABET_SEARCH_QUERY,
		p_limit: ALPHABET_SEARCH_LIMIT,
		p_source_types: ["alphabet"],
	});

	if (!preferredSourceSearch.error) {
		const cards = extractAlphabetSearchCards(preferredSourceSearch.data);
		if (cards.length > 0) {
			return { ok: true, data: cards };
		}
	}

	const broadSearch = await searchCardsV2(client, {
		p_query: ALPHABET_SEARCH_QUERY,
		p_limit: ALPHABET_SEARCH_LIMIT,
	});

	if (broadSearch.error) {
		return { ok: false, error: fromPostgrestError(broadSearch.error) };
	}

	const cards = extractAlphabetSearchCards(broadSearch.data);
	if (cards.length === 0) {
		return {
			ok: false,
			error: createServiceError(
				"RPC_ERROR",
				"Aucune carte d'alphabet n'a été trouvée. Vérifiez les migrations SQL liées à l'alphabet.",
				false,
			),
		};
	}

	return { ok: true, data: cards };
};

const isAuthLikePostgrestError = (error?: PostgrestError | null): boolean => {
	if (!error) {
		return false;
	}

	const haystack =
		`${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
	return (
		/jwt|auth|token|permission/i.test(haystack) || error.code === "PGRST301"
	);
};

const shouldFallbackAlphabetDeckAdd = (
	error?: PostgrestError | null,
): boolean => {
	if (!error || isAuthLikePostgrestError(error)) {
		return false;
	}

	const haystack =
		`${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();

	return (
		haystack.includes("add_alphabet_deck_to_my_account_v1") ||
		haystack.includes("does not exist") ||
		haystack.includes("undefined function") ||
		haystack.includes("42883") ||
		haystack.includes("pgrst202")
	);
};

const isLegacyAlphabetSourceTypeError = (
	error?: PostgrestError | null,
): boolean => {
	if (!error) {
		return false;
	}

	const haystack =
		`${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();

	return (
		haystack.includes("invalid input value for enum deck_source_type") ||
		(haystack.includes("source_type") &&
			haystack.includes("alphabet") &&
			haystack.includes("invalid"))
	);
};

const addAlphabetCardWithCompatibleSourceType = async (
	client: AppSupabaseClient,
	cardId: string,
	sourceRaw: string,
) => {
	const preferredInsert = await addCardToPersonalDeckV2(client, {
		p_vocabulary_card_id: cardId,
		p_source: sourceRaw,
		p_source_type: "alphabet",
	});

	if (
		!preferredInsert.error ||
		!isLegacyAlphabetSourceTypeError(preferredInsert.error)
	) {
		return preferredInsert;
	}

	return addCardToPersonalDeckV2(client, {
		p_vocabulary_card_id: cardId,
		p_source: sourceRaw,
		p_source_type: "collected",
	});
};

const addAlphabetDeckViaCardRpcFallback = async (
	client: AppSupabaseClient,
	sourceRaw: string,
): Promise<ServiceResult<AddAlphabetDeckResult>> => {
	const beforeSearch = await searchAlphabetCards(client);
	if (!beforeSearch.ok) {
		return beforeSearch;
	}

	const cardIds = beforeSearch.data.map((card) => card.id);
	const beforeAddedCount = beforeSearch.data.filter(
		(card) => card.isAdded,
	).length;

	const insertResults = await Promise.all(
		cardIds.map((cardId) =>
			addAlphabetCardWithCompatibleSourceType(client, cardId, sourceRaw),
		),
	);

	const hadAtLeastOneSuccessfulCall = insertResults.some(
		(result) => !result.error,
	);
	const allInsertFailed =
		insertResults.length > 0 && insertResults.every((result) => result.error);

	if (allInsertFailed && beforeAddedCount === cardIds.length) {
		return {
			ok: true,
			data: {
				addedCards: 0,
				existingCards: cardIds.length,
				totalCards: cardIds.length,
			},
		};
	}

	if (allInsertFailed) {
		const firstError = insertResults.find((result) => result.error)?.error;
		return { ok: false, error: fromPostgrestError(firstError) };
	}

	const afterSearch = await searchAlphabetCards(client);
	if (!afterSearch.ok) {
		if (!hadAtLeastOneSuccessfulCall) {
			return afterSearch;
		}

		const totalCards = cardIds.length;
		const addedCards = Math.max(0, totalCards - beforeAddedCount);
		return {
			ok: true,
			data: {
				addedCards,
				existingCards: Math.max(0, totalCards - addedCards),
				totalCards,
			},
		};
	}

	const totalCards = afterSearch.data.length;
	const afterAddedCount = afterSearch.data.filter(
		(card) => card.isAdded,
	).length;
	const addedCards = Math.max(0, afterAddedCount - beforeAddedCount);

	return {
		ok: true,
		data: {
			addedCards,
			existingCards: Math.max(0, totalCards - addedCards),
			totalCards,
		},
	};
};

const toNonNegativeInteger = (value: unknown): number => {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return 0;
	}
	return Math.max(0, Math.floor(value));
};

const parseBooleanRpcData = (data: unknown): boolean => {
	if (typeof data === "boolean") {
		return data;
	}

	if (Array.isArray(data)) {
		const firstRow = data[0];
		if (typeof firstRow === "boolean") {
			return firstRow;
		}

		if (firstRow && typeof firstRow === "object") {
			const boolValue = Object.values(firstRow as Record<string, unknown>).find(
				(value) => typeof value === "boolean",
			);
			if (typeof boolValue === "boolean") {
				return boolValue;
			}
		}

		return false;
	}

	if (data && typeof data === "object") {
		const boolValue = Object.values(data as Record<string, unknown>).find(
			(value) => typeof value === "boolean",
		);
		if (typeof boolValue === "boolean") {
			return boolValue;
		}
	}

	return false;
};

export async function collectPersonalDeckCards(
	cardIds: string[],
	source = "video_cards_panel",
	options: MutationOptions,
): Promise<ServiceResult<BulkCollectResult>> {
	const previewGuard = guardPreviewMode("Ajouter des cartes", options?.mode);
	if (previewGuard) {
		return { ok: false, error: previewGuard };
	}
	const normalizedCardIds = normalizeCardIds(cardIds);

	if (normalizedCardIds.length === 0) {
		return { ok: true, data: { successes: [], failures: [] } };
	}

	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	try {
		const results = await Promise.all(
			normalizedCardIds.map((cardId) =>
				addCardToPersonalDeckV2(client, {
					p_vocabulary_card_id: cardId,
					p_source: source,
					p_source_type: mapSourceToDeckSourceType(source),
				}),
			),
		);

		const successes: string[] = [];
		const failures: BulkCollectResult["failures"] = [];

		results.forEach((result, index) => {
			const cardId = normalizedCardIds[index];
			if (!result.error) {
				successes.push(cardId);
				return;
			}
			failures.push({
				cardId,
				error: fromPostgrestError(result.error),
			});
		});

		return { ok: true, data: { successes, failures } };
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

export async function collectSubtitleWordToPersonalDeck(
	params: CollectSubtitleWordParams,
	options: MutationOptions,
): Promise<ServiceResult<CollectSubtitleWordResult>> {
	const previewGuard = guardPreviewMode(
		"Ajouter un mot depuis les sous-titres",
		options?.mode,
	);
	if (previewGuard) {
		return { ok: false, error: previewGuard };
	}

	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	try {
		const backendVideoId = await resolveBackendVideoId(params.video);
		if (!backendVideoId) {
			return {
				ok: false,
				error: {
					code: "RPC_ERROR",
					message: "Impossible de retrouver la video source pour ce mot.",
					retryable: false,
				},
			};
		}

		const { data, error } = await collectSubtitleWordToPersonalDeckV1(client, {
			p_video_id: backendVideoId,
			p_word_ar: params.wordAr,
			p_word_fr: params.wordFr,
			p_lexicon_entry_id: params.lexiconEntryId ?? null,
			p_example_sentence_ar: params.exampleSentenceAr ?? null,
			p_example_sentence_fr: params.exampleSentenceFr ?? null,
			p_source: params.source ?? "subtitle_word_popover",
			p_transliteration: params.transliteration ?? null,
			p_source_video_is_short: params.sourceVideoIsShort ?? null,
			p_source_cue_id: params.sourceCueId ?? null,
			p_source_word_index: params.sourceWordIndex ?? null,
			p_source_word_start_seconds: params.sourceWordStartSeconds ?? null,
			p_source_word_end_seconds: params.sourceWordEndSeconds ?? null,
		});

		if (error) {
			return { ok: false, error: fromPostgrestError(error) };
		}

		const row = Array.isArray(data)
			? ((data[0] ?? null) as Record<string, unknown> | null)
			: ((data ?? null) as Record<string, unknown> | null);
		const vocabularyCardId =
			row && typeof row.vocabulary_card_id === "string"
				? row.vocabulary_card_id
				: null;

		if (!vocabularyCardId) {
			return {
				ok: false,
				error: {
					code: "RPC_ERROR",
					message:
						"La creation de la carte depuis les sous-titres a renvoye une reponse incomplete.",
					retryable: false,
				},
			};
		}

		return {
			ok: true,
			data: {
				vocabularyCardId,
				wasCreated: row?.was_created === true,
			},
		};
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

export async function addAlphabetDeckToAccount(
	options: MutationOptions,
): Promise<ServiceResult<AddAlphabetDeckResult>> {
	const sourceRaw = ALPHABET_SOURCE;
	const previewGuard = guardPreviewMode(
		"Ajouter le deck alphabet",
		options?.mode,
	);
	if (previewGuard) {
		return { ok: false, error: previewGuard };
	}

	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	try {
		const rpcClient = client as unknown as {
			rpc: (
				fn: string,
				args?: Record<string, unknown>,
			) => Promise<{ data: unknown; error: PostgrestError | null }>;
		};
		const { data, error } = await rpcClient.rpc(
			"add_alphabet_deck_to_my_account_v1",
			{
				p_source: sourceRaw,
			},
		);

		if (error) {
			if (shouldFallbackAlphabetDeckAdd(error)) {
				const fallbackResult = await addAlphabetDeckViaCardRpcFallback(
					client,
					sourceRaw,
				);
				if (fallbackResult.ok) {
					return fallbackResult;
				}
			}

			return { ok: false, error: fromPostgrestError(error) };
		}

		const row = Array.isArray(data)
			? ((data[0] ?? null) as AddAlphabetDeckRpcRow | null)
			: ((data ?? null) as AddAlphabetDeckRpcRow | null);

		const addedCards = toNonNegativeInteger(row?.added_cards ?? 0);
		const totalCards = toNonNegativeInteger(row?.total_cards ?? 0);
		const existingCards = toNonNegativeInteger(
			row?.existing_cards ?? Math.max(0, totalCards - addedCards),
		);

		return {
			ok: true,
			data: {
				addedCards,
				existingCards,
				totalCards,
			},
		};
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

export async function addFoundationDeckToAccount(
	options: MutationOptions,
): Promise<ServiceResult<AddFoundationDeckResult>> {
	const sourceRaw = FOUNDATION_SOURCE;
	const previewGuard = guardPreviewMode(
		"Ajouter le deck Fondations 2000",
		options?.mode,
	);
	if (previewGuard) {
		return { ok: false, error: previewGuard };
	}

	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	try {
		const rpcClient = client as unknown as {
			rpc: (
				fn: string,
				args?: Record<string, unknown>,
			) => Promise<{ data: unknown; error: PostgrestError | null }>;
		};
		const { data, error } = await rpcClient.rpc(
			"add_foundation_deck_to_my_account_v1",
			{
				p_source: sourceRaw,
			},
		);

		if (error) {
			return { ok: false, error: fromPostgrestError(error) };
		}

		const row = Array.isArray(data)
			? ((data[0] ?? null) as AddAlphabetDeckRpcRow | null)
			: ((data ?? null) as AddAlphabetDeckRpcRow | null);

		const addedCards = toNonNegativeInteger(row?.added_cards ?? 0);
		const totalCards = toNonNegativeInteger(row?.total_cards ?? 0);
		const existingCards = toNonNegativeInteger(
			row?.existing_cards ?? Math.max(0, totalCards - addedCards),
		);

		return {
			ok: true,
			data: {
				addedCards,
				existingCards,
				totalCards,
			},
		};
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

export async function addCollectedDeckToAccount(
	options: MutationOptions,
): Promise<ServiceResult<AddCollectedDeckResult>> {
	const sourceRaw = COLLECTED_SOURCE;
	const previewGuard = guardPreviewMode(
		"Ajouter le deck Cartes collectées",
		options?.mode,
	);
	if (previewGuard) {
		return { ok: false, error: previewGuard };
	}

	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	try {
		const rpcClient = client as unknown as {
			rpc: (
				fn: string,
				args?: Record<string, unknown>,
			) => Promise<{ data: unknown; error: PostgrestError | null }>;
		};

		const { data, error } = await rpcClient.rpc(
			"add_collected_deck_to_my_account_v1",
			{
				p_source: sourceRaw,
			},
		);

		if (error) {
			return { ok: false, error: fromPostgrestError(error) };
		}

		const row = Array.isArray(data)
			? ((data[0] ?? null) as AddAlphabetDeckRpcRow | null)
			: ((data ?? null) as AddAlphabetDeckRpcRow | null);

		const addedCards = toNonNegativeInteger(row?.added_cards ?? 0);
		const totalCards = toNonNegativeInteger(row?.total_cards ?? 0);
		const existingCards = toNonNegativeInteger(
			row?.existing_cards ?? Math.max(0, totalCards - addedCards),
		);

		return {
			ok: true,
			data: {
				addedCards,
				existingCards,
				totalCards,
			},
		};
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

export async function importManualWordsToPersonalDeck(
	words: string[],
	options: MutationOptions,
): Promise<ServiceResult<ImportManualWordsToPersonalDeckResult>> {
	const previewGuard = guardPreviewMode(
		"Ajouter des mots manuellement",
		options?.mode,
	);
	if (previewGuard) {
		return { ok: false, error: previewGuard };
	}

	const sanitizedWords = sanitizeManualImportWords(words);
	if (sanitizedWords.length === 0) {
		return {
			ok: true,
			data: {
				matched: 0,
				added: 0,
				rawWords: [],
				lookupWarningMessage: null,
			},
		};
	}

	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	try {
		const { data, error } =
			await client.functions.invoke<ImportManualWordsFunctionResponse>(
				MANUAL_WORD_IMPORT_FUNCTION,
				{
					body: { words: sanitizedWords },
				},
			);

		if (error) {
			const invokeErrorPayload =
				data && typeof data === "object"
					? data
					: await getManualImportInvokeErrorPayload(error);

			return {
				ok: false,
				error: toManualImportServiceError({
					code: getManualImportFunctionErrorCode(invokeErrorPayload),
					message: getManualImportFunctionErrorMessage(
						invokeErrorPayload,
						error.message,
					),
					status: getManualImportInvokeErrorStatus(error),
					fallbackMessage: error.message,
				}),
			};
		}

		if (!data || typeof data !== "object") {
			return {
				ok: false,
				error: createServiceError(
					"RPC_ERROR",
					"Reponse invalide recue pendant l'import des mots.",
					true,
				),
			};
		}

		const response = data as ImportManualWordsFunctionResponse;
		const pendingRawWordsResult = await listPendingManualImportWords(
			client,
			sanitizedWords,
		);

		emitProfileInsightsRefresh();

		return {
			ok: true,
			data: {
				matched: toNonNegativeInteger(response.matched ?? 0),
				added: toNonNegativeInteger(response.added ?? 0),
				rawWords: pendingRawWordsResult.ok ? pendingRawWordsResult.data : [],
				lookupWarningMessage: pendingRawWordsResult.ok
					? null
					: MANUAL_IMPORT_LOOKUP_WARNING_MESSAGE,
			},
		};
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

export async function saveUserVocabularyEnrichment(
	userVocabularyCardId: string,
	translationFr: string,
	exampleSentenceAr: string | null,
	options: MutationOptions,
): Promise<ServiceResult<SaveUserVocabularyEnrichmentResult>> {
	const previewGuard = guardPreviewMode(
		"Enrichir un mot importe",
		options?.mode,
	);
	if (previewGuard) {
		return { ok: false, error: previewGuard };
	}

	const normalizedCardId = userVocabularyCardId.trim();
	if (!normalizedCardId) {
		return {
			ok: false,
			error: createServiceError(
				"RPC_ERROR",
				"Impossible d'identifier le mot a enrichir.",
				false,
			),
		};
	}

	const normalizedTranslation = translationFr.trim();
	if (normalizedTranslation.length === 0) {
		return {
			ok: false,
			error: createServiceError(
				"RPC_ERROR",
				"La traduction est obligatoire pour enregistrer ce mot.",
				false,
			),
		};
	}

	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	try {
		const rpcClient = client as unknown as {
			rpc: (
				fn: string,
				args?: Record<string, unknown>,
			) => Promise<{ data: unknown; error: PostgrestError | null }>;
		};

		const { data, error } = await rpcClient.rpc(
			"save_user_vocabulary_enrichment_v1",
			{
				p_user_vocabulary_card_id: normalizedCardId,
				p_translation_fr: normalizedTranslation,
				p_example_sentence_ar: toManualImportTextOrNull(exampleSentenceAr),
			},
		);

		if (error) {
			return {
				ok: false,
				error: toManualImportServiceError({
					message: error.message ?? UNKNOWN_ERROR_MESSAGE,
					fallbackMessage: UNKNOWN_ERROR_MESSAGE,
				}),
			};
		}

		const row = Array.isArray(data)
			? ((data[0] ?? null) as SaveUserVocabularyEnrichmentRpcRow | null)
			: ((data ?? null) as SaveUserVocabularyEnrichmentRpcRow | null);

		emitProfileInsightsRefresh();

		return {
			ok: true,
			data: {
				status: toManualImportTextOrNull(row?.status) ?? "ready",
				nextReviewAt: toManualImportTextOrNull(row?.next_review_at),
			},
		};
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

export async function removeDeckFromAccount(
	sourceType: DeckSourceType,
	options: MutationOptions,
): Promise<ServiceResult<RemoveDeckFromAccountResult>> {
	const previewGuard = guardPreviewMode("Supprimer un deck", options?.mode);
	if (previewGuard) {
		return { ok: false, error: previewGuard };
	}

	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	try {
		const rpcClient = client as unknown as {
			rpc: (
				fn: string,
				args?: Record<string, unknown>,
			) => Promise<{ data: unknown; error: PostgrestError | null }>;
		};

		const { data, error } = await rpcClient.rpc(
			"remove_deck_from_my_account_v1",
			{
				p_deck_source_type: sourceType,
			},
		);

		if (error) {
			return { ok: false, error: fromPostgrestError(error) };
		}

		const row = Array.isArray(data)
			? ((data[0] ?? null) as { removed_cards?: unknown } | null)
			: ((data ?? null) as { removed_cards?: unknown } | null);

		return {
			ok: true,
			data: {
				sourceType,
				removedCards: toNonNegativeInteger(row?.removed_cards ?? 0),
			},
		};
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

export async function getMySharedDeckSettings(
	deckClientId: string,
	deckKind: SharedDeckKind,
): Promise<ServiceResult<SharedDeckSettings | null>> {
	if (isSharedDeckBackendUnavailable) {
		return { ok: true, data: null };
	}

	const normalizedDeckClientId = deckClientId.trim();
	const normalizedDeckKind = toSharedDeckKind(deckKind);

	if (!normalizedDeckClientId || !normalizedDeckKind) {
		return {
			ok: false,
			error: createServiceError(
				"RPC_ERROR",
				"Impossible de charger le partage de ce deck.",
				false,
			),
		};
	}

	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	try {
		const rpcClient = client as unknown as {
			rpc: (
				fn: string,
				args?: Record<string, unknown>,
			) => Promise<{ data: unknown; error: PostgrestError | null }>;
		};

		let data: unknown;
		let error: PostgrestError | null;

		({ data, error } = await rpcClient.rpc("get_my_shared_deck_settings_v1", {
			p_deck_client_id: normalizedDeckClientId,
			p_deck_kind: normalizedDeckKind,
		}));

		if (isMissingGetSharedDeckSettingsRpcSignature(error)) {
			({ data, error } = await rpcClient.rpc("get_my_shared_deck_settings_v1", {
				deck_client_id: normalizedDeckClientId,
				deck_kind: normalizedDeckKind,
			}));
		}

		if (error) {
			if (markSharedDeckBackendUnavailable(error)) {
				return { ok: true, data: null };
			}
			return { ok: false, error: fromPostgrestError(error) };
		}

		const row = Array.isArray(data)
			? ((data[0] ?? null) as SharedDeckSettingsRpcRow | null)
			: ((data ?? null) as SharedDeckSettingsRpcRow | null);

		if (!row) {
			return { ok: true, data: null };
		}

		const sharedDeckSettings = normalizeSharedDeckSettingsRow(row);
		if (!sharedDeckSettings) {
			return {
				ok: false,
				error: createServiceError(
					"RPC_ERROR",
					"Reponse invalide recue pour le partage de ce deck.",
					true,
				),
			};
		}

		return { ok: true, data: sharedDeckSettings };
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

export async function saveMySharedDeckSettings(
	input: SaveMySharedDeckSettingsInput,
	options: MutationOptions,
): Promise<ServiceResult<SharedDeckSettings>> {
	if (isSharedDeckBackendUnavailable) {
		return { ok: false, error: createSharedDeckBackendUnavailableError() };
	}

	const previewGuard = guardPreviewMode(
		"Mettre a jour le partage d'un deck",
		options?.mode,
	);
	if (previewGuard) {
		return { ok: false, error: previewGuard };
	}

	const normalizedDeckClientId = input.deckClientId.trim();
	const normalizedDeckLabel = input.deckLabel.trim();
	const normalizedDeckKind = toSharedDeckKind(input.deckKind);
	const normalizedRecipientUserIds = normalizeSharedDeckRecipientUserIds(
		input.recipientUserIds,
	);

	if (!normalizedDeckClientId || !normalizedDeckLabel || !normalizedDeckKind) {
		return {
			ok: false,
			error: createServiceError(
				"RPC_ERROR",
				"Impossible d'enregistrer le partage de ce deck.",
				false,
			),
		};
	}

	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	try {
		const rpcClient = client as unknown as {
			rpc: (
				fn: string,
				args?: Record<string, unknown>,
			) => Promise<{ data: unknown; error: PostgrestError | null }>;
		};

		let data: unknown;
		let error: PostgrestError | null;

		({ data, error } = await rpcClient.rpc("upsert_shared_deck_settings_v1", {
			p_deck_client_id: normalizedDeckClientId,
			p_deck_kind: normalizedDeckKind,
			p_deck_label: normalizedDeckLabel,
			p_is_public: input.isPublic,
			p_recipient_user_ids: normalizedRecipientUserIds,
		}));

		if (isMissingUpsertSharedDeckSettingsRpcSignature(error)) {
			({ data, error } = await rpcClient.rpc("upsert_shared_deck_settings_v1", {
				deck_client_id: normalizedDeckClientId,
				deck_kind: normalizedDeckKind,
				deck_label: normalizedDeckLabel,
				is_public: input.isPublic,
				recipient_user_ids: normalizedRecipientUserIds,
			}));
		}

		if (error) {
			if (markSharedDeckBackendUnavailable(error)) {
				return { ok: false, error: createSharedDeckBackendUnavailableError() };
			}
			return { ok: false, error: fromPostgrestError(error) };
		}

		const row = Array.isArray(data)
			? ((data[0] ?? null) as SharedDeckSettingsRpcRow | null)
			: ((data ?? null) as SharedDeckSettingsRpcRow | null);
		const sharedDeckSettings = normalizeSharedDeckSettingsRow(row);

		if (!sharedDeckSettings) {
			return {
				ok: false,
				error: createServiceError(
					"RPC_ERROR",
					"Reponse invalide recue pendant l'enregistrement du partage.",
					true,
				),
			};
		}

		return { ok: true, data: sharedDeckSettings };
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

export async function setSharedDeckSnapshot(
	sharedDeckId: string,
	deckRows: DeckContentTableRow[],
): Promise<ServiceResult<{ sharedDeckId: string; deckCardsCount: number }>> {
	if (isSharedDeckBackendUnavailable) {
		return { ok: false, error: createSharedDeckBackendUnavailableError() };
	}

	const normalizedSharedDeckId = sharedDeckId.trim();
	if (!normalizedSharedDeckId) {
		return {
			ok: false,
			error: createServiceError(
				"RPC_ERROR",
				"Identifiant de deck partagé invalide.",
				false,
			),
		};
	}

	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	const sanitizedRows = deckRows.map((row) => ({
		id: row.id,
		wordAr: row.wordAr,
		wordFr: row.wordFr,
		lastSeenAt: row.lastSeenAt,
		seenCount: row.seenCount,
		addedAt: row.addedAt,
		videoUrl: row.videoUrl,
		sourceVideoId: row.sourceVideoId ?? null,
		sourceCueId: row.sourceCueId ?? null,
		sourceWordIndex: row.sourceWordIndex ?? null,
		sourceWordStartSeconds: row.sourceWordStartSeconds ?? null,
		sourceWordEndSeconds: row.sourceWordEndSeconds ?? null,
		sourceLinkUrl: row.sourceLinkUrl ?? null,
		imageUrl: row.imageUrl ?? null,
		vocabAudioUrl: row.vocabAudioUrl ?? null,
		sentenceAudioUrl: row.sentenceAudioUrl ?? null,
		hasCustomImage: row.hasCustomImage === true,
		hasCustomVocabAudio: row.hasCustomVocabAudio === true,
		hasCustomSentenceAudio: row.hasCustomSentenceAudio === true,
	}));

	try {
		const rpcClient = client as unknown as {
			rpc: (
				fn: string,
				args?: Record<string, unknown>,
			) => Promise<{ data: unknown; error: PostgrestError | null }>;
		};

		const { data, error } = await rpcClient.rpc("set_shared_deck_snapshot_v1", {
			p_shared_deck_id: normalizedSharedDeckId,
			p_deck_rows_json: sanitizedRows,
			p_deck_cards_count: sanitizedRows.length,
		});

		if (error) {
			if (markSharedDeckBackendUnavailable(error)) {
				return { ok: false, error: createSharedDeckBackendUnavailableError() };
			}
			return { ok: false, error: fromPostgrestError(error) };
		}

		const row = Array.isArray(data)
			? ((data[0] ?? null) as SharedDeckSnapshotRpcRow | null)
			: ((data ?? null) as SharedDeckSnapshotRpcRow | null);
		const returnedSharedDeckId = toOptionalTrimmedString(row?.shared_deck_id);
		if (!returnedSharedDeckId) {
			return {
				ok: false,
				error: createServiceError(
					"RPC_ERROR",
					"Réponse invalide pendant la mise à jour du contenu partagé.",
					true,
				),
			};
		}

		return {
			ok: true,
			data: {
				sharedDeckId: returnedSharedDeckId,
				deckCardsCount: toNonNegativeInteger(
					row?.deck_cards_count ?? sanitizedRows.length,
				),
			},
		};
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

export async function listViewableSharedDecks(
	scope: ViewableSharedDeckScope,
	limit = 30,
	offset = 0,
): Promise<ServiceResult<ViewableSharedDeckSummary[]>> {
	if (isSharedDeckBackendUnavailable) {
		return { ok: true, data: [] };
	}

	const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
	const safeOffset = Math.max(0, Math.floor(offset));

	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	try {
		const rpcClient = client as unknown as {
			rpc: (
				fn: string,
				args?: Record<string, unknown>,
			) => Promise<{ data: unknown; error: PostgrestError | null }>;
		};

		const { data, error } = await rpcClient.rpc(
			"list_viewable_shared_decks_v1",
			{
				p_scope: scope,
				p_limit: safeLimit,
				p_offset: safeOffset,
			},
		);

		if (error) {
			if (markSharedDeckBackendUnavailable(error)) {
				return { ok: true, data: [] };
			}
			return { ok: false, error: fromPostgrestError(error) };
		}

		const rows = Array.isArray(data)
			? (data as CommunitySharedDeckRpcRow[])
			: [];
		const sharedDecks = rows
			.map((row) => normalizeViewableSharedDeckRow(row, scope))
			.filter((row): row is ViewableSharedDeckSummary => row !== null);

		return { ok: true, data: sharedDecks };
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

export async function hideSharedDeckForMe(
	sharedDeckId: string,
	hidden = true,
): Promise<ServiceResult<boolean>> {
	if (isSharedDeckBackendUnavailable) {
		return { ok: false, error: createSharedDeckBackendUnavailableError() };
	}

	const normalizedSharedDeckId = sharedDeckId.trim();
	if (!normalizedSharedDeckId) {
		return {
			ok: false,
			error: createServiceError(
				"RPC_ERROR",
				"Identifiant de deck partagé invalide.",
				false,
			),
		};
	}

	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	try {
		const rpcClient = client as unknown as {
			rpc: (
				fn: string,
				args?: Record<string, unknown>,
			) => Promise<{ data: unknown; error: PostgrestError | null }>;
		};

		const { data, error } = await rpcClient.rpc("hide_shared_deck_for_me_v1", {
			p_shared_deck_id: normalizedSharedDeckId,
			p_hidden: hidden,
		});

		if (error) {
			if (markSharedDeckBackendUnavailable(error)) {
				return { ok: false, error: createSharedDeckBackendUnavailableError() };
			}
			return { ok: false, error: fromPostgrestError(error) };
		}

		if (Array.isArray(data)) {
			const first = data[0] as { hidden?: unknown } | undefined;
			if (typeof first?.hidden === "boolean") {
				return { ok: true, data: first.hidden };
			}
		}

		return { ok: true, data: hidden };
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

export async function listCommunitySharedDecks(
	limit = 30,
	offset = 0,
): Promise<ServiceResult<CommunitySharedDeckSummary[]>> {
	if (isSharedDeckBackendUnavailable) {
		return { ok: true, data: [] };
	}

	const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
	const safeOffset = Math.max(0, Math.floor(offset));

	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	try {
		const rpcClient = client as unknown as {
			rpc: (
				fn: string,
				args?: Record<string, unknown>,
			) => Promise<{ data: unknown; error: PostgrestError | null }>;
		};

		let data: unknown;
		let error: PostgrestError | null;

		({ data, error } = await rpcClient.rpc("list_community_shared_decks_v1", {
			p_limit: safeLimit,
			p_offset: safeOffset,
		}));

		if (isMissingListCommunityRpcSignature(error)) {
			({ data, error } = await rpcClient.rpc("list_community_shared_decks_v1", {
				limit: safeLimit,
				offset: safeOffset,
			}));
		}

		if (isMissingListCommunityRpcSignature(error)) {
			({ data, error } = await rpcClient.rpc("list_community_shared_decks_v1"));
		}

		if (error) {
			if (markSharedDeckBackendUnavailable(error)) {
				return { ok: true, data: [] };
			}
			return { ok: false, error: fromPostgrestError(error) };
		}

		const rows = Array.isArray(data)
			? (data as CommunitySharedDeckRpcRow[])
			: [];
		const communityDecks = rows
			.map((row) => normalizeCommunitySharedDeckRow(row))
			.filter((row): row is CommunitySharedDeckSummary => row !== null);

		return { ok: true, data: communityDecks };
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

export async function hasAlphabetDeckInAccount(): Promise<
	ServiceResult<boolean>
> {
	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	const searchResult = await searchAlphabetCards(client);
	if (!searchResult.ok) {
		return { ok: false, error: searchResult.error };
	}

	const hasDeck = searchResult.data.some((card) => card.isAdded);
	return { ok: true, data: hasDeck };
}

export async function hasFoundationDeckInAccount(): Promise<
	ServiceResult<boolean>
> {
	const searchResult = await searchVocabularyBank("", ALPHABET_SEARCH_LIMIT, [
		"foundation",
	]);

	if (!searchResult.ok) {
		return { ok: false, error: searchResult.error };
	}

	const hasDeck = searchResult.data.some(
		(card) => Boolean(card.is_added) || Boolean(card.is_seen),
	);

	return { ok: true, data: hasDeck };
}

export async function hasCollectedDeckInAccount(): Promise<
	ServiceResult<boolean>
> {
	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	try {
		const rpcClient = client as unknown as {
			rpc: (
				fn: string,
				args?: Record<string, unknown>,
			) => Promise<{ data: unknown; error: PostgrestError | null }>;
		};

		const { data, error } = await rpcClient.rpc(
			"has_collected_deck_in_account_v1",
		);

		if (!error) {
			return { ok: true, data: parseBooleanRpcData(data) };
		}

		const fallbackSearch = await searchVocabularyBank(
			"",
			ALPHABET_SEARCH_LIMIT,
			["collected"],
		);
		if (!fallbackSearch.ok) {
			return { ok: false, error: fromPostgrestError(error) };
		}

		const hasDeck = fallbackSearch.data.some(
			(card) => Boolean(card.is_added) || Boolean(card.is_seen),
		);
		return { ok: true, data: hasDeck };
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

export async function fetchDueReviewCount(
	_deckScope: string = "personal_and_foundation",
): Promise<ServiceResult<number>> {
	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	try {
		const { data, error } = await getDueCountV2(client, {
			p_collection_id: null,
		});
		if (error) {
			return { ok: false, error: fromPostgrestError(error) };
		}
		return { ok: true, data: Number(data ?? 0) };
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

export async function searchVocabularyBank(
	query: string,
	limit = 100,
	sourceTypes?: DeckSourceType[],
	offset = 0,
): Promise<ServiceResult<SearchCardsV2Row[]>> {
	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	try {
		const { data, error } = await searchCardsV2(client, {
			p_query: query,
			p_limit: limit,
			p_offset: offset,
			p_source_types: sourceTypes,
		});
		if (error) {
			return { ok: false, error: fromPostgrestError(error) };
		}

		const rows = Array.isArray(data) ? data.map(sanitizeSearchRow) : [];
		return {
			ok: true,
			data: await enrichCollectedSearchRows(client, rows),
		};
	} catch (error) {
		if (isClientResolutionError(error)) {
			return {
				ok: false,
				error: createServiceError(
					"RPC_ERROR",
					"Le client Supabase n'a pas pu resoudre cette requete. Rechargez la page puis reessayez.",
					true,
				),
			};
		}

		return { ok: false, error: fromUnknownError(error) };
	}
}

interface UserCardStateProgressRow {
	foundation_card_id?: string | null;
	vocabulary_card_id?: string | null;
	last_reviewed_at?: string | null;
	repetitions?: number | null;
}

interface UserCardStateProgress {
	lastSeenAt: string | null;
	seenCount: number;
}

interface UserCardStateFromClient {
	from?: (table: string) => {
		select: (columns: string) => {
			in: (
				column: "foundation_card_id" | "vocabulary_card_id",
				values: string[],
			) => Promise<{
				data: UserCardStateProgressRow[] | null;
				error: PostgrestError | null;
			}>;
		};
	};
}

interface DeckContentStateRow {
	foundation_card_id?: string | null;
	vocabulary_card_id?: string | null;
	last_reviewed_at?: string | null;
	repetitions?: number | null;
	added_to_deck_at?: string | null;
	source_video_id?: string | null;
	source_video_is_short?: boolean | null;
	source_cue_id?: string | number | null;
	source_word_index?: number | null;
	source_word_start_seconds?: number | null;
	source_word_end_seconds?: number | null;
}

interface DeckContentVocabularyRow {
	id?: string | null;
	word_ar?: string | null;
	word_fr?: string | null;
	video_id?: string | null;
	image_url?: string | null;
	audio_url?: string | null;
	sentence_audio_url?: string | null;
	category?: string | null;
}

interface DueVocabularyRow {
	id?: string | null;
	word_ar?: string | null;
	word_fr?: string | null;
	transliteration?: string | null;
	example_sentence_ar?: string | null;
	example_sentence_fr?: string | null;
	audio_url?: string | null;
	sentence_audio_url?: string | null;
	image_url?: string | null;
	category?: string | null;
	default_audio_url?: string | null;
	default_sentence_audio_url?: string | null;
	default_image_url?: string | null;
	has_custom_image?: boolean;
	has_custom_vocab_audio?: boolean;
	has_custom_sentence_audio?: boolean;
	image_hidden?: boolean;
	vocab_audio_hidden?: boolean;
	sentence_audio_hidden?: boolean;
}

interface CollectedSourceOccurrenceRow {
	vocabulary_card_id?: string | null;
	source_video_id?: string | null;
	source_video_youtube_id?: string | null;
	source_video_is_short?: boolean | null;
	source_cue_id?: string | number | null;
	source_word_index?: number | null;
	source_word_start_seconds?: number | null;
	source_word_end_seconds?: number | null;
}

interface UserVocabularyCardMediaRow {
	user_id?: string | null;
	vocabulary_card_id?: string | null;
	image_url?: string | null;
	audio_url?: string | null;
	sentence_audio_url?: string | null;
	hide_image?: boolean | null;
	hide_audio?: boolean | null;
	hide_sentence_audio?: boolean | null;
}

interface UserVocabularyCardMediaMutationRow {
	user_id: string;
	vocabulary_card_id: string;
	image_url?: string | null;
	audio_url?: string | null;
	sentence_audio_url?: string | null;
	hide_image?: boolean;
	hide_audio?: boolean;
	hide_sentence_audio?: boolean;
}

interface DeckContentFoundationRow {
	id?: string | null;
	word_ar?: string | null;
	word_fr?: string | null;
	frequency_rank?: number | null;
}

interface DeckContentVideoRow {
	id?: string | null;
	video_url?: string | null;
	source_video_id?: string | null;
}

interface AuthGetUserResponse {
	data?: {
		user?: {
			id?: string | null;
		} | null;
	} | null;
	error?: PostgrestError | null;
}

interface AuthGetSessionResponse {
	data?: {
		session?: {
			user?: {
				id?: string | null;
			} | null;
		} | null;
	} | null;
	error?: PostgrestError | null;
}

interface DueVocabularyFromClient {
	from?: (table: string) => {
		select: (columns: string) => {
			in: (
				column: "id",
				values: string[],
			) => Promise<{
				data: DueVocabularyRow[] | null;
				error: PostgrestError | null;
			}>;
		};
	};
}

interface UserVocabularyCardMediaMutationFromClient {
	from?: (table: string) => {
		upsert: (
			values: UserVocabularyCardMediaMutationRow,
			options: { onConflict: string },
		) => {
			select: (columns: string) => {
				maybeSingle: () => Promise<{
					data: UserVocabularyCardMediaRow | null;
					error: PostgrestError | null;
				}>;
			};
		};
	};
}

const chunkStringIds = (ids: string[], chunkSize = 200): string[][] => {
	if (ids.length === 0) {
		return [];
	}

	const chunks: string[][] = [];
	for (let cursor = 0; cursor < ids.length; cursor += chunkSize) {
		chunks.push(ids.slice(cursor, cursor + chunkSize));
	}

	return chunks;
};

const toOptionalNonEmptyString = (value: unknown): string | null => {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const countAvailableMediaFields = (row: DeckContentVocabularyRow): number => {
	let availableCount = 0;
	if (toOptionalNonEmptyString(row.image_url)) {
		availableCount += 1;
	}
	if (toOptionalNonEmptyString(row.audio_url)) {
		availableCount += 1;
	}
	if (toOptionalNonEmptyString(row.sentence_audio_url)) {
		availableCount += 1;
	}

	return availableCount;
};

const toOptionalNonNegativeNumber = (value: unknown): number | null => {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		return null;
	}

	return value;
};

const toCollectedCardSourceLinkInput = (
	row:
		| CollectedSourceOccurrenceRow
		| DeckContentStateRow
		| Record<string, unknown>
		| null
		| undefined,
): CollectedCardSourceLinkInput => {
	if (!row || typeof row !== "object") {
		return {
			sourceVideoId: null,
			sourceVideoIsShort: null,
			sourceWordStartSeconds: null,
		};
	}

	const sourceVideoIsShortValue = (row as { source_video_is_short?: unknown })
		.source_video_is_short;
	return {
		sourceVideoId: toOptionalNonEmptyString(
			(row as { source_video_id?: unknown }).source_video_id,
		),
		sourceVideoYoutubeId: toOptionalNonEmptyString(
			(row as { source_video_youtube_id?: unknown }).source_video_youtube_id,
		),
		sourceVideoIsShort:
			typeof sourceVideoIsShortValue === "boolean"
				? sourceVideoIsShortValue
				: null,
		sourceWordStartSeconds: toOptionalNonNegativeNumber(
			(row as { source_word_start_seconds?: unknown })
				.source_word_start_seconds,
		),
	};
};

const buildCollectedSourceOccurrencePatch = (
	row: CollectedSourceOccurrenceRow | DeckContentStateRow | null | undefined,
): {
	source_video_id: string | null;
	source_video_is_short: boolean | null;
	source_cue_id: string | null;
	source_word_index: number | null;
	source_word_start_seconds: number | null;
	source_word_end_seconds: number | null;
	source_link_url: string | null;
} => {
	const sourceCueIdValue = row?.source_cue_id;
	const sourceCueId =
		typeof sourceCueIdValue === "number" && Number.isFinite(sourceCueIdValue)
			? String(sourceCueIdValue)
			: toOptionalNonEmptyString(sourceCueIdValue);
	const sourceWordIndex = toOptionalNonNegativeNumber(row?.source_word_index);
	const sourceWordStartSeconds = toOptionalNonNegativeNumber(
		row?.source_word_start_seconds,
	);
	const sourceWordEndSeconds = toOptionalNonNegativeNumber(
		row?.source_word_end_seconds,
	);
	const sourceLinkInput = toCollectedCardSourceLinkInput(row);

	return {
		source_video_id: sourceLinkInput.sourceVideoId ?? null,
		source_video_is_short: sourceLinkInput.sourceVideoIsShort ?? null,
		source_cue_id: sourceCueId,
		source_word_index: sourceWordIndex,
		source_word_start_seconds: sourceWordStartSeconds,
		source_word_end_seconds: sourceWordEndSeconds,
		source_link_url: buildCollectedCardSourceLinkPath(sourceLinkInput),
	};
};

const buildCollectedSourceOccurrenceFields = (
	row: CollectedSourceOccurrenceRow | DeckContentStateRow | null | undefined,
): Pick<
	DeckContentTableRow,
	| "sourceVideoId"
	| "sourceVideoIsShort"
	| "sourceCueId"
	| "sourceWordIndex"
	| "sourceWordStartSeconds"
	| "sourceWordEndSeconds"
	| "sourceLinkUrl"
> => {
	const sourceOccurrencePatch = buildCollectedSourceOccurrencePatch(row);
	return {
		sourceVideoId: sourceOccurrencePatch.source_video_id,
		sourceVideoIsShort: sourceOccurrencePatch.source_video_is_short,
		sourceCueId: sourceOccurrencePatch.source_cue_id,
		sourceWordIndex: sourceOccurrencePatch.source_word_index,
		sourceWordStartSeconds: sourceOccurrencePatch.source_word_start_seconds,
		sourceWordEndSeconds: sourceOccurrencePatch.source_word_end_seconds,
		sourceLinkUrl: sourceOccurrencePatch.source_link_url,
	};
};

const fetchCollectedSourceOccurrencesByVocabularyCardId = async (
	client: AppSupabaseClient,
	vocabularyCardIds: string[],
): Promise<Map<string, CollectedSourceOccurrenceRow>> => {
	const rowsById = new Map<string, CollectedSourceOccurrenceRow>();
	const normalizedIds = normalizeCardIds(vocabularyCardIds);
	if (normalizedIds.length === 0) {
		return rowsById;
	}

	const fromMethod = (client as unknown as { from?: (table: string) => any })
		.from;
	const from =
		typeof fromMethod === "function" ? fromMethod.bind(client) : null;
	if (!from) {
		return rowsById;
	}

	for (const idChunk of chunkStringIds(normalizedIds)) {
		try {
			const { data, error } = await from("user_card_state")
				.select(
					"vocabulary_card_id,source_video_id,source_video_is_short,source_cue_id,source_word_index,source_word_start_seconds,source_word_end_seconds",
				)
				.in("vocabulary_card_id", idChunk);

			if (error) {
				console.error("Unable to load collected source-link rows:", error);
				return rowsById;
			}

			(data ?? []).forEach((row: unknown) => {
				const vocabularyCardId = toOptionalNonEmptyString(
					(row as { vocabulary_card_id?: unknown }).vocabulary_card_id,
				);
				if (!vocabularyCardId || rowsById.has(vocabularyCardId)) {
					return;
				}

				rowsById.set(vocabularyCardId, row as CollectedSourceOccurrenceRow);
			});
		} catch (error) {
			console.error("Unable to load collected source-link rows:", error);
			return rowsById;
		}
	}

	const shortSourceVideoIds = Array.from(
		new Set(
			Array.from(rowsById.values())
				.filter((row) => row.source_video_is_short === true)
				.map((row) => toOptionalNonEmptyString(row.source_video_id))
				.filter((value): value is string => value !== null),
		),
	);

	if (shortSourceVideoIds.length === 0) {
		return rowsById;
	}

	const sourceVideoYoutubeIdById = new Map<string, string>();
	for (const idChunk of chunkStringIds(shortSourceVideoIds)) {
		try {
			const { data, error } = await from("videos")
				.select("id,source_video_id")
				.in("id", idChunk);

			if (error) {
				console.error(
					"Unable to load collected source-link video rows:",
					error,
				);
				return rowsById;
			}

			(data ?? []).forEach((row: DeckContentVideoRow) => {
				const sourceVideoId = toOptionalNonEmptyString(row.id);
				const sourceVideoYoutubeId = toOptionalNonEmptyString(
					row.source_video_id,
				);
				if (!sourceVideoId || !sourceVideoYoutubeId) {
					return;
				}

				sourceVideoYoutubeIdById.set(sourceVideoId, sourceVideoYoutubeId);
			});
		} catch (error) {
			console.error("Unable to load collected source-link video rows:", error);
			return rowsById;
		}
	}

	if (sourceVideoYoutubeIdById.size === 0) {
		return rowsById;
	}

	for (const [vocabularyCardId, row] of rowsById.entries()) {
		const sourceVideoId = toOptionalNonEmptyString(row.source_video_id);
		if (!sourceVideoId) {
			continue;
		}

		const sourceVideoYoutubeId = sourceVideoYoutubeIdById.get(sourceVideoId);
		if (!sourceVideoYoutubeId) {
			continue;
		}

		rowsById.set(vocabularyCardId, {
			...row,
			source_video_youtube_id: sourceVideoYoutubeId,
		});
	}

	return rowsById;
};

const enrichCollectedSearchRows = async (
	client: AppSupabaseClient,
	rows: SearchCardsV2Row[],
): Promise<SearchCardsV2Row[]> => {
	const collectedVocabularyCardIds = rows
		.filter((row) => {
			const sourceType = toOptionalNonEmptyString(
				(row as { source_type?: unknown }).source_type,
			);
			return sourceType === "collected";
		})
		.map((row) =>
			toOptionalNonEmptyString(
				(row as { vocabulary_card_id?: unknown }).vocabulary_card_id,
			),
		)
		.filter((value): value is string => value !== null);

	const sourceOccurrencesById =
		await fetchCollectedSourceOccurrencesByVocabularyCardId(
			client,
			collectedVocabularyCardIds,
		);
	if (sourceOccurrencesById.size === 0) {
		return rows;
	}

	return rows.map((row) => {
		const vocabularyCardId = toOptionalNonEmptyString(
			(row as { vocabulary_card_id?: unknown }).vocabulary_card_id,
		);
		if (!vocabularyCardId) {
			return row;
		}

		const sourceOccurrence = sourceOccurrencesById.get(vocabularyCardId);
		if (!sourceOccurrence) {
			return row;
		}

		return {
			...row,
			...buildCollectedSourceOccurrencePatch(sourceOccurrence),
		};
	});
};

const normalizeUserVocabularyCardMediaRow = (
	row: UserVocabularyCardMediaRow,
): UserVocabularyCardMediaRecord | null => {
	const vocabularyCardId = toOptionalNonEmptyString(row.vocabulary_card_id);
	if (!vocabularyCardId) {
		return null;
	}

	return {
		vocabularyCardId,
		imageStorageRef: toOptionalNonEmptyString(row.image_url),
		vocabAudioStorageRef: toOptionalNonEmptyString(row.audio_url),
		sentenceAudioStorageRef: toOptionalNonEmptyString(row.sentence_audio_url),
		imageUrl: null,
		vocabAudioUrl: null,
		sentenceAudioUrl: null,
		imageHidden: row.hide_image === true,
		vocabAudioHidden: row.hide_audio === true,
		sentenceAudioHidden: row.hide_sentence_audio === true,
		hasCustomImage: toOptionalNonEmptyString(row.image_url) !== null,
		hasCustomVocabAudio: toOptionalNonEmptyString(row.audio_url) !== null,
		hasCustomSentenceAudio:
			toOptionalNonEmptyString(row.sentence_audio_url) !== null,
	};
};

const resolveUserVocabularyCardMediaRecord = async (
	client: AppSupabaseClient,
	row: UserVocabularyCardMediaRecord,
): Promise<UserVocabularyCardMediaRecord> => {
	const resolvedRowsById = await resolveCollectedCardMediaOverlayByCardId(
		client,
		[row.vocabularyCardId],
	);
	const resolvedRow = resolvedRowsById.get(row.vocabularyCardId) ?? null;

	return {
		...row,
		imageUrl: resolvedRow?.imageUrl ?? row.imageUrl,
		vocabAudioUrl: resolvedRow?.vocabAudioUrl ?? row.vocabAudioUrl,
		sentenceAudioUrl: resolvedRow?.sentenceAudioUrl ?? row.sentenceAudioUrl,
		imageHidden: resolvedRow?.imageHidden ?? row.imageHidden ?? false,
		vocabAudioHidden:
			resolvedRow?.vocabAudioHidden ?? row.vocabAudioHidden ?? false,
		sentenceAudioHidden:
			resolvedRow?.sentenceAudioHidden ?? row.sentenceAudioHidden ?? false,
		hasCustomImage: resolvedRow?.hasCustomImage ?? row.hasCustomImage ?? false,
		hasCustomVocabAudio:
			resolvedRow?.hasCustomVocabAudio ?? row.hasCustomVocabAudio ?? false,
		hasCustomSentenceAudio:
			resolvedRow?.hasCustomSentenceAudio ??
			row.hasCustomSentenceAudio ??
			false,
	};
};

const fetchResolvedUserVocabularyCardMediaById = async (
	client: AppSupabaseClient,
	vocabularyCardIds: string[],
): Promise<Map<string, UserVocabularyCardMediaRecord>> => {
	return resolveCollectedCardMediaOverlayByCardId(client, vocabularyCardIds);
};

const applyUserVocabularyCardMediaToDueVocabularyRow = (
	row: DueVocabularyRow,
	userMedia?: UserVocabularyCardMediaRecord,
): DueVocabularyRow => {
	if (!userMedia) {
		return row;
	}

	return {
		...row,
		default_audio_url: row.audio_url ?? null,
		default_sentence_audio_url: row.sentence_audio_url ?? null,
		default_image_url: row.image_url ?? null,
		audio_url: userMedia.vocabAudioHidden
			? null
			: (userMedia.vocabAudioUrl ?? row.audio_url),
		sentence_audio_url: userMedia.sentenceAudioHidden
			? null
			: (userMedia.sentenceAudioUrl ?? row.sentence_audio_url),
		image_url: userMedia.imageHidden
			? null
			: (userMedia.imageUrl ?? row.image_url),
		has_custom_image: userMedia.hasCustomImage ?? false,
		has_custom_vocab_audio: userMedia.hasCustomVocabAudio ?? false,
		has_custom_sentence_audio: userMedia.hasCustomSentenceAudio ?? false,
		image_hidden: userMedia.imageHidden ?? false,
		vocab_audio_hidden: userMedia.vocabAudioHidden ?? false,
		sentence_audio_hidden: userMedia.sentenceAudioHidden ?? false,
	};
};

export async function upsertUserVocabularyCardMedia(
	params: UpsertUserVocabularyCardMediaParams,
	options: MutationOptions,
): Promise<ServiceResult<UserVocabularyCardMediaRecord>> {
	const previewGuard = guardPreviewMode(
		"Mettre a jour les medias d'une carte collectee",
		options?.mode,
	);
	if (previewGuard) {
		return { ok: false, error: previewGuard };
	}

	const vocabularyCardId = params.vocabularyCardId.trim();
	if (!vocabularyCardId) {
		return {
			ok: false,
			error: createServiceError(
				"RPC_ERROR",
				"Impossible de mettre a jour les medias sans identifiant de carte.",
				false,
			),
		};
	}

	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	const userIdResult = await resolveAuthenticatedUserId(client);
	if (!userIdResult.ok) {
		return userIdResult;
	}

	const fromMethod = (
		client as unknown as UserVocabularyCardMediaMutationFromClient
	).from;
	const from =
		typeof fromMethod === "function" ? fromMethod.bind(client) : null;
	if (!from) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	const mutationRow: UserVocabularyCardMediaMutationRow = {
		user_id: userIdResult.data,
		vocabulary_card_id: vocabularyCardId,
	};

	if (params.imageStorageRef !== undefined) {
		mutationRow.image_url = params.imageStorageRef;
	}
	if (params.vocabAudioStorageRef !== undefined) {
		mutationRow.audio_url = params.vocabAudioStorageRef;
	}
	if (params.sentenceAudioStorageRef !== undefined) {
		mutationRow.sentence_audio_url = params.sentenceAudioStorageRef;
	}

	try {
		const { data, error } = await from(USER_VOCABULARY_CARD_MEDIA_TABLE)
			.upsert(mutationRow, { onConflict: "user_id,vocabulary_card_id" })
			.select(USER_VOCABULARY_CARD_MEDIA_SELECT_COLUMNS)
			.maybeSingle();

		if (error) {
			return { ok: false, error: fromPostgrestError(error) };
		}

		if (!data) {
			return {
				ok: false,
				error: createServiceError(
					"RPC_ERROR",
					"La mise a jour des medias a renvoye une reponse vide.",
					false,
				),
			};
		}

		const normalizedRow = normalizeUserVocabularyCardMediaRow(data);
		if (!normalizedRow) {
			return {
				ok: false,
				error: createServiceError(
					"RPC_ERROR",
					"La mise a jour des medias a renvoye une reponse incomplete.",
					false,
				),
			};
		}

		return {
			ok: true,
			data: await resolveUserVocabularyCardMediaRecord(client, normalizedRow),
		};
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

export async function persistUserVocabularyCardMediaAssets(
	params: PersistUserVocabularyCardMediaAssetsParams,
	options: MutationOptions,
): Promise<ServiceResult<UserVocabularyCardMediaRecord>> {
	const previewGuard = guardPreviewMode(
		"Mettre a jour les medias generes d'une carte collectee",
		options?.mode,
	);
	if (previewGuard) {
		return { ok: false, error: previewGuard };
	}

	const vocabularyCardId = params.vocabularyCardId.trim();
	if (!vocabularyCardId) {
		return {
			ok: false,
			error: createServiceError(
				"RPC_ERROR",
				"Impossible de sauvegarder les medias sans identifiant de carte.",
				false,
			),
		};
	}

	const hasAtLeastOneFile = Boolean(
		params.imageFile || params.vocabAudioFile || params.sentenceAudioFile,
	);
	if (!hasAtLeastOneFile) {
		return {
			ok: false,
			error: createServiceError(
				"RPC_ERROR",
				"Aucun media a sauvegarder n'a ete fourni.",
				false,
			),
		};
	}

	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	const normalizeImageFile = async (file: File): Promise<File> => {
		if (file.type === "image/webp") {
			return file;
		}
		return compressCollectedCardImageToWebp(file);
	};

	const userIdResult = await resolveAuthenticatedUserId(client);
	if (isNotAuthenticatedError(userIdResult)) {
		try {
			const normalizedImageFile = params.imageFile
				? await normalizeImageFile(params.imageFile)
				: undefined;

			return {
				ok: true,
				data: await saveGuestCollectedCardMediaAssets({
					vocabularyCardId,
					imageFile: normalizedImageFile,
					vocabAudioFile: params.vocabAudioFile,
					sentenceAudioFile: params.sentenceAudioFile,
				}),
			};
		} catch (error) {
			return { ok: false, error: fromUnknownError(error) };
		}
	}
	if (!userIdResult.ok) {
		return userIdResult;
	}

	try {
		const normalizedImageFile = params.imageFile
			? await normalizeImageFile(params.imageFile)
			: undefined;

		return {
			ok: true,
			data: await saveCollectedCardMediaAssets(client, {
				vocabularyCardId,
				imageFile: normalizedImageFile,
				vocabAudioFile: params.vocabAudioFile,
				sentenceAudioFile: params.sentenceAudioFile,
			}),
		};
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

export async function deleteUserVocabularyCardImage(
	params: DeleteUserVocabularyCardImageParams,
	options: MutationOptions,
): Promise<ServiceResult<UserVocabularyCardMediaRecord>> {
	const previewGuard = guardPreviewMode(
		"Supprimer l'image personnalisee d'une carte collectee",
		options?.mode,
	);
	if (previewGuard) {
		return { ok: false, error: previewGuard };
	}

	const vocabularyCardId = params.vocabularyCardId.trim();
	if (!vocabularyCardId) {
		return {
			ok: false,
			error: createServiceError(
				"RPC_ERROR",
				"Impossible de supprimer l'image sans identifiant de carte.",
				false,
			),
		};
	}

	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	const userIdResult = await resolveAuthenticatedUserId(client);
	if (isNotAuthenticatedError(userIdResult)) {
		try {
			return {
				ok: true,
				data: await deleteGuestCollectedCardMediaSlot({
					vocabularyCardId,
					slot: "image",
				}),
			};
		} catch (error) {
			return { ok: false, error: fromUnknownError(error) };
		}
	}
	if (!userIdResult.ok) {
		return userIdResult;
	}

	try {
		return {
			ok: true,
			data: await deleteCollectedCardMediaSlot(client, {
				vocabularyCardId,
				slot: "image",
			}),
		};
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

export async function deleteUserVocabularyCardAudio(
	params: DeleteUserVocabularyCardAudioParams,
	options: MutationOptions,
): Promise<ServiceResult<UserVocabularyCardMediaRecord>> {
	const label =
		params.kind === "sentence" ? "l'audio de phrase" : "l'audio du vocabulaire";
	const previewGuard = guardPreviewMode(
		`Supprimer ${label} d'une carte collectee`,
		options?.mode,
	);
	if (previewGuard) {
		return { ok: false, error: previewGuard };
	}

	const vocabularyCardId = params.vocabularyCardId.trim();
	if (!vocabularyCardId) {
		return {
			ok: false,
			error: createServiceError(
				"RPC_ERROR",
				`Impossible de supprimer ${label} sans identifiant de carte.`,
				false,
			),
		};
	}

	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	const userIdResult = await resolveAuthenticatedUserId(client);
	if (isNotAuthenticatedError(userIdResult)) {
		try {
			return {
				ok: true,
				data: await deleteGuestCollectedCardMediaSlot({
					vocabularyCardId,
					slot: params.kind === "sentence" ? "sentence-audio" : "vocab-audio",
				}),
			};
		} catch (error) {
			return { ok: false, error: fromUnknownError(error) };
		}
	}
	if (!userIdResult.ok) {
		return userIdResult;
	}

	try {
		return {
			ok: true,
			data: await deleteCollectedCardMediaSlot(client, {
				vocabularyCardId,
				slot: params.kind === "sentence" ? "sentence-audio" : "vocab-audio",
			}),
		};
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

export async function resetUserVocabularyCardMedia(
	params: ResetUserVocabularyCardMediaParams,
	options: MutationOptions,
): Promise<ServiceResult<UserVocabularyCardMediaRecord>> {
	const previewGuard = guardPreviewMode(
		"Reinitialiser les medias personnalises d'une carte collectee",
		options?.mode,
	);
	if (previewGuard) {
		return { ok: false, error: previewGuard };
	}

	const vocabularyCardId = params.vocabularyCardId.trim();
	if (!vocabularyCardId) {
		return {
			ok: false,
			error: createServiceError(
				"RPC_ERROR",
				"Impossible de reinitialiser les medias sans identifiant de carte.",
				false,
			),
		};
	}

	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	const userIdResult = await resolveAuthenticatedUserId(client);
	if (!userIdResult.ok) {
		return userIdResult;
	}

	const fromMethod = (
		client as unknown as UserVocabularyCardMediaMutationFromClient
	).from;
	const from =
		typeof fromMethod === "function" ? fromMethod.bind(client) : null;
	if (!from) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	const mutationRow: UserVocabularyCardMediaMutationRow = {
		user_id: userIdResult.data,
		vocabulary_card_id: vocabularyCardId,
		image_url: null,
		audio_url: null,
		sentence_audio_url: null,
		hide_image: false,
		hide_audio: false,
		hide_sentence_audio: false,
	};

	try {
		const { data, error } = await from(USER_VOCABULARY_CARD_MEDIA_TABLE)
			.upsert(mutationRow, { onConflict: "user_id,vocabulary_card_id" })
			.select(USER_VOCABULARY_CARD_MEDIA_SELECT_COLUMNS)
			.maybeSingle();

		if (error) {
			return { ok: false, error: fromPostgrestError(error) };
		}

		if (!data) {
			return {
				ok: false,
				error: createServiceError(
					"RPC_ERROR",
					"La reinitialisation des medias a renvoye une reponse vide.",
					false,
				),
			};
		}

		const normalizedRow = normalizeUserVocabularyCardMediaRow(data);
		if (!normalizedRow) {
			return {
				ok: false,
				error: createServiceError(
					"RPC_ERROR",
					"La reinitialisation des medias a renvoye une reponse incomplete.",
					false,
				),
			};
		}

		return {
			ok: true,
			data: await resolveUserVocabularyCardMediaRecord(client, normalizedRow),
		};
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

const resolveDueVocabularyCardId = (
	record: GetDueCardsV2Row,
): string | null => {
	if (!record || typeof record !== "object") {
		return null;
	}

	return toOptionalNonEmptyString(
		(record as { vocabulary_card_id?: unknown }).vocabulary_card_id,
	);
};

const mergeDueRecordWithVocabularyRow = (
	record: GetDueCardsV2Row,
	vocabularyRow?: DueVocabularyRow,
): GetDueCardsV2Row => {
	if (!record || typeof record !== "object" || !vocabularyRow) {
		return record;
	}

	const merged = { ...(record as Record<string, unknown>) };

	const applyIfMissing = (key: string, value: unknown) => {
		const existingValue = toOptionalNonEmptyString(merged[key]);
		const nextValue = toOptionalNonEmptyString(value);
		if (!existingValue && nextValue) {
			merged[key] = nextValue;
		}
	};

	applyIfMissing("word_ar", vocabularyRow.word_ar);
	applyIfMissing("word_fr", vocabularyRow.word_fr);
	applyIfMissing("transliteration", vocabularyRow.transliteration);
	applyIfMissing("example_sentence_ar", vocabularyRow.example_sentence_ar);
	applyIfMissing("example_sentence_fr", vocabularyRow.example_sentence_fr);
	applyIfMissing("audio_url", vocabularyRow.audio_url);
	applyIfMissing("sentence_audio_url", vocabularyRow.sentence_audio_url);
	applyIfMissing("image_url", vocabularyRow.image_url);
	applyIfMissing("category", vocabularyRow.category);

	return merged as GetDueCardsV2Row;
};

const applyCollectedSourceOccurrenceToDueRecord = (
	record: GetDueCardsV2Row,
	sourceOccurrence?: CollectedSourceOccurrenceRow,
): GetDueCardsV2Row => {
	if (!record || typeof record !== "object" || !sourceOccurrence) {
		return record;
	}

	return {
		...(record as Record<string, unknown>),
		...buildCollectedSourceOccurrencePatch(sourceOccurrence),
	} as GetDueCardsV2Row;
};

const fetchDueVocabularyRowsById = async (
	client: AppSupabaseClient,
	vocabularyCardIds: string[],
): Promise<Map<string, DueVocabularyRow>> => {
	const rowsById = new Map<string, DueVocabularyRow>();
	const normalizedIds = normalizeCardIds(vocabularyCardIds);
	if (normalizedIds.length === 0) {
		return rowsById;
	}

	const fromMethod = (client as unknown as DueVocabularyFromClient).from;
	const from =
		typeof fromMethod === "function" ? fromMethod.bind(client) : null;
	if (!from) {
		return rowsById;
	}

	for (const idChunk of chunkStringIds(normalizedIds)) {
		try {
			const { data, error } = await from("vocabulary_cards")
				.select(
					"id,word_ar,word_fr,transliteration,example_sentence_ar,example_sentence_fr,audio_url,sentence_audio_url,image_url,category",
				)
				.in("id", idChunk);

			if (error) {
				console.error("Unable to load due vocabulary media rows:", error);
				return rowsById;
			}

			(data ?? []).forEach((row) => {
				const rowId = toOptionalNonEmptyString(row.id);
				if (rowId) {
					rowsById.set(rowId, row);
				}
			});
		} catch (error) {
			console.error("Unable to load due vocabulary media rows:", error);
			return rowsById;
		}
	}

	return rowsById;
};

const normalizeLastSeenAt = (value: unknown): string | null => {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const normalizeSeenCount = (value: unknown): number => {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return 0;
	}

	return Math.max(0, Math.floor(value));
};

const normalizeAddedAt = (value: unknown): string | null =>
	normalizeLastSeenAt(value);

const buildShortPlaybackUrl = (videoId: unknown): string | null => {
	if (typeof videoId !== "string") {
		return null;
	}

	const normalizedVideoId = videoId.trim();
	if (normalizedVideoId.length === 0) {
		return null;
	}

	return buildImmersionShortPath(normalizedVideoId);
};

const normalizeDeckContentPage = (value: number | undefined): number => {
	if (!Number.isFinite(value)) {
		return 1;
	}

	return Math.max(1, Math.floor(value ?? 1));
};

const normalizeDeckContentPageSize = (value: number | undefined): number => {
	if (!Number.isFinite(value)) {
		return DEFAULT_DECK_CONTENT_PAGE_SIZE;
	}

	return Math.min(
		DECK_CONTENT_MAX_PAGE_SIZE,
		Math.max(1, Math.floor(value ?? DEFAULT_DECK_CONTENT_PAGE_SIZE)),
	);
};

const isNotAuthenticatedError = <T>(
	result: ServiceResult<T>,
): result is { ok: false; error: DeckServiceError } =>
	!result.ok && result.error.code === "NOT_AUTHENTICATED";

const toDeckContentRowKey = (row: SearchCardsV2Row, index: number): string => {
	if (
		typeof row.foundation_card_id === "string" &&
		row.foundation_card_id.length > 0
	) {
		return `f:${row.foundation_card_id}`;
	}

	if (
		typeof row.vocabulary_card_id === "string" &&
		row.vocabulary_card_id.length > 0
	) {
		return `v:${row.vocabulary_card_id}`;
	}

	return `fallback:${index}`;
};

const resolveAuthenticatedUserId = async (
	client: AppSupabaseClient,
): Promise<ServiceResult<string>> => {
	const auth = (
		client as unknown as {
			auth?: {
				getUser?: () => Promise<AuthGetUserResponse>;
				getSession?: () => Promise<AuthGetSessionResponse>;
			};
		}
	).auth;

	const getUserMethod =
		typeof auth?.getUser === "function" ? auth.getUser.bind(auth) : null;
	const getSessionMethod =
		typeof auth?.getSession === "function" ? auth.getSession.bind(auth) : null;

	const notAuthenticatedResult: ServiceResult<string> = {
		ok: false,
		error: createServiceError(
			"NOT_AUTHENTICATED",
			"Vous devez etre connecte pour consulter ce deck.",
			false,
		),
	};

	if (!getUserMethod && !getSessionMethod) {
		return notAuthenticatedResult;
	}

	try {
		if (getUserMethod) {
			const { data, error } = await getUserMethod();
			if (!error && data?.user?.id) {
				return { ok: true, data: data.user.id };
			}
		}
	} catch {
		// Fallback to getSession below.
	}

	try {
		if (getSessionMethod) {
			const { data, error } = await getSessionMethod();
			const sessionUserId = data?.session?.user?.id;
			if (
				!error &&
				typeof sessionUserId === "string" &&
				sessionUserId.length > 0
			) {
				return { ok: true, data: sessionUserId };
			}
		}
	} catch {
		// Return NOT_AUTHENTICATED below.
	}

	return notAuthenticatedResult;
};

const buildDeckContentStateRowsQuery = (
	from: (table: string) => any,
	userId: string,
	sourceType: DeckSourceType,
	offset: number,
	pageSize: number,
) => {
	let query = from("user_card_state")
		.select(
			"foundation_card_id,vocabulary_card_id,last_reviewed_at,repetitions,added_to_deck_at,source_video_id,source_video_is_short,source_cue_id,source_word_index,source_word_start_seconds,source_word_end_seconds",
			{ count: "exact" },
		)
		.eq("user_id", userId);

	if (sourceType === "foundation") {
		query = query
			.not("foundation_card_id", "is", null)
			.order("last_reviewed_at", { ascending: false, nullsFirst: false })
			.order("foundation_card_id", { ascending: true, nullsFirst: false });
	} else {
		query = query
			.not("vocabulary_card_id", "is", null)
			.not("added_to_deck_at", "is", null)
			.eq("source_type", sourceType)
			.order("added_to_deck_at", { ascending: false, nullsFirst: false })
			.order("vocabulary_card_id", { ascending: true, nullsFirst: false });
	}

	return query.range(offset, offset + pageSize);
};

export async function fetchDeckContentPage(
	sourceType: DeckSourceType,
	options: FetchDeckContentPageOptions = {},
): Promise<ServiceResult<DeckContentPageData>> {
	const page = normalizeDeckContentPage(options.page);
	const pageSize = normalizeDeckContentPageSize(options.pageSize);
	const offset = (page - 1) * pageSize;

	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	const userIdResult = await resolveAuthenticatedUserId(client);
	if (!userIdResult.ok) {
		return userIdResult;
	}

	const fromMethod = (
		client as unknown as {
			from?: (table: string) => any;
		}
	).from;
	const from =
		typeof fromMethod === "function" ? fromMethod.bind(client) : null;
	if (!from) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	if (sourceType === "foundation") {
		try {
			const { count: totalRowsCount, error: totalRowsError } = await from(
				"foundation_deck",
			).select("id", { count: "exact", head: true });

			if (totalRowsError) {
				return { ok: false, error: fromPostgrestError(totalRowsError) };
			}

			const { data: foundationCardsPageRows, error: foundationCardsPageError } =
				await from("foundation_deck")
					.select("id,word_ar,word_fr,frequency_rank")
					.order("frequency_rank", {
						ascending: true,
						nullsFirst: false,
					})
					.order("id", { ascending: true, nullsFirst: false })
					.range(offset, offset + pageSize - 1);

			if (foundationCardsPageError) {
				return {
					ok: false,
					error: fromPostgrestError(foundationCardsPageError),
				};
			}

			const foundationCards = Array.isArray(foundationCardsPageRows)
				? (foundationCardsPageRows as DeckContentFoundationRow[])
				: [];

			if (foundationCards.length === 0) {
				const totalRows =
					typeof totalRowsCount === "number" ? totalRowsCount : null;
				return {
					ok: true,
					data: {
						rows: [],
						page,
						pageSize,
						hasNextPage: false,
						totalRows,
					},
				};
			}

			const foundationIds = foundationCards
				.map((card) => toOptionalNonEmptyString(card.id))
				.filter((value): value is string => value !== null);

			const progressByFoundationId = new Map<
				string,
				Pick<
					DeckContentStateRow,
					"last_reviewed_at" | "repetitions" | "added_to_deck_at"
				>
			>();

			for (const idChunk of chunkStringIds(foundationIds)) {
				const { data: progressRows, error: progressError } = await from(
					"user_card_state",
				)
					.select(
						"foundation_card_id,last_reviewed_at,repetitions,added_to_deck_at",
					)
					.eq("user_id", userIdResult.data)
					.in("foundation_card_id", idChunk);

				if (progressError) {
					return { ok: false, error: fromPostgrestError(progressError) };
				}

				(progressRows as DeckContentStateRow[] | null | undefined)?.forEach(
					(progressRow) => {
						if (
							typeof progressRow.foundation_card_id === "string" &&
							progressRow.foundation_card_id.length > 0
						) {
							progressByFoundationId.set(progressRow.foundation_card_id, {
								last_reviewed_at: progressRow.last_reviewed_at,
								repetitions: progressRow.repetitions,
								added_to_deck_at: progressRow.added_to_deck_at,
							});
						}
					},
				);
			}

			const foundationWordArValues = Array.from(
				new Set(
					foundationCards
						.map((card) => toOptionalNonEmptyString(card.word_ar))
						.filter((value): value is string => value !== null),
				),
			);

			const mediaCardByWordAr = new Map<string, DeckContentVocabularyRow>();
			const mediaCardByVocabularyId = new Map<
				string,
				DeckContentVocabularyRow
			>();

			for (const wordChunk of chunkStringIds(foundationWordArValues)) {
				const { data: mediaCardRows, error: mediaCardError } = await from(
					"vocabulary_cards",
				)
					.select("id,word_ar,word_fr,image_url,audio_url,sentence_audio_url")
					.in("word_ar", wordChunk);

				if (mediaCardError) {
					return { ok: false, error: fromPostgrestError(mediaCardError) };
				}

				(
					mediaCardRows as DeckContentVocabularyRow[] | null | undefined
				)?.forEach((cardRow) => {
					const vocabularyCardId = toOptionalNonEmptyString(cardRow.id);
					const wordAr = toOptionalNonEmptyString(cardRow.word_ar);
					if (!vocabularyCardId || !wordAr) {
						return;
					}

					mediaCardByVocabularyId.set(vocabularyCardId, cardRow);

					const currentMediaCard = mediaCardByWordAr.get(wordAr);
					if (
						!currentMediaCard ||
						countAvailableMediaFields(cardRow) >
							countAvailableMediaFields(currentMediaCard)
					) {
						mediaCardByWordAr.set(wordAr, cardRow);
					}
				});
			}

			const userMediaRowsById = await fetchResolvedUserVocabularyCardMediaById(
				client,
				Array.from(mediaCardByVocabularyId.keys()),
			);

			const rows: DeckContentTableRow[] = foundationCards.map((card, index) => {
				const foundationId = toOptionalNonEmptyString(card.id);
				const wordAr = toOptionalNonEmptyString(card.word_ar) ?? "";
				const wordFr = toOptionalNonEmptyString(card.word_fr) ?? "";
				const foundationMedia = resolvePreferredFoundationMedia({
					frequencyRank:
						typeof card.frequency_rank === "number" &&
						Number.isFinite(card.frequency_rank)
							? card.frequency_rank
							: null,
					vocabFull: wordAr,
					vocabBase: wordAr,
					sentence: null,
				});
				const progress = foundationId
					? progressByFoundationId.get(foundationId)
					: undefined;
				const mediaCard = wordAr
					? (mediaCardByWordAr.get(wordAr) ?? null)
					: null;
				const vocabularyCardId = toOptionalNonEmptyString(mediaCard?.id);
				const userMedia = vocabularyCardId
					? (userMediaRowsById.get(vocabularyCardId) ?? null)
					: null;

				return {
					id: foundationId
						? `f:${foundationId}`
						: `foundation:${offset + index}`,
					vocabularyCardId,
					wordAr,
					wordFr,
					focusRank:
						typeof card.frequency_rank === "number" &&
						Number.isFinite(card.frequency_rank)
							? card.frequency_rank
							: null,
					lastSeenAt: normalizeLastSeenAt(progress?.last_reviewed_at),
					seenCount: normalizeSeenCount(progress?.repetitions),
					addedAt: normalizeAddedAt(progress?.added_to_deck_at),
					videoUrl: null,
					imageUrl:
						userMedia?.imageUrl ??
						toOptionalNonEmptyString(mediaCard?.image_url) ??
						foundationMedia.imageUrl ??
						null,
					vocabAudioUrl:
						userMedia?.vocabAudioUrl ??
						toOptionalNonEmptyString(mediaCard?.audio_url) ??
						foundationMedia.vocabAudioUrl ??
						null,
					sentenceAudioUrl:
						userMedia?.sentenceAudioUrl ??
						toOptionalNonEmptyString(mediaCard?.sentence_audio_url) ??
						foundationMedia.sentenceAudioUrl ??
						null,
					hasCustomImage: Boolean(userMedia?.imageStorageRef),
					hasCustomVocabAudio: Boolean(userMedia?.vocabAudioStorageRef),
					hasCustomSentenceAudio: Boolean(userMedia?.sentenceAudioStorageRef),
				};
			});

			const totalRows =
				typeof totalRowsCount === "number" ? totalRowsCount : null;
			const hasNextPage =
				totalRows !== null
					? offset + rows.length < totalRows
					: rows.length === pageSize;

			return {
				ok: true,
				data: {
					rows,
					page,
					pageSize,
					hasNextPage,
					totalRows,
				},
			};
		} catch (error) {
			return { ok: false, error: fromUnknownError(error) };
		}
	}

	try {
		const { data, error, count } = await buildDeckContentStateRowsQuery(
			from,
			userIdResult.data,
			sourceType,
			offset,
			pageSize,
		);
		if (error) {
			return { ok: false, error: fromPostgrestError(error) };
		}

		const fetchedRows = Array.isArray(data)
			? (data as DeckContentStateRow[])
			: [];
		const hasNextPage = fetchedRows.length > pageSize;
		const pageStateRows = hasNextPage
			? fetchedRows.slice(0, pageSize)
			: fetchedRows;

		if (pageStateRows.length === 0) {
			return {
				ok: true,
				data: {
					rows: [],
					page,
					pageSize,
					hasNextPage,
					totalRows: typeof count === "number" ? count : null,
				},
			};
		}

		const vocabularyIds = pageStateRows
			.map((row) => row.vocabulary_card_id)
			.filter(
				(value): value is string =>
					typeof value === "string" && value.length > 0,
			);

		const vocabularyRowsById = new Map<string, DeckContentVocabularyRow>();
		for (const idChunk of chunkStringIds(vocabularyIds)) {
			const { data: cardRows, error: cardError } = await from(
				"vocabulary_cards",
			)
				.select(
					"id,word_ar,word_fr,video_id,category,image_url,audio_url,sentence_audio_url",
				)
				.in("id", idChunk);
			if (cardError) {
				return { ok: false, error: fromPostgrestError(cardError) };
			}

			(cardRows as DeckContentVocabularyRow[] | null | undefined)?.forEach(
				(cardRow) => {
					if (typeof cardRow.id === "string" && cardRow.id.length > 0) {
						vocabularyRowsById.set(cardRow.id, cardRow);
					}
				},
			);
		}

		const userMediaRowsById = await fetchResolvedUserVocabularyCardMediaById(
			client,
			vocabularyIds,
		);

		const videoUrlsByVideoId = new Map<string, string>();
		const sourceVideoYoutubeIdByVideoId = new Map<string, string>();
		const fallbackVideoIdsByCardId = new Map<string, string>();
		if (sourceType === "collected") {
			const subtitleMinedCardIds = Array.from(vocabularyRowsById.values())
				.filter(
					(row): row is DeckContentVocabularyRow & { id: string } =>
						(typeof row.video_id !== "string" || row.video_id.length === 0) &&
						row.category === "subtitle_mined" &&
						typeof row.id === "string" &&
						row.id.length > 0,
				)
				.map((row) => row.id);

			for (const idChunk of chunkStringIds(subtitleMinedCardIds)) {
				const { data: linkRows, error: linkError } = await from(
					"vocabulary_card_videos",
				)
					.select("video_id,vocabulary_card_id")
					.in("vocabulary_card_id", idChunk);
				if (linkError) {
					return { ok: false, error: fromPostgrestError(linkError) };
				}

				(
					linkRows as
						| Array<{ video_id?: unknown; vocabulary_card_id?: unknown }>
						| null
						| undefined
				)?.forEach((linkRow) => {
					const vocabularyCardId =
						typeof linkRow.vocabulary_card_id === "string"
							? linkRow.vocabulary_card_id
							: null;
					const videoId =
						typeof linkRow.video_id === "string" ? linkRow.video_id : null;
					if (
						vocabularyCardId &&
						videoId &&
						!fallbackVideoIdsByCardId.has(vocabularyCardId)
					) {
						fallbackVideoIdsByCardId.set(vocabularyCardId, videoId);
					}
				});
			}

			const videoIds = Array.from(
				new Set([
					...Array.from(vocabularyRowsById.values())
						.map((row) => row.video_id)
						.filter(
							(value): value is string =>
								typeof value === "string" && value.length > 0,
						),
					...Array.from(fallbackVideoIdsByCardId.values()),
				]),
			);

			for (const idChunk of chunkStringIds(videoIds)) {
				const { data: videoRows, error: videoError } = await from("videos")
					.select("id,video_url,source_video_id")
					.in("id", idChunk);
				if (videoError) {
					return { ok: false, error: fromPostgrestError(videoError) };
				}

				(videoRows as DeckContentVideoRow[] | null | undefined)?.forEach(
					(videoRow) => {
						const videoId =
							typeof videoRow.id === "string" ? videoRow.id : null;
						const sourceVideoYoutubeId = toOptionalNonEmptyString(
							videoRow.source_video_id,
						);
						const shortPlaybackUrl = buildShortPlaybackUrl(videoId);
						if (videoId && shortPlaybackUrl) {
							videoUrlsByVideoId.set(videoId, shortPlaybackUrl);
						}
						if (videoId && sourceVideoYoutubeId) {
							sourceVideoYoutubeIdByVideoId.set(videoId, sourceVideoYoutubeId);
						}
					},
				);
			}
		}

		const rows = pageStateRows.map((row, index): DeckContentTableRow => {
			const vocabularyId =
				typeof row.vocabulary_card_id === "string"
					? row.vocabulary_card_id
					: null;
			const card = vocabularyId
				? vocabularyRowsById.get(vocabularyId)
				: undefined;
			const sourceVideoId = toOptionalNonEmptyString(row.source_video_id);
			const sourceVideoYoutubeId = sourceVideoId
				? (sourceVideoYoutubeIdByVideoId.get(sourceVideoId) ?? null)
				: null;
			const sourceOccurrenceFields = buildCollectedSourceOccurrenceFields({
				...row,
				source_video_youtube_id: sourceVideoYoutubeId,
			});
			const userMedia = vocabularyId
				? (userMediaRowsById.get(vocabularyId) ?? null)
				: null;
			const linkedVideoUrl =
				typeof card?.video_id === "string"
					? (videoUrlsByVideoId.get(card.video_id) ?? null)
					: vocabularyId
						? (() => {
								const fallbackVideoId =
									fallbackVideoIdsByCardId.get(vocabularyId);
								return fallbackVideoId
									? (videoUrlsByVideoId.get(fallbackVideoId) ?? null)
									: null;
							})()
						: null;

			return {
				id: vocabularyId ? `v:${vocabularyId}` : `vocabulary:${offset + index}`,
				vocabularyCardId: vocabularyId,
				wordAr: typeof card?.word_ar === "string" ? card.word_ar : "",
				wordFr: typeof card?.word_fr === "string" ? card.word_fr : "",
				lastSeenAt: normalizeLastSeenAt(row.last_reviewed_at),
				seenCount: normalizeSeenCount(row.repetitions),
				addedAt: normalizeAddedAt(row.added_to_deck_at),
				videoUrl: linkedVideoUrl,
				...sourceOccurrenceFields,
				imageUrl:
					userMedia?.imageUrl ?? toOptionalNonEmptyString(card?.image_url),
				vocabAudioUrl:
					userMedia?.vocabAudioUrl ?? toOptionalNonEmptyString(card?.audio_url),
				sentenceAudioUrl:
					userMedia?.sentenceAudioUrl ??
					toOptionalNonEmptyString(card?.sentence_audio_url),
				hasCustomImage: Boolean(userMedia?.imageStorageRef),
				hasCustomVocabAudio: Boolean(userMedia?.vocabAudioStorageRef),
				hasCustomSentenceAudio: Boolean(userMedia?.sentenceAudioStorageRef),
			};
		});

		return {
			ok: true,
			data: {
				rows,
				page,
				pageSize,
				hasNextPage,
				totalRows: typeof count === "number" ? count : null,
			},
		};
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

export async function fetchDeckContentRows(
	sourceType: DeckSourceType,
): Promise<ServiceResult<DeckContentTableRow[]>> {
	try {
		const deckRows: SearchCardsV2Row[] = [];
		const seenPageFingerprints = new Set<string>();
		const fetchStartedAt = Date.now();
		let offset = 0;

		for (let pageIndex = 0; pageIndex < MAX_SEARCH_PAGE_COUNT; pageIndex += 1) {
			if (Date.now() - fetchStartedAt > DECK_CONTENT_TOTAL_TIMEOUT_MS) {
				return {
					ok: false,
					error: createServiceError(
						"RPC_ERROR",
						"Le chargement du contenu du deck prend trop de temps.",
						true,
					),
				};
			}

			const result = await withPromiseTimeout(
				searchVocabularyBank("", SEARCH_PAGE_LIMIT, [sourceType], offset),
				DECK_CONTENT_PAGE_TIMEOUT_MS,
				"Le chargement du contenu du deck a expiré.",
			);
			if (!result.ok) {
				return { ok: false, error: result.error };
			}

			const pageRows = result.data;
			if (pageRows.length === 0) {
				break;
			}

			const firstRowKey = toDeckContentRowKey(pageRows[0], 0);
			const lastRowKey = toDeckContentRowKey(
				pageRows[pageRows.length - 1],
				pageRows.length - 1,
			);
			const pageFingerprint = `${pageRows.length}:${firstRowKey}:${lastRowKey}`;
			if (seenPageFingerprints.has(pageFingerprint)) {
				break;
			}

			seenPageFingerprints.add(pageFingerprint);
			deckRows.push(...pageRows);

			if (pageRows.length < SEARCH_PAGE_LIMIT) {
				break;
			}

			offset += SEARCH_PAGE_LIMIT;
		}

		const dedupedRows: SearchCardsV2Row[] = [];
		const seenRowKeys = new Set<string>();
		deckRows.forEach((row, index) => {
			const rowKey = toDeckContentRowKey(row, index);
			if (seenRowKeys.has(rowKey)) {
				return;
			}

			seenRowKeys.add(rowKey);
			dedupedRows.push(row);
		});

		const foundationIds = dedupedRows
			.map((row) => row.foundation_card_id)
			.filter(
				(value): value is string =>
					typeof value === "string" && value.length > 0,
			);

		const vocabularyIds = dedupedRows
			.map((row) => row.vocabulary_card_id)
			.filter(
				(value): value is string =>
					typeof value === "string" && value.length > 0,
			);

		const progressByCardKey = new Map<string, UserCardStateProgress>();
		const client = resolveClient();
		if (!client) {
			return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
		}

		const fromMethod = (client as unknown as UserCardStateFromClient).from;
		const from =
			typeof fromMethod === "function" ? fromMethod.bind(client) : null;
		if (from) {
			for (const idChunk of chunkStringIds(foundationIds)) {
				const { data, error } = await from("user_card_state")
					.select("foundation_card_id,last_reviewed_at,repetitions")
					.in("foundation_card_id", idChunk);

				if (error) {
					return { ok: false, error: fromPostgrestError(error) };
				}

				(data ?? []).forEach((row) => {
					if (
						typeof row.foundation_card_id !== "string" ||
						row.foundation_card_id.length === 0
					) {
						return;
					}

					progressByCardKey.set(`f:${row.foundation_card_id}`, {
						lastSeenAt: normalizeLastSeenAt(row.last_reviewed_at),
						seenCount: normalizeSeenCount(row.repetitions),
					});
				});
			}

			for (const idChunk of chunkStringIds(vocabularyIds)) {
				const { data, error } = await from("user_card_state")
					.select("vocabulary_card_id,last_reviewed_at,repetitions")
					.in("vocabulary_card_id", idChunk);

				if (error) {
					return { ok: false, error: fromPostgrestError(error) };
				}

				(data ?? []).forEach((row) => {
					if (
						typeof row.vocabulary_card_id !== "string" ||
						row.vocabulary_card_id.length === 0
					) {
						return;
					}

					progressByCardKey.set(`v:${row.vocabulary_card_id}`, {
						lastSeenAt: normalizeLastSeenAt(row.last_reviewed_at),
						seenCount: normalizeSeenCount(row.repetitions),
					});
				});
			}
		}

		const rows = dedupedRows
			.map((row, index): DeckContentTableRow => {
				const rowKey = toDeckContentRowKey(row, index);
				const progress = progressByCardKey.get(rowKey);
				const fallbackSeenCount = row.is_seen ? 1 : 0;
				const sourceOccurrenceFields = buildCollectedSourceOccurrenceFields(
					row as CollectedSourceOccurrenceRow,
				);

				return {
					id: rowKey,
					wordAr: typeof row.word_ar === "string" ? row.word_ar : "",
					wordFr: typeof row.word_fr === "string" ? row.word_fr : "",
					lastSeenAt: progress?.lastSeenAt ?? null,
					seenCount:
						progress?.seenCount ?? normalizeSeenCount(fallbackSeenCount),
					addedAt: null,
					videoUrl: null,
					...sourceOccurrenceFields,
				};
			})
			.sort((left, right) =>
				left.wordAr.localeCompare(right.wordAr, "ar", {
					sensitivity: "base",
				}),
			);

		return { ok: true, data: rows };
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

export async function fetchDueCardsByReviewTypes(
	reviewTypes: ReviewType[],
	limitPerScope = 40,
): Promise<ServiceResult<VocabCard[]>> {
	const {
		fetchDueCardsByReviewTypes: fetchDueCardsByReviewTypesFromDueService,
	} = await import("@/services/deckPersoDueReviewService");

	return fetchDueCardsByReviewTypesFromDueService(reviewTypes, limitPerScope);
}

export async function startReviewPreviewSession(
	source = "phase1-review-step",
): Promise<ServiceResult<ReviewPreviewSessionState>> {
	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	try {
		const { data, error } = await startReviewPreviewSessionV1(client, {
			p_source: source,
		});
		if (error) {
			return { ok: false, error: fromPostgrestError(error) };
		}
		return { ok: true, data: normalizeReviewPreviewSessionState(data) };
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

export async function completeReviewPreviewSession(
	previewSessionId?: string | null,
	completionReason = "cards_completed",
): Promise<ServiceResult<ReviewPreviewSessionState>> {
	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	try {
		const { data, error } = await completeReviewPreviewSessionV1(client, {
			p_preview_session_id: previewSessionId ?? null,
			p_completion_reason: completionReason,
		});
		if (error) {
			return { ok: false, error: fromPostgrestError(error) };
		}
		return { ok: true, data: normalizeReviewPreviewSessionState(data) };
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

async function submitReviewNow(
	card: VocabCard,
	rating: BinaryReviewRating,
): Promise<ServiceResult<SubmitReviewSchedulerPayload | null>> {
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

	if (hasRecentReview(cardKey)) {
		return {
			ok: false,
			error: createServiceError(
				"DUPLICATE_REVIEW",
				"Cette carte vient d'être révisée. Réessayez dans quelques secondes.",
				false,
			),
		};
	}

	if (inFlightReviewKeys.has(cardKey)) {
		return {
			ok: false,
			error: createServiceError(
				"DUPLICATE_IN_FLIGHT",
				"Une revue est déjà en cours pour cette carte.",
				true,
			),
		};
	}

	const client = resolveClient();
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	inFlightReviewKeys.add(cardKey);
	const clientReviewId = getOrCreateClientReviewId(cardKey);
	const reviewSessionId = getOrCreateReviewSessionId();
	const nowUtc = new Date().toISOString();

	try {
		const leaseError = await claimActiveReviewSessionLease(
			client,
			reviewSessionId,
		);
		if (leaseError) {
			if (isActiveSessionLockedError(leaseError)) {
				return {
					ok: false,
					error: createServiceError(
						"ACTIVE_SESSION_LOCKED",
						"Une autre session de revue est active sur ce compte.",
						false,
					),
				};
			}
			return { ok: false, error: fromPostgrestError(leaseError) };
		}

		const submitViaLegacyRpc = async (options?: {
			trackReviewLifecycle?: boolean;
		}): Promise<ServiceResult<SubmitReviewSchedulerPayload | null>> => {
			const trackReviewLifecycle = options?.trackReviewLifecycle ?? true;
			const hasLegacyCardIds =
				!!card.vocabularyCardId || !!card.foundationCardId;
			const schedulerCardId =
				typeof card.schedulerCardId === "string" && card.schedulerCardId.trim().length > 0
					? card.schedulerCardId.trim()
					: typeof card.remoteId === "string" &&
						  card.remoteId.trim().length > 0 &&
						  !card.remoteId.startsWith("due-")
						? card.remoteId.trim()
						: null;

			const submitBatchSignature = async () =>
				submitReviewFsrsV2(client, {
					p_session_id: reviewSessionId,
					p_reviews: [
						{
							card_id: schedulerCardId,
							rating: FSRS_RATING_BY_RATING[rating],
							client_event_id: clientReviewId,
							event_at: nowUtc,
						},
					],
				});

			const submitLegacySignature = async () =>
				submitReviewFsrsV2(client, {
					p_quality: FSRS_RATING_BY_RATING[rating],
					p_client_review_id: clientReviewId,
					p_vocabulary_card_id: card.vocabularyCardId ?? null,
					p_foundation_card_id: card.foundationCardId ?? null,
				});

			let data: unknown = null;
			let error: PostgrestError | null = null;
			if (!hasLegacyCardIds && schedulerCardId) {
				({ data, error } = await submitBatchSignature());
			} else {
				({ data, error } = await submitLegacySignature());
				if (error && isMissingLegacySubmitReviewSignature(error) && schedulerCardId) {
					({ data, error } = await submitBatchSignature());
				}
			}

			if (error) {
				if (isDuplicateReviewError(error)) {
					if (trackReviewLifecycle) {
						markRecentReview(cardKey);
						clearClientReviewId(cardKey);
					}
					return {
						ok: false,
						error: createServiceError(
							"DUPLICATE_REVIEW",
							"Cette carte a déjà été révisée dans un autre onglet.",
							false,
						),
					};
				}
				return { ok: false, error: fromPostgrestError(error) };
			}

			if (trackReviewLifecycle) {
				markRecentReview(cardKey);
				clearClientReviewId(cardKey);
			}
			emitPendingReviewsInvalidated();
			emitProfileInsightsRefresh();
			return {
				ok: true,
				data: (data as SubmitReviewSchedulerPayload | null) ?? null,
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
		const canUseRuntimeReviewScheduler =
			typeof invoke === "function" &&
			!!card.foundationCardId &&
			!isDeckPersoSchedulerRollbackToLegacyEnabled();

		const shadowDiffContext = canUseRuntimeReviewScheduler
			? await resolveSchedulerShadowDiffContext(client)
			: { userId: null, enabled: false };

		if (canUseRuntimeReviewScheduler) {
			const legacyFallbackSunsetGuardEnabled =
				isDeckPersoSchedulerLegacyFallbackSunsetGuardEnabled();
			const runtimeReviewRequestPayload = {
				schema_version: 1,
				now_utc: nowUtc,
				foundation_card_id: card.foundationCardId,
				review_event: {
					review_session_id: reviewSessionId,
					client_review_id: clientReviewId,
					rating,
				},
			};

			let runtimeInvokeData: unknown = null;
			let runtimeInvokeError: unknown = null;
			try {
				const invokeResult = await invoke("scheduler-review-v1", {
					body: runtimeReviewRequestPayload,
				});
				runtimeInvokeData = invokeResult.data;
				runtimeInvokeError = invokeResult.error;
			} catch (invokeError) {
				runtimeInvokeError = invokeError;
			}

			if (runtimeInvokeError) {
				if (isInvokeActiveSessionLockedError(runtimeInvokeError)) {
					return {
						ok: false,
						error: createServiceError(
							"ACTIVE_SESSION_LOCKED",
							"Une autre session de revue est active sur ce compte.",
							false,
						),
					};
				}

				if (isInvokeDuplicateReviewError(runtimeInvokeError)) {
					markRecentReview(cardKey);
					clearClientReviewId(cardKey);
					return {
						ok: false,
						error: createServiceError(
							"DUPLICATE_REVIEW",
							"Cette carte a déjà été révisée dans un autre onglet.",
							false,
						),
					};
				}

				if (shouldFallbackToLegacySubmitRpc(runtimeInvokeError)) {
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
								operation: "review_submit",
								primaryPath: "runtime_edge",
								occurredAt: nowUtc,
								requestNowUtc: nowUtc,
								weightsVersion,
								schedulerInputs: {
									card_key: cardKey,
									vocabulary_card_id: card.vocabularyCardId ?? null,
									foundation_card_id: card.foundationCardId,
									rating,
									runtime_request: runtimeReviewRequestPayload,
								},
								runtimeOutput: serializeShadowOutput(null, runtimeInvokeError),
								legacyOutput: serializeShadowOutput(null),
								diffSummary: {
									matches: false,
									reason:
										SHADOW_DIFF_REASON_CODES.RUNTIME_REVIEW_FALLBACK_BLOCKED_BY_SUNSET_GUARD,
									runtime_error: serializeShadowError(runtimeInvokeError),
								},
							});
						}

						return {
							ok: false,
							error: createServiceError(
								"RPC_ERROR",
								REVIEW_SUNSET_GUARD_BLOCKED_ERROR_MESSAGE,
								true,
							),
						};
					}

					const legacyFallbackResult = await submitViaLegacyRpc();

					if (shadowDiffContext.enabled && shadowDiffContext.userId) {
						const weightsVersion = await resolveActiveWeightsVersion(
							client,
							shadowDiffContext.userId,
						);

						await insertSchedulerShadowDiffEvent(client, {
							userId: shadowDiffContext.userId,
							operation: "review_submit",
							primaryPath: "legacy_sql",
							occurredAt: nowUtc,
							requestNowUtc: nowUtc,
							weightsVersion,
							schedulerInputs: {
								card_key: cardKey,
								vocabulary_card_id: card.vocabularyCardId ?? null,
								foundation_card_id: card.foundationCardId,
								rating,
								runtime_request: runtimeReviewRequestPayload,
							},
							runtimeOutput: serializeShadowOutput(null, runtimeInvokeError),
							legacyOutput:
								serializeServiceResultForShadow(legacyFallbackResult),
							diffSummary: {
								matches: false,
								reason:
									SHADOW_DIFF_REASON_CODES.RUNTIME_REVIEW_FALLBACK_TO_LEGACY,
								legacy_ok: legacyFallbackResult.ok,
								runtime_error: serializeShadowError(runtimeInvokeError),
							},
						});
					}

					return legacyFallbackResult;
				}

				return { ok: false, error: fromUnknownError(runtimeInvokeError) };
			}

			let runtimeReviewResponse: SchedulerReviewResponse | null = null;
			let runtimeParseError: unknown = null;
			try {
				runtimeReviewResponse = parseSchedulerReviewResponse(runtimeInvokeData);
			} catch (parseError) {
				runtimeParseError = parseError;
			}

			if (!runtimeReviewResponse) {
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
							operation: "review_submit",
							primaryPath: "runtime_edge",
							occurredAt: nowUtc,
							requestNowUtc: nowUtc,
							weightsVersion,
							schedulerInputs: {
								card_key: cardKey,
								vocabulary_card_id: card.vocabularyCardId ?? null,
								foundation_card_id: card.foundationCardId,
								rating,
								runtime_request: runtimeReviewRequestPayload,
							},
							runtimeOutput: serializeShadowOutput(
								{ invoke_response: runtimeInvokeData },
								runtimeParseError,
							),
							legacyOutput: serializeShadowOutput(null),
							diffSummary: {
								matches: false,
								reason:
									SHADOW_DIFF_REASON_CODES.RUNTIME_REVIEW_FALLBACK_BLOCKED_BY_SUNSET_GUARD,
								runtime_error: serializeShadowError(runtimeParseError),
							},
						});
					}

					return {
						ok: false,
						error: createServiceError(
							"RPC_ERROR",
							REVIEW_SUNSET_GUARD_BLOCKED_ERROR_MESSAGE,
							true,
						),
					};
				}

				const legacyFallbackResult = await submitViaLegacyRpc();

				if (shadowDiffContext.enabled && shadowDiffContext.userId) {
					const weightsVersion = await resolveActiveWeightsVersion(
						client,
						shadowDiffContext.userId,
					);

					await insertSchedulerShadowDiffEvent(client, {
						userId: shadowDiffContext.userId,
						operation: "review_submit",
						primaryPath: "legacy_sql",
						occurredAt: nowUtc,
						requestNowUtc: nowUtc,
						weightsVersion,
						schedulerInputs: {
							card_key: cardKey,
							vocabulary_card_id: card.vocabularyCardId ?? null,
							foundation_card_id: card.foundationCardId,
							rating,
							runtime_request: runtimeReviewRequestPayload,
						},
						runtimeOutput: serializeShadowOutput(
							{ invoke_response: runtimeInvokeData },
							runtimeParseError,
						),
						legacyOutput: serializeServiceResultForShadow(legacyFallbackResult),
						diffSummary: {
							matches: false,
							reason: SHADOW_DIFF_REASON_CODES.RUNTIME_REVIEW_INVALID_PAYLOAD,
							legacy_ok: legacyFallbackResult.ok,
							runtime_error: serializeShadowError(runtimeParseError),
						},
					});
				}

				return legacyFallbackResult;
			}

			if (shadowDiffContext.enabled && shadowDiffContext.userId) {
				const legacyShadowResult = await submitViaLegacyRpc({
					trackReviewLifecycle: false,
				});

				const weightsVersion = await resolveActiveWeightsVersion(
					client,
					shadowDiffContext.userId,
				);

				const diffSummary = legacyShadowResult.ok
					? summarizeReviewResultDiff(
							runtimeReviewResponse,
							legacyShadowResult.data,
						)
					: {
							matches: false,
							reason: SHADOW_DIFF_REASON_CODES.LEGACY_REVIEW_SHADOW_FAILED,
							legacy_error: legacyShadowResult.error,
						};

				await insertSchedulerShadowDiffEvent(client, {
					userId: shadowDiffContext.userId,
					operation: "review_submit",
					primaryPath: "runtime_edge",
					occurredAt: nowUtc,
					requestNowUtc: nowUtc,
					weightsVersion,
					schedulerInputs: {
						card_key: cardKey,
						vocabulary_card_id: card.vocabularyCardId ?? null,
						foundation_card_id: card.foundationCardId,
						rating,
						runtime_request: runtimeReviewRequestPayload,
					},
					runtimeOutput: serializeShadowOutput(runtimeReviewResponse),
					legacyOutput: serializeServiceResultForShadow(legacyShadowResult),
					diffSummary,
				});
			}

			markRecentReview(cardKey);
			clearClientReviewId(cardKey);
			emitPendingReviewsInvalidated();
			emitProfileInsightsRefresh();
			return { ok: true, data: runtimeReviewResponse };
		}

		return await submitViaLegacyRpc();
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	} finally {
		inFlightReviewKeys.delete(cardKey);
	}
}

export async function replayQueuedReviews(): Promise<ReviewReplayResult> {
	if (replayInProgress) {
		return replayInProgress;
	}

	replayInProgress = (async () => {
		const state = loadReviewQueueState();
		if (isBrowserOffline()) {
			return {
				processed: 0,
				succeeded: 0,
				dropped: 0,
				deferred: state.items.length,
				remaining: state.items.length,
			};
		}

		const client = resolveClient();
		const activeAccountKey = await resolveAccountKey(client);
		const accountItems = state.items.filter(
			(item) => item.accountKey === activeAccountKey,
		);
		const droppedForAccountMismatch = state.items.length - accountItems.length;

		const nowMs = Date.now();
		let processed = 0;
		let succeeded = 0;
		let dropped = droppedForAccountMismatch;
		let deferred = 0;

		const pendingItems: QueuedReviewItem[] = [];

		for (const item of accountItems) {
			if (item.nextRetryAt > nowMs) {
				pendingItems.push(item);
				deferred += 1;
				continue;
			}

			processed += 1;
			setClientReviewId(item.cardKey, item.clientReviewId);
			const result = await submitReviewNow(item.card, item.rating);
			if (result.ok) {
				succeeded += 1;
				continue;
			}

			if (result.error.code === "DUPLICATE_REVIEW" || !result.error.retryable) {
				dropped += 1;
				continue;
			}

			const nextAttempts = item.attempts + 1;
			if (nextAttempts >= MAX_REVIEW_REPLAY_ATTEMPTS) {
				dropped += 1;
				continue;
			}

			pendingItems.push({
				...item,
				attempts: nextAttempts,
				nextRetryAt: nowMs + resolveRetryDelay(nextAttempts),
			});
		}

		const nextState: ReviewQueueState = {
			lastSequence: state.lastSequence,
			items: pendingItems.sort(
				(a, b) => a.sequence - b.sequence || a.enqueuedAt - b.enqueuedAt,
			),
		};

		persistReviewQueueState(nextState);
		if (succeeded > 0) {
			emitPendingReviewsInvalidated();
		}
		return {
			processed,
			succeeded,
			dropped,
			deferred,
			remaining: nextState.items.length,
		};
	})();

	try {
		return await replayInProgress;
	} finally {
		replayInProgress = null;
	}
}

export function getQueuedReviewCount(): number {
	return loadReviewQueueState().items.length;
}

export function clearQueuedReviews(): void {
	persistReviewQueueState({ lastSequence: 0, items: [] });
}

export async function submitReviewForCard(
	card: VocabCard,
	rating: BinaryReviewRating,
	options: MutationOptions,
): Promise<ServiceResult<SubmitReviewSchedulerPayload | null>> {
	const { submitReviewForCard: submitReviewForCardFromDueService } =
		await import("@/services/deckPersoDueReviewService");

	return submitReviewForCardFromDueService(card, rating, options);
}

export const deckPersoDueReviewInternals = {
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
	shouldFallbackToLegacySubmitRpc,
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
} as const;

export async function logCardFlipEvent(
	args: {
		vocabularyCardId?: string | null;
		foundationCardId?: string | null;
	},
	options: MutationOptions,
): Promise<ServiceResult<void>> {
	const previewGuard = guardPreviewMode("Journaliser un flip", options?.mode);
	if (previewGuard) {
		return { ok: false, error: previewGuard };
	}
	if (!args.vocabularyCardId && !args.foundationCardId) {
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
	if (!client) {
		return { ok: false, error: CLIENT_UNAVAILABLE_ERROR };
	}

	try {
		const { error } = await logCardFlipV2(client, {
			p_vocabulary_card_id: args.vocabularyCardId ?? null,
			p_foundation_card_id: args.foundationCardId ?? null,
		});

		if (error) {
			return { ok: false, error: fromPostgrestError(error) };
		}

		return { ok: true, data: undefined };
	} catch (error) {
		return { ok: false, error: fromUnknownError(error) };
	}
}

function bootstrapReviewReplay(): void {
	if (typeof window === "undefined") {
		return;
	}
	ensureOnlineReplayListener();
	if (isBrowserOffline()) {
		return;
	}
	if (getQueuedReviewCount() === 0) {
		return;
	}
	void replayQueuedReviews();
}

bootstrapReviewReplay();

export type { SearchCardsV2Row };
