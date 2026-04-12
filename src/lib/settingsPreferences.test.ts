import { describe, expect, it } from "vitest";
import { resolveReviewReminderEmailEnabled } from "@/lib/settingsPreferences";

describe("resolveReviewReminderEmailEnabled", () => {
	it("prefers an explicit cached enabled value", () => {
		expect(resolveReviewReminderEmailEnabled("1", false)).toBe(true);
	});

	it("prefers an explicit cached disabled value", () => {
		expect(resolveReviewReminderEmailEnabled("0", true)).toBe(false);
	});

	it("falls back to the server-backed profile value when cache is absent", () => {
		expect(resolveReviewReminderEmailEnabled(null, true)).toBe(true);
		expect(resolveReviewReminderEmailEnabled(null, false)).toBe(false);
	});
});
