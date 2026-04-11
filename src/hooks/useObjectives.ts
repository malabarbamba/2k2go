import { useEffect, useRef, useState } from "react";
import type { DataMode } from "@/hooks/usePreviewMode";
import { supabase } from "@/integrations/supabase/client";
import {
	fetchDueReviewCount,
	searchVocabularyBank,
} from "@/services/deckPersoService";
import { parseSchedulerDueResponse } from "@/services/schedulerRuntimeSchema";

export interface Objective {
	id: string;
	type: "review" | "new_cards" | "monthly_regularity";
	label: string;
	current: number;
	target: number;
	progress: number; // 0-100
}

interface UseObjectivesReturn {
	objectives: Objective[];
	loading: boolean;
	error: string | null;
}

const PREVIEW_OBJECTIVES: Objective[] = [
	{
		id: "review-daily",
		type: "review",
		label: "Revues du jour",
		current: 86,
		target: 100,
		progress: 86,
	},
	{
		id: "new-cards-daily",
		type: "new_cards",
		label: "Maitrise des 2000 mots",
		current: 140,
		target: 2000,
		progress: 7,
	},
];

const FOUNDATION_OBJECTIVE_TARGET = 2000;
const REVIEW_QUEUE_LIMIT = 50;

type LooseQueryBuilder = {
	select: (
		columns: string,
		options?: { count?: "exact"; head?: boolean },
	) => LooseQueryBuilder;
	eq: (column: string, value: unknown) => LooseQueryBuilder;
	gte: (column: string, value: string) => LooseQueryBuilder;
	lt: (column: string, value: string) => LooseQueryBuilder;
	maybeSingle: <T>() => Promise<T>;
};

type LooseSupabaseClient = {
	from: (table: string) => LooseQueryBuilder;
};

const countPendingReviewsFromRuntimeQueue = async (): Promise<
	number | null
> => {
	const invoke = (
		supabase as unknown as {
			functions?: {
				invoke?: (
					name: string,
					options?: { body?: Record<string, unknown> },
				) => Promise<{ data: unknown; error: unknown }>;
			};
		}
	).functions?.invoke;

	if (typeof invoke !== "function") {
		return null;
	}

	const { data, error } = await invoke("scheduler-due-v1", {
		body: {
			schema_version: 1,
			now_utc: new Date().toISOString(),
			queue_limit: REVIEW_QUEUE_LIMIT,
			include_new_candidates: false,
			candidate_new_limit: 0,
		},
	});

	if (error) {
		return null;
	}

	try {
		const parsed = parseSchedulerDueResponse(data);
		return parsed.ordered_queue.length;
	} catch {
		return null;
	}
};

const areObjectivesEqual = (left: Objective[], right: Objective[]): boolean => {
	if (left === right) {
		return true;
	}

	if (left.length !== right.length) {
		return false;
	}

	for (let index = 0; index < left.length; index += 1) {
		const current = left[index];
		const next = right[index];
		if (
			current.id !== next.id ||
			current.type !== next.type ||
			current.label !== next.label ||
			current.current !== next.current ||
			current.target !== next.target ||
			current.progress !== next.progress
		) {
			return false;
		}
	}

	return true;
};

export const useObjectives = (
	userId: string | undefined,
	mode: DataMode,
): UseObjectivesReturn => {
	const [realObjectives, setRealObjectives] = useState<Objective[]>([]);
	const [loading, setLoading] = useState(mode === "real");
	const [error, setError] = useState<string | null>(null);
	const previousRealUserIdRef = useRef<string | undefined>(undefined);
	const objectivesCacheRef = useRef<Objective[]>([]);

	useEffect(() => {
		objectivesCacheRef.current = realObjectives;
	}, [realObjectives]);

	useEffect(() => {
		let cancelled = false;

		const fetchObjectives = async () => {
			if (!userId || mode !== "real") {
				previousRealUserIdRef.current = undefined;
				setLoading(false);
				setError(null);
				return;
			}

			const userChanged = previousRealUserIdRef.current !== userId;
			previousRealUserIdRef.current = userId;
			const hasCachedObjectives =
				!userChanged && objectivesCacheRef.current.length > 0;

			setLoading(!hasCachedObjectives);
			setError(null);

			if (userChanged) {
				setRealObjectives([]);
				objectivesCacheRef.current = [];
			}

			try {
				const supabaseLoose = supabase as unknown as LooseSupabaseClient;
				const today = new Date();
				today.setHours(0, 0, 0, 0);
				const todayStr = today.toISOString().split("T")[0];

				const [
					activityResult,
					runtimePendingReviewCount,
					dueResult,
					foundationResult,
				] = await Promise.all([
					supabaseLoose
						.from("user_daily_activity")
						.select("activity_date,reviews_count,new_words")
						.eq("user_id", userId)
						.eq("activity_date", todayStr)
						.maybeSingle() as Promise<{
						data: { reviews_count?: number | null } | null;
						error: { message?: string } | null;
					}>,
					countPendingReviewsFromRuntimeQueue(),
					fetchDueReviewCount("personal_and_foundation"),
					searchVocabularyBank("", FOUNDATION_OBJECTIVE_TARGET, ["foundation"]),
				]);

				const { data: activityData, error: activityError } = activityResult;

				const activityReviewCount = Math.max(
					0,
					Number(activityData?.reviews_count ?? 0),
				);
				const reviewedTodayCount = activityReviewCount;
				const dueReviewCount =
					typeof runtimePendingReviewCount === "number"
						? Math.max(0, runtimePendingReviewCount)
						: dueResult.ok
							? Math.max(0, dueResult.data)
							: 0;
				const reviewTarget = reviewedTodayCount + dueReviewCount;
				const reviewProgress =
					reviewTarget > 0
						? Math.min(
								100,
								Math.round((reviewedTodayCount / reviewTarget) * 100),
							)
						: reviewedTodayCount > 0
							? 100
							: 0;

				const foundationSeenCount = foundationResult.ok
					? foundationResult.data.reduce(
							(count, row) => (row.is_seen ? count + 1 : count),
							0,
						)
					: 0;

				const objectiveErrors = [
					activityError?.message,
					dueResult.ok ? null : dueResult.error.message,
					foundationResult.ok ? null : foundationResult.error.message,
				].filter((value): value is string => typeof value === "string");

				const objectivesList: Objective[] = [
					{
						id: "review-daily",
						type: "review",
						label: "Revues du jour",
						current: reviewedTodayCount,
						target: reviewTarget,
						progress: reviewProgress,
					},
					{
						id: "new-cards-daily",
						type: "new_cards",
						label: "Maitrise des 2000 mots",
						current: foundationSeenCount,
						target: FOUNDATION_OBJECTIVE_TARGET,
						progress: Math.min(
							100,
							Math.round(
								(foundationSeenCount / FOUNDATION_OBJECTIVE_TARGET) * 100,
							),
						),
					},
				];

				if (!cancelled) {
					setRealObjectives((currentObjectives) =>
						areObjectivesEqual(currentObjectives, objectivesList)
							? currentObjectives
							: objectivesList,
					);
					objectivesCacheRef.current = objectivesList;
					setError(objectiveErrors[0] ?? null);
				}
			} catch (err) {
				console.error("Error fetching objectives:", err);
				if (!cancelled) {
					setError(
						err instanceof Error ? err.message : "Failed to fetch objectives",
					);
					if (userChanged) {
						setRealObjectives([]);
						objectivesCacheRef.current = [];
					}
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		};

		fetchObjectives();

		return () => {
			cancelled = true;
		};
	}, [userId, mode]);

	return {
		objectives: mode === "real" ? realObjectives : PREVIEW_OBJECTIVES,
		loading,
		error,
	};
};
