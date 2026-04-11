import { describe, expect, it } from "vitest";

import { supabaseCardToVocabCard } from "@/lib/deck-perso-adapters";

describe("supabaseCardToVocabCard", () => {
	it("maps legacy due row fields", () => {
		const card = supabaseCardToVocabCard(
			{
				vocabulary_card_id: "vocab-1",
				word_ar: "سلام",
				word_fr: "paix",
				next_review_at: "2026-04-10T12:00:00.000Z",
				source: "vocabulary",
				source_type: "collected",
				status: "review",
			},
			0,
		);

		expect(card.id).toBe("vocab-1");
		expect(card.vocabularyCardId).toBe("vocab-1");
		expect(card.schedulerCardId).toBeUndefined();
		expect(card.vocabFull).toBe("سلام");
		expect(card.vocabDef).toBe("paix");
		expect(card.nextReviewAt).toBe("2026-04-10T12:00:00.000Z");
	});

	it("maps v1 compatibility due row fields", () => {
		const card = supabaseCardToVocabCard(
			{
				card_id: "10c4dd99-df2f-4cb6-8dd5-fce2a695f927",
				term: "كتاب",
				translation: "livre",
				example_term: "هذا كتاب",
				example_translation: "c'est un livre",
				due_at: "2026-04-11T08:30:00.000Z",
				state: "learning",
			},
			0,
		);

		expect(card.id).toBe("10c4dd99-df2f-4cb6-8dd5-fce2a695f927");
		expect(card.schedulerCardId).toBe("10c4dd99-df2f-4cb6-8dd5-fce2a695f927");
		expect(card.vocabularyCardId).toBeUndefined();
		expect(card.foundationCardId).toBeUndefined();
		expect(card.vocabFull).toBe("كتاب");
		expect(card.vocabDef).toBe("livre");
		expect(card.sentFull).toBe("هذا <b>كتاب</b>");
		expect(card.sentFrench).toBe("c'est un livre");
		expect(card.nextReviewAt).toBe("2026-04-11T08:30:00.000Z");
	});
});
