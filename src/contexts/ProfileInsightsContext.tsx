import { AnimatePresence, motion } from "framer-motion";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	DISTINCTIONS,
	type DistinctionDefinition,
	type DistinctionId,
} from "@/components/progression/distinctionsData";
import { useAuth } from "@/contexts/AuthContext";
import { useHeatmap } from "@/contexts/HeatmapContext";
import { FOUNDATION_LEVEL_THRESHOLDS } from "@/features/learning-path/unitData";
import {
	getImmersionTotalMinutes,
	IMMERSION_DAILY_LOG_KEY,
	IMMERSION_PROGRESS_UPDATED_EVENT,
} from "@/lib/immersionProgress";
import { PROFILE_INSIGHTS_REFRESH_EVENT } from "@/lib/profileInsightsEvents";
import {
	computeObjectiveGoalMetrics,
	computeReviewStreakDays,
	sumImmersionMinutes,
} from "@/lib/profileMetrics";
import {
	fetchLearningPathProgress,
	fetchLearningProgressSummary,
	fetchTotalImmersionMinutes,
	fetchWordsAcquiredCount,
	type LearningPathProgressRecord,
	type LearningProgressSummaryRecord,
	markAccomplishmentNotified,
	syncImmersionMinutesToServer,
	syncUserAccomplishments,
	type UserAccomplishmentRecord,
} from "@/services/profileProgressService";

const WEEKLY_GOAL_TARGET_DAYS = 5;
const MONTHLY_GOAL_TARGET_DAYS = 20;
const DISTINCTION_OVERLAY_VERSION = 1;
const PROFILE_INSIGHTS_STALE_MS = 60_000;
const PROFILE_INSIGHTS_FOCUS_STALE_MS = 180_000;
const PROFILE_INSIGHTS_REFRESH_WINDOW_MS = 60_000;
const PROFILE_INSIGHTS_REFRESH_WARN_THRESHOLD = 6;

type ProfileInsightsRefreshReason =
	| "mount"
	| "focus"
	| "event"
	| "manual"
	| "queued-event";

const DISTINCTION_BY_ID = new Map<DistinctionId, DistinctionDefinition>(
	DISTINCTIONS.map((distinction) => [distinction.id, distinction]),
);

const CONFETTI_PARTICLES = [
	{ id: 0, x: -240, y: -160, rotate: -40, color: "#facc15", delay: 0.0 },
	{ id: 1, x: -190, y: -210, rotate: 60, color: "#4ade80", delay: 0.05 },
	{ id: 2, x: -120, y: -220, rotate: -80, color: "#60a5fa", delay: 0.1 },
	{ id: 3, x: -40, y: -250, rotate: 45, color: "#fb7185", delay: 0.08 },
	{ id: 4, x: 30, y: -245, rotate: -65, color: "#f97316", delay: 0.12 },
	{ id: 5, x: 105, y: -220, rotate: 90, color: "#22c55e", delay: 0.16 },
	{ id: 6, x: 175, y: -190, rotate: -50, color: "#38bdf8", delay: 0.18 },
	{ id: 7, x: 235, y: -155, rotate: 35, color: "#f472b6", delay: 0.22 },
	{ id: 8, x: -215, y: -75, rotate: 20, color: "#facc15", delay: 0.14 },
	{ id: 9, x: -150, y: -105, rotate: -25, color: "#34d399", delay: 0.2 },
	{ id: 10, x: -75, y: -130, rotate: 75, color: "#a78bfa", delay: 0.24 },
	{ id: 11, x: 0, y: -145, rotate: -90, color: "#f87171", delay: 0.28 },
	{ id: 12, x: 82, y: -126, rotate: 58, color: "#f59e0b", delay: 0.26 },
	{ id: 13, x: 155, y: -102, rotate: -42, color: "#4ade80", delay: 0.3 },
	{ id: 14, x: 220, y: -68, rotate: 88, color: "#60a5fa", delay: 0.34 },
] as const;

type FoundationLevelThreshold = (typeof FOUNDATION_LEVEL_THRESHOLDS)[number];

interface ProfileInsightsContextValue {
	loading: boolean;
	error: string | null;
	wordsAcquiredCount: number;
	totalImmersionMinutes: number;
	reviewStreakDays: number;
	weeklyGoalCompletedDays: number;
	weeklyGoalTargetDays: number;
	weeklyGoalProgressPercent: number;
	monthlyGoalCompletedDays: number;
	monthlyGoalTargetDays: number;
	monthlyGoalProgressPercent: number;
	foundationLevel: FoundationLevelThreshold;
	nextFoundationLevel: FoundationLevelThreshold | null;
	learningPathProgress: LearningPathProgressRecord | null;
	accomplishments: UserAccomplishmentRecord[];
	unlockedDistinctionIds: Set<DistinctionId>;
	refreshInsights: () => Promise<void>;
}

const ProfileInsightsContext =
	createContext<ProfileInsightsContextValue | null>(null);

const getFoundationLevel = (
	wordsAcquiredCount: number,
): FoundationLevelThreshold => {
	let currentLevel = FOUNDATION_LEVEL_THRESHOLDS[0];
	for (const threshold of FOUNDATION_LEVEL_THRESHOLDS) {
		if (wordsAcquiredCount >= threshold.minWords) {
			currentLevel = threshold;
		}
	}
	return currentLevel;
};

const getNextFoundationLevel = (
	wordsAcquiredCount: number,
): FoundationLevelThreshold | null =>
	FOUNDATION_LEVEL_THRESHOLDS.find(
		(threshold) => threshold.minWords > wordsAcquiredCount,
	) ?? null;

const resolveDistinction = (
	accomplishmentType: string,
): DistinctionDefinition | null => {
	if (!DISTINCTION_BY_ID.has(accomplishmentType as DistinctionId)) {
		return null;
	}
	return DISTINCTION_BY_ID.get(accomplishmentType as DistinctionId) ?? null;
};

const reportRefreshFrequency = (
	history: number[],
	reason: ProfileInsightsRefreshReason,
) => {
	const cutoff = Date.now() - PROFILE_INSIGHTS_REFRESH_WINDOW_MS;
	const recentRefreshes = history.filter((timestamp) => timestamp >= cutoff);
	recentRefreshes.push(Date.now());
	if (recentRefreshes.length >= PROFILE_INSIGHTS_REFRESH_WARN_THRESHOLD) {
		console.warn(
			`[profile-insights] ${recentRefreshes.length} refreshes in the last minute (latest: ${reason})`,
		);
	}
	return recentRefreshes;
};

const DistinctionUnlockOverlay = ({
	accomplishment,
	onDismiss,
}: {
	accomplishment: UserAccomplishmentRecord | null;
	onDismiss: () => void;
}) => {
	const [showText, setShowText] = useState(false);
	const [isDismissible, setIsDismissible] = useState(false);
	const distinction = accomplishment
		? resolveDistinction(accomplishment.accomplishmentType)
		: null;

	useEffect(() => {
		setShowText(false);
		setIsDismissible(false);

		if (!accomplishment) {
			return;
		}

		const textTimer = window.setTimeout(() => setShowText(true), 2500);
		const dismissTimer = window.setTimeout(() => setIsDismissible(true), 3400);

		return () => {
			window.clearTimeout(textTimer);
			window.clearTimeout(dismissTimer);
		};
	}, [accomplishment]);

	if (!distinction) {
		return null;
	}

	return (
		<AnimatePresence>
			{accomplishment ? (
				<motion.div
					className="fixed inset-0 z-[9800] flex h-full w-full items-center justify-center overflow-hidden bg-black/82 px-6 backdrop-blur-sm"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					onClick={() => {
						if (!isDismissible) {
							return;
						}
						onDismiss();
					}}
					aria-label={
						isDismissible
							? `Fermer la distinction ${distinction.name}`
							: `Animation de la distinction ${distinction.name}`
					}
				>
					<div className="pointer-events-none relative flex flex-col items-center justify-center gap-8 text-white">
						<div className="relative flex h-[220px] w-[220px] items-center justify-center">
							{CONFETTI_PARTICLES.map((particle) => (
								<motion.div
									key={particle.id}
									className="absolute h-3 w-2 rounded-full"
									style={{ backgroundColor: particle.color }}
									initial={{ x: 0, y: 0, opacity: 0, scale: 0.6 }}
									animate={{
										x: [0, particle.x],
										y: [0, particle.y, 240],
										rotate: [0, particle.rotate, particle.rotate * 1.6],
										opacity: [0, 1, 1, 0],
										scale: [0.6, 1, 1, 0.8],
									}}
									transition={{
										duration: 2.7,
										delay: 1.45 + particle.delay,
										ease: "easeOut",
									}}
								/>
							))}

							<motion.div
								className="relative flex h-[150px] w-[150px] items-center justify-center"
								initial={{ scale: 0.84, rotate: 0 }}
								animate={{ scale: [0.84, 1, 1], rotate: [0, 360, 960, 1440] }}
								transition={{ duration: 2.15, ease: [0.16, 1, 0.3, 1] }}
							>
								<motion.div
									className="absolute h-[150px] w-[150px] rounded-[28px] object-contain drop-shadow-[0_0_38px_rgba(255,255,255,0.18)]"
									initial={{ opacity: 1, scale: 1 }}
									animate={{ opacity: [1, 1, 0], scale: [1, 1.02, 0.96] }}
									transition={{ duration: 1.2, ease: "easeInOut" }}
									style={{
										backgroundImage: `url(${distinction.iconSrc})`,
										backgroundPosition: "center",
										backgroundRepeat: "no-repeat",
										backgroundSize: "contain",
										filter: "brightness(0) saturate(0%)",
									}}
								/>
								<motion.div
									className="absolute h-[150px] w-[150px] rounded-[28px] object-contain drop-shadow-[0_0_42px_rgba(255,255,255,0.24)]"
									initial={{ opacity: 0, scale: 0.92 }}
									animate={{ opacity: [0, 0, 1], scale: [0.92, 0.92, 1] }}
									transition={{ duration: 2.1, ease: "easeOut" }}
									style={{
										backgroundImage: `url(${distinction.iconSrc})`,
										backgroundPosition: "center",
										backgroundRepeat: "no-repeat",
										backgroundSize: "contain",
									}}
								/>
							</motion.div>
						</div>

						<AnimatePresence>
							{showText ? (
								<motion.div
									className="space-y-2 text-center"
									initial={{ opacity: 0, y: 16 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: 10 }}
									transition={{ duration: 0.55, ease: "easeOut" }}
								>
									<p className="text-sm font-medium uppercase tracking-[0.22em] text-white/72 sm:text-base">
										Felicitations, tu as debloque la distinction
									</p>
									<p className="text-2xl font-semibold text-white sm:text-3xl">
										{distinction.name}
									</p>
								</motion.div>
							) : null}
						</AnimatePresence>
					</div>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
};

export const ProfileInsightsProvider = ({
	children,
}: {
	children: ReactNode;
}) => {
	const { user } = useAuth();
	const { heatmapData, refreshHeatmap, setSource } = useHeatmap();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [wordsAcquiredCount, setWordsAcquiredCount] = useState(0);
	const [serverTotalImmersionMinutes, setServerTotalImmersionMinutes] =
		useState(0);
	const [localTotalImmersionMinutes, setLocalTotalImmersionMinutes] = useState(
		() => getImmersionTotalMinutes(),
	);
	const [learningProgressSummary, setLearningProgressSummary] =
		useState<LearningProgressSummaryRecord | null>(null);
	const [learningPathProgress, setLearningPathProgress] =
		useState<LearningPathProgressRecord | null>(null);
	const [accomplishments, setAccomplishments] = useState<
		UserAccomplishmentRecord[]
	>([]);
	const [activeAccomplishment, setActiveAccomplishment] =
		useState<UserAccomplishmentRecord | null>(null);
	const inFlightRefreshRef = useRef<Promise<void> | null>(null);
	const queuedForcedRefreshRef = useRef(false);
	const lastRefreshAtRef = useRef<number>(0);
	const refreshHistoryRef = useRef<number[]>([]);

	useEffect(() => {
		if (user?.id) {
			setSource({ type: "real", userId: user.id });
			return;
		}
		setSource({ type: "local" });
	}, [setSource, user?.id]);

	const requestRefresh = useCallback(
		async (force: boolean, reason: ProfileInsightsRefreshReason) => {
			const now = Date.now();
			if (inFlightRefreshRef.current) {
				queuedForcedRefreshRef.current =
					queuedForcedRefreshRef.current || force;
				return inFlightRefreshRef.current;
			}

			if (!user?.id) {
				lastRefreshAtRef.current = 0;
				queuedForcedRefreshRef.current = false;
				inFlightRefreshRef.current = null;
				setLoading(false);
				setError(null);
				setLearningPathProgress(null);
				setAccomplishments([]);
				setWordsAcquiredCount(0);
				setServerTotalImmersionMinutes(0);
				setLearningProgressSummary(null);
				return;
			}

			if (
				!force &&
				now - lastRefreshAtRef.current < PROFILE_INSIGHTS_STALE_MS
			) {
				return;
			}

			const refreshPromise = (async () => {
				refreshHistoryRef.current = reportRefreshFrequency(
					refreshHistoryRef.current,
					reason,
				);
				setLoading(true);
				setError(null);

				const immersionSyncResult = await syncImmersionMinutesToServer(user.id);
				if (!immersionSyncResult.ok) {
					setError(immersionSyncResult.error.message);
				}

				refreshHeatmap();

				const [
					pathResult,
					progressSummaryResult,
					wordsResult,
					immersionResult,
					accomplishmentsResult,
				] = await Promise.all([
					fetchLearningPathProgress(),
					fetchLearningProgressSummary(),
					fetchWordsAcquiredCount(user.id),
					fetchTotalImmersionMinutes(),
					syncUserAccomplishments(),
				]);

				if (pathResult.ok) {
					setLearningPathProgress(pathResult.data);
				} else {
					setError((current) => current ?? pathResult.error.message);
				}

				if (progressSummaryResult.ok) {
					setLearningProgressSummary(progressSummaryResult.data);
				} else {
					setError((current) => current ?? progressSummaryResult.error.message);
				}

				if (wordsResult.ok) {
					setWordsAcquiredCount(wordsResult.data);
				} else {
					setError((current) => current ?? wordsResult.error.message);
				}

				if (immersionResult.ok) {
					setServerTotalImmersionMinutes(immersionResult.data);
				} else {
					setError((current) => current ?? immersionResult.error.message);
				}

				if (accomplishmentsResult.ok) {
					setAccomplishments(accomplishmentsResult.data);
				} else {
					setError((current) => current ?? accomplishmentsResult.error.message);
				}

				lastRefreshAtRef.current = Date.now();
				setLoading(false);
			})().finally(() => {
				inFlightRefreshRef.current = null;
				const shouldRunQueuedForceRefresh = queuedForcedRefreshRef.current;
				queuedForcedRefreshRef.current = false;
				if (shouldRunQueuedForceRefresh) {
					void requestRefresh(true, "queued-event");
				}
			});

			inFlightRefreshRef.current = refreshPromise;
			return refreshPromise;
		},
		[refreshHeatmap, user?.id],
	);

	const refreshInsights = useCallback(
		() => requestRefresh(true, "manual"),
		[requestRefresh],
	);

	useEffect(() => {
		void requestRefresh(false, "mount");
	}, [requestRefresh]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const syncLocalImmersionTotalMinutes = () => {
			setLocalTotalImmersionMinutes(getImmersionTotalMinutes());
		};

		const handleStorage = (event: StorageEvent) => {
			if (!event.key || event.key === IMMERSION_DAILY_LOG_KEY) {
				syncLocalImmersionTotalMinutes();
			}
		};

		syncLocalImmersionTotalMinutes();
		window.addEventListener(
			IMMERSION_PROGRESS_UPDATED_EVENT,
			syncLocalImmersionTotalMinutes,
		);
		window.addEventListener("focus", syncLocalImmersionTotalMinutes);
		window.addEventListener("storage", handleStorage);

		return () => {
			window.removeEventListener(
				IMMERSION_PROGRESS_UPDATED_EVENT,
				syncLocalImmersionTotalMinutes,
			);
			window.removeEventListener("focus", syncLocalImmersionTotalMinutes);
			window.removeEventListener("storage", handleStorage);
		};
	}, []);

	useEffect(() => {
		if (typeof window === "undefined" || !user?.id) {
			return;
		}

		let timeoutId: number | null = null;
		let refreshRequestedByEvent = false;
		const scheduleRefresh = (force: boolean) => {
			refreshRequestedByEvent = refreshRequestedByEvent || force;
			if (timeoutId !== null) {
				window.clearTimeout(timeoutId);
			}
			timeoutId = window.setTimeout(() => {
				if (
					refreshRequestedByEvent ||
					Date.now() - lastRefreshAtRef.current >=
						PROFILE_INSIGHTS_FOCUS_STALE_MS
				) {
					void requestRefresh(
						refreshRequestedByEvent,
						refreshRequestedByEvent ? "event" : "focus",
					);
				}
				refreshRequestedByEvent = false;
				timeoutId = null;
			}, 200);
		};

		const handleImmersionProgressUpdated = () => scheduleRefresh(true);
		const handleProfileInsightsRefresh = () => scheduleRefresh(true);
		const handleFocus = () => scheduleRefresh(false);

		window.addEventListener(
			IMMERSION_PROGRESS_UPDATED_EVENT,
			handleImmersionProgressUpdated,
		);
		window.addEventListener(
			PROFILE_INSIGHTS_REFRESH_EVENT,
			handleProfileInsightsRefresh,
		);
		window.addEventListener("focus", handleFocus);

		return () => {
			if (timeoutId !== null) {
				window.clearTimeout(timeoutId);
			}
			window.removeEventListener(
				IMMERSION_PROGRESS_UPDATED_EVENT,
				handleImmersionProgressUpdated,
			);
			window.removeEventListener(
				PROFILE_INSIGHTS_REFRESH_EVENT,
				handleProfileInsightsRefresh,
			);
			window.removeEventListener("focus", handleFocus);
		};
	}, [requestRefresh, user?.id]);

	useEffect(() => {
		if (activeAccomplishment) {
			return;
		}

		const nextAccomplishment = accomplishments.find(
			(item) =>
				(item.notifiedAt === null ||
					item.overlayVersion < DISTINCTION_OVERLAY_VERSION) &&
				resolveDistinction(item.accomplishmentType),
		);
		if (nextAccomplishment) {
			setActiveAccomplishment(nextAccomplishment);
		}
	}, [accomplishments, activeAccomplishment]);

	const handleDismissActiveAccomplishment = useCallback(() => {
		if (!activeAccomplishment) {
			return;
		}

		const accomplishmentType = activeAccomplishment.accomplishmentType;
		setAccomplishments((current) =>
			current.map((item) =>
				item.accomplishmentType === accomplishmentType
					? {
							...item,
							notifiedAt: new Date().toISOString(),
							overlayVersion: DISTINCTION_OVERLAY_VERSION,
						}
					: item,
			),
		);
		setActiveAccomplishment(null);
		void markAccomplishmentNotified(accomplishmentType);
	}, [activeAccomplishment]);

	const unlockedDistinctionIds = useMemo(() => {
		const nextSet = new Set<DistinctionId>();
		for (const accomplishment of accomplishments) {
			const distinction = resolveDistinction(accomplishment.accomplishmentType);
			if (distinction) {
				nextSet.add(distinction.id);
			}
		}
		return nextSet;
	}, [accomplishments]);

	const reviewStreakDays = useMemo(
		() =>
			user?.id
				? Math.max(0, learningProgressSummary?.currentStreak ?? 0)
				: computeReviewStreakDays(heatmapData),
		[heatmapData, learningProgressSummary?.currentStreak, user?.id],
	);

	const { weeklyCompletedDays, monthlyCompletedDays } = useMemo(
		() => computeObjectiveGoalMetrics(heatmapData),
		[heatmapData],
	);

	const weeklyGoalProgressPercent = Math.round(
		(Math.min(weeklyCompletedDays, WEEKLY_GOAL_TARGET_DAYS) /
			WEEKLY_GOAL_TARGET_DAYS) *
			100,
	);
	const monthlyGoalProgressPercent = Math.round(
		(Math.min(monthlyCompletedDays, MONTHLY_GOAL_TARGET_DAYS) /
			MONTHLY_GOAL_TARGET_DAYS) *
			100,
	);

	const totalImmersionMinutes = useMemo(() => {
		if (user?.id) {
			return Math.max(serverTotalImmersionMinutes, localTotalImmersionMinutes);
		}
		return Math.max(
			sumImmersionMinutes(heatmapData),
			localTotalImmersionMinutes,
		);
	}, [
		heatmapData,
		localTotalImmersionMinutes,
		serverTotalImmersionMinutes,
		user?.id,
	]);

	const foundationLevel = useMemo(
		() => getFoundationLevel(wordsAcquiredCount),
		[wordsAcquiredCount],
	);
	const nextFoundationLevel = useMemo(
		() => getNextFoundationLevel(wordsAcquiredCount),
		[wordsAcquiredCount],
	);

	const contextValue = useMemo<ProfileInsightsContextValue>(
		() => ({
			loading,
			error,
			wordsAcquiredCount,
			totalImmersionMinutes,
			reviewStreakDays,
			weeklyGoalCompletedDays: weeklyCompletedDays,
			weeklyGoalTargetDays: WEEKLY_GOAL_TARGET_DAYS,
			weeklyGoalProgressPercent,
			monthlyGoalCompletedDays: monthlyCompletedDays,
			monthlyGoalTargetDays: MONTHLY_GOAL_TARGET_DAYS,
			monthlyGoalProgressPercent,
			foundationLevel,
			nextFoundationLevel,
			learningPathProgress,
			accomplishments,
			unlockedDistinctionIds,
			refreshInsights,
		}),
		[
			accomplishments,
			error,
			foundationLevel,
			learningPathProgress,
			loading,
			monthlyCompletedDays,
			monthlyGoalProgressPercent,
			nextFoundationLevel,
			refreshInsights,
			reviewStreakDays,
			totalImmersionMinutes,
			unlockedDistinctionIds,
			weeklyCompletedDays,
			weeklyGoalProgressPercent,
			wordsAcquiredCount,
		],
	);

	return (
		<ProfileInsightsContext.Provider value={contextValue}>
			{children}
			<DistinctionUnlockOverlay
				accomplishment={activeAccomplishment}
				onDismiss={handleDismissActiveAccomplishment}
			/>
		</ProfileInsightsContext.Provider>
	);
};

export const useProfileInsights = (): ProfileInsightsContextValue => {
	const context = useContext(ProfileInsightsContext);
	if (!context) {
		throw new Error(
			"useProfileInsights must be used within a ProfileInsightsProvider",
		);
	}
	return context;
};
