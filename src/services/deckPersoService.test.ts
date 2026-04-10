import { describe, expect, it } from "vitest";

import { deckPersoDueReviewInternals } from "@/services/deckPersoService";

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
