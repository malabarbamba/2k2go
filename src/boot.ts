type RuntimeSupabaseConfig = Record<string, unknown>;

declare global {
	interface Window {
		__SUPABASE_CONFIG__?: RuntimeSupabaseConfig;
	}
}

window.__SUPABASE_CONFIG__ = undefined;

const normalizedBaseUrl = import.meta.env.BASE_URL.endsWith("/")
	? import.meta.env.BASE_URL
	: `${import.meta.env.BASE_URL}/`;
const basePrefix =
	normalizedBaseUrl === "/" ? "" : normalizedBaseUrl.replace(/\/+$/, "");

const redirectPathParams = new URLSearchParams(window.location.search);
const redirectedPath = redirectPathParams.get("p");

if (redirectedPath) {
	const redirectedQuery = redirectPathParams.get("q");
	const normalizedRedirectPath = redirectedPath.startsWith("/")
		? redirectedPath
		: `/${redirectedPath}`;
	const querySuffix = redirectedQuery ? `?${redirectedQuery}` : "";
	const nextUrl = `${basePrefix}${normalizedRedirectPath}${querySuffix}${window.location.hash}`;
	window.history.replaceState(null, "", nextUrl);
}

void (async () => {
	try {
		const response = await fetch(`${normalizedBaseUrl}runtime-config.json`);
		if (response.ok) {
			const config = await response.json();
			if (config && typeof config === "object") {
				window.__SUPABASE_CONFIG__ = config;
			}
		}
	} catch {
		// Fall back to Vite env vars if runtime config is unavailable.
	}

	await import("./main.tsx");
})();
