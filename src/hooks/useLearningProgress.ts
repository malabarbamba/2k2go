import { useCallback, useEffect, useMemo, useState } from "react";
import type {
	FoundationLevelThreshold,
	LearningDailyObjectiveEntry,
	LearningProgressSnapshot,
	LearningUnitProgressMetrics,
	LearningUnitState,
} from "@/features/learning-path/types";
import {
	FOUNDATION_LEVEL_THRESHOLDS,
	getLearningUnitById,
	getLearningUnitKey,
	isLearningUnitId,
	LEARNING_PATH_UNITS,
} from "@/features/learning-path/unitData";
import {
	getImmersionDailyMinutes,
	IMMERSION_PROGRESS_UPDATED_EVENT,
	toIsoDateKey,
} from "@/lib/immersionProgress";

const LEARNING_PROGRESS_UPDATED_EVENT = "app:learning-progress-updated";
const MILLISECONDS_PER_DAY = 86_400_000;
const ISO_DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAILY_IMMERSION_TARGET_MINUTES = 15;
const WEEKLY_GOAL_TARGET_DAYS = 5;
const MONTHLY_GOAL_TARGET_DAYS = 20;
const DAILY_OBJECTIVE_RETENTION_DAYS = 400;

export const LEARNING_PROGRESS_STORAGE_KEYS = {
	canReadArabic: "onboarding.canReadArabic",
	currentUnitId: "learning.currentUnitId",
	completedUnitIds: "learning.completedUnitIds",
	minutesByUnit: "learning.minutesByUnit",
	wordsByUnit: "learning.wordsByUnit",
	masteredWordsTotal: "learning.masteredWordsTotal",
	streakDays: "learning.streakDays",
	lastCompletedDate: "learning.lastCompletedDate",
	dailyObjectivesByDate: "learning.dailyObjectivesByDate",
} as const;

const STORAGE_KEY_SET = new Set<string>(
	Object.values(LEARNING_PROGRESS_STORAGE_KEYS),
);
const UNIT_ID_BY_KEY = new Map(
	LEARNING_PATH_UNITS.map((unit) => [unit.key, unit.id]),
);
const UNIT_KEY_SET = new Set(LEARNING_PATH_UNITS.map((unit) => unit.key));
const LAST_UNIT_ID =
	LEARNING_PATH_UNITS[LEARNING_PATH_UNITS.length - 1]?.id ?? 0;
const PROLOGUE_UNIT_ID = 0;

type UnitProgressInput = {
	minutesWatched?: number;
	foundationWords?: number;
};

export interface UseLearningProgressReturn {
	units: typeof LEARNING_PATH_UNITS;
	canReadArabic: boolean | null;
	currentUnitId: number;
	completedUnitIds: string[];
	minutesByUnit: Record<string, number>;
	wordsByUnit: Record<string, number>;
	masteredWordsTotal: number;
	streakDays: number;
	lastCompletedDate: string | null;
	canRecoverStreakToday: boolean;
	dailyObjectiveDate: string;
	dailyImmersionMinutes: number;
	dailyImmersionTargetMinutes: number;
	isDailyImmersionComplete: boolean;
	isDailyReviewsComplete: boolean;
	isDailyObjectiveComplete: boolean;
	weeklyGoalCompletedDays: number;
	weeklyGoalTargetDays: number;
	weeklyGoalProgressPercent: number;
	isWeeklyGoalComplete: boolean;
	monthlyGoalCompletedDays: number;
	monthlyGoalTargetDays: number;
	monthlyGoalProgressPercent: number;
	isMonthlyGoalComplete: boolean;
	foundationLevel: FoundationLevelThreshold;
	nextFoundationLevel: FoundationLevelThreshold | null;
	getUnitState: (unitId: number) => LearningUnitState;
	isUnitActionable: (unitId: number) => boolean;
	getUnitProgressMetrics: (unitId: number) => LearningUnitProgressMetrics;
	setCanReadArabic: (value: boolean) => void;
	setUnitProgress: (unitId: number, progress: UnitProgressInput) => void;
	markUnitCompleted: (unitId: number) => void;
	markCurrentUnitCompleted: () => void;
	markDailyImmersionComplete: () => void;
	markDailyReviewsComplete: () => void;
	resetLearningProgress: () => void;
}

const isBrowser = (): boolean => typeof window !== "undefined";

const createDefaultProgressSnapshot = (): LearningProgressSnapshot => ({
	canReadArabic: null,
	currentUnitId: PROLOGUE_UNIT_ID,
	completedUnitIds: [],
	minutesByUnit: {},
	wordsByUnit: {},
	masteredWordsTotal: 0,
	streakDays: 0,
	lastCompletedDate: null,
	dailyObjectivesByDate: {},
});

const toSafeNumber = (value: unknown): number => {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return 0;
	}

	return Math.max(0, Math.round(value));
};

const toProgressRatio = (actual: number, required: number): number => {
	if (required <= 0) {
		return 1;
	}

	const ratio = actual / required;
	if (!Number.isFinite(ratio)) {
		return 0;
	}

	return Math.min(1, Math.max(0, ratio));
};

const isIsoDateKey = (value: string | null | undefined): value is string =>
	typeof value === "string" && ISO_DATE_KEY_PATTERN.test(value);

const parseDateKeyFromStorage = (value: string | null): string | null => {
	if (!isIsoDateKey(value)) {
		return null;
	}

	return value;
};

const getDayDelta = (fromDateKey: string, toDateKey: string): number => {
	const fromUtc = Date.parse(`${fromDateKey}T00:00:00.000Z`);
	const toUtc = Date.parse(`${toDateKey}T00:00:00.000Z`);

	if (!Number.isFinite(fromUtc) || !Number.isFinite(toUtc)) {
		return 0;
	}

	return Math.round((toUtc - fromUtc) / MILLISECONDS_PER_DAY);
};

const createEmptyDailyObjectiveEntry = (): LearningDailyObjectiveEntry => ({
	immersionCompleted: false,
	reviewsCompleted: false,
	completedAt: null,
});

const isDailyObjectiveCompleted = (
	entry: LearningDailyObjectiveEntry | null | undefined,
): boolean => Boolean(entry?.immersionCompleted && entry?.reviewsCompleted);

const normalizeDailyObjectiveEntry = (
	entry: unknown,
): LearningDailyObjectiveEntry | null => {
	if (!entry || typeof entry !== "object") {
		return null;
	}

	const source = entry as Partial<LearningDailyObjectiveEntry>;
	const completedAt =
		typeof source.completedAt === "string" &&
		source.completedAt.trim().length > 0
			? source.completedAt
			: null;

	return {
		immersionCompleted: source.immersionCompleted === true,
		reviewsCompleted: source.reviewsCompleted === true,
		completedAt,
	};
};

const normalizeDailyObjectivesByDate = (
	value: Record<string, LearningDailyObjectiveEntry>,
	referenceDateKey: string = toIsoDateKey(new Date()),
): Record<string, LearningDailyObjectiveEntry> => {
	const normalizedEntries: Record<string, LearningDailyObjectiveEntry> = {};

	for (const [dateKey, entry] of Object.entries(value)) {
		if (!isIsoDateKey(dateKey)) {
			continue;
		}

		const normalizedEntry = normalizeDailyObjectiveEntry(entry);
		if (!normalizedEntry) {
			continue;
		}

		const delta = getDayDelta(dateKey, referenceDateKey);
		if (delta < -2 || delta > DAILY_OBJECTIVE_RETENTION_DAYS) {
			continue;
		}

		normalizedEntries[dateKey] = normalizedEntry;
	}

	return normalizedEntries;
};

const parseDailyObjectivesByDateFromStorage = (
	value: string | null,
): Record<string, LearningDailyObjectiveEntry> => {
	if (!value) {
		return {};
	}

	try {
		const parsed = JSON.parse(value);
		if (
			parsed === null ||
			typeof parsed !== "object" ||
			Array.isArray(parsed)
		) {
			return {};
		}

		const sanitized: Record<string, LearningDailyObjectiveEntry> = {};
		for (const [dateKey, entry] of Object.entries(
			parsed as Record<string, unknown>,
		)) {
			if (!isIsoDateKey(dateKey)) {
				continue;
			}

			const normalizedEntry = normalizeDailyObjectiveEntry(entry);
			if (!normalizedEntry) {
				continue;
			}

			sanitized[dateKey] = normalizedEntry;
		}

		return normalizeDailyObjectivesByDate(sanitized);
	} catch {
		return {};
	}
};

const areDailyObjectivesEqual = (
	left: Record<string, LearningDailyObjectiveEntry>,
	right: Record<string, LearningDailyObjectiveEntry>,
): boolean => {
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);

	if (leftKeys.length !== rightKeys.length) {
		return false;
	}

	for (const key of leftKeys) {
		const leftEntry = left[key];
		const rightEntry = right[key];
		if (!rightEntry) {
			return false;
		}

		if (
			leftEntry.immersionCompleted !== rightEntry.immersionCompleted ||
			leftEntry.reviewsCompleted !== rightEntry.reviewsCompleted ||
			leftEntry.completedAt !== rightEntry.completedAt
		) {
			return false;
		}
	}

	return true;
};

const withDailyObjectiveProgress = (
	currentSnapshot: LearningProgressSnapshot,
	dateKey: string,
	update: Partial<
		Pick<LearningDailyObjectiveEntry, "immersionCompleted" | "reviewsCompleted">
	>,
): LearningProgressSnapshot => {
	if (!isIsoDateKey(dateKey)) {
		return currentSnapshot;
	}

	const currentEntry =
		currentSnapshot.dailyObjectivesByDate[dateKey] ??
		createEmptyDailyObjectiveEntry();
	const nextEntry: LearningDailyObjectiveEntry = {
		immersionCompleted:
			currentEntry.immersionCompleted || update.immersionCompleted === true,
		reviewsCompleted:
			currentEntry.reviewsCompleted || update.reviewsCompleted === true,
		completedAt: currentEntry.completedAt,
	};

	if (isDailyObjectiveCompleted(nextEntry) && !nextEntry.completedAt) {
		nextEntry.completedAt = new Date().toISOString();
	}

	const nextDailyObjectivesByDate = normalizeDailyObjectivesByDate(
		{
			...currentSnapshot.dailyObjectivesByDate,
			[dateKey]: nextEntry,
		},
		dateKey,
	);

	if (currentSnapshot.lastCompletedDate === dateKey) {
		return {
			...currentSnapshot,
			dailyObjectivesByDate: nextDailyObjectivesByDate,
		};
	}

	if (!isDailyObjectiveCompleted(nextEntry)) {
		return {
			...currentSnapshot,
			dailyObjectivesByDate: nextDailyObjectivesByDate,
		};
	}

	const previousDateKey = currentSnapshot.lastCompletedDate;
	const previousStreak = Math.max(0, toSafeNumber(currentSnapshot.streakDays));
	let nextStreak = 1;

	if (previousDateKey && isIsoDateKey(previousDateKey)) {
		const dayDelta = getDayDelta(previousDateKey, dateKey);
		if (dayDelta <= 0) {
			nextStreak = Math.max(1, previousStreak);
		} else if (dayDelta === 1 || dayDelta === 2) {
			nextStreak = Math.max(1, previousStreak + 1);
		}
	}

	return {
		...currentSnapshot,
		dailyObjectivesByDate: nextDailyObjectivesByDate,
		streakDays: nextStreak,
		lastCompletedDate: dateKey,
	};
};

const getWeekRangeForDate = (referenceDate: Date): [string, string] => {
	const cursor = new Date(referenceDate);
	cursor.setUTCHours(0, 0, 0, 0);
	const day = cursor.getUTCDay();
	const offsetToMonday = day === 0 ? -6 : 1 - day;
	cursor.setUTCDate(cursor.getUTCDate() + offsetToMonday);

	const weekStart = toIsoDateKey(cursor);
	const weekEndDate = new Date(cursor);
	weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
	const weekEnd = toIsoDateKey(weekEndDate);

	return [weekStart, weekEnd];
};

const countCompletedObjectivesInRange = (
	entries: Record<string, LearningDailyObjectiveEntry>,
	startDateKey: string,
	endDateKey: string,
): number =>
	Object.entries(entries).reduce((count, [dateKey, entry]) => {
		if (!isDailyObjectiveCompleted(entry)) {
			return count;
		}

		if (dateKey < startDateKey || dateKey > endDateKey) {
			return count;
		}

		return count + 1;
	}, 0);

const parseBooleanFromStorage = (value: string | null): boolean | null => {
	if (value === "true") {
		return true;
	}

	if (value === "false") {
		return false;
	}

	return null;
};

const parseArrayFromStorage = (value: string | null): string[] => {
	if (!value) {
		return [];
	}

	try {
		const parsed = JSON.parse(value);
		if (!Array.isArray(parsed)) {
			return [];
		}

		return parsed.filter((entry): entry is string => typeof entry === "string");
	} catch {
		return [];
	}
};

const parseNumberMapFromStorage = (
	value: string | null,
): Record<string, number> => {
	if (!value) {
		return {};
	}

	try {
		const parsed = JSON.parse(value);
		if (
			parsed === null ||
			typeof parsed !== "object" ||
			Array.isArray(parsed)
		) {
			return {};
		}

		return Object.entries(parsed as Record<string, unknown>).reduce<
			Record<string, number>
		>((accumulator, [key, rawValue]) => {
			if (!UNIT_KEY_SET.has(key)) {
				return accumulator;
			}

			accumulator[key] = toSafeNumber(rawValue);
			return accumulator;
		}, {});
	} catch {
		return {};
	}
};

const normalizeCompletedUnits = (
	canReadArabic: boolean | null,
	completedUnitIds: string[],
): string[] => {
	const filteredSet = new Set(
		completedUnitIds.filter((unitKey) => UNIT_KEY_SET.has(unitKey)),
	);

	if (canReadArabic === true) {
		filteredSet.add(getLearningUnitKey(PROLOGUE_UNIT_ID));
	}

	if (canReadArabic === false) {
		filteredSet.delete(getLearningUnitKey(PROLOGUE_UNIT_ID));
	}

	const contiguousCompleted: string[] = [];
	for (const unit of LEARNING_PATH_UNITS) {
		if (!filteredSet.has(unit.key)) {
			break;
		}

		contiguousCompleted.push(unit.key);
	}

	return contiguousCompleted;
};

const resolveCurrentUnitId = (
	canReadArabic: boolean | null,
	completedUnitIds: string[],
): number => {
	const completedSet = new Set(completedUnitIds);
	const firstIncomplete = LEARNING_PATH_UNITS.find(
		(unit) => !completedSet.has(unit.key),
	);

	if (!firstIncomplete) {
		return LAST_UNIT_ID;
	}

	if (canReadArabic === true && firstIncomplete.id === PROLOGUE_UNIT_ID) {
		return 1;
	}

	return firstIncomplete.id;
};

const normalizeSnapshot = (
	snapshot: LearningProgressSnapshot,
): LearningProgressSnapshot => {
	let canReadArabic = snapshot.canReadArabic;

	if (
		canReadArabic === null &&
		snapshot.completedUnitIds.includes(getLearningUnitKey(PROLOGUE_UNIT_ID))
	) {
		canReadArabic = true;
	}

	const completedUnitIds = normalizeCompletedUnits(
		canReadArabic,
		snapshot.completedUnitIds,
	);
	const currentUnitId = resolveCurrentUnitId(canReadArabic, completedUnitIds);
	const minutesByUnit = Object.entries(snapshot.minutesByUnit).reduce<
		Record<string, number>
	>((accumulator, [unitKey, value]) => {
		if (!UNIT_KEY_SET.has(unitKey)) {
			return accumulator;
		}

		accumulator[unitKey] = toSafeNumber(value);
		return accumulator;
	}, {});
	const wordsByUnit = Object.entries(snapshot.wordsByUnit).reduce<
		Record<string, number>
	>((accumulator, [unitKey, value]) => {
		if (!UNIT_KEY_SET.has(unitKey)) {
			return accumulator;
		}

		accumulator[unitKey] = toSafeNumber(value);
		return accumulator;
	}, {});
	const highestTrackedWords = Math.max(0, ...Object.values(wordsByUnit));
	const masteredWordsTotal = Math.max(
		toSafeNumber(snapshot.masteredWordsTotal),
		highestTrackedWords,
	);
	const referenceDateKey = toIsoDateKey(new Date());
	const streakDays = toSafeNumber(snapshot.streakDays);
	const lastCompletedDate = parseDateKeyFromStorage(snapshot.lastCompletedDate);
	const dailyObjectivesByDate = normalizeDailyObjectivesByDate(
		snapshot.dailyObjectivesByDate ?? {},
		referenceDateKey,
	);
	const streakDelta =
		lastCompletedDate !== null
			? getDayDelta(lastCompletedDate, referenceDateKey)
			: 0;
	const effectiveStreakDays = streakDelta > 2 ? 0 : streakDays;

	return {
		canReadArabic,
		currentUnitId,
		completedUnitIds,
		minutesByUnit,
		wordsByUnit,
		masteredWordsTotal,
		streakDays: effectiveStreakDays,
		lastCompletedDate,
		dailyObjectivesByDate,
	};
};

const areNumberMapsEqual = (
	left: Record<string, number>,
	right: Record<string, number>,
): boolean => {
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);

	if (leftKeys.length !== rightKeys.length) {
		return false;
	}

	for (const key of leftKeys) {
		if (left[key] !== right[key]) {
			return false;
		}
	}

	return true;
};

const areStringArraysEqual = (left: string[], right: string[]): boolean => {
	if (left.length !== right.length) {
		return false;
	}

	for (let index = 0; index < left.length; index += 1) {
		if (left[index] !== right[index]) {
			return false;
		}
	}

	return true;
};

const areSnapshotsEqual = (
	left: LearningProgressSnapshot,
	right: LearningProgressSnapshot,
): boolean => {
	return (
		left.canReadArabic === right.canReadArabic &&
		left.currentUnitId === right.currentUnitId &&
		left.masteredWordsTotal === right.masteredWordsTotal &&
		left.streakDays === right.streakDays &&
		left.lastCompletedDate === right.lastCompletedDate &&
		areStringArraysEqual(left.completedUnitIds, right.completedUnitIds) &&
		areNumberMapsEqual(left.minutesByUnit, right.minutesByUnit) &&
		areNumberMapsEqual(left.wordsByUnit, right.wordsByUnit) &&
		areDailyObjectivesEqual(
			left.dailyObjectivesByDate,
			right.dailyObjectivesByDate,
		)
	);
};

const readSnapshotFromStorage = (): LearningProgressSnapshot => {
	if (!isBrowser()) {
		return createDefaultProgressSnapshot();
	}

	const snapshot: LearningProgressSnapshot = {
		canReadArabic: parseBooleanFromStorage(
			window.localStorage.getItem(LEARNING_PROGRESS_STORAGE_KEYS.canReadArabic),
		),
		currentUnitId: toSafeNumber(
			Number(
				window.localStorage.getItem(
					LEARNING_PROGRESS_STORAGE_KEYS.currentUnitId,
				),
			),
		),
		completedUnitIds: parseArrayFromStorage(
			window.localStorage.getItem(
				LEARNING_PROGRESS_STORAGE_KEYS.completedUnitIds,
			),
		),
		minutesByUnit: parseNumberMapFromStorage(
			window.localStorage.getItem(LEARNING_PROGRESS_STORAGE_KEYS.minutesByUnit),
		),
		wordsByUnit: parseNumberMapFromStorage(
			window.localStorage.getItem(LEARNING_PROGRESS_STORAGE_KEYS.wordsByUnit),
		),
		masteredWordsTotal: toSafeNumber(
			Number(
				window.localStorage.getItem(
					LEARNING_PROGRESS_STORAGE_KEYS.masteredWordsTotal,
				),
			),
		),
		streakDays: toSafeNumber(
			Number(
				window.localStorage.getItem(LEARNING_PROGRESS_STORAGE_KEYS.streakDays),
			),
		),
		lastCompletedDate: parseDateKeyFromStorage(
			window.localStorage.getItem(
				LEARNING_PROGRESS_STORAGE_KEYS.lastCompletedDate,
			),
		),
		dailyObjectivesByDate: parseDailyObjectivesByDateFromStorage(
			window.localStorage.getItem(
				LEARNING_PROGRESS_STORAGE_KEYS.dailyObjectivesByDate,
			),
		),
	};

	if (!isLearningUnitId(snapshot.currentUnitId)) {
		snapshot.currentUnitId = PROLOGUE_UNIT_ID;
	}

	return normalizeSnapshot(snapshot);
};

const writeSnapshotToStorage = (snapshot: LearningProgressSnapshot): void => {
	if (!isBrowser()) {
		return;
	}

	if (snapshot.canReadArabic === null) {
		window.localStorage.removeItem(
			LEARNING_PROGRESS_STORAGE_KEYS.canReadArabic,
		);
	} else {
		window.localStorage.setItem(
			LEARNING_PROGRESS_STORAGE_KEYS.canReadArabic,
			String(snapshot.canReadArabic),
		);
	}

	window.localStorage.setItem(
		LEARNING_PROGRESS_STORAGE_KEYS.currentUnitId,
		String(snapshot.currentUnitId),
	);
	window.localStorage.setItem(
		LEARNING_PROGRESS_STORAGE_KEYS.completedUnitIds,
		JSON.stringify(snapshot.completedUnitIds),
	);
	window.localStorage.setItem(
		LEARNING_PROGRESS_STORAGE_KEYS.minutesByUnit,
		JSON.stringify(snapshot.minutesByUnit),
	);
	window.localStorage.setItem(
		LEARNING_PROGRESS_STORAGE_KEYS.wordsByUnit,
		JSON.stringify(snapshot.wordsByUnit),
	);
	window.localStorage.setItem(
		LEARNING_PROGRESS_STORAGE_KEYS.masteredWordsTotal,
		String(snapshot.masteredWordsTotal),
	);
	window.localStorage.setItem(
		LEARNING_PROGRESS_STORAGE_KEYS.streakDays,
		String(snapshot.streakDays),
	);

	if (snapshot.lastCompletedDate) {
		window.localStorage.setItem(
			LEARNING_PROGRESS_STORAGE_KEYS.lastCompletedDate,
			snapshot.lastCompletedDate,
		);
	} else {
		window.localStorage.removeItem(
			LEARNING_PROGRESS_STORAGE_KEYS.lastCompletedDate,
		);
	}

	if (Object.keys(snapshot.dailyObjectivesByDate).length === 0) {
		window.localStorage.removeItem(
			LEARNING_PROGRESS_STORAGE_KEYS.dailyObjectivesByDate,
		);
	} else {
		window.localStorage.setItem(
			LEARNING_PROGRESS_STORAGE_KEYS.dailyObjectivesByDate,
			JSON.stringify(snapshot.dailyObjectivesByDate),
		);
	}
};

export const resetLearningProgressStorage = (): void => {
	if (!isBrowser()) {
		return;
	}

	for (const storageKey of Object.values(LEARNING_PROGRESS_STORAGE_KEYS)) {
		window.localStorage.removeItem(storageKey);
	}

	window.dispatchEvent(new CustomEvent(LEARNING_PROGRESS_UPDATED_EVENT));
};

const completeUnit = (
	currentSnapshot: LearningProgressSnapshot,
	unitId: number,
): LearningProgressSnapshot => {
	const unit = getLearningUnitById(unitId);
	if (!unit || currentSnapshot.currentUnitId !== unitId) {
		return currentSnapshot;
	}

	const nextCompletedUnitIds = Array.from(
		new Set([...currentSnapshot.completedUnitIds, unit.key]),
	);
	const nextMinutesByUnit = {
		...currentSnapshot.minutesByUnit,
		[unit.key]: Math.max(
			currentSnapshot.minutesByUnit[unit.key] ?? 0,
			unit.requirements.minutesWatched,
		),
	};
	const nextWordsByUnit = {
		...currentSnapshot.wordsByUnit,
		[unit.key]: Math.max(
			currentSnapshot.wordsByUnit[unit.key] ?? 0,
			unit.requirements.foundationWords,
		),
	};

	return normalizeSnapshot({
		...currentSnapshot,
		canReadArabic:
			unitId === PROLOGUE_UNIT_ID ? true : currentSnapshot.canReadArabic,
		completedUnitIds: nextCompletedUnitIds,
		minutesByUnit: nextMinutesByUnit,
		wordsByUnit: nextWordsByUnit,
	});
};

export function useLearningProgress(): UseLearningProgressReturn {
	const [snapshot, setSnapshot] = useState<LearningProgressSnapshot>(() =>
		readSnapshotFromStorage(),
	);
	const [todayDateKey, setTodayDateKey] = useState<string>(() =>
		toIsoDateKey(new Date()),
	);
	const [immersionSyncVersion, setImmersionSyncVersion] = useState<number>(0);

	const updateSnapshot = useCallback(
		(
			updater: (current: LearningProgressSnapshot) => LearningProgressSnapshot,
		) => {
			setSnapshot((current) => {
				const next = normalizeSnapshot(updater(current));
				return areSnapshotsEqual(current, next) ? current : next;
			});
		},
		[],
	);

	useEffect(() => {
		if (!isBrowser()) {
			return;
		}

		const syncTodayDate = () => {
			setTodayDateKey((current) => {
				const next = toIsoDateKey(new Date());
				return current === next ? current : next;
			});
		};

		const handleImmersionProgressUpdate = () => {
			syncTodayDate();
			setImmersionSyncVersion((current) => current + 1);
		};

		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				handleImmersionProgressUpdate();
			}
		};

		const intervalId = window.setInterval(syncTodayDate, 60_000);
		window.addEventListener(
			IMMERSION_PROGRESS_UPDATED_EVENT,
			handleImmersionProgressUpdate,
		);
		window.addEventListener("focus", handleImmersionProgressUpdate);
		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			window.clearInterval(intervalId);
			window.removeEventListener(
				IMMERSION_PROGRESS_UPDATED_EVENT,
				handleImmersionProgressUpdate,
			);
			window.removeEventListener("focus", handleImmersionProgressUpdate);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, []);

	useEffect(() => {
		writeSnapshotToStorage(snapshot);
		if (isBrowser()) {
			window.dispatchEvent(new CustomEvent(LEARNING_PROGRESS_UPDATED_EVENT));
		}
	}, [snapshot]);

	useEffect(() => {
		if (!isBrowser()) {
			return;
		}

		const syncFromStorage = () => {
			setSnapshot((current) => {
				const next = readSnapshotFromStorage();
				return areSnapshotsEqual(current, next) ? current : next;
			});
		};

		const handleStorage = (event: StorageEvent) => {
			if (!event.key || STORAGE_KEY_SET.has(event.key)) {
				syncFromStorage();
			}
		};

		window.addEventListener("storage", handleStorage);
		window.addEventListener(LEARNING_PROGRESS_UPDATED_EVENT, syncFromStorage);

		return () => {
			window.removeEventListener("storage", handleStorage);
			window.removeEventListener(
				LEARNING_PROGRESS_UPDATED_EVENT,
				syncFromStorage,
			);
		};
	}, []);

	const setCanReadArabic = useCallback(
		(value: boolean) => {
			updateSnapshot((current) => {
				if (value) {
					return normalizeSnapshot({
						...current,
						canReadArabic: true,
						completedUnitIds: [
							...current.completedUnitIds,
							getLearningUnitKey(PROLOGUE_UNIT_ID),
						],
					});
				}

				return normalizeSnapshot({
					...current,
					canReadArabic: false,
					currentUnitId: PROLOGUE_UNIT_ID,
					completedUnitIds: current.completedUnitIds.filter(
						(unitKey) => UNIT_ID_BY_KEY.get(unitKey) !== PROLOGUE_UNIT_ID,
					),
				});
			});
		},
		[updateSnapshot],
	);

	const setUnitProgress = useCallback(
		(unitId: number, progress: UnitProgressInput) => {
			if (!isLearningUnitId(unitId)) {
				return;
			}

			updateSnapshot((current) => {
				if (unitId > current.currentUnitId) {
					return current;
				}

				const unit = getLearningUnitById(unitId);
				if (!unit) {
					return current;
				}

				const unitKey = unit.key;
				const nextMinutesByUnit = { ...current.minutesByUnit };
				const nextWordsByUnit = { ...current.wordsByUnit };

				if (typeof progress.minutesWatched === "number") {
					nextMinutesByUnit[unitKey] = Math.max(
						current.minutesByUnit[unitKey] ?? 0,
						toSafeNumber(progress.minutesWatched),
					);
				}

				if (typeof progress.foundationWords === "number") {
					nextWordsByUnit[unitKey] = Math.max(
						current.wordsByUnit[unitKey] ?? 0,
						toSafeNumber(progress.foundationWords),
					);
				}

				const nextMasteredWordsTotal = Math.max(
					current.masteredWordsTotal,
					nextWordsByUnit[unitKey] ?? 0,
				);
				const nextSnapshot = normalizeSnapshot({
					...current,
					minutesByUnit: nextMinutesByUnit,
					wordsByUnit: nextWordsByUnit,
					masteredWordsTotal: nextMasteredWordsTotal,
				});

				const minutesReached = nextSnapshot.minutesByUnit[unitKey] ?? 0;
				const wordsReached = nextSnapshot.wordsByUnit[unitKey] ?? 0;
				const meetsRequirements =
					minutesReached >= unit.requirements.minutesWatched &&
					wordsReached >= unit.requirements.foundationWords;

				if (!meetsRequirements || nextSnapshot.currentUnitId !== unitId) {
					return nextSnapshot;
				}

				return completeUnit(nextSnapshot, unitId);
			});
		},
		[updateSnapshot],
	);

	const markUnitCompleted = useCallback(
		(unitId: number) => {
			if (!isLearningUnitId(unitId)) {
				return;
			}

			updateSnapshot((current) => completeUnit(current, unitId));
		},
		[updateSnapshot],
	);

	const markCurrentUnitCompleted = useCallback(() => {
		updateSnapshot((current) => completeUnit(current, current.currentUnitId));
	}, [updateSnapshot]);

	const markDailyImmersionComplete = useCallback(() => {
		const dateKey = toIsoDateKey(new Date());
		updateSnapshot((current) =>
			withDailyObjectiveProgress(current, dateKey, {
				immersionCompleted: true,
			}),
		);
	}, [updateSnapshot]);

	const markDailyReviewsComplete = useCallback(() => {
		const dateKey = toIsoDateKey(new Date());
		updateSnapshot((current) =>
			withDailyObjectiveProgress(current, dateKey, {
				reviewsCompleted: true,
			}),
		);
	}, [updateSnapshot]);

	const resetLearningProgress = useCallback(() => {
		updateSnapshot(() => createDefaultProgressSnapshot());
	}, [updateSnapshot]);

	const completedUnitIdSet = useMemo(
		() => new Set(snapshot.completedUnitIds),
		[snapshot.completedUnitIds],
	);

	const getUnitState = useCallback(
		(unitId: number): LearningUnitState => {
			if (!isLearningUnitId(unitId)) {
				return "locked";
			}

			const unitKey = getLearningUnitKey(unitId);
			if (completedUnitIdSet.has(unitKey)) {
				return "done";
			}

			if (snapshot.currentUnitId === unitId) {
				return "current";
			}

			return "locked";
		},
		[completedUnitIdSet, snapshot.currentUnitId],
	);

	const isUnitActionable = useCallback(
		(unitId: number): boolean => getUnitState(unitId) === "current",
		[getUnitState],
	);

	const getUnitProgressMetrics = useCallback(
		(unitId: number): LearningUnitProgressMetrics => {
			const unit = getLearningUnitById(unitId);
			if (!unit) {
				return {
					minutesWatched: 0,
					foundationWords: 0,
					minutesRatio: 0,
					wordsRatio: 0,
				};
			}

			const unitState = getUnitState(unitId);
			const unitKey = unit.key;
			const minutesWatched =
				unitState === "done"
					? unit.requirements.minutesWatched
					: (snapshot.minutesByUnit[unitKey] ?? 0);
			const foundationWords =
				unitState === "done"
					? unit.requirements.foundationWords
					: (snapshot.wordsByUnit[unitKey] ?? 0);

			return {
				minutesWatched,
				foundationWords,
				minutesRatio: toProgressRatio(
					minutesWatched,
					unit.requirements.minutesWatched,
				),
				wordsRatio: toProgressRatio(
					foundationWords,
					unit.requirements.foundationWords,
				),
			};
		},
		[getUnitState, snapshot.minutesByUnit, snapshot.wordsByUnit],
	);

	const foundationLevel = useMemo(() => {
		let activeLevel = FOUNDATION_LEVEL_THRESHOLDS[0];
		for (const threshold of FOUNDATION_LEVEL_THRESHOLDS) {
			if (snapshot.masteredWordsTotal >= threshold.minWords) {
				activeLevel = threshold;
			}
		}

		return activeLevel;
	}, [snapshot.masteredWordsTotal]);

	const nextFoundationLevel = useMemo(
		() =>
			FOUNDATION_LEVEL_THRESHOLDS.find(
				(threshold) => threshold.minWords > snapshot.masteredWordsTotal,
			) ?? null,
		[snapshot.masteredWordsTotal],
	);

	const dailyObjectiveDate = todayDateKey;
	const dailyImmersionMinutes = useMemo(() => {
		void immersionSyncVersion;
		return getImmersionDailyMinutes(dailyObjectiveDate);
	}, [dailyObjectiveDate, immersionSyncVersion]);
	const dailyObjectiveEntry = useMemo(
		() =>
			snapshot.dailyObjectivesByDate[dailyObjectiveDate] ??
			createEmptyDailyObjectiveEntry(),
		[dailyObjectiveDate, snapshot.dailyObjectivesByDate],
	);
	const isDailyImmersionComplete =
		dailyObjectiveEntry.immersionCompleted ||
		dailyImmersionMinutes >= DAILY_IMMERSION_TARGET_MINUTES;
	const isDailyReviewsComplete = dailyObjectiveEntry.reviewsCompleted;
	const isDailyObjectiveComplete =
		isDailyImmersionComplete && isDailyReviewsComplete;

	useEffect(() => {
		if (dailyImmersionMinutes < DAILY_IMMERSION_TARGET_MINUTES) {
			return;
		}

		updateSnapshot((current) =>
			withDailyObjectiveProgress(current, dailyObjectiveDate, {
				immersionCompleted: true,
			}),
		);
	}, [dailyImmersionMinutes, dailyObjectiveDate, updateSnapshot]);

	const streakDays = useMemo(() => {
		if (
			!snapshot.lastCompletedDate ||
			!isIsoDateKey(snapshot.lastCompletedDate)
		) {
			return 0;
		}

		const dayDelta = getDayDelta(
			snapshot.lastCompletedDate,
			dailyObjectiveDate,
		);
		if (dayDelta > 2) {
			return 0;
		}

		return Math.max(0, toSafeNumber(snapshot.streakDays));
	}, [dailyObjectiveDate, snapshot.lastCompletedDate, snapshot.streakDays]);

	const canRecoverStreakToday = useMemo(() => {
		if (
			!snapshot.lastCompletedDate ||
			!isIsoDateKey(snapshot.lastCompletedDate)
		) {
			return false;
		}

		if (isDailyObjectiveComplete) {
			return false;
		}

		return getDayDelta(snapshot.lastCompletedDate, dailyObjectiveDate) === 2;
	}, [
		dailyObjectiveDate,
		isDailyObjectiveComplete,
		snapshot.lastCompletedDate,
	]);

	const [weekStartDate, weekEndDate] = useMemo(() => {
		const referenceDate = new Date(`${dailyObjectiveDate}T00:00:00.000Z`);
		return getWeekRangeForDate(referenceDate);
	}, [dailyObjectiveDate]);

	const weeklyGoalCompletedDays = useMemo(
		() =>
			countCompletedObjectivesInRange(
				snapshot.dailyObjectivesByDate,
				weekStartDate,
				weekEndDate,
			),
		[snapshot.dailyObjectivesByDate, weekEndDate, weekStartDate],
	);
	const weeklyGoalProgressPercent = Math.round(
		toProgressRatio(weeklyGoalCompletedDays, WEEKLY_GOAL_TARGET_DAYS) * 100,
	);
	const isWeeklyGoalComplete =
		weeklyGoalCompletedDays >= WEEKLY_GOAL_TARGET_DAYS;

	const [monthStartDate, monthEndDate] = useMemo(() => {
		const monthStart = new Date(`${dailyObjectiveDate}T00:00:00.000Z`);
		monthStart.setUTCDate(1);

		const monthEnd = new Date(monthStart);
		monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
		monthEnd.setUTCDate(0);

		return [toIsoDateKey(monthStart), toIsoDateKey(monthEnd)] as const;
	}, [dailyObjectiveDate]);

	const monthlyGoalCompletedDays = useMemo(
		() =>
			countCompletedObjectivesInRange(
				snapshot.dailyObjectivesByDate,
				monthStartDate,
				monthEndDate,
			),
		[monthEndDate, monthStartDate, snapshot.dailyObjectivesByDate],
	);
	const monthlyGoalProgressPercent = Math.round(
		toProgressRatio(monthlyGoalCompletedDays, MONTHLY_GOAL_TARGET_DAYS) * 100,
	);
	const isMonthlyGoalComplete =
		monthlyGoalCompletedDays >= MONTHLY_GOAL_TARGET_DAYS;

	return {
		units: LEARNING_PATH_UNITS,
		canReadArabic: snapshot.canReadArabic,
		currentUnitId: snapshot.currentUnitId,
		completedUnitIds: snapshot.completedUnitIds,
		minutesByUnit: snapshot.minutesByUnit,
		wordsByUnit: snapshot.wordsByUnit,
		masteredWordsTotal: snapshot.masteredWordsTotal,
		streakDays,
		lastCompletedDate: snapshot.lastCompletedDate,
		canRecoverStreakToday,
		dailyObjectiveDate,
		dailyImmersionMinutes,
		dailyImmersionTargetMinutes: DAILY_IMMERSION_TARGET_MINUTES,
		isDailyImmersionComplete,
		isDailyReviewsComplete,
		isDailyObjectiveComplete,
		weeklyGoalCompletedDays,
		weeklyGoalTargetDays: WEEKLY_GOAL_TARGET_DAYS,
		weeklyGoalProgressPercent,
		isWeeklyGoalComplete,
		monthlyGoalCompletedDays,
		monthlyGoalTargetDays: MONTHLY_GOAL_TARGET_DAYS,
		monthlyGoalProgressPercent,
		isMonthlyGoalComplete,
		foundationLevel,
		nextFoundationLevel,
		getUnitState,
		isUnitActionable,
		getUnitProgressMetrics,
		setCanReadArabic,
		setUnitProgress,
		markUnitCompleted,
		markCurrentUnitCompleted,
		markDailyImmersionComplete,
		markDailyReviewsComplete,
		resetLearningProgress,
	};
}

export default useLearningProgress;
