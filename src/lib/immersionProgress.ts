import type { Video } from "@/interfaces/video";

export interface ImmersionWatchProgressEntry {
	videoId: string;
	youtubeId: string | null;
	title: string;
	thumbnail: string;
	category: string | null;
	level: string | null;
	watchedSeconds: number;
	positionSeconds: number;
	durationSeconds: number | null;
	progressPercent: number;
	lastWatchedAt: string;
}

export interface ImmersionDailyLogEntry {
	seconds: number;
	updatedAt: string;
}

export interface ImmersionPlaybackCheckpoint {
	positionSeconds: number;
	recordedAt: number;
}

export interface RecordImmersionWatchInput {
	video: Pick<
		Video,
		"videoId" | "youtubeId" | "title" | "thumbnail" | "category" | "level"
	>;
	positionSeconds: number;
	durationSeconds?: number | null;
	deltaSeconds: number;
	ended?: boolean;
	at?: Date;
}

export interface ImmersionPlaybackStatusInput {
	positionSeconds: number;
	durationSeconds?: number | null;
	progressPercent?: number;
}

const IMMERSION_WATCH_PROGRESS_KEY = "immersion.watchProgress.v1";
const IMMERSION_DAILY_LOG_KEY = "immersion.dailyLog.v1";
const IMMERSION_PROGRESS_UPDATED_EVENT = "app:immersion-progress-updated";
const IMMERSION_LONG_VIDEO_MIN_DURATION_SECONDS = 5 * 60;
const IMMERSION_RESUME_MINIMUM_SECONDS = 2 * 60;
const IMMERSION_RESUME_MINIMUM_PROGRESS_PERCENT = 5;
const IMMERSION_COMPLETED_MINIMUM_PROGRESS_PERCENT = 95;

const isBrowser = (): boolean => typeof window !== "undefined";

const toIsoDateKey = (date: Date): string => date.toISOString().split("T")[0];

const toSafeSeconds = (value: unknown): number => {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return 0;
	}

	return Math.max(0, Math.round(value));
};

const toSafeProgress = (value: unknown): number => {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return 0;
	}

	return Math.min(100, Math.max(0, Math.round(value)));
};

const toSafeDurationSeconds = (value: unknown): number | null => {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return null;
	}

	return Math.max(1, Math.round(value));
};

const getImmersionProgressPercent = ({
	positionSeconds,
	durationSeconds,
	progressPercent,
}: ImmersionPlaybackStatusInput): number => {
	const safeDurationSeconds = toSafeDurationSeconds(durationSeconds);
	if (safeDurationSeconds) {
		const safePositionSeconds = Math.min(
			toSafeSeconds(positionSeconds),
			safeDurationSeconds,
		);
		return Math.min(
			100,
			Math.round((safePositionSeconds / safeDurationSeconds) * 100),
		);
	}

	return toSafeProgress(progressPercent);
};

const isImmersionLongFormEligible = (
	durationSeconds: number | null | undefined,
): boolean => {
	const safeDurationSeconds = toSafeDurationSeconds(durationSeconds);
	return (
		typeof safeDurationSeconds === "number" &&
		safeDurationSeconds >= IMMERSION_LONG_VIDEO_MIN_DURATION_SECONDS
	);
};

const isImmersionPlaybackCompleted = (
	input: ImmersionPlaybackStatusInput,
): boolean => {
	const safeProgressPercent = getImmersionProgressPercent(input);

	return safeProgressPercent >= IMMERSION_COMPLETED_MINIMUM_PROGRESS_PERCENT;
};

const getImmersionResumePositionSeconds = (
	input: ImmersionPlaybackStatusInput,
): number | null => {
	const safeDurationSeconds = toSafeDurationSeconds(input.durationSeconds);
	if (
		typeof safeDurationSeconds !== "number" ||
		!isImmersionLongFormEligible(safeDurationSeconds)
	) {
		return null;
	}

	if (isImmersionPlaybackCompleted(input)) {
		return null;
	}

	const safePositionSeconds = Math.min(
		toSafeSeconds(input.positionSeconds),
		safeDurationSeconds,
	);
	const minimumResumeSeconds = Math.max(
		IMMERSION_RESUME_MINIMUM_SECONDS,
		Math.ceil(
			safeDurationSeconds * (IMMERSION_RESUME_MINIMUM_PROGRESS_PERCENT / 100),
		),
	);

	if (safePositionSeconds < minimumResumeSeconds) {
		return null;
	}

	return safePositionSeconds;
};

const createImmersionPlaybackCheckpoint = (
	positionSeconds: number,
	recordedAt: number = Date.now(),
): ImmersionPlaybackCheckpoint => ({
	positionSeconds: toSafeSeconds(positionSeconds),
	recordedAt:
		typeof recordedAt === "number" && Number.isFinite(recordedAt)
			? Math.max(0, Math.round(recordedAt))
			: Date.now(),
});

const computeImmersionDeltaSeconds = ({
	previousCheckpoint,
	positionSeconds,
	recordedAt = Date.now(),
}: {
	previousCheckpoint: ImmersionPlaybackCheckpoint | null;
	positionSeconds: number;
	recordedAt?: number;
}): number => {
	if (!previousCheckpoint) {
		return 0;
	}

	const nextRecordedAt =
		typeof recordedAt === "number" && Number.isFinite(recordedAt)
			? Math.max(0, Math.round(recordedAt))
			: Date.now();
	const elapsedSeconds = Math.max(
		0,
		Math.floor((nextRecordedAt - previousCheckpoint.recordedAt) / 1000),
	);
	if (elapsedSeconds <= 0) {
		return 0;
	}

	const safePositionSeconds = toSafeSeconds(positionSeconds);
	const positionDeltaSeconds =
		safePositionSeconds - previousCheckpoint.positionSeconds;

	if (positionDeltaSeconds < 0) {
		return elapsedSeconds;
	}

	return Math.min(elapsedSeconds, positionDeltaSeconds);
};

const safeParseStorageRecord = <TValue extends object>(
	storageKey: string,
): Record<string, TValue> => {
	if (!isBrowser()) {
		return {};
	}

	try {
		const rawValue = window.localStorage.getItem(storageKey);
		if (!rawValue) {
			return {};
		}

		const parsed = JSON.parse(rawValue);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return {};
		}

		return parsed as Record<string, TValue>;
	} catch {
		return {};
	}
};

const persistStorageRecord = <TValue extends object>(
	storageKey: string,
	value: Record<string, TValue>,
): void => {
	if (!isBrowser()) {
		return;
	}

	try {
		window.localStorage.setItem(storageKey, JSON.stringify(value));
	} catch {
		// Ignore localStorage failures.
	}
};

const sanitizeWatchEntry = (
	videoId: string,
	entry: unknown,
): ImmersionWatchProgressEntry | null => {
	if (!entry || typeof entry !== "object") {
		return null;
	}

	const source = entry as Partial<ImmersionWatchProgressEntry>;
	const title = typeof source.title === "string" ? source.title.trim() : "";
	const thumbnail =
		typeof source.thumbnail === "string" ? source.thumbnail.trim() : "";
	if (!title || !thumbnail) {
		return null;
	}

	const lastWatchedAt =
		typeof source.lastWatchedAt === "string" &&
		source.lastWatchedAt.trim().length > 0
			? source.lastWatchedAt
			: new Date(0).toISOString();

	const durationSeconds = toSafeDurationSeconds(source.durationSeconds);

	const watchedSeconds = toSafeSeconds(source.watchedSeconds);
	const positionSeconds = toSafeSeconds(source.positionSeconds);
	const computedProgress =
		durationSeconds && durationSeconds > 0
			? Math.min(100, Math.round((positionSeconds / durationSeconds) * 100))
			: toSafeProgress(source.progressPercent);

	return {
		videoId,
		youtubeId:
			typeof source.youtubeId === "string" && source.youtubeId.trim().length > 0
				? source.youtubeId
				: null,
		title,
		thumbnail,
		category:
			typeof source.category === "string" && source.category.trim().length > 0
				? source.category
				: null,
		level:
			typeof source.level === "string" && source.level.trim().length > 0
				? source.level
				: null,
		watchedSeconds,
		positionSeconds,
		durationSeconds,
		progressPercent: computedProgress,
		lastWatchedAt,
	};
};

const sanitizeDailyLogEntry = (
	entry: unknown,
): ImmersionDailyLogEntry | null => {
	if (!entry || typeof entry !== "object") {
		return null;
	}

	const source = entry as Partial<ImmersionDailyLogEntry>;
	return {
		seconds: toSafeSeconds(source.seconds),
		updatedAt:
			typeof source.updatedAt === "string" && source.updatedAt.trim().length > 0
				? source.updatedAt
				: new Date(0).toISOString(),
	};
};

const emitImmersionProgressUpdated = (): void => {
	if (!isBrowser()) {
		return;
	}

	window.dispatchEvent(new CustomEvent(IMMERSION_PROGRESS_UPDATED_EVENT));
};

const readImmersionWatchProgress = (): Record<
	string,
	ImmersionWatchProgressEntry
> => {
	const rawRecord = safeParseStorageRecord<ImmersionWatchProgressEntry>(
		IMMERSION_WATCH_PROGRESS_KEY,
	);

	const sanitizedRecord: Record<string, ImmersionWatchProgressEntry> = {};
	for (const [videoId, entry] of Object.entries(rawRecord)) {
		if (typeof videoId !== "string" || videoId.trim().length === 0) {
			continue;
		}

		const sanitizedEntry = sanitizeWatchEntry(videoId, entry);
		if (sanitizedEntry) {
			sanitizedRecord[videoId] = sanitizedEntry;
		}
	}

	return sanitizedRecord;
};

const readImmersionDailyLog = (): Record<string, ImmersionDailyLogEntry> => {
	const rawRecord = safeParseStorageRecord<ImmersionDailyLogEntry>(
		IMMERSION_DAILY_LOG_KEY,
	);

	const sanitizedRecord: Record<string, ImmersionDailyLogEntry> = {};
	for (const [dateKey, entry] of Object.entries(rawRecord)) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
			continue;
		}

		const sanitizedEntry = sanitizeDailyLogEntry(entry);
		if (sanitizedEntry) {
			sanitizedRecord[dateKey] = sanitizedEntry;
		}
	}

	return sanitizedRecord;
};

const getImmersionDailySeconds = (dateKey?: string): number => {
	const targetDateKey =
		typeof dateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
			? dateKey
			: toIsoDateKey(new Date());

	const dailyLog = readImmersionDailyLog();
	return toSafeSeconds(dailyLog[targetDateKey]?.seconds ?? 0);
};

const getImmersionDailyMinutes = (dateKey?: string): number => {
	const dailySeconds = getImmersionDailySeconds(dateKey);
	return Math.floor(dailySeconds / 60);
};

const getImmersionTotalSeconds = (): number => {
	const dailyLog = readImmersionDailyLog();
	return Object.values(dailyLog).reduce(
		(totalSeconds, entry) => totalSeconds + toSafeSeconds(entry.seconds),
		0,
	);
};

const getImmersionTotalMinutes = (): number => {
	return Math.floor(getImmersionTotalSeconds() / 60);
};

const getImmersionSecondsByRecentDays = (
	days: number,
	endDate: Date = new Date(),
): Record<string, number> => {
	const safeDays = Math.max(1, Math.round(days));
	const dailyLog = readImmersionDailyLog();
	const normalizedEndDate = new Date(endDate);
	const result: Record<string, number> = {};

	for (let offset = safeDays - 1; offset >= 0; offset -= 1) {
		const date = new Date(normalizedEndDate);
		date.setHours(0, 0, 0, 0);
		date.setDate(normalizedEndDate.getDate() - offset);
		const dateKey = toIsoDateKey(date);
		result[dateKey] = toSafeSeconds(dailyLog[dateKey]?.seconds ?? 0);
	}

	return result;
};

const recordImmersionWatchProgress = ({
	video,
	positionSeconds,
	durationSeconds,
	deltaSeconds,
	ended = false,
	at = new Date(),
}: RecordImmersionWatchInput): ImmersionWatchProgressEntry | null => {
	const normalizedVideoId = video.videoId.trim();
	const hasWatchDelta = Number.isFinite(deltaSeconds) && deltaSeconds > 0;
	if (!normalizedVideoId || (!hasWatchDelta && !ended)) {
		return null;
	}

	const safeDeltaSeconds = hasWatchDelta
		? Math.max(1, Math.round(deltaSeconds))
		: 0;
	const safePositionSeconds = toSafeSeconds(positionSeconds);
	const safeDurationSeconds = toSafeDurationSeconds(durationSeconds);

	const watchProgress = readImmersionWatchProgress();
	const previousEntry = watchProgress[normalizedVideoId];

	const nextDurationSeconds =
		safeDurationSeconds ?? previousEntry?.durationSeconds ?? null;
	const nextPositionSeconds =
		ended && nextDurationSeconds
			? nextDurationSeconds
			: nextDurationSeconds
				? Math.min(safePositionSeconds, nextDurationSeconds)
				: safePositionSeconds;
	const previousWatchedSeconds = previousEntry?.watchedSeconds ?? 0;
	const nextWatchedSeconds =
		ended && nextDurationSeconds
			? Math.max(previousWatchedSeconds, nextDurationSeconds)
			: Math.max(safeDeltaSeconds, previousWatchedSeconds + safeDeltaSeconds);
	const nextProgressPercent = nextDurationSeconds
		? Math.min(
				100,
				Math.round((nextPositionSeconds / nextDurationSeconds) * 100),
			)
		: Math.min(100, ended ? 100 : (previousEntry?.progressPercent ?? 0));

	const updatedEntry: ImmersionWatchProgressEntry = {
		videoId: normalizedVideoId,
		youtubeId: video.youtubeId ?? null,
		title: video.title,
		thumbnail: video.thumbnail,
		category: video.category ?? null,
		level: video.level ?? null,
		watchedSeconds: nextWatchedSeconds,
		positionSeconds: nextPositionSeconds,
		durationSeconds: nextDurationSeconds,
		progressPercent: nextProgressPercent,
		lastWatchedAt: at.toISOString(),
	};

	watchProgress[normalizedVideoId] = updatedEntry;
	persistStorageRecord(IMMERSION_WATCH_PROGRESS_KEY, watchProgress);

	if (safeDeltaSeconds > 0) {
		const dailyLog = readImmersionDailyLog();
		const dateKey = toIsoDateKey(at);
		const previousDayEntry = dailyLog[dateKey];
		dailyLog[dateKey] = {
			seconds: Math.max(
				safeDeltaSeconds,
				toSafeSeconds(previousDayEntry?.seconds ?? 0) + safeDeltaSeconds,
			),
			updatedAt: at.toISOString(),
		};
		persistStorageRecord(IMMERSION_DAILY_LOG_KEY, dailyLog);
	}

	emitImmersionProgressUpdated();
	return updatedEntry;
};

const getContinueWatchingEntries = (options?: {
	limit?: number;
	minProgressPercent?: number;
	maxProgressPercent?: number;
}): ImmersionWatchProgressEntry[] => {
	const limit = Math.max(1, Math.round(options?.limit ?? 10));
	const minProgressPercent = Math.min(
		100,
		Math.max(0, Math.round(options?.minProgressPercent ?? 5)),
	);
	const maxProgressPercent = Math.min(
		100,
		Math.max(minProgressPercent, Math.round(options?.maxProgressPercent ?? 95)),
	);

	return Object.values(readImmersionWatchProgress())
		.filter(
			(entry) =>
				getImmersionResumePositionSeconds(entry) !== null &&
				entry.progressPercent >= minProgressPercent &&
				entry.progressPercent <= maxProgressPercent,
		)
		.sort((left, right) => {
			const leftTime = new Date(left.lastWatchedAt).getTime();
			const rightTime = new Date(right.lastWatchedAt).getTime();
			if (leftTime !== rightTime) {
				return rightTime - leftTime;
			}

			return left.title.localeCompare(right.title);
		})
		.slice(0, limit);
};

export {
	computeImmersionDeltaSeconds,
	createImmersionPlaybackCheckpoint,
	IMMERSION_DAILY_LOG_KEY,
	IMMERSION_PROGRESS_UPDATED_EVENT,
	IMMERSION_WATCH_PROGRESS_KEY,
	getContinueWatchingEntries,
	getImmersionProgressPercent,
	getImmersionDailyMinutes,
	getImmersionDailySeconds,
	getImmersionResumePositionSeconds,
	getImmersionSecondsByRecentDays,
	getImmersionTotalMinutes,
	getImmersionTotalSeconds,
	isImmersionLongFormEligible,
	isImmersionPlaybackCompleted,
	readImmersionDailyLog,
	readImmersionWatchProgress,
	recordImmersionWatchProgress,
	toIsoDateKey,
};
