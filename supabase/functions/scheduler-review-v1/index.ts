import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import {
	createServiceClient,
	resolveRequestAuth,
} from "../_shared/edgeAuth.ts";
import { jsonResponse, optionsResponse } from "../_shared/httpSecurity.ts";

const CORS_OPTIONS = { methods: "POST, OPTIONS" };
const RUNTIME_SCHEMA_VERSION = 1;

const DEFAULT_SCHEDULER_TIMEZONE = "UTC";
const DEFAULT_SCHEDULER_DAY_CUTOFF_HOUR = 4;
const DEFAULT_FSRS_TARGET_RETENTION = 0.9;
const DEFAULT_ACTIVE_WEIGHTS_VERSION = 1;
const TRUTHY_ENV_VALUES = new Set(["1", "true", "yes", "on"]);
const COMPUTE_BODY_OVERRIDE_ENV = "SCHEDULER_ALLOW_BODY_COMPUTE_URL_OVERRIDE";

const DEFAULT_FSRS_STATE = 0;
const DEFAULT_FSRS_STABILITY = 0.4026;
const DEFAULT_FSRS_DIFFICULTY = 5;

type JsonRecord = Record<string, unknown>;

type ReviewRating = "fail" | "pass";

const REVIEW_BINARY_QUALITY_BY_RATING: Record<ReviewRating, 1 | 3> = {
	fail: 1,
	pass: 3,
};
const REVIEW_ADAPTER_CONTRACT_RESPONSE_KEYS = [
	"schema_version",
	"now_utc",
	"commit_payload",
] as const;
const REVIEW_ADAPTER_COMMIT_PAYLOAD_KEYS = [
	"vocabulary_card_id",
	"foundation_card_id",
	"review_session_id",
	"client_review_id",
	"quality",
	"reviewed_at",
	"status",
	"interval_days",
	"due_at",
	"fsrs_state",
	"fsrs_stability",
	"fsrs_difficulty",
	"fsrs_elapsed_days",
	"fsrs_scheduled_days",
	"fsrs_weights_version",
	"expected_last_reviewed_at",
] as const;

type ValidatedRequestBody = {
	schema_version: 1;
	now_utc: string;
	foundation_card_id: string;
	review_event: {
		review_session_id: string;
		client_review_id: string;
		rating: ReviewRating;
	};
	compute_base_url: string | null;
};

type SchedulerConfig = {
	scheduler_timezone: string;
	scheduler_day_cutoff_hour: number;
	fsrs_target_retention: number;
	active_weights_version: number;
};

type RuntimeCardState = {
	source: "foundation";
	vocabulary_card_id: string | null;
	foundation_card_id: string;
	status: "new" | "learning" | "review" | "mastered";
	next_review_at: string | null;
	source_type: string;
	scheduling_algorithm: "fsrs";
	interval_days: number;
	repetitions: number;
	lapses: number;
	last_reviewed_at: string | null;
	fsrs_state: number;
	fsrs_stability: number;
	fsrs_difficulty: number;
	fsrs_elapsed_days: number;
	fsrs_scheduled_days: number;
	fsrs_due_at: string | null;
	fsrs_last_reviewed_at: string | null;
	expected_last_reviewed_at: string | null;
};

type ReviewComputeRequest = {
	schema_version: number;
	now_utc: string;
	scheduler_config: SchedulerConfig;
	card_state: RuntimeCardState;
	review_event: {
		review_session_id: string;
		client_review_id: string;
		rating: ReviewRating;
	};
};

type ReviewAdapterContractRequest = {
	now_utc: string;
	scheduler_config: SchedulerConfig;
	card_state: RuntimeCardState;
	review_event: {
		review_session_id: string;
		client_review_id: string;
		rating: ReviewRating;
	};
};

type ReviewCommitPayload = {
	vocabulary_card_id: string | null;
	foundation_card_id: string | null;
	review_session_id: string;
	client_review_id: string;
	quality: 1 | 3;
	reviewed_at: string;
	status: "learning" | "review" | "mastered";
	interval_days: number;
	due_at: string;
	fsrs_state: number;
	fsrs_stability: number;
	fsrs_difficulty: number;
	fsrs_elapsed_days: number;
	fsrs_scheduled_days: number;
	fsrs_weights_version: number;
	expected_last_reviewed_at: string | null;
};

type ReviewComputeResponse = {
	schema_version: number;
	now_utc: string;
	commit_payload: ReviewCommitPayload;
};

type ReviewAdapterContractResponse = {
	schema_version: number;
	now_utc: string;
	commit_payload: ReviewCommitPayload;
};

type ProfileRow = {
	scheduler_timezone: unknown;
	scheduler_day_cutoff_hour: unknown;
	fsrs_target_retention: unknown;
};

type ActiveWeightsRow = {
	active_weights_version: unknown;
};

type UserCardStateRow = {
	vocabulary_card_id: unknown;
	foundation_card_id: unknown;
	status: unknown;
	next_review_at: unknown;
	source_type: unknown;
	scheduling_algorithm: unknown;
	interval_days: unknown;
	repetitions: unknown;
	lapses: unknown;
	last_reviewed_at: unknown;
	fsrs_state: unknown;
	fsrs_stability: unknown;
	fsrs_difficulty: unknown;
	fsrs_elapsed_days: unknown;
	fsrs_scheduled_days: unknown;
	fsrs_due_at: unknown;
	fsrs_last_reviewed_at: unknown;
};

type CommitRpcRow = {
	status: unknown;
	interval_days: unknown;
	ease_factor: unknown;
	repetitions: unknown;
	lapses: unknown;
	next_review_at: unknown;
	last_reviewed_at: unknown;
};

type FrontendReviewResponse = {
	schema_version: number;
	now_utc: string;
	status: string;
	interval_days: number;
	ease_factor: number;
	repetitions: number;
	lapses: number;
	next_review_at: string | null;
	last_reviewed_at: string | null;
};

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isJsonRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactlyKeys(
	record: JsonRecord,
	requiredKeys: readonly string[],
): boolean {
	const recordKeys = Object.keys(record);
	if (recordKeys.length !== requiredKeys.length) {
		return false;
	}

	for (const requiredKey of requiredKeys) {
		if (!(requiredKey in record)) {
			return false;
		}
	}

	return true;
}

function asFiniteNumber(value: unknown): number | null {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function asIntegerWithBounds(
	value: unknown,
	minimum: number,
	maximum: number,
): number | null {
	const parsed = asFiniteNumber(value);
	if (parsed === null) {
		return null;
	}

	if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
		return null;
	}

	return parsed;
}

function isValidIsoDateTime(value: unknown): value is string {
	if (typeof value !== "string" || value.trim().length === 0) {
		return false;
	}

	return Number.isFinite(Date.parse(value));
}

function parseEnvBoolean(value: string | undefined): boolean {
	if (!value) {
		return false;
	}

	return TRUTHY_ENV_VALUES.has(value.trim().toLowerCase());
}

function isProductionRuntime(): boolean {
	const appEnv = Deno.env.get("APP_ENV")?.trim().toLowerCase() ?? "";
	const nodeEnv = Deno.env.get("NODE_ENV")?.trim().toLowerCase() ?? "";
	if (
		appEnv === "production" ||
		nodeEnv === "production" ||
		appEnv === "prod" ||
		nodeEnv === "prod"
	) {
		return true;
	}

	const deploymentId = Deno.env.get("DENO_DEPLOYMENT_ID")?.trim() ?? "";
	return deploymentId.length > 0;
}

function allowBodyComputeBaseUrlOverride(): boolean {
	if (isProductionRuntime()) {
		return false;
	}

	const rawOverrideFlag = Deno.env.get(COMPUTE_BODY_OVERRIDE_ENV);
	if (rawOverrideFlag === undefined) {
		// Non-production default keeps local scheduler harnesses working.
		return true;
	}

	// Non-production only: explicit local/dev escape hatch control.
	return parseEnvBoolean(rawOverrideFlag);
}

function isUuid(value: unknown): value is string {
	return typeof value === "string" && UUID_PATTERN.test(value);
}

function asIsoDateTimeOrNull(value: unknown): string | null {
	return isValidIsoDateTime(value) ? value : null;
}

function asStatus(value: unknown): RuntimeCardState["status"] {
	if (
		value === "new" ||
		value === "learning" ||
		value === "review" ||
		value === "mastered"
	) {
		return value;
	}

	return "new";
}

function asCommitStatus(value: unknown): ReviewCommitPayload["status"] | null {
	if (value === "learning" || value === "review" || value === "mastered") {
		return value;
	}

	return null;
}

function asRating(value: unknown): ReviewRating | null {
	if (value === "fail" || value === "pass") {
		return value;
	}

	return null;
}

function expectedQualityForBinaryRating(rating: ReviewRating): 1 | 3 {
	return REVIEW_BINARY_QUALITY_BY_RATING[rating];
}

function toComputeBaseUrl(rawValue: string): string | null {
	try {
		const parsedUrl = new URL(rawValue);
		if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
			return null;
		}

		const normalizedPath = parsedUrl.pathname.replace(/\/+$/, "");
		return normalizedPath.length > 0
			? `${parsedUrl.origin}${normalizedPath}`
			: parsedUrl.origin;
	} catch {
		return null;
	}
}

function resolveComputeBaseUrl(
	bodyComputeBaseUrl: string | null,
): string | null {
	const envComputeBaseUrl = Deno.env.get("SCHEDULER_COMPUTE_URL")?.trim() ?? "";
	if (envComputeBaseUrl.length > 0) {
		return toComputeBaseUrl(envComputeBaseUrl);
	}

	if (!bodyComputeBaseUrl) {
		return null;
	}

	if (!allowBodyComputeBaseUrlOverride()) {
		return null;
	}

	return toComputeBaseUrl(bodyComputeBaseUrl);
}

function normalizeSchedulerTimezone(value: unknown): string {
	if (typeof value !== "string") {
		return DEFAULT_SCHEDULER_TIMEZONE;
	}

	const normalized = value.trim();
	return normalized.length > 0 ? normalized : DEFAULT_SCHEDULER_TIMEZONE;
}

function normalizeSchedulerDayCutoffHour(value: unknown): number {
	const parsed = asIntegerWithBounds(value, 0, 23);
	return parsed ?? DEFAULT_SCHEDULER_DAY_CUTOFF_HOUR;
}

function normalizeFsrsTargetRetention(value: unknown): number {
	const parsed = asFiniteNumber(value);
	if (parsed === null) {
		return DEFAULT_FSRS_TARGET_RETENTION;
	}

	return Math.min(0.97, Math.max(0.7, parsed));
}

function normalizeActiveWeightsVersion(value: unknown): number {
	const parsed = asIntegerWithBounds(value, 1, Number.MAX_SAFE_INTEGER);
	return parsed ?? DEFAULT_ACTIVE_WEIGHTS_VERSION;
}

function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
	const parsed = asIntegerWithBounds(value, 0, Number.MAX_SAFE_INTEGER);
	return parsed ?? fallback;
}

function normalizeFsrsState(value: unknown): number {
	const parsed = asIntegerWithBounds(value, 0, 3);
	return parsed ?? DEFAULT_FSRS_STATE;
}

function normalizeFsrsStability(value: unknown): number {
	const parsed = asFiniteNumber(value);
	if (parsed === null || parsed < 0) {
		return DEFAULT_FSRS_STABILITY;
	}

	return parsed;
}

function normalizeFsrsDifficulty(value: unknown): number {
	const parsed = asFiniteNumber(value);
	if (parsed === null) {
		return DEFAULT_FSRS_DIFFICULTY;
	}

	return Math.min(10, Math.max(1, parsed));
}

function validateRequestBody(
	body: unknown,
):
	| { ok: true; value: ValidatedRequestBody }
	| { ok: false; responseBody: JsonRecord } {
	if (!isJsonRecord(body)) {
		return {
			ok: false,
			responseBody: {
				error: "Invalid request body",
				code: "INVALID_BODY",
			},
		};
	}

	const schemaVersion = asIntegerWithBounds(body.schema_version, 1, 1);
	if (schemaVersion !== RUNTIME_SCHEMA_VERSION) {
		return {
			ok: false,
			responseBody: {
				error: "Unsupported schema_version",
				code: "UNSUPPORTED_SCHEMA_VERSION",
			},
		};
	}

	if (!isValidIsoDateTime(body.now_utc)) {
		return {
			ok: false,
			responseBody: {
				error: "now_utc must be a valid ISO-8601 datetime",
				code: "INVALID_NOW_UTC",
			},
		};
	}

	if (!isUuid(body.foundation_card_id)) {
		return {
			ok: false,
			responseBody: {
				error: "foundation_card_id must be a valid UUID",
				code: "INVALID_FOUNDATION_CARD_ID",
			},
		};
	}

	if (!isJsonRecord(body.review_event)) {
		return {
			ok: false,
			responseBody: {
				error: "review_event must be an object",
				code: "INVALID_REVIEW_EVENT",
			},
		};
	}

	if (!isUuid(body.review_event.review_session_id)) {
		return {
			ok: false,
			responseBody: {
				error: "review_event.review_session_id must be a valid UUID",
				code: "INVALID_REVIEW_SESSION_ID",
			},
		};
	}

	if (!isUuid(body.review_event.client_review_id)) {
		return {
			ok: false,
			responseBody: {
				error: "review_event.client_review_id must be a valid UUID",
				code: "INVALID_CLIENT_REVIEW_ID",
			},
		};
	}

	const rating = asRating(body.review_event.rating);
	if (!rating) {
		return {
			ok: false,
			responseBody: {
				error: "review_event.rating must be one of fail or pass",
				code: "INVALID_REVIEW_RATING",
			},
		};
	}

	const computeBaseUrl =
		typeof body.compute_base_url === "string" &&
		body.compute_base_url.trim().length > 0
			? body.compute_base_url.trim()
			: null;

	return {
		ok: true,
		value: {
			schema_version: schemaVersion,
			now_utc: body.now_utc,
			foundation_card_id: body.foundation_card_id,
			review_event: {
				review_session_id: body.review_event.review_session_id,
				client_review_id: body.review_event.client_review_id,
				rating,
			},
			compute_base_url: computeBaseUrl,
		},
	};
}

function buildRuntimeCardState(
	requestBody: ValidatedRequestBody,
	cardRow: UserCardStateRow | null,
): RuntimeCardState {
	if (!cardRow) {
		return {
			source: "foundation",
			vocabulary_card_id: null,
			foundation_card_id: requestBody.foundation_card_id,
			status: "new",
			next_review_at: null,
			source_type: "foundation",
			scheduling_algorithm: "fsrs",
			interval_days: 0,
			repetitions: 0,
			lapses: 0,
			last_reviewed_at: null,
			fsrs_state: DEFAULT_FSRS_STATE,
			fsrs_stability: DEFAULT_FSRS_STABILITY,
			fsrs_difficulty: DEFAULT_FSRS_DIFFICULTY,
			fsrs_elapsed_days: 0,
			fsrs_scheduled_days: 0,
			fsrs_due_at: null,
			fsrs_last_reviewed_at: null,
			expected_last_reviewed_at: null,
		};
	}

	const intervalDays = normalizeNonNegativeInteger(cardRow.interval_days, 0);
	const lastReviewedAt = asIsoDateTimeOrNull(cardRow.last_reviewed_at);
	const fsrsLastReviewedAt = asIsoDateTimeOrNull(cardRow.fsrs_last_reviewed_at);
	const expectedLastReviewedAt = fsrsLastReviewedAt ?? lastReviewedAt;

	const vocabularyCardId =
		typeof cardRow.vocabulary_card_id === "string" &&
		UUID_PATTERN.test(cardRow.vocabulary_card_id)
			? cardRow.vocabulary_card_id
			: null;

	return {
		source: "foundation",
		vocabulary_card_id: vocabularyCardId,
		foundation_card_id: requestBody.foundation_card_id,
		status: asStatus(cardRow.status),
		next_review_at: asIsoDateTimeOrNull(cardRow.next_review_at),
		source_type:
			typeof cardRow.source_type === "string" &&
			cardRow.source_type.trim().length > 0
				? cardRow.source_type
				: "foundation",
		scheduling_algorithm: "fsrs",
		interval_days: intervalDays,
		repetitions: normalizeNonNegativeInteger(cardRow.repetitions, 0),
		lapses: normalizeNonNegativeInteger(cardRow.lapses, 0),
		last_reviewed_at: lastReviewedAt,
		fsrs_state: normalizeFsrsState(cardRow.fsrs_state),
		fsrs_stability: normalizeFsrsStability(cardRow.fsrs_stability),
		fsrs_difficulty: normalizeFsrsDifficulty(cardRow.fsrs_difficulty),
		fsrs_elapsed_days: normalizeNonNegativeInteger(
			cardRow.fsrs_elapsed_days,
			0,
		),
		fsrs_scheduled_days: normalizeNonNegativeInteger(
			cardRow.fsrs_scheduled_days,
			intervalDays,
		),
		fsrs_due_at:
			asIsoDateTimeOrNull(cardRow.fsrs_due_at) ??
			asIsoDateTimeOrNull(cardRow.next_review_at),
		fsrs_last_reviewed_at: fsrsLastReviewedAt,
		expected_last_reviewed_at: expectedLastReviewedAt,
	};
}

function buildReviewAdapterContractRequest(
	requestBody: ValidatedRequestBody,
	schedulerConfig: SchedulerConfig,
	runtimeCardState: RuntimeCardState,
): ReviewAdapterContractRequest {
	return {
		now_utc: requestBody.now_utc,
		scheduler_config: schedulerConfig,
		card_state: runtimeCardState,
		review_event: {
			review_session_id: requestBody.review_event.review_session_id,
			client_review_id: requestBody.review_event.client_review_id,
			rating: requestBody.review_event.rating,
		},
	};
}

function mapReviewAdapterContractRequestToComputeRequest(
	adapterRequest: ReviewAdapterContractRequest,
	schemaVersion: number,
): ReviewComputeRequest {
	return {
		schema_version: schemaVersion,
		now_utc: adapterRequest.now_utc,
		scheduler_config: adapterRequest.scheduler_config,
		card_state: adapterRequest.card_state,
		review_event: adapterRequest.review_event,
	};
}

function parseReviewCommitPayload(value: unknown): ReviewCommitPayload | null {
	if (!isJsonRecord(value)) {
		return null;
	}

	if (!hasExactlyKeys(value, REVIEW_ADAPTER_COMMIT_PAYLOAD_KEYS)) {
		return null;
	}

	const vocabularyCardId = value.vocabulary_card_id;
	const foundationCardId = value.foundation_card_id;
	const normalizedVocabularyCardId =
		vocabularyCardId === null
			? null
			: isUuid(vocabularyCardId)
				? vocabularyCardId
				: null;
	const normalizedFoundationCardId =
		foundationCardId === null
			? null
			: isUuid(foundationCardId)
				? foundationCardId
				: null;

	if (
		(normalizedVocabularyCardId === null &&
			normalizedFoundationCardId === null) ||
		(normalizedVocabularyCardId !== null && normalizedFoundationCardId !== null)
	) {
		return null;
	}

	if (!isUuid(value.review_session_id) || !isUuid(value.client_review_id)) {
		return null;
	}

	const quality = asIntegerWithBounds(value.quality, 1, 3);
	if (quality !== 1 && quality !== 3) {
		return null;
	}

	if (
		!isValidIsoDateTime(value.reviewed_at) ||
		!isValidIsoDateTime(value.due_at)
	) {
		return null;
	}

	const status = asCommitStatus(value.status);
	if (!status) {
		return null;
	}

	const intervalDays = asIntegerWithBounds(
		value.interval_days,
		0,
		Number.MAX_SAFE_INTEGER,
	);
	const fsrsState = asIntegerWithBounds(value.fsrs_state, 0, 3);
	const fsrsStability = asFiniteNumber(value.fsrs_stability);
	const fsrsDifficulty = asFiniteNumber(value.fsrs_difficulty);
	const fsrsElapsedDays = asIntegerWithBounds(
		value.fsrs_elapsed_days,
		0,
		Number.MAX_SAFE_INTEGER,
	);
	const fsrsScheduledDays = asIntegerWithBounds(
		value.fsrs_scheduled_days,
		0,
		Number.MAX_SAFE_INTEGER,
	);
	const fsrsWeightsVersion = asIntegerWithBounds(
		value.fsrs_weights_version,
		1,
		Number.MAX_SAFE_INTEGER,
	);

	if (
		intervalDays === null ||
		fsrsState === null ||
		fsrsStability === null ||
		fsrsStability < 0 ||
		fsrsDifficulty === null ||
		fsrsDifficulty < 1 ||
		fsrsDifficulty > 10 ||
		fsrsElapsedDays === null ||
		fsrsScheduledDays === null ||
		fsrsWeightsVersion === null
	) {
		return null;
	}

	if (intervalDays !== fsrsScheduledDays) {
		return null;
	}

	if (status === "learning" && intervalDays !== 0) {
		return null;
	}

	if ((status === "review" || status === "mastered") && intervalDays < 1) {
		return null;
	}

	const expectedLastReviewedAt =
		value.expected_last_reviewed_at === null
			? null
			: isValidIsoDateTime(value.expected_last_reviewed_at)
				? value.expected_last_reviewed_at
				: null;

	if (
		value.expected_last_reviewed_at !== null &&
		expectedLastReviewedAt === null
	) {
		return null;
	}

	return {
		vocabulary_card_id: normalizedVocabularyCardId,
		foundation_card_id: normalizedFoundationCardId,
		review_session_id: value.review_session_id,
		client_review_id: value.client_review_id,
		quality,
		reviewed_at: value.reviewed_at,
		status,
		interval_days: intervalDays,
		due_at: value.due_at,
		fsrs_state: fsrsState,
		fsrs_stability: fsrsStability,
		fsrs_difficulty: fsrsDifficulty,
		fsrs_elapsed_days: fsrsElapsedDays,
		fsrs_scheduled_days: fsrsScheduledDays,
		fsrs_weights_version: fsrsWeightsVersion,
		expected_last_reviewed_at: expectedLastReviewedAt,
	};
}

function parseReviewAdapterContractResponse(
	value: unknown,
): ReviewAdapterContractResponse | null {
	if (!isJsonRecord(value)) {
		return null;
	}

	if (!hasExactlyKeys(value, REVIEW_ADAPTER_CONTRACT_RESPONSE_KEYS)) {
		return null;
	}

	const schemaVersion = asIntegerWithBounds(value.schema_version, 1, 1);
	if (schemaVersion !== RUNTIME_SCHEMA_VERSION) {
		return null;
	}

	if (!isValidIsoDateTime(value.now_utc)) {
		return null;
	}

	const commitPayload = parseReviewCommitPayload(value.commit_payload);
	if (!commitPayload) {
		return null;
	}

	return {
		schema_version: schemaVersion,
		now_utc: value.now_utc,
		commit_payload: commitPayload,
	};
}

function mapReviewAdapterContractResponseToComputeEnvelope(
	adapterResponse: ReviewAdapterContractResponse,
): ReviewComputeResponse {
	return {
		schema_version: adapterResponse.schema_version,
		now_utc: adapterResponse.now_utc,
		commit_payload: adapterResponse.commit_payload,
	};
}

function extractCommitRpcRow(data: unknown): CommitRpcRow | null {
	const candidate = Array.isArray(data) ? data[0] : data;
	if (!isJsonRecord(candidate)) {
		return null;
	}

	if (
		!("status" in candidate) ||
		!("interval_days" in candidate) ||
		!("ease_factor" in candidate) ||
		!("repetitions" in candidate) ||
		!("lapses" in candidate) ||
		!("next_review_at" in candidate) ||
		!("last_reviewed_at" in candidate)
	) {
		return null;
	}

	return candidate as CommitRpcRow;
}

function parseCommitRpcResponse(
	row: CommitRpcRow,
	nowUtc: string,
): FrontendReviewResponse | null {
	const status = typeof row.status === "string" ? row.status : null;
	const intervalDays = asIntegerWithBounds(
		row.interval_days,
		0,
		Number.MAX_SAFE_INTEGER,
	);
	const easeFactor = asFiniteNumber(row.ease_factor);
	const repetitions = asIntegerWithBounds(
		row.repetitions,
		0,
		Number.MAX_SAFE_INTEGER,
	);
	const lapses = asIntegerWithBounds(row.lapses, 0, Number.MAX_SAFE_INTEGER);

	if (
		status === null ||
		intervalDays === null ||
		easeFactor === null ||
		repetitions === null ||
		lapses === null
	) {
		return null;
	}

	const nextReviewAt =
		row.next_review_at === null
			? null
			: isValidIsoDateTime(row.next_review_at)
				? row.next_review_at
				: null;

	const lastReviewedAt =
		row.last_reviewed_at === null
			? null
			: isValidIsoDateTime(row.last_reviewed_at)
				? row.last_reviewed_at
				: null;

	if (row.next_review_at !== null && nextReviewAt === null) {
		return null;
	}

	if (row.last_reviewed_at !== null && lastReviewedAt === null) {
		return null;
	}

	return {
		schema_version: RUNTIME_SCHEMA_VERSION,
		now_utc: nowUtc,
		status,
		interval_days: intervalDays,
		ease_factor: easeFactor,
		repetitions,
		lapses,
		next_review_at: nextReviewAt,
		last_reviewed_at: lastReviewedAt,
	};
}

function mapCommitErrorToStatus(message: string): number {
	const uppercaseMessage = message.toUpperCase();
	if (
		uppercaseMessage.includes("CARD_STATE_STALE") ||
		uppercaseMessage.includes("ACTIVE_REVIEW_SESSION_LOCKED") ||
		uppercaseMessage.includes("CLIENT_REVIEW_ID_CARD_MISMATCH")
	) {
		return 409;
	}

	return 500;
}

serve(async (req) => {
	if (req.method === "OPTIONS") {
		return optionsResponse(req, CORS_OPTIONS);
	}

	if (req.method !== "POST") {
		return jsonResponse(
			req,
			{ error: "Method not allowed" },
			405,
			CORS_OPTIONS,
		);
	}

	let parsedBody: unknown;
	try {
		parsedBody = await req.json();
	} catch {
		return jsonResponse(
			req,
			{
				error: "Request body must be valid JSON",
				code: "INVALID_JSON",
			},
			400,
			CORS_OPTIONS,
		);
	}

	const validationResult = validateRequestBody(parsedBody);
	if (!validationResult.ok) {
		return jsonResponse(req, validationResult.responseBody, 400, CORS_OPTIONS);
	}
	const requestBody = validationResult.value;

	const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
	const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim() ?? "";
	if (!supabaseUrl || !supabaseAnonKey) {
		return jsonResponse(
			req,
			{
				error: "Supabase environment is not configured",
				code: "MISSING_SUPABASE_ENV",
			},
			500,
			CORS_OPTIONS,
		);
	}

	const computeBaseUrl = resolveComputeBaseUrl(requestBody.compute_base_url);
	if (!computeBaseUrl) {
		return jsonResponse(
			req,
			{
				error: "Scheduler compute endpoint is not configured",
				code: "MISSING_SCHEDULER_COMPUTE_URL",
			},
			500,
			CORS_OPTIONS,
		);
	}

	const supabaseAdmin = createServiceClient();
	const auth = await resolveRequestAuth(req, supabaseAdmin);
	if (!auth.isAuthenticated || !auth.user || !auth.token) {
		return jsonResponse(
			req,
			{ error: "Authentication failed" },
			401,
			CORS_OPTIONS,
		);
	}

	const authenticatedUserId = auth.user.id;

	const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
			detectSessionInUrl: false,
		},
		global: {
			headers: {
				Authorization: `Bearer ${auth.token}`,
			},
		},
	});

	const profileResult = await supabaseUserClient
		.from("profiles")
		.select(
			"scheduler_timezone,scheduler_day_cutoff_hour,fsrs_target_retention",
		)
		.eq("user_id", authenticatedUserId)
		.maybeSingle();

	if (profileResult.error) {
		console.error("profiles lookup failed", {
			message: profileResult.error.message,
			details: profileResult.error.details,
			hint: profileResult.error.hint,
			code: profileResult.error.code,
		});
		return jsonResponse(
			req,
			{
				error: "Unable to load scheduler profile",
				code: "PROFILE_LOOKUP_FAILED",
			},
			500,
			CORS_OPTIONS,
		);
	}

	const activeWeightsResult = await supabaseUserClient
		.from("user_fsrs_active_weights")
		.select("active_weights_version")
		.eq("user_id", authenticatedUserId)
		.maybeSingle();

	if (activeWeightsResult.error) {
		console.error("user_fsrs_active_weights lookup failed", {
			message: activeWeightsResult.error.message,
			details: activeWeightsResult.error.details,
			hint: activeWeightsResult.error.hint,
			code: activeWeightsResult.error.code,
		});
		return jsonResponse(
			req,
			{
				error: "Unable to load active FSRS weights",
				code: "ACTIVE_WEIGHTS_LOOKUP_FAILED",
			},
			500,
			CORS_OPTIONS,
		);
	}

	const cardStateResult = await supabaseUserClient
		.from("user_card_state")
		.select(
			"vocabulary_card_id,foundation_card_id,status,next_review_at,source_type,scheduling_algorithm,interval_days,repetitions,lapses,last_reviewed_at,fsrs_state,fsrs_stability,fsrs_difficulty,fsrs_elapsed_days,fsrs_scheduled_days,fsrs_due_at,fsrs_last_reviewed_at",
		)
		.eq("user_id", authenticatedUserId)
		.eq("foundation_card_id", requestBody.foundation_card_id)
		.maybeSingle();

	if (cardStateResult.error) {
		console.error("user_card_state lookup failed", {
			message: cardStateResult.error.message,
			details: cardStateResult.error.details,
			hint: cardStateResult.error.hint,
			code: cardStateResult.error.code,
		});
		return jsonResponse(
			req,
			{
				error: "Unable to load card state",
				code: "CARD_STATE_LOOKUP_FAILED",
			},
			500,
			CORS_OPTIONS,
		);
	}

	const profileRow = isJsonRecord(profileResult.data)
		? (profileResult.data as ProfileRow)
		: null;
	const activeWeightsRow = isJsonRecord(activeWeightsResult.data)
		? (activeWeightsResult.data as ActiveWeightsRow)
		: null;
	const cardStateRow = isJsonRecord(cardStateResult.data)
		? (cardStateResult.data as UserCardStateRow)
		: null;

	const schedulerConfig: SchedulerConfig = {
		scheduler_timezone: normalizeSchedulerTimezone(
			profileRow?.scheduler_timezone,
		),
		scheduler_day_cutoff_hour: normalizeSchedulerDayCutoffHour(
			profileRow?.scheduler_day_cutoff_hour,
		),
		fsrs_target_retention: normalizeFsrsTargetRetention(
			profileRow?.fsrs_target_retention,
		),
		active_weights_version: normalizeActiveWeightsVersion(
			activeWeightsRow?.active_weights_version,
		),
	};

	const runtimeCardState = buildRuntimeCardState(requestBody, cardStateRow);
	const reviewAdapterContractRequest = buildReviewAdapterContractRequest(
		requestBody,
		schedulerConfig,
		runtimeCardState,
	);
	const reviewComputeRequest = mapReviewAdapterContractRequestToComputeRequest(
		reviewAdapterContractRequest,
		requestBody.schema_version,
	);

	let computeHttpResponse: Response;
	try {
		computeHttpResponse = await fetch(`${computeBaseUrl}/v1/review`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(reviewComputeRequest),
		});
	} catch (error) {
		console.error("scheduler compute review request failed", error);
		return jsonResponse(
			req,
			{
				error: "Scheduler compute service is unavailable",
				code: "SCHEDULER_COMPUTE_UNAVAILABLE",
			},
			502,
			CORS_OPTIONS,
		);
	}

	if (!computeHttpResponse.ok) {
		const rawBody = await computeHttpResponse.text();
		const upstreamStatus = computeHttpResponse.status;
		const mappedStatus = upstreamStatus === 409 ? 409 : 502;
		return jsonResponse(
			req,
			{
				error: "Scheduler compute service rejected request",
				code: "SCHEDULER_COMPUTE_REJECTED",
				status: upstreamStatus,
				details: rawBody.slice(0, 500),
			},
			mappedStatus,
			CORS_OPTIONS,
		);
	}

	let computeJson: unknown;
	try {
		computeJson = await computeHttpResponse.json();
	} catch {
		return jsonResponse(
			req,
			{
				error: "Scheduler compute response is not valid JSON",
				code: "INVALID_COMPUTE_RESPONSE_JSON",
			},
			502,
			CORS_OPTIONS,
		);
	}

	const reviewAdapterContractResponse =
		parseReviewAdapterContractResponse(computeJson);
	if (!reviewAdapterContractResponse) {
		return jsonResponse(
			req,
			{
				error: "Scheduler compute response shape is invalid",
				code: "INVALID_COMPUTE_RESPONSE_SHAPE",
			},
			502,
			CORS_OPTIONS,
		);
	}
	const reviewComputeResponse =
		mapReviewAdapterContractResponseToComputeEnvelope(
			reviewAdapterContractResponse,
		);

	if (
		reviewComputeResponse.schema_version !== requestBody.schema_version ||
		reviewComputeResponse.now_utc !== requestBody.now_utc
	) {
		return jsonResponse(
			req,
			{
				error:
					"Scheduler compute response did not preserve schema_version/now_utc",
				code: "COMPUTE_BOUNDARY_MISMATCH",
			},
			502,
			CORS_OPTIONS,
		);
	}

	const commitPayload = reviewComputeResponse.commit_payload;
	if (commitPayload.foundation_card_id !== requestBody.foundation_card_id) {
		return jsonResponse(
			req,
			{
				error:
					"Scheduler compute response did not preserve requested foundation_card_id",
				code: "COMPUTE_CARD_MISMATCH",
			},
			502,
			CORS_OPTIONS,
		);
	}

	if (
		commitPayload.review_session_id !==
			requestBody.review_event.review_session_id ||
		commitPayload.client_review_id !== requestBody.review_event.client_review_id
	) {
		return jsonResponse(
			req,
			{
				error:
					"Scheduler compute response did not preserve review_event identifiers",
				code: "COMPUTE_REVIEW_EVENT_MISMATCH",
			},
			502,
			CORS_OPTIONS,
		);
	}

	const expectedQuality = expectedQualityForBinaryRating(
		requestBody.review_event.rating,
	);
	if (commitPayload.quality !== expectedQuality) {
		return jsonResponse(
			req,
			{
				error:
					"Scheduler compute response did not preserve binary fail/pass quality mapping",
				code: "COMPUTE_RATING_MAPPING_MISMATCH",
			},
			502,
			CORS_OPTIONS,
		);
	}

	if (
		commitPayload.fsrs_weights_version !==
		schedulerConfig.active_weights_version
	) {
		return jsonResponse(
			req,
			{
				error:
					"Scheduler compute response did not preserve fsrs_weights_version",
				code: "COMPUTE_WEIGHTS_VERSION_MISMATCH",
			},
			502,
			CORS_OPTIONS,
		);
	}

	const pinnedFsrsWeightsVersion = schedulerConfig.active_weights_version;

	const commitResult = await supabaseUserClient.rpc("commit_review_fsrs_v1", {
		p_vocabulary_card_id: commitPayload.vocabulary_card_id,
		p_foundation_card_id: commitPayload.foundation_card_id,
		p_review_session_id: commitPayload.review_session_id,
		p_client_review_id: commitPayload.client_review_id,
		p_quality: commitPayload.quality,
		p_reviewed_at: commitPayload.reviewed_at,
		p_status: commitPayload.status,
		p_interval_days: commitPayload.interval_days,
		p_due_at: commitPayload.due_at,
		p_fsrs_state: commitPayload.fsrs_state,
		p_fsrs_stability: commitPayload.fsrs_stability,
		p_fsrs_difficulty: commitPayload.fsrs_difficulty,
		p_fsrs_elapsed_days: commitPayload.fsrs_elapsed_days,
		p_fsrs_scheduled_days: commitPayload.fsrs_scheduled_days,
		p_fsrs_weights_version: pinnedFsrsWeightsVersion,
		p_expected_last_reviewed_at: commitPayload.expected_last_reviewed_at,
	});

	if (commitResult.error) {
		console.error("commit_review_fsrs_v1 failed", {
			message: commitResult.error.message,
			details: commitResult.error.details,
			hint: commitResult.error.hint,
			code: commitResult.error.code,
		});

		const httpStatus = mapCommitErrorToStatus(
			`${commitResult.error.message ?? ""} ${commitResult.error.details ?? ""}`,
		);

		return jsonResponse(
			req,
			{
				error: "Unable to commit scheduler review",
				code: "COMMIT_REVIEW_FAILED",
				details:
					`${commitResult.error.message ?? ""} ${commitResult.error.details ?? ""}`
						.trim()
						.slice(0, 500),
			},
			httpStatus,
			CORS_OPTIONS,
		);
	}

	const commitRpcRow = extractCommitRpcRow(commitResult.data);
	if (!commitRpcRow) {
		return jsonResponse(
			req,
			{
				error: "Commit RPC response shape is invalid",
				code: "INVALID_COMMIT_RESPONSE",
			},
			500,
			CORS_OPTIONS,
		);
	}

	const frontendReviewResponse = parseCommitRpcResponse(
		commitRpcRow,
		requestBody.now_utc,
	);
	if (!frontendReviewResponse) {
		return jsonResponse(
			req,
			{
				error: "Commit RPC values are invalid",
				code: "INVALID_COMMIT_VALUES",
			},
			500,
			CORS_OPTIONS,
		);
	}

	return jsonResponse(req, frontendReviewResponse, 200, CORS_OPTIONS);
});
