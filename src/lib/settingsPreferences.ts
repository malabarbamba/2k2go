export const resolveReviewReminderEmailEnabled = (
	cachedValue: string | null,
	profileValue: boolean | null | undefined,
): boolean => {
	if (cachedValue === "1") {
		return true;
	}

	if (cachedValue === "0") {
		return false;
	}

	return Boolean(profileValue);
};
