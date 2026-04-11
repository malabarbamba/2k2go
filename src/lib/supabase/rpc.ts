import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type AppSupabaseClient = SupabaseClient<Database>;

// These RPC functions exist in the database but are not yet in the generated types.
// Using `any` to bypass type-checking until types are regenerated.
type SearchCardsV2Args = any;
type SearchCardsV2Row = any;
type AddCardToPersonalDeckV2Args = any;
type CollectSubtitleWordToPersonalDeckV1Args = {
	p_video_id: string;
	p_word_ar: string;
	p_word_fr: string;
	p_lexicon_entry_id?: string | null;
	p_example_sentence_ar?: string | null;
	p_example_sentence_fr?: string | null;
	p_source?: string | null;
	p_transliteration?: string | null;
	p_source_video_is_short?: boolean | null;
	p_source_cue_id?: string | null;
	p_source_word_index?: number | null;
	p_source_word_start_seconds?: number | null;
	p_source_word_end_seconds?: number | null;
};
type CollectSubtitleWordToPersonalDeckV1Row = any;
type GetDueCountV2Args = any;
type GetDueCardsV2Args = any;
type GetDueCardsV2Row = any;
type SubmitReviewFsrsV2Args = any;
type SubmitReviewFsrsV2Row = any;
type LogCardFlipV2Args = any;
type StartReviewPreviewSessionV1Args = any;
type StartReviewPreviewSessionV1Row = any;
type CompleteReviewPreviewSessionV1Args = any;
type CompleteReviewPreviewSessionV1Row = any;
type GetUserThemeDistributionV1Args = {
	p_user_id: string;
};
type GetUserThemeDistributionV1Row = {
	category: string | null;
	total_cards: number | null;
	learned_cards: number | null;
};

function normalizeSubmitReviewData<T>(data: unknown): T | null {
	if (Array.isArray(data)) {
		return (data[0] as T | undefined) ?? null;
	}
	if (data && typeof data === "object") {
		return data as T;
	}
	return null;
}

export interface SearchCardsV2Response {
	data: SearchCardsV2Row[] | null;
	error: PostgrestError | null;
}

export interface AddCardToPersonalDeckV2Response {
	error: PostgrestError | null;
}

export interface CollectSubtitleWordToPersonalDeckV1Response {
	data: CollectSubtitleWordToPersonalDeckV1Row | null;
	error: PostgrestError | null;
}

export interface GetDueCountV2Response {
	data: number | null;
	error: PostgrestError | null;
}

export interface GetDueCardsV2Response {
	data: GetDueCardsV2Row[] | null;
	error: PostgrestError | null;
}

export interface SubmitReviewFsrsV2Response {
	data: SubmitReviewFsrsV2Row | null;
	error: PostgrestError | null;
}

export interface LogCardFlipV2Response {
	error: PostgrestError | null;
}

export interface StartReviewPreviewSessionV1Response {
	data: StartReviewPreviewSessionV1Row | null;
	error: PostgrestError | null;
}

export interface CompleteReviewPreviewSessionV1Response {
	data: CompleteReviewPreviewSessionV1Row | null;
	error: PostgrestError | null;
}

export interface GetUserThemeDistributionV1Response {
	data: GetUserThemeDistributionV1Row[] | null;
	error: PostgrestError | null;
}

export async function searchCardsV2(
	supabase: AppSupabaseClient,
	args: SearchCardsV2Args,
): Promise<SearchCardsV2Response> {
	const providedArgs =
		args && typeof args === "object" ? (args as Record<string, unknown>) : {};
	const normalizedArgs = {
		p_query:
			typeof providedArgs.p_query === "string"
				? providedArgs.p_query
				: typeof providedArgs.p_q === "string"
					? providedArgs.p_q
					: null,
		p_collection_id:
			typeof providedArgs.p_collection_id === "string"
				? providedArgs.p_collection_id
				: null,
		p_limit:
			typeof providedArgs.p_limit === "number" ? providedArgs.p_limit : 50,
		p_offset:
			typeof providedArgs.p_offset === "number" ? providedArgs.p_offset : 0,
		p_source_types:
			"p_source_types" in providedArgs ? providedArgs.p_source_types : null,
	};

	const { data, error } = await (supabase as any).rpc(
		"search_cards_v2",
		normalizedArgs,
	);
	return {
		data: data ?? null,
		error,
	};
}

export async function addCardToPersonalDeckV2(
	supabase: AppSupabaseClient,
	args: AddCardToPersonalDeckV2Args,
): Promise<AddCardToPersonalDeckV2Response> {
	const { error } = await (supabase as any).rpc(
		"add_card_to_personal_deck_v2",
		args,
	);
	return { error };
}

export async function collectSubtitleWordToPersonalDeckV1(
	supabase: AppSupabaseClient,
	args: CollectSubtitleWordToPersonalDeckV1Args,
): Promise<CollectSubtitleWordToPersonalDeckV1Response> {
	const { data, error } = await (supabase as any).rpc(
		"collect_subtitle_word_to_personal_deck_v1",
		args,
	);
	return {
		data: normalizeSubmitReviewData<CollectSubtitleWordToPersonalDeckV1Row>(
			data,
		),
		error,
	};
}

export async function getDueCountV2(
	supabase: AppSupabaseClient,
	args: GetDueCountV2Args,
): Promise<GetDueCountV2Response> {
	const providedArgs =
		args && typeof args === "object" ? (args as Record<string, unknown>) : {};
	const normalizedArgs = {
		p_collection_id:
			typeof providedArgs.p_collection_id === "string"
				? providedArgs.p_collection_id
				: null,
	};

	const { data, error } = await (supabase as any).rpc(
		"get_due_count_v2",
		normalizedArgs,
	);
	return {
		data,
		error,
	};
}

export async function getDueCardsV2(
	supabase: AppSupabaseClient,
	args: GetDueCardsV2Args,
): Promise<GetDueCardsV2Response> {
	const providedArgs =
		args && typeof args === "object" ? (args as Record<string, unknown>) : {};
	const normalizedArgs = {
		p_limit:
			typeof providedArgs.p_limit === "number" ? providedArgs.p_limit : 50,
		p_collection_id:
			typeof providedArgs.p_collection_id === "string"
				? providedArgs.p_collection_id
				: null,
	};

	const { data, error } = await (supabase as any).rpc(
		"get_due_cards_v2",
		normalizedArgs,
	);
	return {
		data: data ?? null,
		error,
	};
}

export async function submitReviewFsrsV2(
	supabase: AppSupabaseClient,
	args: SubmitReviewFsrsV2Args,
): Promise<SubmitReviewFsrsV2Response> {
	const { data, error } = await (supabase as any).rpc(
		"submit_review_fsrs_v2",
		args,
	);
	return {
		data: normalizeSubmitReviewData<SubmitReviewFsrsV2Row>(data),
		error,
	};
}

export async function logCardFlipV2(
	supabase: AppSupabaseClient,
	args: LogCardFlipV2Args,
): Promise<LogCardFlipV2Response> {
	const { error } = await (supabase as any).rpc("log_card_flip_v2", args);
	return { error };
}

export async function startReviewPreviewSessionV1(
	supabase: AppSupabaseClient,
	args: StartReviewPreviewSessionV1Args,
): Promise<StartReviewPreviewSessionV1Response> {
	const { data, error } = await (supabase as any).rpc(
		"start_review_preview_session_v1",
		args,
	);
	return {
		data: normalizeSubmitReviewData<StartReviewPreviewSessionV1Row>(data),
		error,
	};
}

export async function completeReviewPreviewSessionV1(
	supabase: AppSupabaseClient,
	args: CompleteReviewPreviewSessionV1Args,
): Promise<CompleteReviewPreviewSessionV1Response> {
	const { data, error } = await (supabase as any).rpc(
		"complete_review_preview_session_v1",
		args,
	);
	return {
		data: normalizeSubmitReviewData<CompleteReviewPreviewSessionV1Row>(data),
		error,
	};
}

export async function getUserThemeDistributionV1(
	supabase: AppSupabaseClient,
	args: GetUserThemeDistributionV1Args,
): Promise<GetUserThemeDistributionV1Response> {
	const { data, error } = await (supabase as any).rpc(
		"get_user_theme_distribution_v1",
		args,
	);
	return {
		data: data ?? null,
		error,
	};
}

export type {
	SearchCardsV2Row,
	GetDueCardsV2Row,
	StartReviewPreviewSessionV1Row,
	CompleteReviewPreviewSessionV1Row,
	GetUserThemeDistributionV1Row,
};
