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
		expect(invokeMock).toHaveBeenCalledTimes(1);
		const [functionName, options] = invokeMock.mock.calls[0];
		expect(functionName).toBe("send-feedback-email");
		expect(options).toEqual(
			expect.objectContaining({
				body: expect.objectContaining({
					summary: "Bug",
					evidenceUrl: "https://example.com",
				}),
			}),
		);
		if (options.headers !== undefined) {
			expect(options.headers).toEqual(
				expect.objectContaining({ Authorization: expect.any(String) }),
			);
		}
	});
});
