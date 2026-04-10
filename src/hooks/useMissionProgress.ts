import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { foundation2kDeck } from "@/data/foundation2kDeck";
import type { ReviewType } from "@/lib/deck-perso-adapters";
import { searchAppV2VocabularyBank } from "@/services/appV2VocabularySearchService";
import { fetchDueCardsByReviewTypes } from "@/services/deckPersoDueReviewService";
import type { SearchCardsV2Row } from "@/services/deckPersoService";

export interface UseMissionProgressReturn {
	totalCards: number;
	masteredCards: number;
	dueCount: number;
	loading: boolean;
	error: string | null;
}

// Note: Alphabet deck has its own dedicated mini-deck UX, not FSRS reviews
const DEFAULT_HOME_REVIEW_TYPES: ReviewType[] = [
	"foundation",
	"collected",
	"sent",
];
const DEFAULT_DUE_LIMIT = 40;
const MASTERY_SCORE_THRESHOLD = 0.8;
const FALLBACK_TOTAL_CARDS = foundation2kDeck.length;

const toFiniteNumber = (value: unknown): number => {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
};

const getRowStatus = (row: SearchCardsV2Row): string => {
	const status = (row as { status?: unknown }).status;
	return typeof status === "string" ? status.toLowerCase() : "";
};

const getRowMaturityScore = (row: SearchCardsV2Row): number => {
	const maturityScore = (row as { maturity_score?: unknown }).maturity_score;
	if (maturityScore != null) {
		return toFiniteNumber(maturityScore);
	}
	return toFiniteNumber((row as { score?: unknown }).score);
};

const countMasteredFoundationCards = (rows: SearchCardsV2Row[]): number => {
	return rows.reduce((count, row) => {
		if (getRowStatus(row) === "mastered") {
			return count + 1;
		}

		return getRowMaturityScore(row) >= MASTERY_SCORE_THRESHOLD
			? count + 1
			: count;
	}, 0);
};

export const useMissionProgress = (): UseMissionProgressReturn => {
	const { user, loading: authLoading } = useAuth();
	const userId = user?.id ?? null;

	const [totalCards, setTotalCards] = useState(FALLBACK_TOTAL_CARDS);
	const [masteredCards, setMasteredCards] = useState(0);
	const [dueCount, setDueCount] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const requestIdRef = useRef(0);

	useEffect(() => {
		let cancelled = false;
		const requestId = requestIdRef.current + 1;
		requestIdRef.current = requestId;

		const isCurrentRequest = (): boolean =>
			!cancelled && requestIdRef.current === requestId;

		if (authLoading) {
			if (isCurrentRequest()) {
				setLoading(true);
			}
			return () => {
				cancelled = true;
			};
		}

		if (!userId) {
			if (isCurrentRequest()) {
				setTotalCards(FALLBACK_TOTAL_CARDS);
				setMasteredCards(0);
				setDueCount(0);
				setError(null);
				setLoading(false);
			}
			return () => {
				cancelled = true;
			};
		}

		const fetchMissionProgress = async () => {
			setLoading(true);
			setError(null);

			try {
				const [dueResult, foundationResult] = await Promise.all([
					fetchDueCardsByReviewTypes(
						DEFAULT_HOME_REVIEW_TYPES,
						DEFAULT_DUE_LIMIT,
					),
					searchAppV2VocabularyBank("", FALLBACK_TOTAL_CARDS, ["foundation"]),
				]);

				if (!isCurrentRequest()) {
					return;
				}

				const errors: string[] = [];

				let nextDueCount = 0;
				if (dueResult.ok) {
					nextDueCount = Array.isArray(dueResult.data)
						? dueResult.data.length
						: 0;
				} else {
					errors.push(dueResult.error.message);
				}

				let nextTotalCards = FALLBACK_TOTAL_CARDS;
				let nextMasteredCards = 0;
				if (foundationResult.ok) {
					const foundationRows = Array.isArray(foundationResult.data)
						? foundationResult.data
						: [];
					nextTotalCards =
						foundationRows.length > 0
							? foundationRows.length
							: FALLBACK_TOTAL_CARDS;
					nextMasteredCards = countMasteredFoundationCards(foundationRows);
				} else {
					errors.push(foundationResult.error.message);
				}

				setTotalCards(nextTotalCards);
				setMasteredCards(Math.min(nextMasteredCards, nextTotalCards));
				setDueCount(nextDueCount);
				setError(errors[0] ?? null);
			} catch (err) {
				if (isCurrentRequest()) {
					setTotalCards(FALLBACK_TOTAL_CARDS);
					setMasteredCards(0);
					setDueCount(0);
					setError(
						err instanceof Error
							? err.message
							: "Failed to fetch mission progress",
					);
				}
			} finally {
				if (isCurrentRequest()) {
					setLoading(false);
				}
			}
		};

		void fetchMissionProgress();

		return () => {
			cancelled = true;
		};
	}, [authLoading, userId]);

	return {
		totalCards,
		masteredCards,
		dueCount,
		loading,
		error,
	};
};
