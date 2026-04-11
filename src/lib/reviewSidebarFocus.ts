export const REVIEW_CARD_FLIPPED_EVENT = "arur:review-card-flipped";

export type ReviewCardFlippedEventDetail = {
	source: "cards-review";
};

export const emitReviewCardFlipped = () => {
	if (typeof window === "undefined") {
		return;
	}

	window.dispatchEvent(
		new CustomEvent<ReviewCardFlippedEventDetail>(REVIEW_CARD_FLIPPED_EVENT, {
			detail: {
				source: "cards-review",
			},
		}),
	);
};
