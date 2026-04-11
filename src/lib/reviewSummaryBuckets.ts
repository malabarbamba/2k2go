import type { VocabCard } from "@/data/vocabCards";

export type ReviewSummaryBucket = "new" | "learning" | "review";

export type ReviewSummaryCounts = {
	newCards: number;
	inProgressCards: number;
	reviewCards: number;
};

export function resolveReviewSummaryBucket(
	status: string | null | undefined,
): ReviewSummaryBucket {
	const normalizedStatus = status?.trim().toLowerCase();
	if (normalizedStatus === "new") {
		return "new";
	}
	if (normalizedStatus === "learning" || normalizedStatus === "relearning") {
		return "learning";
	}
	return "review";
}

export function countReviewSummaryBuckets(
	cards: Array<Pick<VocabCard, "status">>,
): ReviewSummaryCounts {
	return cards.reduce(
		(acc, card) => {
			const bucket = resolveReviewSummaryBucket(card.status);
			if (bucket === "new") {
				acc.newCards += 1;
			} else if (bucket === "learning") {
				acc.inProgressCards += 1;
			} else {
				acc.reviewCards += 1;
			}
			return acc;
		},
		{ newCards: 0, inProgressCards: 0, reviewCards: 0 },
	);
}
