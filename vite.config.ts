import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	server: {
		host: "::",
		port: 8080,
	},
	test: {
		environment: "jsdom",
		setupFiles: "./src/setupTests.ts",
		globals: true,
		css: true,
		restoreMocks: true,
		include: ["src/**/*.test.{ts,tsx}", "src/**/*.spec.{ts,tsx}"],
		exclude: ["**/node_modules/**", "**/dist/**"],
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	worker: {
		format: "es",
	},
});
