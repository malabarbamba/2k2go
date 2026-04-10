import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const PRELOAD_RELOAD_GUARD_KEY = "__vite_preload_reload_guard__";
const PRELOAD_RELOAD_GUARD_WINDOW_MS = 30_000;

type PreloadReloadGuard = {
	path: string;
	timestampMs: number;
};

const readPreloadReloadGuard = (): PreloadReloadGuard | null => {
	try {
		const rawValue = window.sessionStorage.getItem(PRELOAD_RELOAD_GUARD_KEY);
		if (!rawValue) {
			return null;
		}

		const parsed = JSON.parse(rawValue) as Partial<PreloadReloadGuard>;
		if (
			typeof parsed.path !== "string" ||
			typeof parsed.timestampMs !== "number"
		) {
			return null;
		}

		return { path: parsed.path, timestampMs: parsed.timestampMs };
	} catch {
		return null;
	}
};

const writePreloadReloadGuard = (value: PreloadReloadGuard): void => {
	try {
		window.sessionStorage.setItem(
			PRELOAD_RELOAD_GUARD_KEY,
			JSON.stringify(value),
		);
	} catch {
		// Ignore storage write failures.
	}
};

window.addEventListener("vite:preloadError", (event) => {
	event.preventDefault();

	const currentPath =
		window.location.pathname + window.location.search + window.location.hash;
	const now = Date.now();
	const existingGuard = readPreloadReloadGuard();

	if (
		existingGuard &&
		existingGuard.path === currentPath &&
		now - existingGuard.timestampMs < PRELOAD_RELOAD_GUARD_WINDOW_MS
	) {
		console.error(
			"Vite preload error persisted after reload; blocking further auto-reloads to avoid a refresh loop.",
			event,
		);
		return;
	}

	writePreloadReloadGuard({ path: currentPath, timestampMs: now });
	window.location.reload();
});

const rootElement = document.getElementById("root");

if (rootElement) {
	createRoot(rootElement).render(<App />);
}
