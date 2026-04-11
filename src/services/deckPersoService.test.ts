import { afterEach, describe, expect, it } from "vitest";

import { deckPersoDueReviewInternals } from "@/services/deckPersoService";

afterEach(() => {
	window.sessionStorage.clear();
});

describe("shouldFallbackToLegacySubmitRpc", () => {
	it("falls back on runtime 500 responses", () => {
		const shouldFallback =
			deckPersoDueReviewInternals.shouldFallbackToLegacySubmitRpc({
				status: 500,
				message: "Unable to commit scheduler review",
				context: { code: "COMMIT_REVIEW_FAILED" },
			});

		expect(shouldFallback).toBe(true);
	});

	it("does not fallback on client 400 validation errors", () => {
		const shouldFallback =
			deckPersoDueReviewInternals.shouldFallbackToLegacySubmitRpc({
				status: 400,
				message: "invalid payload",
				context: { code: "INVALID_COMPUTE_RESPONSE_SHAPE" },
			});

		expect(shouldFallback).toBe(false);
	});
});

describe("submit review RPC signature detection", () => {
	it("detects missing batch submit signature", () => {
		expect(
			deckPersoDueReviewInternals.isMissingBatchSubmitReviewSignature({
				code: "PGRST202",
				message: "Could not find the function public.submit_review_fsrs_v2(p_session_id, p_reviews) in the schema cache",
				details: null,
				hint: null,
				name: "PostgrestError",
			}),
		).toBe(true);
	});
});

describe("review session storage", () => {
	it("stores separate session ids per account", () => {
		const firstAccountSessionId =
			deckPersoDueReviewInternals.getOrCreateReviewSessionId("user-1");
		const secondAccountSessionId =
			deckPersoDueReviewInternals.getOrCreateReviewSessionId("user-2");

		expect(firstAccountSessionId).toBeTruthy();
		expect(secondAccountSessionId).toBeTruthy();
		expect(secondAccountSessionId).not.toBe(firstAccountSessionId);
		expect(
			deckPersoDueReviewInternals.getOrCreateReviewSessionId("user-1"),
		).toBe(firstAccountSessionId);
	});

	it("clears only the targeted account session id", () => {
		const preservedSessionId =
			deckPersoDueReviewInternals.getOrCreateReviewSessionId("user-1");
		const clearedSessionId =
			deckPersoDueReviewInternals.getOrCreateReviewSessionId("user-2");

		deckPersoDueReviewInternals.clearReviewSessionId("user-2");

		const nextSessionId =
			deckPersoDueReviewInternals.getOrCreateReviewSessionId("user-2");

		expect(nextSessionId).not.toBe(clearedSessionId);
		expect(
			deckPersoDueReviewInternals.getOrCreateReviewSessionId("user-1"),
		).toBe(preservedSessionId);
	});
});

describe("isReviewSessionNotOpenError", () => {
	it("detects database review session lifecycle errors", () => {
		expect(
			deckPersoDueReviewInternals.isReviewSessionNotOpenError({
				message: "Review session not found or not open",
			}),
		).toBe(true);
	});

	it("detects normalized runtime error codes", () => {
		expect(
			deckPersoDueReviewInternals.isReviewSessionNotOpenError({
				context: { code: "review_session_not_open" },
			}),
		).toBe(true);
	});
});
