import { z } from "zod";
import { parseWithSchema } from "@/components/tool-ui/shared/parse";

const NullableString = z.string().nullable();
const NullableNonEmptyString = z.string().min(1).nullable();

const SchedulerDueQueueEntrySchema = z
	.object({
		source: z.enum(["foundation", "vocabulary"]),
		vocabulary_card_id: NullableNonEmptyString,
		foundation_card_id: NullableNonEmptyString,
		word_ar: NullableString,
		word_fr: NullableString,
		transliteration: NullableString,
		example_sentence_ar: NullableString,
		example_sentence_fr: NullableString,
		audio_url: NullableString,
		category: NullableString,
		status: z.enum(["new", "learning", "review", "mastered"]),
		next_review_at: NullableString,
		added_to_deck_at: NullableString,
		first_seen_at: NullableString,
		source_type: z.enum(["foundation", "collected", "sent", "alphabet"]),
		scheduling_algorithm: z.string().min(1).nullable(),
		interval_days: z.number().nullable(),
		repetitions: z.number().nullable(),
		lapses: z.number().nullable(),
		last_reviewed_at: NullableString,
		fsrs_state: z.number().nullable(),
		fsrs_stability: z.number().nullable(),
		fsrs_difficulty: z.number().nullable(),
		fsrs_elapsed_days: z.number().nullable(),
		fsrs_scheduled_days: z.number().nullable(),
		fsrs_due_at: NullableString,
		fsrs_last_reviewed_at: NullableString,
		expected_last_reviewed_at: NullableString,
		queue_partition: z.enum(["new", "review"]).optional(),
		queue_position: z.number().int().nonnegative().optional(),
	})
	.passthrough()
	.superRefine((value, ctx) => {
		const hasFoundationId =
			typeof value.foundation_card_id === "string" &&
			value.foundation_card_id.length > 0;
		const hasVocabularyId =
			typeof value.vocabulary_card_id === "string" &&
			value.vocabulary_card_id.length > 0;

		if (value.source === "foundation") {
			if (!hasFoundationId || hasVocabularyId) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "foundation source requires foundation_card_id only",
				});
			}
		}

		if (value.source === "vocabulary") {
			if (!hasVocabularyId || hasFoundationId) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "vocabulary source requires vocabulary_card_id only",
				});
			}
		}
	});

const SchedulerDueResponseSchema = z
	.object({
		schema_version: z.literal(1),
		now_utc: z.string().min(1),
		ordered_queue: z.array(SchedulerDueQueueEntrySchema),
		deterministic: z.boolean(),
	})
	.passthrough();

const SchedulerReviewResponseSchema = z
	.object({
		schema_version: z.literal(1),
		now_utc: z.string().min(1),
		status: z.enum(["learning", "review", "mastered"]),
		interval_days: z.number(),
		ease_factor: z.number(),
		repetitions: z.number(),
		lapses: z.number(),
		next_review_at: NullableString,
		last_reviewed_at: NullableString,
	})
	.passthrough();

export type SchedulerDueQueueEntry = z.infer<
	typeof SchedulerDueQueueEntrySchema
>;
export type SchedulerDueResponse = z.infer<typeof SchedulerDueResponseSchema>;
export type SchedulerReviewResponse = z.infer<
	typeof SchedulerReviewResponseSchema
>;

export function parseSchedulerDueResponse(
	input: unknown,
): SchedulerDueResponse {
	return parseWithSchema(
		SchedulerDueResponseSchema,
		input,
		"scheduler-due-v1 response",
	);
}

export function parseSchedulerReviewResponse(
	input: unknown,
): SchedulerReviewResponse {
	return parseWithSchema(
		SchedulerReviewResponseSchema,
		input,
		"scheduler-review-v1 response",
	);
}
