export type ReminderPreferencesDbState = {
	user_id: string;
	enabled: boolean;
	email_enabled: boolean;
	push_enabled: boolean;
	in_app_enabled: boolean;
	created_at: string;
	updated_at: string;
};

export type ReviewReminderPreferenceState = {
	user_id: string;
	enabled: boolean;
	email_enabled: boolean;
	calendar_enabled: boolean;
	web_push_enabled: boolean;
	created_at: string;
	updated_at: string;
};

export type ReviewReminderPreferencesPatch = Partial<
	Pick<
		ReviewReminderPreferenceState,
		"enabled" | "email_enabled" | "calendar_enabled" | "web_push_enabled"
	>
>;

export type ReminderPreferencesDbPatch = Partial<
	Pick<
		ReminderPreferencesDbState,
		"enabled" | "email_enabled" | "push_enabled" | "in_app_enabled"
	>
>;

export const REVIEW_REMINDER_PREFERENCES_SELECT =
	"user_id,enabled,email_enabled,push_enabled,in_app_enabled,created_at,updated_at";

export function toReviewReminderPreferenceState(
	row: ReminderPreferencesDbState,
): ReviewReminderPreferenceState {
	return {
		user_id: row.user_id,
		enabled: row.enabled,
		email_enabled: row.email_enabled,
		calendar_enabled: row.in_app_enabled,
		web_push_enabled: row.push_enabled,
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}

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
		normalized.calendar_enabled = false;
		return normalized;
	}

	if (patch.enabled === true && !("email_enabled" in patch)) {
		normalized.email_enabled = true;
	}

	return normalized;
}

export function toReminderPreferencesDbPatch(
	patch: ReviewReminderPreferencesPatch,
): ReminderPreferencesDbPatch {
	const dbPatch: ReminderPreferencesDbPatch = {};

	if (typeof patch.enabled === "boolean") {
		dbPatch.enabled = patch.enabled;
	}

	if (typeof patch.email_enabled === "boolean") {
		dbPatch.email_enabled = patch.email_enabled;
	}

	if (typeof patch.web_push_enabled === "boolean") {
		dbPatch.push_enabled = patch.web_push_enabled;
	}

	if (typeof patch.calendar_enabled === "boolean") {
		dbPatch.in_app_enabled = patch.calendar_enabled;
	}

	return dbPatch;
}
