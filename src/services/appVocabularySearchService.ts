import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { searchCardsV2, type SearchCardsV2Row } from "@/lib/supabase/rpc";

export type AppDeckSourceType =
	| "foundation"
	| "collected"
	| "sent"
	| "alphabet";

type ServiceError = {
	code: string;
	message: string;
};

type ServiceResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: ServiceError };

const toServiceError = (error: unknown): ServiceError => {
	const message =
		typeof error === "object" && error !== null && "message" in error
			? String((error as { message?: unknown }).message ?? "")
			: error instanceof Error
				? error.message
				: "Impossible de charger les cartes.";

	return {
		code: "RPC_ERROR",
		message:
			message.trim().length > 0 ? message : "Impossible de charger les cartes.",
	};
};

const parseBooleanRpcData = (value: unknown): boolean => {
	if (typeof value === "boolean") {
		return value;
	}

	if (typeof value === "number") {
		return value !== 0;
	}

	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		return normalized === "true" || normalized === "t" || normalized === "1";
	}

	return false;
};

const normalizeAppVocabularyBankRow = (
	row: SearchCardsV2Row,
): SearchCardsV2Row => {
	if (!row || typeof row !== "object") {
		return row;
	}

	const record = row as Record<string, unknown>;
	const sourceKind =
		typeof record.source_kind === "string"
			? record.source_kind.trim().toLowerCase()
			: "";

	return {
		...record,
		word_ar:
			typeof record.word_ar === "string"
				? record.word_ar
				: typeof record.term === "string"
					? record.term
					: record.word_ar,
		word_fr:
			typeof record.word_fr === "string"
				? record.word_fr
				: typeof record.translation === "string"
					? record.translation
					: record.word_fr,
		example_term:
			typeof record.example_term === "string"
				? record.example_term
				: typeof record.example_sentence_ar === "string"
					? record.example_sentence_ar
					: record.example_term,
		example_translation:
			typeof record.example_translation === "string"
				? record.example_translation
				: typeof record.example_sentence_fr === "string"
					? record.example_sentence_fr
					: record.example_translation,
		source:
			typeof record.source === "string"
				? record.source
				: sourceKind === "foundation_seed"
					? "foundation"
					: "vocabulary",
		source_type:
			typeof record.source_type === "string"
				? record.source_type
				: sourceKind === "foundation_seed"
					? "foundation"
					: "collected",
		maturity_score:
			typeof record.maturity_score === "number"
				? record.maturity_score
				: typeof record.score === "number"
					? record.score
					: record.maturity_score,
	};
};

export async function searchAppVocabularyBank(
	query: string,
	limit = 100,
	sourceTypes?: AppDeckSourceType[],
	offset = 0,
): Promise<ServiceResult<SearchCardsV2Row[]>> {
	try {
		const { data, error } = await searchCardsV2(supabase, {
			p_query: query,
			p_limit: limit,
			p_offset: offset,
			p_source_types: sourceTypes,
		});

		if (error) {
			return { ok: false, error: toServiceError(error) };
		}

		return {
			ok: true,
			data: Array.isArray(data)
				? data.map((row) => normalizeAppVocabularyBankRow(row))
				: [],
		};
	} catch (error) {
		return { ok: false, error: toServiceError(error) };
	}
}

export async function hasCollectedDeckInAccountLight(): Promise<
	ServiceResult<boolean>
> {
	try {
		const rpcClient = supabase as unknown as {
			rpc: (
				fn: string,
				args?: Record<string, unknown>,
			) => Promise<{ data: unknown; error: PostgrestError | null }>;
		};

		const { data, error } = await rpcClient.rpc(
			"has_collected_deck_in_account_v1",
		);

		if (!error) {
			return { ok: true, data: parseBooleanRpcData(data) };
		}

		const fallbackResult = await searchAppVocabularyBank("", 80, [
			"collected",
		]);
		if (!fallbackResult.ok) {
			return { ok: false, error: toServiceError(error) };
		}

		return {
			ok: true,
			data: fallbackResult.data.some(
				(row) => Boolean(row?.is_added) || Boolean(row?.is_seen),
			),
		};
	} catch (error) {
		return { ok: false, error: toServiceError(error) };
	}
}
