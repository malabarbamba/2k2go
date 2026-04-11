export const PROFILE_INSIGHTS_REFRESH_EVENT = "app:profile-insights-refresh";

export const emitProfileInsightsRefresh = (): void => {
	if (typeof window === "undefined") {
		return;
	}

	window.dispatchEvent(new CustomEvent(PROFILE_INSIGHTS_REFRESH_EVENT));
};
