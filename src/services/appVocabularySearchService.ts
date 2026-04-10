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
			data: Array.isArray(data) ? data : [],
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
