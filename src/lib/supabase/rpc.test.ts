import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/integrations/supabase/types";
import {
	collectSubtitleWordToPersonalDeckV1,
	searchCardsV2,
} from "@/lib/supabase/rpc";

describe("searchCardsV2", () => {
	it("adds p_source_types=null when omitted", async () => {
		const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
		const supabase = { rpc } as unknown as SupabaseClient<Database>;

		await searchCardsV2(supabase, { p_q: "salam", p_limit: 20 });

		expect(rpc).toHaveBeenCalledWith(
			"search_cards_v2",
			expect.objectContaining({
				p_q: "salam",
				p_limit: 20,
				p_source_types: null,
			}),
		);
	});

	it("keeps explicit p_source_types when provided", async () => {
		const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
		const supabase = { rpc } as unknown as SupabaseClient<Database>;

		await searchCardsV2(supabase, {
			p_q: "salam",
			p_limit: 20,
			p_source_types: ["foundation"],
		});

		expect(rpc).toHaveBeenCalledWith(
			"search_cards_v2",
			expect.objectContaining({
				p_q: "salam",
				p_limit: 20,
				p_source_types: ["foundation"],
			}),
		);
	});
});

describe("collectSubtitleWordToPersonalDeckV1", () => {
	it("calls the subtitle collect RPC with the provided payload", async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: [{ vocabulary_card_id: "card-1", was_created: true }],
			error: null,
		});
		const supabase = { rpc } as unknown as SupabaseClient<Database>;

		await collectSubtitleWordToPersonalDeckV1(supabase, {
			p_video_id: "video-1",
			p_word_ar: "السلام",
			p_word_fr: "paix",
			p_lexicon_entry_id: "lex-1",
			p_example_sentence_ar: "السلام عليكم",
			p_example_sentence_fr: "que la paix soit sur vous",
			p_source: "subtitle_word_popover",
			p_transliteration: null,
		});

		expect(rpc).toHaveBeenCalledWith(
			"collect_subtitle_word_to_personal_deck_v1",
			expect.objectContaining({
				p_video_id: "video-1",
				p_word_ar: "السلام",
				p_word_fr: "paix",
				p_lexicon_entry_id: "lex-1",
				p_source: "subtitle_word_popover",
			}),
		);
	});
});
