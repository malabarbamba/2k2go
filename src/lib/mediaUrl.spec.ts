import { afterEach, describe, expect, it } from "vitest";
import { resolveMediaUrl } from "@/lib/mediaUrl";

const mediaConfigWindow = window as Window & {
	__SUPABASE_CONFIG__?: { SITE_URL?: string };
};

describe("resolveMediaUrl", () => {
	afterEach(() => {
		delete mediaConfigWindow.__SUPABASE_CONFIG__;
	});

	it("uses configured public origin for persisted media paths in local dev", () => {
		mediaConfigWindow.__SUPABASE_CONFIG__ = {
			SITE_URL: "https://media.example.com",
		};

		expect(resolveMediaUrl("/immersion/shorts/card.png")).toBe(
			"https://media.example.com/immersion/shorts/card.png",
		);
	});

	it("keeps bundled local asset paths on the current origin", () => {
		mediaConfigWindow.__SUPABASE_CONFIG__ = {
			SITE_URL: "https://media.example.com",
		};

		expect(
			resolveMediaUrl("/src/assets/deck-fondations-2k/collection.media/1_nom.avif"),
		).toBe(
			"http://localhost:3000/src/assets/deck-fondations-2k/collection.media/1_nom.avif",
		);

		expect(resolveMediaUrl("/assets/1_nom.avif")).toBe(
			"http://localhost:3000/assets/1_nom.avif",
		);

		expect(resolveMediaUrl("/immersion/assets/card.png")).toBe(
			"https://media.example.com/immersion/assets/card.png",
		);
	});

	it("still rewrites DB-backed immersion paths away from localhost", () => {
		expect(
			resolveMediaUrl(
				"/immersion/shorts/arur-short-lait-chameau/fixed-cards/card-2.png",
			),
		).toBe(
			"https://2k2go.github.io/immersion/shorts/arur-short-lait-chameau/fixed-cards/card-2.png",
		);
	});
});
