type RuntimeDeckPersoSchedulerConfig = {
	DECK_PERSO_SCHEDULER_ROLLBACK_TO_LEGACY?: boolean;
	DECK_PERSO_SCHEDULER_LEGACY_FALLBACK_SUNSET_GUARD?: boolean;
	DECK_PERSO_SCHEDULER_CANARY_FOUNDATION_ENABLED?: boolean;
	DECK_PERSO_SCHEDULER_CANARY_FOUNDATION_TOTAL_EVENTS?: number | string;
	DECK_PERSO_SCHEDULER_CANARY_FOUNDATION_MISMATCH_RATE_PCT?: number | string;
	DECK_PERSO_SCHEDULER_CANARY_FOUNDATION_FALLBACK_RATE_PCT?: number | string;
	DECK_PERSO_SCHEDULER_CANARY_FOUNDATION_ERROR_RATE_PCT?: number | string;
	DECK_PERSO_SCHEDULER_CANARY_FOUNDATION_P95_LAG_MS?: number | string;
};

type RuntimeConfigWindow = Window & {
	__SUPABASE_CONFIG__?: RuntimeDeckPersoSchedulerConfig;
};

const SCHEDULER_ROLLBACK_ENV_KEY =
	"VITE_DECK_PERSO_SCHEDULER_ROLLBACK_TO_LEGACY";
const SCHEDULER_LEGACY_FALLBACK_SUNSET_GUARD_ENV_KEY =
	"VITE_DECK_PERSO_SCHEDULER_LEGACY_FALLBACK_SUNSET_GUARD";
const SCHEDULER_CANARY_FOUNDATION_ENABLED_ENV_KEY =
	"VITE_DECK_PERSO_SCHEDULER_CANARY_FOUNDATION_ENABLED";
const SCHEDULER_CANARY_FOUNDATION_TOTAL_EVENTS_ENV_KEY =
	"VITE_DECK_PERSO_SCHEDULER_CANARY_FOUNDATION_TOTAL_EVENTS";
const SCHEDULER_CANARY_FOUNDATION_MISMATCH_RATE_ENV_KEY =
	"VITE_DECK_PERSO_SCHEDULER_CANARY_FOUNDATION_MISMATCH_RATE_PCT";
const SCHEDULER_CANARY_FOUNDATION_FALLBACK_RATE_ENV_KEY =
	"VITE_DECK_PERSO_SCHEDULER_CANARY_FOUNDATION_FALLBACK_RATE_PCT";
const SCHEDULER_CANARY_FOUNDATION_ERROR_RATE_ENV_KEY =
	"VITE_DECK_PERSO_SCHEDULER_CANARY_FOUNDATION_ERROR_RATE_PCT";
const SCHEDULER_CANARY_FOUNDATION_P95_LAG_MS_ENV_KEY =
	"VITE_DECK_PERSO_SCHEDULER_CANARY_FOUNDATION_P95_LAG_MS";

export const DECK_PERSO_SCHEDULER_ROLLBACK_REQUIRED_COMMAND =
	"set DECK_PERSO_SCHEDULER_ROLLBACK_TO_LEGACY=true";

export const DECK_PERSO_SCHEDULER_FOUNDATION_CANARY_THRESHOLDS = {
	scope: "foundation-only",
	windowMinutes: 15,
	minimumSampleEvents: 50,
	mismatchRatePct: {
		warn: 0.5,
		hold: 1,
		rollbackRequired: 2,
	},
	fallbackRatePct: {
		warn: 1,
		hold: 2.5,
		rollbackRequired: 5,
	},
	errorRatePct: {
		warn: 0.25,
		hold: 0.5,
		rollbackRequired: 1,
	},
	p95LagMs: {
		warn: 1500,
		hold: 3000,
		rollbackRequired: 5000,
	},
} as const;

type DeckPersoSchedulerCanaryMetricName =
	| "mismatch_rate_pct"
	| "fallback_rate_pct"
	| "error_rate_pct"
	| "p95_lag_ms";

export type DeckPersoSchedulerFoundationCanaryAction =
	| "healthy"
	| "warn"
	| "hold"
	| "rollback-required";

export interface DeckPersoSchedulerFoundationCanaryMetrics {
	totalEvents: number;
	mismatchRatePct: number;
	fallbackRatePct: number;
	errorRatePct: number;
	p95LagMs: number;
}

export interface DeckPersoSchedulerFoundationCanaryDecision {
	scope: "foundation-only";
	canaryEnabled: boolean;
	windowMinutes: number;
	minimumSampleEvents: number;
	metrics: DeckPersoSchedulerFoundationCanaryMetrics;
	rolloutAction: DeckPersoSchedulerFoundationCanaryAction;
	reasonCode: string;
	breachMetric: DeckPersoSchedulerCanaryMetricName | null;
	requiresRollbackToLegacy: boolean;
	rollbackFlagCommand: typeof DECK_PERSO_SCHEDULER_ROLLBACK_REQUIRED_COMMAND;
	actionInstruction: string;
}

interface GateCheck {
	metricName: DeckPersoSchedulerCanaryMetricName;
	value: number;
	thresholds: {
		warn: number;
		hold: number;
		rollbackRequired: number;
	};
}

function parseBoolean(value: unknown): boolean | null {
	if (typeof value === "boolean") {
		return value;
	}
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (normalized === "true") {
			return true;
		}
		if (normalized === "false") {
			return false;
		}
	}
	return null;
}

function parseFiniteNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string") {
		const normalized = value.trim();
		if (!normalized) {
			return null;
		}
		const parsed = Number(normalized);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return null;
}

function getRuntimeConfig(): RuntimeDeckPersoSchedulerConfig | null {
	if (typeof window === "undefined") {
		return null;
	}
	return (window as RuntimeConfigWindow).__SUPABASE_CONFIG__ ?? null;
}

function resolveBooleanFlag(
	envKey: string,
	runtimeKey: keyof RuntimeDeckPersoSchedulerConfig,
): boolean | null {
	const envValue = (import.meta.env as Record<string, unknown>)[envKey];
	const envOverride = parseBoolean(envValue);
	if (envOverride !== null) {
		return envOverride;
	}

	const runtimeOverride = parseBoolean(getRuntimeConfig()?.[runtimeKey]);
	if (runtimeOverride !== null) {
		return runtimeOverride;
	}

	return null;
}

function resolveNumericFlag(
	envKey: string,
	runtimeKey: keyof RuntimeDeckPersoSchedulerConfig,
): number | null {
	const envValue = (import.meta.env as Record<string, unknown>)[envKey];
	const envOverride = parseFiniteNumber(envValue);
	if (envOverride !== null) {
		return envOverride;
	}

	const runtimeOverride = parseFiniteNumber(getRuntimeConfig()?.[runtimeKey]);
	if (runtimeOverride !== null) {
		return runtimeOverride;
	}

	return null;
}

function normalizeMetric(value: number | null): number {
	if (value === null || Number.isNaN(value)) {
		return 0;
	}
	if (value < 0) {
		return 0;
	}
	return value;
}

function resolveCanaryMetricsFromOverrides(): DeckPersoSchedulerFoundationCanaryMetrics {
	return {
		totalEvents: Math.floor(
			normalizeMetric(
				resolveNumericFlag(
					SCHEDULER_CANARY_FOUNDATION_TOTAL_EVENTS_ENV_KEY,
					"DECK_PERSO_SCHEDULER_CANARY_FOUNDATION_TOTAL_EVENTS",
				),
			),
		),
		mismatchRatePct: normalizeMetric(
			resolveNumericFlag(
				SCHEDULER_CANARY_FOUNDATION_MISMATCH_RATE_ENV_KEY,
				"DECK_PERSO_SCHEDULER_CANARY_FOUNDATION_MISMATCH_RATE_PCT",
			),
		),
		fallbackRatePct: normalizeMetric(
			resolveNumericFlag(
				SCHEDULER_CANARY_FOUNDATION_FALLBACK_RATE_ENV_KEY,
				"DECK_PERSO_SCHEDULER_CANARY_FOUNDATION_FALLBACK_RATE_PCT",
			),
		),
		errorRatePct: normalizeMetric(
			resolveNumericFlag(
				SCHEDULER_CANARY_FOUNDATION_ERROR_RATE_ENV_KEY,
				"DECK_PERSO_SCHEDULER_CANARY_FOUNDATION_ERROR_RATE_PCT",
			),
		),
		p95LagMs: normalizeMetric(
			resolveNumericFlag(
				SCHEDULER_CANARY_FOUNDATION_P95_LAG_MS_ENV_KEY,
				"DECK_PERSO_SCHEDULER_CANARY_FOUNDATION_P95_LAG_MS",
			),
		),
	};
}

function buildDecision(
	canaryEnabled: boolean,
	metrics: DeckPersoSchedulerFoundationCanaryMetrics,
	rolloutAction: DeckPersoSchedulerFoundationCanaryAction,
	reasonCode: string,
	breachMetric: DeckPersoSchedulerCanaryMetricName | null,
	actionInstruction: string,
): DeckPersoSchedulerFoundationCanaryDecision {
	return {
		scope: "foundation-only",
		canaryEnabled,
		windowMinutes:
			DECK_PERSO_SCHEDULER_FOUNDATION_CANARY_THRESHOLDS.windowMinutes,
		minimumSampleEvents:
			DECK_PERSO_SCHEDULER_FOUNDATION_CANARY_THRESHOLDS.minimumSampleEvents,
		metrics,
		rolloutAction,
		reasonCode,
		breachMetric,
		requiresRollbackToLegacy: rolloutAction === "rollback-required",
		rollbackFlagCommand: DECK_PERSO_SCHEDULER_ROLLBACK_REQUIRED_COMMAND,
		actionInstruction,
	};
}

function toGateChecks(
	metrics: DeckPersoSchedulerFoundationCanaryMetrics,
): GateCheck[] {
	return [
		{
			metricName: "mismatch_rate_pct",
			value: metrics.mismatchRatePct,
			thresholds:
				DECK_PERSO_SCHEDULER_FOUNDATION_CANARY_THRESHOLDS.mismatchRatePct,
		},
		{
			metricName: "fallback_rate_pct",
			value: metrics.fallbackRatePct,
			thresholds:
				DECK_PERSO_SCHEDULER_FOUNDATION_CANARY_THRESHOLDS.fallbackRatePct,
		},
		{
			metricName: "error_rate_pct",
			value: metrics.errorRatePct,
			thresholds:
				DECK_PERSO_SCHEDULER_FOUNDATION_CANARY_THRESHOLDS.errorRatePct,
		},
		{
			metricName: "p95_lag_ms",
			value: metrics.p95LagMs,
			thresholds: DECK_PERSO_SCHEDULER_FOUNDATION_CANARY_THRESHOLDS.p95LagMs,
		},
	];
}

export function evaluateDeckPersoSchedulerFoundationCanaryGate(
	metrics: DeckPersoSchedulerFoundationCanaryMetrics,
): DeckPersoSchedulerFoundationCanaryDecision {
	if (
		metrics.totalEvents <
		DECK_PERSO_SCHEDULER_FOUNDATION_CANARY_THRESHOLDS.minimumSampleEvents
	) {
		return buildDecision(
			true,
			metrics,
			"hold",
			"insufficient_sample_hold",
			null,
			"Hold canary progression until total_events >= 50.",
		);
	}

	const gateChecks = toGateChecks(metrics);
	const rollbackGate = gateChecks.find(
		(check) => check.value >= check.thresholds.rollbackRequired,
	);
	if (rollbackGate) {
		return buildDecision(
			true,
			metrics,
			"rollback-required",
			`${rollbackGate.metricName}_rollback_required`,
			rollbackGate.metricName,
			`Rollback required: ${DECK_PERSO_SCHEDULER_ROLLBACK_REQUIRED_COMMAND}`,
		);
	}

	const holdGate = gateChecks.find(
		(check) => check.value >= check.thresholds.hold,
	);
	if (holdGate) {
		return buildDecision(
			true,
			metrics,
			"hold",
			`${holdGate.metricName}_hold_threshold_breached`,
			holdGate.metricName,
			"Hold progression at current canary slice; require two clean windows.",
		);
	}

	const warnGate = gateChecks.find(
		(check) => check.value >= check.thresholds.warn,
	);
	if (warnGate) {
		return buildDecision(
			true,
			metrics,
			"warn",
			`${warnGate.metricName}_warn_threshold_breached`,
			warnGate.metricName,
			"Warn gate reached: no progression, rerun checks every 5 minutes.",
		);
	}

	return buildDecision(
		true,
		metrics,
		"healthy",
		"healthy_window",
		null,
		"Healthy window: canary progression allowed for Foundation scheduler.",
	);
}

export function getDeckPersoSchedulerFoundationCanaryDecision(): DeckPersoSchedulerFoundationCanaryDecision {
	const canaryEnabled =
		resolveBooleanFlag(
			SCHEDULER_CANARY_FOUNDATION_ENABLED_ENV_KEY,
			"DECK_PERSO_SCHEDULER_CANARY_FOUNDATION_ENABLED",
		) === true;
	const metrics = resolveCanaryMetricsFromOverrides();

	if (!canaryEnabled) {
		return buildDecision(
			false,
			metrics,
			"healthy",
			"canary_disabled",
			null,
			"Foundation canary gate disabled; runtime path follows rollback switch semantics.",
		);
	}

	return evaluateDeckPersoSchedulerFoundationCanaryGate(metrics);
}

export function isDeckPersoSchedulerRollbackToLegacyEnabled(): boolean {
	return (
		resolveBooleanFlag(
			SCHEDULER_ROLLBACK_ENV_KEY,
			"DECK_PERSO_SCHEDULER_ROLLBACK_TO_LEGACY",
		) === true
	);
}

export function isDeckPersoSchedulerLegacyFallbackSunsetGuardEnabled(): boolean {
	return (
		resolveBooleanFlag(
			SCHEDULER_LEGACY_FALLBACK_SUNSET_GUARD_ENV_KEY,
			"DECK_PERSO_SCHEDULER_LEGACY_FALLBACK_SUNSET_GUARD",
		) === true
	);
}
