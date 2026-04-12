import { supabase } from "@/integrations/supabase/client";

type RecordDeckDownloadClickInput = {
	clickId: string;
	deckKey: string;
	sourceName: string;
	pagePath: string;
	referrer: string | null;
	locale: string | null;
	userId: string | null;
	visitorId: string | null;
};

type DeckDownloadTrackingResponse = {
	ok: boolean;
};

const DECK_DOWNLOAD_INIT_FUNCTION_NAME = "deck-download-init";

export function createDeckDownloadClickId(): string {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return crypto.randomUUID();
	}

	return `deck-download-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function recordDeckDownloadClick(
	input: RecordDeckDownloadClickInput,
): Promise<void> {
	const { data, error } =
		await supabase.functions.invoke<DeckDownloadTrackingResponse>(
			DECK_DOWNLOAD_INIT_FUNCTION_NAME,
			{ body: input },
		);

	if (error) {
		throw error;
	}

	if (!data?.ok) {
		throw new Error("Unexpected deck download tracking response.");
	}
}
