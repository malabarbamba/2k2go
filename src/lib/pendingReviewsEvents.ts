export const PENDING_REVIEWS_INVALIDATED_EVENT =
	"app:pending-reviews-invalidated";

export const emitPendingReviewsInvalidated = (): void => {
	if (typeof window === "undefined") {
		return;
	}

	window.dispatchEvent(new CustomEvent(PENDING_REVIEWS_INVALIDATED_EVENT));
};
