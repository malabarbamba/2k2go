import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import type { HeatmapData } from "@/components/ReviewHeatmap";
import { LEARNING_PROGRESS_STORAGE_KEYS } from "@/hooks/useLearningProgress";
import { supabase } from "@/integrations/supabase/client";
import { readImmersionDailyLog } from "@/lib/immersionProgress";

export type HeatmapSource =
	| { type: "preview" }
	| { type: "local" }
	| { type: "real"; userId: string };

const ISO_DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isSameHeatmapSource = (
	left: HeatmapSource | null,
	right: HeatmapSource | null,
): boolean => {
	if (left === right) {
		return true;
	}

	if (!left || !right || left.type !== right.type) {
		return false;
	}

	if (left.type === "preview" || left.type === "local") {
		return true;
	}

	return right.type === "real" && left.userId === right.userId;
};

interface HeatmapContextType {
	heatmapData: HeatmapData[];
	loading: boolean;
	error: string | null;
	source: HeatmapSource | null;
	refreshHeatmap: () => void;
	addActivity: (date: string, count: number) => void;
	setSource: (source: HeatmapSource) => void;
}

const HeatmapContext = createContext<HeatmapContextType | null>(null);

interface DailyActivityRow {
	activity_date: string;
	reviews_count: number | null;
	time_spent_minutes: number | null;
	time_spent_seconds: number | null;
}

const isIsoDateKey = (value: string): boolean =>
	ISO_DATE_KEY_PATTERN.test(value);

interface LocalDailyObjectiveEntry {
	immersionCompleted: boolean;
	reviewsCompleted: boolean;
}

const readLocalDailyObjectives = (): Record<
	string,
	LocalDailyObjectiveEntry
> => {
	if (typeof window === "undefined") {
		return {};
	}

	const rawDailyObjectives = window.localStorage.getItem(
		LEARNING_PROGRESS_STORAGE_KEYS.dailyObjectivesByDate,
	);
	if (!rawDailyObjectives) {
		return {};
	}

	try {
		const parsed = JSON.parse(rawDailyObjectives);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return {};
		}

		const normalized: Record<string, LocalDailyObjectiveEntry> = {};
		for (const [dateKey, rawEntry] of Object.entries(
			parsed as Record<string, unknown>,
		)) {
			if (!isIsoDateKey(dateKey) || !rawEntry || typeof rawEntry !== "object") {
				continue;
			}

			const source = rawEntry as {
				immersionCompleted?: unknown;
				reviewsCompleted?: unknown;
			};
			normalized[dateKey] = {
				immersionCompleted: source.immersionCompleted === true,
				reviewsCompleted: source.reviewsCompleted === true,
			};
		}

		return normalized;
	} catch {
		return {};
	}
};

const buildLocalHeatmapData = (): HeatmapData[] => {
	const mergedByDate = new Map<string, HeatmapData>();
	const localDailyObjectives = readLocalDailyObjectives();

	for (const [date, entry] of Object.entries(localDailyObjectives)) {
		const reviewsCount = entry.reviewsCompleted ? 1 : 0;
		const hasConnection = entry.immersionCompleted || entry.reviewsCompleted;

		if (!hasConnection) {
			continue;
		}

		mergedByDate.set(date, {
			date,
			count: reviewsCount,
			hasConnection: true,
			immersionActive: entry.immersionCompleted,
			immersionMinutes: entry.immersionCompleted ? 15 : 0,
		});
	}

	const immersionLog = readImmersionDailyLog();
	for (const [date, logEntry] of Object.entries(immersionLog)) {
		if (!isIsoDateKey(date) || !logEntry || logEntry.seconds <= 0) {
			continue;
		}

		const current = mergedByDate.get(date);
		if (current) {
			current.hasConnection = true;
			current.immersionActive = true;
			current.immersionMinutes = Math.max(
				current.immersionMinutes ?? 0,
				Math.floor(logEntry.seconds / 60),
			);
			mergedByDate.set(date, current);
			continue;
		}

		mergedByDate.set(date, {
			date,
			count: 0,
			hasConnection: true,
			immersionActive: true,
			immersionMinutes: Math.floor(logEntry.seconds / 60),
		});
	}

	return Array.from(mergedByDate.values()).sort((a, b) =>
		a.date.localeCompare(b.date),
	);
};

const buildRealHeatmapData = async (userId: string): Promise<HeatmapData[]> => {
	const fromDate = new Date();
	fromDate.setDate(fromDate.getDate() - 364);
	const fromDateStr = fromDate.toISOString().split("T")[0];

	const untypedClient = supabase as any;
	const { data: dailyData, error: dailyQueryError } = await untypedClient
		.from("user_daily_activity")
		.select("activity_date,reviews_count,time_spent_minutes,time_spent_seconds")
		.eq("user_id", userId)
		.gte("activity_date", fromDateStr)
		.order("activity_date", { ascending: true });

	if (dailyQueryError) {
		throw dailyQueryError;
	}

	const dailyRows: DailyActivityRow[] = Array.isArray(dailyData)
		? (dailyData as DailyActivityRow[])
		: [];

	const mergedByDate = new Map<string, HeatmapData>();
	dailyRows.forEach((row) => {
		if (!row.activity_date) {
			return;
		}

		mergedByDate.set(row.activity_date, {
			date: row.activity_date,
			count: Math.max(0, row.reviews_count ?? 0),
			hasConnection: true,
			immersionActive:
				Math.max(0, row.time_spent_minutes ?? 0) > 0 ||
				Math.max(0, row.time_spent_seconds ?? 0) > 0,
			immersionMinutes:
				Math.max(0, row.time_spent_minutes ?? 0) > 0
					? Math.max(0, row.time_spent_minutes ?? 0)
					: Math.floor(Math.max(0, row.time_spent_seconds ?? 0) / 60),
		});
	});

	return Array.from(mergedByDate.values()).sort((a, b) =>
		a.date.localeCompare(b.date),
	);
};

const generateInitialHeatmapData = (): HeatmapData[] => {
	const days: HeatmapData[] = [];
	const today = new Date();

	for (let i = 364; i >= 0; i--) {
		const date = new Date(today);
		date.setDate(date.getDate() - i);

		const dayOfWeek = date.getDay();
		const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

		let count = 0;
		if (!isWeekend && Math.random() > 0.3) {
			count = Math.floor(Math.random() * 45) + 5;
		} else if (isWeekend && Math.random() > 0.7) {
			count = Math.floor(Math.random() * 10) + 1;
		}

		days.push({
			date: date.toISOString().split("T")[0],
			count,
			hasConnection: count > 0,
		});
	}

	return days;
};

interface HeatmapProviderProps {
	children: ReactNode;
}

export const HeatmapProvider: React.FC<HeatmapProviderProps> = ({
	children,
}) => {
	const previewDatasetRef = useRef<HeatmapData[]>(generateInitialHeatmapData());
	const realDatasetCacheRef = useRef<Map<string, HeatmapData[]>>(new Map());
	const requestVersionRef = useRef(0);
	const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([]);
	const [source, setSourceState] = useState<HeatmapSource | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const applyPreviewData = useCallback((requestVersion: number) => {
		if (requestVersion !== requestVersionRef.current) {
			return;
		}

		setHeatmapData(previewDatasetRef.current);
		setError(null);
		setLoading(false);
	}, []);

	const applyLocalData = useCallback((requestVersion: number) => {
		if (requestVersion !== requestVersionRef.current) {
			return;
		}

		setHeatmapData(buildLocalHeatmapData());
		setError(null);
		setLoading(false);
	}, []);

	const fetchRealHeatmap = useCallback(
		async (userId: string, requestVersion: number) => {
			const cachedData = realDatasetCacheRef.current.get(userId);
			if (cachedData) {
				setHeatmapData(cachedData);
			}

			setLoading(!cachedData);
			setError(null);

			try {
				const mapped = await buildRealHeatmapData(userId);

				if (requestVersion !== requestVersionRef.current) {
					return;
				}

				setHeatmapData(mapped);
				realDatasetCacheRef.current.set(userId, mapped);
				setError(null);
			} catch (err) {
				if (requestVersion !== requestVersionRef.current) {
					return;
				}

				console.error("Error fetching heatmap data:", err);
				setError(
					err instanceof Error
						? err.message
						: "Impossible de charger la heatmap",
				);
			} finally {
				if (requestVersion === requestVersionRef.current) {
					setLoading(false);
				}
			}
		},
		[],
	);

	const runSourceLoad = useCallback(
		(nextSource: HeatmapSource) => {
			const requestVersion = requestVersionRef.current + 1;
			requestVersionRef.current = requestVersion;

			if (nextSource.type === "preview") {
				applyPreviewData(requestVersion);
				return;
			}

			if (nextSource.type === "local") {
				applyLocalData(requestVersion);
				return;
			}

			void fetchRealHeatmap(nextSource.userId, requestVersion);
		},
		[applyLocalData, applyPreviewData, fetchRealHeatmap],
	);

	useEffect(() => {
		if (!source) {
			return;
		}

		runSourceLoad(source);
	}, [source, runSourceLoad]);

	const refreshHeatmap = useCallback(() => {
		if (!source) {
			return;
		}

		runSourceLoad(source);
	}, [source, runSourceLoad]);

	const addActivity = useCallback(
		(date: string, count: number) => {
			setHeatmapData((prev) => {
				const existing = prev.find((d) => d.date === date);
				if (existing) {
					return prev.map((d) =>
						d.date === date
							? { ...d, count: d.count + count, hasConnection: true }
							: d,
					);
				}

				return [...prev, { date, count, hasConnection: true }];
			});

			if (source?.type === "preview") {
				const existing = previewDatasetRef.current.find((d) => d.date === date);
				if (existing) {
					previewDatasetRef.current = previewDatasetRef.current.map((d) =>
						d.date === date
							? { ...d, count: d.count + count, hasConnection: true }
							: d,
					);
				} else {
					previewDatasetRef.current = [
						...previewDatasetRef.current,
						{ date, count, hasConnection: true },
					];
				}
			}
		},
		[source],
	);

	const setSource = useCallback((nextSource: HeatmapSource) => {
		setSourceState((current) =>
			isSameHeatmapSource(current, nextSource) ? current : nextSource,
		);
	}, []);

	return (
		<HeatmapContext.Provider
			value={{
				heatmapData,
				loading,
				error,
				source,
				refreshHeatmap,
				addActivity,
				setSource,
			}}
		>
			{children}
		</HeatmapContext.Provider>
	);
};

export const useHeatmap = (): HeatmapContextType => {
	const context = useContext(HeatmapContext);
	if (!context) {
		throw new Error("useHeatmap must be used within a HeatmapProvider");
	}
	return context;
};
