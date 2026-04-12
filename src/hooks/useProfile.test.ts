import { describe, expect, it } from "vitest";
import { normalizeNullableProfileTextValue } from "@/hooks/useProfile";

describe("normalizeNullableProfileTextValue", () => {
	it("trims non-empty values", () => {
		expect(normalizeNullableProfileTextValue("  United States  ")).toBe(
			"United States",
		);
	});

	it("converts empty values to null so settings can clear persisted fields", () => {
		expect(normalizeNullableProfileTextValue("   ")).toBeNull();
		expect(normalizeNullableProfileTextValue("")).toBeNull();
	});
});
