import { describe, expect, it } from "vitest";
import { normalizeProfileUsername } from "@/lib/profileIdentity";

describe("normalizeProfileUsername", () => {
	it("normalizes whitespace, @ prefix, case, and url encoding", () => {
		expect(normalizeProfileUsername("  %40User__Test  ")).toBe("user__test");
	});

	it("returns an empty string for empty input", () => {
		expect(normalizeProfileUsername("   ")).toBe("");
		expect(normalizeProfileUsername(null)).toBe("");
	});
});
