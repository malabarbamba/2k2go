import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

function registerReviewRemindersServiceWorker(): void {
	if (!("serviceWorker" in navigator)) {
		return;
	}

	window.addEventListener("load", () => {
		void navigator.serviceWorker.register("/review-reminders-sw.js");
	});
}

window.addEventListener("vite:preloadError", (event) => {
	event.preventDefault();
	window.location.reload();
});

const rootElement = document.getElementById("root");

if (rootElement) {
	createRoot(rootElement).render(<App />);
	registerReviewRemindersServiceWorker();

	window.requestAnimationFrame(() => {
		rootElement.removeAttribute("data-booting");
		document.documentElement.removeAttribute("data-boot-shell");
	});
}
