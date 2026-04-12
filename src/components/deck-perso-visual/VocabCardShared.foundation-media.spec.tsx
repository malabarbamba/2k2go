import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppLocaleProvider } from "@/contexts/AppLocaleContext";
import { supabaseCardToVocabCard } from "@/lib/deck-perso-adapters";
import { ReviewMainCardSurface } from "./VocabCardShared";

describe("ReviewMainCardSurface foundation media", () => {
	it("renders the bundled foundation image for card nom", async () => {
		const card = supabaseCardToVocabCard(
			{
				card_id: "f456fadc-20ad-406a-8c55-a6dadf1d34fd",
				source: "foundation",
				foundation_card_id: "8e6157a4-7868-4831-a2a5-8a3164c5bc62",
				vocabulary_card_id: null,
				source_type: "foundation",
				state: "new",
				term: "اِسْمٌ",
				translation: "nom",
				transliteration: null,
				example_term: "بِسْمِ اللَّهِ",
				example_translation: "Au nom d'Allah.",
				frequency_rank: 1,
				image_url: null,
				audio_url: null,
				sentence_audio_url: null,
			},
			0,
		);

		render(
			<AppLocaleProvider>
				<ReviewMainCardSurface
					card={card}
					isFlipped={true}
					showVowels={false}
					onToggleVowels={() => {}}
					onFlip={() => {}}
					audioUrls={{}}
					isLoadingAudio={false}
					flipKey={0}
					showImage={true}
					onVocabAudioMouseMove={() => {}}
					onVocabAudioMouseLeave={() => {}}
					onSentenceAudioMouseMove={() => {}}
					onSentenceAudioMouseLeave={() => {}}
				/>
			</AppLocaleProvider>,
		);

		const image = await screen.findByAltText("nom");
		expect(image).toHaveAttribute(
			"src",
			"http://localhost:3000/src/assets/deck-fondations-2k/collection.media/1_nom.avif",
		);
	});
});
