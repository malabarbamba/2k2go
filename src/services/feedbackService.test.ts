import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultFeedbackFormData } from "@/lib/feedback";
import { submitFeedback } from "@/services/feedbackService";

const { invokeMock } = vi.hoisted(() => ({
	invokeMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
	supabase: {
		functions: {
			invoke: invokeMock,
		},
	},
}));

describe("submitFeedback", () => {
	beforeEach(() => {
		invokeMock.mockReset();
	});

	it("throws when the edge function returns an error", async () => {
		invokeMock.mockResolvedValue({ data: null, error: new Error("Boom") });
		const formData = createDefaultFeedbackFormData();
		formData.summary = "Bug";
		formData.beforeContext = "Before";
		formData.expectedBehavior = "Expected";
		formData.actualBehavior = "Actual";
		formData.evidenceUrl = "https://example.com";
		formData.frequency = "once";
		formData.device = "iphone";

		await expect(submitFeedback(formData, null)).rejects.toThrow("Boom");
		expect(invokeMock).toHaveBeenCalledWith(
			"send-feedback-email",
			expect.objectContaining({
				headers: undefined,
			}),
		);
	});
});
