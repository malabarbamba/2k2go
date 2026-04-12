import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppLocaleProvider } from "@/contexts/AppLocaleContext";
import { supabaseCardToVocabCard } from "@/lib/deck-perso-adapters";
import { ReviewMainCardSurface, theme } from "./VocabCardShared";

const originalAudio = window.Audio;

afterEach(() => {
	window.Audio = originalAudio;
});

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
					muteFlipAudio
				/>
			</AppLocaleProvider>,
		);

		const image = await screen.findByAltText("nom");
		expect(image).toHaveAttribute(
			"src",
			"http://localhost:3000/src/assets/deck-fondations-2k/collection.media/1_nom.avif",
		);
	});

	it("keeps the target highlight for the sentence-start basmallah form", async () => {
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
					isFlipped={false}
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

		const highlightedWords = await screen.findAllByText("بسم");
		expect(highlightedWords[0]).toHaveStyle({ color: theme.target });
	});

	it("does not autoplay audio on mount and only plays after a direct press", async () => {
		const playMock = vi.fn().mockResolvedValue(undefined);
		window.Audio = vi.fn(
			() =>
				({
					preload: "none",
					src: "",
					currentTime: 0,
					pause: vi.fn(),
					play: playMock,
					onended: null,
					onerror: null,
				}) as HTMLAudioElement,
		) as typeof Audio;

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
				audio_url: "https://example.com/bismillah-vocab.mp3",
				sentence_audio_url: "https://example.com/bismillah-sentence.mp3",
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
					muteFlipAudio
				/>
			</AppLocaleProvider>,
		);

		expect(playMock).not.toHaveBeenCalled();

		const listenButtons = await screen.findAllByRole("button", { name: "Listen" });
		fireEvent.click(listenButtons[0]);
		expect(playMock).not.toHaveBeenCalled();

		fireEvent.pointerDown(listenButtons[0]);
		fireEvent.click(listenButtons[0]);

		await waitFor(() => {
			expect(playMock).toHaveBeenCalledTimes(1);
		});
	});
});
