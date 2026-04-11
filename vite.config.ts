import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { defineConfig } from "vite";

const normalizeBasePath = (value: string): string => {
	if (!value || value === "/") {
		return "/";
	}

	const trimmed = value.trim().replace(/^\/+|\/+$/g, "");
	return trimmed ? `/${trimmed}/` : "/";
};

const [repoOwner, repoName] = process.env.GITHUB_REPOSITORY?.split("/") ?? [];
const isUserOrOrgPagesRepo =
	Boolean(repoOwner) &&
	Boolean(repoName) &&
	repoName.toLowerCase() === `${repoOwner.toLowerCase()}.github.io`;
const defaultGithubPagesBase =
	process.env.GITHUB_ACTIONS === "true" && repoName
		? isUserOrOrgPagesRepo
			? "/"
			: `/${repoName}/`
		: "/";
const base = normalizeBasePath(
	process.env.VITE_BASE_PATH ?? defaultGithubPagesBase,
);

export default defineConfig({
	base,
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
