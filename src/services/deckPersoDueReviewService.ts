import type { ReviewType, VocabCard } from "@/lib/deck-perso-adapters";
import type {
	BinaryReviewRating,
	ServiceResult,
	SubmitReviewSchedulerPayload,
} from "@/services/deckPersoService";

type ReviewMutationMode = "preview" | "real";

type ReviewMutationOptions = {
	mode: ReviewMutationMode;
};

type DeckPersoReviewRuntimeModule = {
	fetchDueCardsByReviewTypes: (
		reviewTypes: ReviewType[],
		limitPerScope?: number,
	) => Promise<ServiceResult<VocabCard[]>>;
	submitReviewForCard: (
		card: VocabCard,
		rating: BinaryReviewRating,
		options: ReviewMutationOptions,
	) => Promise<ServiceResult<SubmitReviewSchedulerPayload | null>>;
};

let runtimeModulePromise: Promise<DeckPersoReviewRuntimeModule> | null = null;

const loadRuntimeModule = (): Promise<DeckPersoReviewRuntimeModule> => {
	if (!runtimeModulePromise) {
		runtimeModulePromise = import("@/services/deckPersoService")
			.then(({ fetchDueCardsByReviewTypes, submitReviewForCard }) => ({
				fetchDueCardsByReviewTypes,
				submitReviewForCard,
			}))
			.catch((error) => {
				runtimeModulePromise = null;
				throw error;
			});
	}

	return runtimeModulePromise;
};

export async function fetchDueCardsByReviewTypes(
	reviewTypes: ReviewType[],
	limitPerScope = 40,
): Promise<ServiceResult<VocabCard[]>> {
	const runtimeModule = await loadRuntimeModule();
	return runtimeModule.fetchDueCardsByReviewTypes(reviewTypes, limitPerScope);
}

export async function submitReviewForCard(
	card: VocabCard,
	rating: BinaryReviewRating,
	options: ReviewMutationOptions,
): Promise<ServiceResult<SubmitReviewSchedulerPayload | null>> {
	const runtimeModule = await loadRuntimeModule();
	return runtimeModule.submitReviewForCard(card, rating, options);
}

export type { BinaryReviewRating, ReviewMutationOptions };
