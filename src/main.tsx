import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

window.addEventListener("vite:preloadError", (event) => {
	event.preventDefault();
	window.location.reload();
});

const rootElement = document.getElementById("root");

if (rootElement) {
	createRoot(rootElement).render(<App />);
}
