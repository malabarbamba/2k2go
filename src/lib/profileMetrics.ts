import type { HeatmapData } from "@/components/ReviewHeatmap";

const DAY_MS = 86_400_000;

const toUtcDate = (dateKey: string): Date =>
	new Date(`${dateKey}T00:00:00.000Z`);

const toIsoDateKeyUtc = (value: Date): string =>
	new Date(
		Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
	)
		.toISOString()
		.split("T")[0];

const getDayDelta = (fromDateKey: string, toDateKey: string): number => {
	const fromUtc = toUtcDate(fromDateKey).getTime();
	const toUtc = toUtcDate(toDateKey).getTime();
	if (!Number.isFinite(fromUtc) || !Number.isFinite(toUtc)) {
		return 0;
	}
	return Math.round((toUtc - fromUtc) / DAY_MS);
};

const hasReviewedOnDate = (entry: HeatmapData | undefined): boolean =>
	Boolean(entry && entry.count > 0);

export const computeReviewStreakDays = (
	heatmapData: HeatmapData[],
	referenceDate: Date = new Date(),
): number => {
	const reviewEntriesByDate = new Map(
		heatmapData.map((entry) => [entry.date, entry]),
	);
	const todayKey = toIsoDateKeyUtc(referenceDate);
	const yesterday = new Date(referenceDate);
	yesterday.setUTCDate(yesterday.getUTCDate() - 1);
	const yesterdayKey = toIsoDateKeyUtc(yesterday);

	const anchorDateKey = hasReviewedOnDate(reviewEntriesByDate.get(todayKey))
		? todayKey
		: hasReviewedOnDate(reviewEntriesByDate.get(yesterdayKey))
			? yesterdayKey
			: null;

	if (!anchorDateKey) {
		return 0;
	}

	let streakDays = 0;
	for (let offset = 0; offset < 366; offset += 1) {
		const date = toUtcDate(anchorDateKey);
		date.setUTCDate(date.getUTCDate() - offset);
		const dateKey = toIsoDateKeyUtc(date);
		if (!hasReviewedOnDate(reviewEntriesByDate.get(dateKey))) {
			break;
		}
		streakDays += 1;
	}

	return streakDays;
};

export const isObjectiveDayComplete = (entry: HeatmapData): boolean =>
	entry.count > 0 && entry.immersionActive === true;

export const countObjectiveDaysBetween = (
	heatmapData: HeatmapData[],
	startDateKey: string,
	endDateKey: string,
): number =>
	heatmapData.reduce((count, entry) => {
		if (entry.date < startDateKey || entry.date > endDateKey) {
			return count;
		}
		return count + (isObjectiveDayComplete(entry) ? 1 : 0);
	}, 0);

export const getWeekRangeForDate = (referenceDate: Date): [string, string] => {
	const cursor = new Date(referenceDate);
	cursor.setUTCHours(0, 0, 0, 0);
	const day = cursor.getUTCDay();
	const offsetToMonday = day === 0 ? -6 : 1 - day;
	cursor.setUTCDate(cursor.getUTCDate() + offsetToMonday);

	const weekStart = toIsoDateKeyUtc(cursor);
	const weekEndDate = new Date(cursor);
	weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
	return [weekStart, toIsoDateKeyUtc(weekEndDate)];
};

export const getMonthRangeForDate = (referenceDate: Date): [string, string] => {
	const monthStart = new Date(referenceDate);
	monthStart.setUTCHours(0, 0, 0, 0);
	monthStart.setUTCDate(1);

	const monthEnd = new Date(monthStart);
	monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
	monthEnd.setUTCDate(0);

	return [toIsoDateKeyUtc(monthStart), toIsoDateKeyUtc(monthEnd)];
};

export const computeObjectiveGoalMetrics = (
	heatmapData: HeatmapData[],
	referenceDate: Date = new Date(),
): {
	weeklyCompletedDays: number;
	monthlyCompletedDays: number;
} => {
	const [weekStart, weekEnd] = getWeekRangeForDate(referenceDate);
	const [monthStart, monthEnd] = getMonthRangeForDate(referenceDate);

	return {
		weeklyCompletedDays: countObjectiveDaysBetween(
			heatmapData,
			weekStart,
			weekEnd,
		),
		monthlyCompletedDays: countObjectiveDaysBetween(
			heatmapData,
			monthStart,
			monthEnd,
		),
	};
};

export const sumImmersionMinutes = (heatmapData: HeatmapData[]): number =>
	heatmapData.reduce(
		(total, entry) =>
			total + Math.max(0, Math.round(entry.immersionMinutes ?? 0)),
		0,
	);

export const hasReviewedToday = (
	heatmapData: HeatmapData[],
	referenceDate: Date = new Date(),
): boolean => {
	const todayKey = toIsoDateKeyUtc(referenceDate);
	return heatmapData.some(
		(entry) => entry.date === todayKey && entry.count > 0,
	);
};

export { getDayDelta, toIsoDateKeyUtc };
