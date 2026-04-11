import { supabase } from "@/integrations/supabase/client";
import { stripArabicDiacritics } from "@/lib/arabicText";
import {
	getImmersionDailyMinutes,
	readImmersionDailyLog,
} from "@/lib/immersionProgress";
import { emitProfileInsightsRefresh } from "@/lib/profileInsightsEvents";

const IMMERSION_SYNC_STATE_STORAGE_KEY_PREFIX =
	"profile.immersion-sync-state.v1";

interface ImmersionSyncStateEntry {
	minutes: number;
}

type LooseSupabaseClient = {
	rpc: (
		functionName: string,
		args?: Record<string, unknown>,
	) => Promise<{ data: unknown; error: { message?: string } | null }>;
	from: (table: string) => {
		select: (columns: string) => {
			eq: (
				column: string,
				value: unknown,
			) => {
				maybeSingle: () => Promise<{
					data: unknown;
					error: { message?: string } | null;
				}>;
			};
			maybeSingle: () => Promise<{
				data: unknown;
				error: { message?: string } | null;
			}>;
		};
	};
};

export interface LearningPathProgressRecord {
	firstVisitedAt: string | null;
	stepOneChoice: string | null;
	stepOneCompletedAt: string | null;
	foundationDeckStartedAt: string | null;
}

export interface LearningProgressSummaryRecord {
	currentStreak: number;
}

export interface UserAccomplishmentRecord {
	accomplishmentType: string;
	earnedAt: string;
	notifiedAt: string | null;
	overlayVersion: number;
	metadata: Record<string, unknown>;
}

export interface ProfileProgressServiceError {
	message: string;
}

export type ProfileProgressServiceResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: ProfileProgressServiceError };

const createError = (message: string): ProfileProgressServiceError => ({
	message,
});

const isBrowser = (): boolean => typeof window !== "undefined";

const resolveImmersionSyncStateStorageKey = (userId: string): string =>
	`${IMMERSION_SYNC_STATE_STORAGE_KEY_PREFIX}:${userId}`;

const readImmersionSyncState = (
	userId: string | null | undefined,
): Record<string, ImmersionSyncStateEntry> => {
	if (!isBrowser() || !userId) {
		return {};
	}

	try {
		const rawValue = window.localStorage.getItem(
			resolveImmersionSyncStateStorageKey(userId),
		);
		if (!rawValue) {
			return {};
		}

		const parsed = JSON.parse(rawValue);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return {};
		}

		const nextState: Record<string, ImmersionSyncStateEntry> = {};
		for (const [dateKey, entry] of Object.entries(parsed)) {
			if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
				continue;
			}

			if (!entry || typeof entry !== "object") {
				continue;
			}

			const source = entry as Partial<ImmersionSyncStateEntry>;
			nextState[dateKey] = {
				minutes:
					typeof source.minutes === "number" && Number.isFinite(source.minutes)
						? Math.max(0, Math.floor(source.minutes))
						: 0,
			};
		}

		return nextState;
	} catch {
		return {};
	}
};

const writeImmersionSyncState = (
	userId: string | null | undefined,
	state: Record<string, ImmersionSyncStateEntry>,
): void => {
	if (!isBrowser() || !userId) {
		return;
	}

	try {
		const storageKey = resolveImmersionSyncStateStorageKey(userId);
		if (Object.keys(state).length === 0) {
			window.localStorage.removeItem(storageKey);
			return;
		}

		window.localStorage.setItem(storageKey, JSON.stringify(state));
	} catch {
		return;
	}
};

const getLooseClient = (): LooseSupabaseClient =>
	supabase as unknown as LooseSupabaseClient;

const normalizeArabicWord = (value: string): string =>
	stripArabicDiacritics(value)
		.replace(/\u0640/g, "")
		.trim();

const mapLearningPathProgress = (
	data: unknown,
): LearningPathProgressRecord | null => {
	if (!data || typeof data !== "object") {
		return null;
	}

	const row = data as {
		first_visited_at?: unknown;
		step_one_choice?: unknown;
		step_one_completed_at?: unknown;
		foundation_deck_started_at?: unknown;
	};

	return {
		firstVisitedAt:
			typeof row.first_visited_at === "string" ? row.first_visited_at : null,
		stepOneChoice:
			typeof row.step_one_choice === "string" ? row.step_one_choice : null,
		stepOneCompletedAt:
			typeof row.step_one_completed_at === "string"
				? row.step_one_completed_at
				: null,
		foundationDeckStartedAt:
			typeof row.foundation_deck_started_at === "string"
				? row.foundation_deck_started_at
				: null,
	};
};

const mapLearningProgressSummary = (
	data: unknown,
): LearningProgressSummaryRecord | null => {
	if (!data || typeof data !== "object") {
		return null;
	}

	const row = data as { current_streak?: unknown };
	return {
		currentStreak:
			typeof row.current_streak === "number"
				? Math.max(0, Math.floor(row.current_streak))
				: 0,
	};
};

const mapAccomplishmentRows = (data: unknown): UserAccomplishmentRecord[] => {
	if (!Array.isArray(data)) {
		return [];
	}

	return data.flatMap((row) => {
		if (!row || typeof row !== "object") {
			return [];
		}

		const source = row as {
			accomplishment_type?: unknown;
			earned_at?: unknown;
			notified_at?: unknown;
			overlay_version?: unknown;
			metadata?: unknown;
		};

		if (
			typeof source.accomplishment_type !== "string" ||
			typeof source.earned_at !== "string"
		) {
			return [];
		}

		return [
			{
				accomplishmentType: source.accomplishment_type,
				earnedAt: source.earned_at,
				notifiedAt:
					typeof source.notified_at === "string" ? source.notified_at : null,
				overlayVersion:
					typeof source.overlay_version === "number"
						? source.overlay_version
						: 1,
				metadata:
					source.metadata && typeof source.metadata === "object"
						? (source.metadata as Record<string, unknown>)
						: {},
			},
		];
	});
};

export async function fetchLearningPathProgress(): Promise<
	ProfileProgressServiceResult<LearningPathProgressRecord | null>
> {
	const client = getLooseClient();

	const { data, error } = await client
		.from("user_learning_path_progress")
		.select(
			"first_visited_at,step_one_choice,step_one_completed_at,foundation_deck_started_at",
		)
		.maybeSingle();

	if (error) {
		return {
			ok: false,
			error: createError(error.message ?? "Progression parcours indisponible."),
		};
	}

	return { ok: true, data: mapLearningPathProgress(data) };
}

export async function fetchLearningProgressSummary(): Promise<
	ProfileProgressServiceResult<LearningProgressSummaryRecord | null>
> {
	const client = getLooseClient();
	const { data, error } = await client
		.from("user_learning_progress")
		.select("current_streak")
		.maybeSingle();

	if (error) {
		return {
			ok: false,
			error: createError(
				error.message ?? "Impossible de lire la progression serveur.",
			),
		};
	}

	return { ok: true, data: mapLearningProgressSummary(data) };
}

export async function markProgressPathStepOneCompleted(
	choice: string,
): Promise<ProfileProgressServiceResult<LearningPathProgressRecord>> {
	const client = getLooseClient();
	const { data, error } = await client.rpc(
		"mark_progress_path_step_one_completed_v1",
		{ p_choice: choice },
	);

	if (error) {
		return {
			ok: false,
			error: createError(
				error.message ?? "Impossible d'enregistrer l'etape 1.",
			),
		};
	}

	const rows = Array.isArray(data) ? data : [data];
	const mapped = mapLearningPathProgress(rows[0]);
	if (!mapped) {
		return { ok: false, error: createError("Reponse etape 1 invalide.") };
	}

	emitProfileInsightsRefresh();
	return { ok: true, data: mapped };
}

export async function markProgressPathVisited(
	firstVisitedAt: string | null = null,
): Promise<ProfileProgressServiceResult<string>> {
	const client = getLooseClient();
	const { data, error } = await client.rpc("mark_progress_path_visited_v1", {
		p_first_visited_at: firstVisitedAt,
	});

	if (error) {
		return {
			ok: false,
			error: createError(
				error.message ??
					"Impossible d'enregistrer le point de depart du parcours.",
			),
		};
	}

	if (typeof data !== "string") {
		return {
			ok: false,
			error: createError("Reponse point de depart invalide."),
		};
	}

	emitProfileInsightsRefresh();
	return { ok: true, data };
}

export async function markFoundationDeckStarted(): Promise<
	ProfileProgressServiceResult<string>
> {
	const client = getLooseClient();
	const { data, error } = await client.rpc("mark_foundation_deck_started_v1");

	if (error) {
		return {
			ok: false,
			error: createError(
				error.message ??
					"Impossible d'enregistrer le depart du deck fondations.",
			),
		};
	}

	if (typeof data !== "string") {
		return {
			ok: false,
			error: createError("Reponse deck fondations invalide."),
		};
	}

	emitProfileInsightsRefresh();
	return { ok: true, data };
}

export async function syncUserAccomplishments(): Promise<
	ProfileProgressServiceResult<UserAccomplishmentRecord[]>
> {
	const client = getLooseClient();
	const { data, error } = await client.rpc("sync_user_accomplishments_v1");

	if (error) {
		return {
			ok: false,
			error: createError(
				error.message ?? "Impossible de synchroniser les distinctions.",
			),
		};
	}

	return { ok: true, data: mapAccomplishmentRows(data) };
}

export async function markAccomplishmentNotified(
	accomplishmentType: string,
): Promise<ProfileProgressServiceResult<boolean>> {
	const client = getLooseClient();
	const { data, error } = await client.rpc(
		"mark_user_accomplishment_notified_v1",
		{ p_accomplishment_type: accomplishmentType, p_overlay_version: 1 },
	);

	if (error) {
		return {
			ok: false,
			error: createError(
				error.message ?? "Impossible de marquer la distinction comme vue.",
			),
		};
	}

	return { ok: true, data: data === true };
}

export async function fetchWordsAcquiredCount(
	targetUserId?: string,
): Promise<ProfileProgressServiceResult<number>> {
	const client = getLooseClient();
	if (targetUserId && targetUserId.trim().length > 0) {
		const { data, error } = await client.rpc(
			"get_profile_progression_summary_v1",
			{
				p_target_user_id: targetUserId,
			},
		);

		if (!error) {
			const firstRow = Array.isArray(data) ? data[0] : data;
			if (firstRow && typeof firstRow === "object") {
				const rawWordsAcquiredCount = (
					firstRow as { words_acquired_count?: unknown }
				).words_acquired_count;
				const numericWordsAcquiredCount = Number(rawWordsAcquiredCount);
				if (Number.isFinite(numericWordsAcquiredCount)) {
					return {
						ok: true,
						data: Math.max(0, Math.floor(numericWordsAcquiredCount)),
					};
				}
			}
		}
	}

	const { searchAppVocabularyBank } = await import(
		"@/services/appVocabularySearchService"
	);
	const result = await searchAppVocabularyBank("", 5000, [
		"foundation",
		"collected",
		"sent",
	]);

	if (!result.ok) {
		return { ok: false, error: createError(result.error.message) };
	}

	const uniqueWords = new Set<string>();
	for (const row of result.data) {
		const normalizedStatus =
			typeof row.status === "string" ? row.status.trim().toLowerCase() : null;
		const isAcquiredByStatus =
			normalizedStatus === null ? Boolean(row.is_seen) : normalizedStatus === "review";

		if (!isAcquiredByStatus || typeof row.word_ar !== "string") {
			continue;
		}
		const normalizedWord = normalizeArabicWord(row.word_ar);
		if (normalizedWord) {
			uniqueWords.add(normalizedWord);
		}
	}

	return { ok: true, data: uniqueWords.size };
}

export async function fetchTotalImmersionMinutes(): Promise<
	ProfileProgressServiceResult<number>
> {
	const client = getLooseClient();
	const query = client
		.from("user_daily_activity")
		.select("time_spent_minutes,time_spent_seconds") as unknown as Promise<{
		data: unknown;
		error: { message?: string } | null;
	}>;
	const response = await query;

	if (response.error) {
		return {
			ok: false,
			error: createError(
				response.error.message ?? "Impossible de lire le total d'immersion.",
			),
		};
	}

	const rows = Array.isArray(response.data) ? response.data : [];
	const totalMinutes = rows.reduce((sum, row) => {
		if (!row || typeof row !== "object") {
			return sum;
		}
		const source = row as {
			time_spent_minutes?: unknown;
			time_spent_seconds?: unknown;
		};
		const minutes =
			typeof source.time_spent_minutes === "number"
				? Math.max(0, Math.floor(source.time_spent_minutes))
				: 0;
		const seconds =
			typeof source.time_spent_seconds === "number"
				? Math.max(0, Math.floor(source.time_spent_seconds))
				: 0;
		return sum + Math.max(minutes, Math.floor(seconds / 60));
	}, 0);

	return { ok: true, data: totalMinutes };
}

export async function syncImmersionMinutesToServer(
	userId: string,
): Promise<ProfileProgressServiceResult<number>> {
	const client = getLooseClient();
	const dailyLog = readImmersionDailyLog();
	const syncState = readImmersionSyncState(userId);
	const nextSyncState: Record<string, ImmersionSyncStateEntry> = {};
	let syncedDays = 0;

	for (const dateKey of Object.keys(dailyLog).sort()) {
		const localMinutes = Math.max(0, getImmersionDailyMinutes(dateKey));
		if (localMinutes <= 0) {
			continue;
		}

		const previousSync = syncState[dateKey];
		if (previousSync && previousSync.minutes === localMinutes) {
			nextSyncState[dateKey] = previousSync;
			continue;
		}

		const { error } = await client.rpc("upsert_my_daily_activity_v1", {
			p_activity_date: dateKey,
			p_reviews_count: 0,
			p_new_words: 0,
			p_time_spent_minutes: localMinutes,
			p_time_spent_seconds: localMinutes * 60,
		});

		if (error) {
			return {
				ok: false,
				error: createError(
					error.message ?? "Impossible de synchroniser l'immersion.",
				),
			};
		}

		nextSyncState[dateKey] = {
			minutes: localMinutes,
		};
		syncedDays += 1;
	}

	writeImmersionSyncState(userId, nextSyncState);
	return { ok: true, data: syncedDays };
}
