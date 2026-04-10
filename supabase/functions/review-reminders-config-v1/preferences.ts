export type ReviewReminderPreferenceState = {
	enabled: boolean;
	email_enabled: boolean;
	calendar_enabled: boolean;
	web_push_enabled: boolean;
	user_id?: string;
	created_at?: string;
	updated_at?: string;
};

export type ReviewReminderPreferencesPatch = Partial<
	Pick<
		ReviewReminderPreferenceState,
		"enabled" | "email_enabled" | "calendar_enabled" | "web_push_enabled"
	>
>;

export const REVIEW_REMINDER_PREFERENCES_SELECT =
	"user_id,enabled,email_enabled,calendar_enabled,web_push_enabled,created_at,updated_at";

export function normalizeReviewReminderPreferencesPatch(
	current: ReviewReminderPreferenceState,
	patch: ReviewReminderPreferencesPatch,
): ReviewReminderPreferencesPatch {
	const normalized: ReviewReminderPreferencesPatch = { ...patch };
	const nextEnabled =
		typeof patch.enabled === "boolean" ? patch.enabled : current.enabled;

	if (!nextEnabled) {
		normalized.email_enabled = false;
		normalized.web_push_enabled = false;
		return normalized;
	}

	if (patch.enabled === true && !("email_enabled" in patch)) {
		normalized.email_enabled = true;
	}

	return normalized;
}
