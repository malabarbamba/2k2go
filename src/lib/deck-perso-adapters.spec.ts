import { describe, expect, it } from "vitest";
import { supabaseCardToVocabCard } from "@/lib/deck-perso-adapters";

describe("supabaseCardToVocabCard foundation media fallback", () => {
	it("uses bundled foundation media when legacy due rows identify foundation cards", () => {
		const card = supabaseCardToVocabCard(
			{
				card_id: "4e07e244-7995-4598-aa42-10e7628e377c",
				source: "foundation",
				foundation_card_id: "822f7828-f7ca-4e5f-838f-81c7de3a2d52",
				vocabulary_card_id: null,
				source_type: "foundation",
				word_ar: "أَنَا",
				word_fr: "je",
				example_sentence_ar: "أَنَا نُوحٌ",
				example_sentence_fr: "Je suis Noe (Nouh).",
				audio_url: null,
				sentence_audio_url: null,
				image_url: null,
				frequency_rank: 2,
			},
			0,
		);

		expect(card.source).toBe("foundation");
		expect(card.sourceType).toBe("foundation");
		expect(card.vocabAudioUrl).toMatch(/2_je_(vocabDef|vocabBase).*\.mp3$/);
		expect(card.sentenceAudioUrl).toMatch(/2_je_sentBase.*\.mp3$/);
		expect(card.image).toMatch(/2_je.*\.avif$/);
	});

	it("prefers bundled foundation audio over broken relative backend audio", () => {
		const card = supabaseCardToVocabCard(
			{
				card_id: "a6a02acf-34fa-4dcc-96f4-95981043b67b",
				source: "foundation",
				foundation_card_id: "09a5323a-98cd-4f89-8c67-61d23b5f449e",
				vocabulary_card_id: null,
				source_type: "foundation",
				word_ar: "شُكْرَا",
				word_fr: "merci",
				example_sentence_ar: "شُكْرَا جَزِيلًا",
				example_sentence_fr: "Merci beaucoup !",
				audio_url:
					"/immersion/shorts/arur-short-kkucw2ht2d4/fixed-cards/card-1-vocab.mp3",
				sentence_audio_url: null,
				image_url: null,
				frequency_rank: 8,
			},
			0,
		);

		expect(card.vocabAudioUrl).toMatch(/8_merci_vocabDef.*\.mp3$/);
		expect(card.vocabAudioUrl).not.toContain("/immersion/");
	});
});
