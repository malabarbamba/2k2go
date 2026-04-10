import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import {
	createServiceClient,
	resolveRequestAuth,
} from "../_shared/edgeAuth.ts";
import { jsonResponse, optionsResponse } from "../_shared/httpSecurity.ts";

const CORS_OPTIONS = { methods: "POST, OPTIONS" };
const RUNTIME_SCHEMA_VERSION = 1;
const DEFAULT_QUEUE_LIMIT = 20;
const MAX_QUEUE_LIMIT = 50;
const DEFAULT_CANDIDATE_NEW_LIMIT = 20;
const MAX_CANDIDATE_NEW_LIMIT = 200;
const TRUTHY_ENV_VALUES = new Set(["1", "true", "yes", "on"]);
const COMPUTE_BODY_OVERRIDE_ENV = "SCHEDULER_ALLOW_BODY_COMPUTE_URL_OVERRIDE";
const DUE_PAYLOAD_SCHEMA_VERSION = 3;
const DUE_ADAPTER_PROJECTION_SCHEMA_VERSION = 1;
const DEFAULT_FSRS_STABILITY = 0.4026;
const DEFAULT_FSRS_DIFFICULTY = 5;
const DEFAULT_DAILY_NEW_CAP = 20;
const DEFAULT_INTRODUCED_TODAY_COUNT = 0;
const DEFAULT_DECK_NEW_GATHER_PRIORITY = "sql_frequency_rank";
const DUE_CARD_STATUSES = new Set(["new", "learning", "review", "mastered"]);
const DUE_MISSING_PARITY_PROJECTION_BLOCKER_CODES = [
	"MISSING_DECK_REVIEW_LIMITS",
	"MISSING_DECK_NEW_LIMITS_AND_GATHER_PRIORITY",
	"MISSING_SIBLING_NOTE_ID_LINKAGE",
	"MISSING_BURY_MODE_FLAGS",
] as const;
const DUE_PROJECTION_BLOCKER_CODES = [
	...DUE_MISSING_PARITY_PROJECTION_BLOCKER_CODES,
	"NON_FOUNDATION_DUE_SCOPE",
] as const;
const DUE_PROJECTION_BLOCKER_REASON_CODES = [
	"PROJECTION_BLOCKER_DECK_LIMITS_UNAVAILABLE",
	"PROJECTION_BLOCKER_SIBLING_NOTE_ID_UNAVAILABLE",
	"PROJECTION_BLOCKER_BURY_FLAGS_UNAVAILABLE",
] as const;
const DUE_ADAPTER_CONTRACT_REQUEST_BLOCKER_CODES = [
	"INVALID_DUE_PAYLOAD_SCHEMA_VERSION",
	"INVALID_SCHEDULER_TIMEZONE",
	"INVALID_SCHEDULER_DAY_CUTOFF_HOUR",
	"INVALID_FSRS_TARGET_RETENTION",
	"INVALID_ACTIVE_WEIGHTS_VERSION",
	"INVALID_DUE_PAYLOAD_ITEM_ARRAYS",
	"INVALID_DUE_ITEMS",
	"INVALID_CANDIDATE_NEW_ITEMS",
	...DUE_PROJECTION_BLOCKER_REASON_CODES,
] as const;
const DUE_ADAPTER_CONTRACT_RESPONSE_KEYS = [
	"schema_version",
	"now_utc",
	"ordered_queue",
	"deterministic",
] as const;

type JsonRecord = Record<string, unknown>;
type DueCardSource = "foundation" | "vocabulary";
type DueCardStatus = "new" | "learning" | "review" | "mastered";
type DueMissingParityProjectionBlockerCode =
	(typeof DUE_MISSING_PARITY_PROJECTION_BLOCKER_CODES)[number];
type DueProjectionBlockerCode = (typeof DUE_PROJECTION_BLOCKER_CODES)[number];
type DueProjectionBlockerReasonCode =
	(typeof DUE_PROJECTION_BLOCKER_REASON_CODES)[number];
type DueAdapterContractRequestBlockerCode =
	(typeof DUE_ADAPTER_CONTRACT_REQUEST_BLOCKER_CODES)[number];
type DueAdapterQueuePartition = "review" | "new";

type DuePayloadRow = {
	schema_version: unknown;
	scheduler_timezone: unknown;
	scheduler_day_cutoff_hour: unknown;
	fsrs_target_retention: unknown;
	active_weights_version: unknown;
	due_items: unknown;
	candidate_new_items: unknown;
};

type ValidatedRequestBody = {
	schema_version: 1;
	now_utc: string;
	queue_limit: number;
	include_new_candidates: boolean;
	candidate_new_limit: number;
	compute_base_url: string | null;
};

type DueAdapterCardState = JsonRecord & {
	source: DueCardSource;
	vocabulary_card_id: string | null;
	foundation_card_id: string | null;
	status: DueCardStatus;
	source_type: string;
	scheduling_algorithm: "fsrs";
	interval_days: number;
	repetitions: number;
	lapses: number;
	fsrs_state: number;
	fsrs_stability: number;
	fsrs_difficulty: number;
	fsrs_elapsed_days: number;
	fsrs_scheduled_days: number;
	next_review_at: string | null;
	last_reviewed_at: string | null;
	fsrs_due_at: string | null;
	fsrs_last_reviewed_at: string | null;
	expected_last_reviewed_at: string | null;
};

type DueAdapterProjection = {
	schema_version: 1;
	assumptions: {
		foundation_only: true;
		binary_grading_only: true;
	};
	deterministic_defaults: {
		daily_new_cap: number;
		introduced_today_count: number;
		remaining_new: number;
		deck_review_limit: null;
		deck_new_limit: null;
		deck_new_gather_priority: "sql_frequency_rank";
		note_id_linkage_available: false;
		bury_new_siblings: false;
		bury_review_siblings: false;
		bury_interday_learning_siblings: false;
	};
	blocker_codes: DueProjectionBlockerCode[];
};

type DueAdapterProjectionBlockers = {
	schema_version: 1;
	missing_parity_codes: DueMissingParityProjectionBlockerCode[];
	codes: DueProjectionBlockerCode[];
};

type DueAdapterContractRequest = {
	scheduler_config: {
		scheduler_timezone: string;
		scheduler_day_cutoff_hour: number;
		fsrs_target_retention: number;
		active_weights_version: number;
	};
	due_items: DueAdapterCardState[];
	candidate_new_items: DueAdapterCardState[];
	options: {
		queue_limit: number;
		include_new_candidates: boolean;
	};
	projection_blockers: DueAdapterProjectionBlockers;
	projection: DueAdapterProjection;
};

type DueAdapterContractQueueItem = DueAdapterCardState & {
	queue_partition: DueAdapterQueuePartition;
	queue_position: number;
};

type BuildDueAdapterContractRequestResult =
	| {
			ok: true;
			value: DueAdapterContractRequest;
			blocker_codes: DueAdapterContractRequestBlockerCode[];
	  }
	| {
			ok: false;
			blocker_codes: DueAdapterContractRequestBlockerCode[];
			details?: Record<string, unknown>;
	  };

type DueComputeRequest = {
	schema_version: number;
	now_utc: string;
	scheduler_config: {
		scheduler_timezone: string;
		scheduler_day_cutoff_hour: number;
		fsrs_target_retention: number;
		active_weights_version: number;
	};
	due_items: DueAdapterCardState[];
	candidate_new_items: DueAdapterCardState[];
	options: {
		queue_limit: number;
		include_new_candidates: boolean;
	};
	projection_blockers: DueAdapterProjectionBlockers;
	projection: DueAdapterProjection;
};

type DueComputeResponse = {
	schema_version: number;
	now_utc: string;
	ordered_queue: DueAdapterContractQueueItem[];
	deterministic: boolean;
};

type DueAdapterContractResponse = {
	schema_version: number;
	now_utc: string;
	ordered_queue: DueAdapterContractQueueItem[];
	deterministic: true;
};

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

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function asNonNegativeInteger(value: unknown): number | null {
	return asIntegerWithBounds(value, 0, Number.MAX_SAFE_INTEGER);
}

function normalizeOptionalIsoDateTime(value: unknown): string | null {
	if (value === null || value === undefined) {
		return null;
	}

	if (!isValidIsoDateTime(value)) {
		return null;
	}

	return new Date(value).toISOString();
}

function asDueCardSource(value: unknown): DueCardSource | null {
	if (value !== "foundation" && value !== "vocabulary") {
		return null;
	}

	return value;
}

function asDueCardStatus(value: unknown): DueCardStatus | null {
	if (typeof value !== "string" || !DUE_CARD_STATUSES.has(value)) {
		return null;
	}

	return value as DueCardStatus;
}

function normalizeDueCardState(card: unknown): DueAdapterCardState | null {
	if (!isJsonRecord(card)) {
		return null;
	}

	const source = asDueCardSource(card.source);
	if (source === null) {
		return null;
	}

	const vocabularyCardId = isNonEmptyString(card.vocabulary_card_id)
		? card.vocabulary_card_id.trim()
		: null;
	const foundationCardId = isNonEmptyString(card.foundation_card_id)
		? card.foundation_card_id.trim()
		: null;

	if (source === "foundation" && (!foundationCardId || vocabularyCardId)) {
		return null;
	}

	if (source === "vocabulary" && (!vocabularyCardId || foundationCardId)) {
		return null;
	}

	const status = asDueCardStatus(card.status);
	if (status === null) {
		return null;
	}

	const sourceType = isNonEmptyString(card.source_type)
		? card.source_type.trim()
		: source === "foundation"
			? "foundation"
			: "collected";

	const intervalDays = asNonNegativeInteger(card.interval_days) ?? 0;
	const repetitions = asNonNegativeInteger(card.repetitions) ?? 0;
	const lapses = asNonNegativeInteger(card.lapses) ?? 0;
	const fsrsState = asIntegerWithBounds(card.fsrs_state, 0, 3) ?? 0;
	const fsrsStability =
		asFiniteNumber(card.fsrs_stability) ?? DEFAULT_FSRS_STABILITY;
	const normalizedFsrsStability = Math.max(0, fsrsStability);
	const fsrsDifficulty =
		asFiniteNumber(card.fsrs_difficulty) ?? DEFAULT_FSRS_DIFFICULTY;
	const normalizedFsrsDifficulty = Math.min(10, Math.max(1, fsrsDifficulty));
	const fsrsElapsedDays = asNonNegativeInteger(card.fsrs_elapsed_days) ?? 0;
	const fsrsScheduledDays =
		asNonNegativeInteger(card.fsrs_scheduled_days) ?? intervalDays;

	const nextReviewAt = normalizeOptionalIsoDateTime(card.next_review_at);
	const lastReviewedAt = normalizeOptionalIsoDateTime(card.last_reviewed_at);
	const fsrsDueAt = normalizeOptionalIsoDateTime(card.fsrs_due_at);
	const fsrsLastReviewedAt = normalizeOptionalIsoDateTime(
		card.fsrs_last_reviewed_at,
	);
	const expectedLastReviewedAt =
		normalizeOptionalIsoDateTime(card.expected_last_reviewed_at) ??
		fsrsLastReviewedAt ??
		lastReviewedAt ??
		null;

	return {
		...card,
		source,
		vocabulary_card_id: vocabularyCardId,
		foundation_card_id: foundationCardId,
		status,
		source_type: sourceType,
		scheduling_algorithm: "fsrs",
		interval_days: intervalDays,
		repetitions,
		lapses,
		fsrs_state: fsrsState,
		fsrs_stability: normalizedFsrsStability,
		fsrs_difficulty: normalizedFsrsDifficulty,
		fsrs_elapsed_days: fsrsElapsedDays,
		fsrs_scheduled_days: fsrsScheduledDays,
		next_review_at: nextReviewAt,
		last_reviewed_at: lastReviewedAt,
		fsrs_due_at: fsrsDueAt,
		fsrs_last_reviewed_at: fsrsLastReviewedAt,
		expected_last_reviewed_at: expectedLastReviewedAt,
	};
}

function createDueAdapterProjection(
	candidateNewItems: DueAdapterCardState[],
	blockerCodes: DueProjectionBlockerCode[],
): DueAdapterProjection {
	return {
		schema_version: DUE_ADAPTER_PROJECTION_SCHEMA_VERSION,
		assumptions: {
			foundation_only: true,
			binary_grading_only: true,
		},
		deterministic_defaults: {
			daily_new_cap: DEFAULT_DAILY_NEW_CAP,
			introduced_today_count: DEFAULT_INTRODUCED_TODAY_COUNT,
			remaining_new: candidateNewItems.length,
			deck_review_limit: null,
			deck_new_limit: null,
			deck_new_gather_priority: DEFAULT_DECK_NEW_GATHER_PRIORITY,
			note_id_linkage_available: false,
			bury_new_siblings: false,
			bury_review_siblings: false,
			bury_interday_learning_siblings: false,
		},
		blocker_codes: blockerCodes,
	};
}

function buildProjectionBlockers(
	dueItems: DueAdapterCardState[],
	candidateNewItems: DueAdapterCardState[],
): DueAdapterProjectionBlockers {
	const missingParityCodes = [
		...DUE_MISSING_PARITY_PROJECTION_BLOCKER_CODES,
	].sort((left, right) => left.localeCompare(right));
	const blockerCodes = new Set<DueProjectionBlockerCode>(missingParityCodes);
	const hasNonFoundationScope = [...dueItems, ...candidateNewItems].some(
		(item) => item.source !== "foundation",
	);
	if (hasNonFoundationScope) {
		blockerCodes.add("NON_FOUNDATION_DUE_SCOPE");
	}

	return {
		schema_version: DUE_ADAPTER_PROJECTION_SCHEMA_VERSION,
		missing_parity_codes: missingParityCodes,
		codes: [...blockerCodes].sort((left, right) => left.localeCompare(right)),
	};
}

function mapProjectionBlockerReasons(
	blockerCodes: DueProjectionBlockerCode[],
): DueProjectionBlockerReasonCode[] {
	const reasonCodes = new Set<DueProjectionBlockerReasonCode>();

	if (
		blockerCodes.includes("MISSING_DECK_REVIEW_LIMITS") ||
		blockerCodes.includes("MISSING_DECK_NEW_LIMITS_AND_GATHER_PRIORITY")
	) {
		reasonCodes.add("PROJECTION_BLOCKER_DECK_LIMITS_UNAVAILABLE");
	}

	if (blockerCodes.includes("MISSING_SIBLING_NOTE_ID_LINKAGE")) {
		reasonCodes.add("PROJECTION_BLOCKER_SIBLING_NOTE_ID_UNAVAILABLE");
	}

	if (blockerCodes.includes("MISSING_BURY_MODE_FLAGS")) {
		reasonCodes.add("PROJECTION_BLOCKER_BURY_FLAGS_UNAVAILABLE");
	}

	return [...reasonCodes].sort((left, right) => left.localeCompare(right));
}

function buildDueAdapterContractRequestBlocked(
	blockerCode: DueAdapterContractRequestBlockerCode,
	details?: Record<string, unknown>,
): BuildDueAdapterContractRequestResult {
	return {
		ok: false,
		blocker_codes: [blockerCode],
		details,
	};
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

function extractRpcRow(data: unknown): DuePayloadRow | null {
	const candidate = Array.isArray(data) ? data[0] : data;
	if (!isJsonRecord(candidate)) {
		return null;
	}

	if (
		!("schema_version" in candidate) ||
		!("scheduler_timezone" in candidate) ||
		!("scheduler_day_cutoff_hour" in candidate) ||
		!("fsrs_target_retention" in candidate) ||
		!("active_weights_version" in candidate) ||
		!("due_items" in candidate) ||
		!("candidate_new_items" in candidate)
	) {
		return null;
	}

	return candidate as DuePayloadRow;
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

	const queueLimit =
		body.queue_limit === undefined
			? DEFAULT_QUEUE_LIMIT
			: asIntegerWithBounds(body.queue_limit, 1, MAX_QUEUE_LIMIT);
	if (queueLimit === null) {
		return {
			ok: false,
			responseBody: {
				error: "queue_limit must be an integer between 1 and 50",
				code: "INVALID_QUEUE_LIMIT",
			},
		};
	}

	const includeNewCandidates =
		body.include_new_candidates === undefined
			? true
			: body.include_new_candidates === true
				? true
				: body.include_new_candidates === false
					? false
					: null;
	if (includeNewCandidates === null) {
		return {
			ok: false,
			responseBody: {
				error: "include_new_candidates must be a boolean",
				code: "INVALID_INCLUDE_NEW_CANDIDATES",
			},
		};
	}

	const candidateNewLimit =
		body.candidate_new_limit === undefined
			? DEFAULT_CANDIDATE_NEW_LIMIT
			: asIntegerWithBounds(
					body.candidate_new_limit,
					0,
					MAX_CANDIDATE_NEW_LIMIT,
				);
	if (candidateNewLimit === null) {
		return {
			ok: false,
			responseBody: {
				error: "candidate_new_limit must be an integer between 0 and 200",
				code: "INVALID_CANDIDATE_NEW_LIMIT",
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
			queue_limit: queueLimit,
			include_new_candidates: includeNewCandidates,
			candidate_new_limit: candidateNewLimit,
			compute_base_url: computeBaseUrl,
		},
	};
}

function buildDueAdapterContractRequest(
	rpcRow: DuePayloadRow,
	requestBody: ValidatedRequestBody,
): BuildDueAdapterContractRequestResult {
	const duePayloadSchemaVersion = asIntegerWithBounds(
		rpcRow.schema_version,
		DUE_PAYLOAD_SCHEMA_VERSION,
		DUE_PAYLOAD_SCHEMA_VERSION,
	);
	if (duePayloadSchemaVersion !== DUE_PAYLOAD_SCHEMA_VERSION) {
		return buildDueAdapterContractRequestBlocked(
			"INVALID_DUE_PAYLOAD_SCHEMA_VERSION",
			{ schema_version: rpcRow.schema_version },
		);
	}

	const schedulerTimezone =
		typeof rpcRow.scheduler_timezone === "string"
			? rpcRow.scheduler_timezone.trim()
			: "";
	if (schedulerTimezone.length === 0) {
		return buildDueAdapterContractRequestBlocked("INVALID_SCHEDULER_TIMEZONE");
	}

	const schedulerDayCutoffHour = asIntegerWithBounds(
		rpcRow.scheduler_day_cutoff_hour,
		0,
		23,
	);
	if (schedulerDayCutoffHour === null) {
		return buildDueAdapterContractRequestBlocked(
			"INVALID_SCHEDULER_DAY_CUTOFF_HOUR",
			{ scheduler_day_cutoff_hour: rpcRow.scheduler_day_cutoff_hour },
		);
	}

	const fsrsTargetRetention = asFiniteNumber(rpcRow.fsrs_target_retention);
	if (
		fsrsTargetRetention === null ||
		fsrsTargetRetention < 0.7 ||
		fsrsTargetRetention > 0.97
	) {
		return buildDueAdapterContractRequestBlocked(
			"INVALID_FSRS_TARGET_RETENTION",
			{
				fsrs_target_retention: rpcRow.fsrs_target_retention,
			},
		);
	}

	const activeWeightsVersion = asIntegerWithBounds(
		rpcRow.active_weights_version,
		1,
		Number.MAX_SAFE_INTEGER,
	);
	if (activeWeightsVersion === null) {
		return buildDueAdapterContractRequestBlocked(
			"INVALID_ACTIVE_WEIGHTS_VERSION",
			{
				active_weights_version: rpcRow.active_weights_version,
			},
		);
	}

	if (
		!Array.isArray(rpcRow.due_items) ||
		!Array.isArray(rpcRow.candidate_new_items)
	) {
		return buildDueAdapterContractRequestBlocked(
			"INVALID_DUE_PAYLOAD_ITEM_ARRAYS",
		);
	}

	const normalizedDueItems = rpcRow.due_items
		.map((item) => normalizeDueCardState(item))
		.filter((item): item is DueAdapterCardState => item !== null);
	if (normalizedDueItems.length !== rpcRow.due_items.length) {
		return buildDueAdapterContractRequestBlocked("INVALID_DUE_ITEMS");
	}

	const normalizedCandidateNewItems = rpcRow.candidate_new_items
		.map((item) => normalizeDueCardState(item))
		.filter((item): item is DueAdapterCardState => item !== null);
	if (
		normalizedCandidateNewItems.length !== rpcRow.candidate_new_items.length
	) {
		return buildDueAdapterContractRequestBlocked("INVALID_CANDIDATE_NEW_ITEMS");
	}

	const candidateNewItems = requestBody.include_new_candidates
		? normalizedCandidateNewItems
		: [];
	const projectionBlockers = buildProjectionBlockers(
		normalizedDueItems,
		candidateNewItems,
	);
	const projectionBlockerReasons = mapProjectionBlockerReasons(
		projectionBlockers.codes,
	);
	const projection = createDueAdapterProjection(
		candidateNewItems,
		projectionBlockers.codes,
	);

	return {
		ok: true,
		blocker_codes: projectionBlockerReasons,
		value: {
			scheduler_config: {
				scheduler_timezone: schedulerTimezone,
				scheduler_day_cutoff_hour: schedulerDayCutoffHour,
				fsrs_target_retention: fsrsTargetRetention,
				active_weights_version: activeWeightsVersion,
			},
			due_items: normalizedDueItems,
			candidate_new_items: candidateNewItems,
			options: {
				queue_limit: requestBody.queue_limit,
				include_new_candidates: requestBody.include_new_candidates,
			},
			projection_blockers: projectionBlockers,
			projection,
		},
	};
}

function mapDueAdapterContractRequestToComputeRequest(
	adapterRequest: DueAdapterContractRequest,
	requestBody: ValidatedRequestBody,
): DueComputeRequest {
	return {
		schema_version: requestBody.schema_version,
		now_utc: requestBody.now_utc,
		scheduler_config: adapterRequest.scheduler_config,
		due_items: adapterRequest.due_items,
		candidate_new_items: adapterRequest.candidate_new_items,
		options: adapterRequest.options,
		projection_blockers: adapterRequest.projection_blockers,
		projection: adapterRequest.projection,
	};
}

function compareNullableStrings(
	leftValue: unknown,
	rightValue: unknown,
): number {
	const left = typeof leftValue === "string" ? leftValue : "";
	const right = typeof rightValue === "string" ? rightValue : "";
	if (left < right) {
		return -1;
	}
	if (left > right) {
		return 1;
	}
	return 0;
}

function compareNullableIsoDate(
	leftValue: unknown,
	rightValue: unknown,
): number {
	const left =
		typeof leftValue === "string"
			? Date.parse(leftValue)
			: Number.NEGATIVE_INFINITY;
	const right =
		typeof rightValue === "string"
			? Date.parse(rightValue)
			: Number.NEGATIVE_INFINITY;
	if (left < right) {
		return -1;
	}
	if (left > right) {
		return 1;
	}
	return 0;
}

function compareDueCardsForLegacyFallback(
	left: DueAdapterCardState,
	right: DueAdapterCardState,
): number {
	const leftPartitionRank = left.status === "new" ? 0 : 1;
	const rightPartitionRank = right.status === "new" ? 0 : 1;
	if (leftPartitionRank !== rightPartitionRank) {
		return leftPartitionRank - rightPartitionRank;
	}

	const dueComparison = compareNullableIsoDate(
		left.next_review_at ?? left.fsrs_due_at ?? null,
		right.next_review_at ?? right.fsrs_due_at ?? null,
	);
	if (dueComparison !== 0) {
		return dueComparison;
	}

	const sourceTypeComparison = compareNullableStrings(
		left.source_type,
		right.source_type,
	);
	if (sourceTypeComparison !== 0) {
		return sourceTypeComparison;
	}

	const statusComparison = compareNullableStrings(left.status, right.status);
	if (statusComparison !== 0) {
		return statusComparison;
	}

	const foundationCardComparison = compareNullableStrings(
		left.foundation_card_id,
		right.foundation_card_id,
	);
	if (foundationCardComparison !== 0) {
		return foundationCardComparison;
	}

	return compareNullableStrings(
		left.vocabulary_card_id,
		right.vocabulary_card_id,
	);
}

function compareCandidateCardsForLegacyFallback(
	left: DueAdapterCardState,
	right: DueAdapterCardState,
): number {
	const foundationCardComparison = compareNullableStrings(
		left.foundation_card_id,
		right.foundation_card_id,
	);
	if (foundationCardComparison !== 0) {
		return foundationCardComparison;
	}

	return compareNullableStrings(
		left.vocabulary_card_id,
		right.vocabulary_card_id,
	);
}

function buildLegacyDueAdapterContractResponse(
	adapterRequest: DueAdapterContractRequest,
	requestBody: ValidatedRequestBody,
): DueComputeResponse {
	const sortedDueItems = [...adapterRequest.due_items].sort(
		compareDueCardsForLegacyFallback,
	);
	const sortedCandidateNewItems = [...adapterRequest.candidate_new_items].sort(
		compareCandidateCardsForLegacyFallback,
	);
	const merged = adapterRequest.options.include_new_candidates
		? [...sortedDueItems, ...sortedCandidateNewItems]
		: sortedDueItems;
	const orderedQueue = merged
		.slice(0, adapterRequest.options.queue_limit)
		.map((card, index) => {
			const queuePartition: DueAdapterQueuePartition =
				card.status === "new" ? "new" : "review";
			const queueItem: DueAdapterContractQueueItem = {
				...card,
				queue_partition: queuePartition,
				queue_position: index,
			};

			return queueItem;
		});

	return {
		schema_version: requestBody.schema_version,
		now_utc: requestBody.now_utc,
		ordered_queue: orderedQueue,
		deterministic: true,
	};
}

function logDueAdapterFallback(
	reason: string,
	details: Record<string, unknown>,
): void {
	console.warn("[scheduler-due-v1] due adapter fallback", {
		reason,
		...details,
	});
}

function parseDueAdapterContractQueueItem(
	value: unknown,
	index: number,
): DueAdapterContractQueueItem | null {
	if (!isJsonRecord(value)) {
		return null;
	}

	const normalizedCardState = normalizeDueCardState(value);
	if (!normalizedCardState) {
		return null;
	}

	const queuePartition: DueAdapterQueuePartition | null =
		value.queue_partition === "new" || value.queue_partition === "review"
			? value.queue_partition
			: null;
	if (!queuePartition) {
		return null;
	}

	const queuePosition = asNonNegativeInteger(value.queue_position);
	if (queuePosition === null || queuePosition !== index) {
		return null;
	}

	const expectedQueuePartition =
		normalizedCardState.status === "new" ? "new" : "review";
	if (queuePartition !== expectedQueuePartition) {
		return null;
	}

	return {
		...normalizedCardState,
		queue_partition: queuePartition,
		queue_position: queuePosition,
	};
}

function parseDueAdapterContractResponse(
	data: unknown,
): DueAdapterContractResponse | null {
	if (!isJsonRecord(data)) {
		return null;
	}

	if (!hasExactlyKeys(data, DUE_ADAPTER_CONTRACT_RESPONSE_KEYS)) {
		return null;
	}

	const schemaVersion = asIntegerWithBounds(
		data.schema_version,
		RUNTIME_SCHEMA_VERSION,
		RUNTIME_SCHEMA_VERSION,
	);
	if (schemaVersion !== RUNTIME_SCHEMA_VERSION) {
		return null;
	}

	if (!isValidIsoDateTime(data.now_utc)) {
		return null;
	}

	if (!Array.isArray(data.ordered_queue)) {
		return null;
	}

	const orderedQueue = data.ordered_queue
		.map((item, index) => parseDueAdapterContractQueueItem(item, index))
		.filter((item): item is DueAdapterContractQueueItem => item !== null);
	if (orderedQueue.length !== data.ordered_queue.length) {
		return null;
	}

	if (data.deterministic !== true) {
		return null;
	}

	return {
		schema_version: schemaVersion,
		now_utc: data.now_utc,
		ordered_queue: orderedQueue,
		deterministic: true,
	};
}

function mapDueAdapterContractResponseToV1Envelope(
	adapterResponse: DueAdapterContractResponse,
): DueComputeResponse {
	return {
		schema_version: adapterResponse.schema_version,
		now_utc: adapterResponse.now_utc,
		ordered_queue: adapterResponse.ordered_queue,
		deterministic: adapterResponse.deterministic,
	};
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
	if (!auth.isAuthenticated || !auth.token) {
		return jsonResponse(
			req,
			{ error: "Authentication failed" },
			401,
			CORS_OPTIONS,
		);
	}

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

	const candidateNewLimit = requestBody.include_new_candidates
		? requestBody.candidate_new_limit
		: 0;

	const duePayloadResult = await supabaseUserClient.rpc("get_due_payload_v3", {
		p_due_limit: requestBody.queue_limit,
		p_candidate_new_limit: candidateNewLimit,
	});

	if (duePayloadResult.error) {
		console.error("get_due_payload_v3 failed", {
			message: duePayloadResult.error.message,
			details: duePayloadResult.error.details,
			hint: duePayloadResult.error.hint,
			code: duePayloadResult.error.code,
		});
		return jsonResponse(
			req,
			{
				error: "Unable to load due payload",
				code: "DUE_PAYLOAD_RPC_FAILED",
			},
			500,
			CORS_OPTIONS,
		);
	}

	const rpcRow = extractRpcRow(duePayloadResult.data);
	if (!rpcRow) {
		return jsonResponse(
			req,
			{
				error: "Due payload response shape is invalid",
				code: "INVALID_DUE_PAYLOAD",
			},
			500,
			CORS_OPTIONS,
		);
	}

	const dueAdapterContractRequestResult = buildDueAdapterContractRequest(
		rpcRow,
		requestBody,
	);
	if (!dueAdapterContractRequestResult.ok) {
		console.error("due payload projection failed", {
			blocker_codes: dueAdapterContractRequestResult.blocker_codes,
			details: dueAdapterContractRequestResult.details ?? null,
		});
		const errorDetails = {
			blocker_codes: dueAdapterContractRequestResult.blocker_codes,
			...(dueAdapterContractRequestResult.details ?? {}),
		};
		return jsonResponse(
			req,
			{
				error: "Due payload values are invalid",
				code: "INVALID_DUE_PAYLOAD_VALUES",
				details: errorDetails,
			},
			500,
			CORS_OPTIONS,
		);
	}
	const dueAdapterContractRequest = dueAdapterContractRequestResult.value;
	const legacyDueV1Envelope = buildLegacyDueAdapterContractResponse(
		dueAdapterContractRequest,
		requestBody,
	);

	if (dueAdapterContractRequest.projection.blocker_codes.length > 0) {
		console.warn("[scheduler-due-v1] due projection blockers", {
			blocker_codes: dueAdapterContractRequest.projection.blocker_codes,
			blocker_reasons: dueAdapterContractRequestResult.blocker_codes,
			shadow_reason: "DUE_PROJECTION_MISSING_INPUTS",
		});
	}

	const dueComputeRequest = mapDueAdapterContractRequestToComputeRequest(
		dueAdapterContractRequest,
		requestBody,
	);

	let computeHttpResponse: Response;
	try {
		computeHttpResponse = await fetch(`${computeBaseUrl}/v1/due`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(dueComputeRequest),
		});
	} catch (error) {
		logDueAdapterFallback("SCHEDULER_COMPUTE_UNAVAILABLE", {
			error: error instanceof Error ? error.message : String(error),
			projection_blockers: dueAdapterContractRequest.projection.blocker_codes,
		});
		return jsonResponse(req, legacyDueV1Envelope, 200, CORS_OPTIONS);
	}

	if (!computeHttpResponse.ok) {
		const rawBody = await computeHttpResponse.text();
		logDueAdapterFallback("SCHEDULER_COMPUTE_REJECTED", {
			status: computeHttpResponse.status,
			details: rawBody.slice(0, 500),
			projection_blockers: dueAdapterContractRequest.projection.blocker_codes,
		});
		return jsonResponse(req, legacyDueV1Envelope, 200, CORS_OPTIONS);
	}

	let computeJson: unknown;
	try {
		computeJson = await computeHttpResponse.json();
	} catch {
		logDueAdapterFallback("INVALID_COMPUTE_RESPONSE_JSON", {
			projection_blockers: dueAdapterContractRequest.projection.blocker_codes,
		});
		return jsonResponse(req, legacyDueV1Envelope, 200, CORS_OPTIONS);
	}

	const dueAdapterContractResponse =
		parseDueAdapterContractResponse(computeJson);
	if (!dueAdapterContractResponse) {
		logDueAdapterFallback("INVALID_COMPUTE_RESPONSE_SHAPE", {
			projection_blockers: dueAdapterContractRequest.projection.blocker_codes,
		});
		return jsonResponse(req, legacyDueV1Envelope, 200, CORS_OPTIONS);
	}

	if (
		dueAdapterContractResponse.schema_version !== requestBody.schema_version ||
		dueAdapterContractResponse.now_utc !== requestBody.now_utc
	) {
		logDueAdapterFallback("COMPUTE_BOUNDARY_MISMATCH", {
			projection_blockers: dueAdapterContractRequest.projection.blocker_codes,
			expected: {
				schema_version: requestBody.schema_version,
				now_utc: requestBody.now_utc,
			},
			received: {
				schema_version: dueAdapterContractResponse.schema_version,
				now_utc: dueAdapterContractResponse.now_utc,
			},
		});
		return jsonResponse(req, legacyDueV1Envelope, 200, CORS_OPTIONS);
	}

	const dueV1Envelope = mapDueAdapterContractResponseToV1Envelope(
		dueAdapterContractResponse,
	);
	return jsonResponse(req, dueV1Envelope, 200, CORS_OPTIONS);
});
