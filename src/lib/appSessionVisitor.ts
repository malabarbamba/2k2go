const APP_SESSION_VISITOR_STORAGE_KEY = "app_session_visitor_id";

function createAppSessionVisitorId(): string {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return crypto.randomUUID();
	}

	return `fallback-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateAppSessionVisitorId(): string {
	if (typeof window === "undefined") {
		return createAppSessionVisitorId();
	}

	try {
		const storedValue = window.localStorage.getItem(APP_SESSION_VISITOR_STORAGE_KEY);
		if (storedValue && storedValue.trim().length > 0) {
			return storedValue;
		}
	} catch {
		// Ignore localStorage read failures.
	}

	const nextVisitorId = createAppSessionVisitorId();

	try {
		window.localStorage.setItem(APP_SESSION_VISITOR_STORAGE_KEY, nextVisitorId);
	} catch {
		// Ignore localStorage write failures.
	}

	return nextVisitorId;
}
