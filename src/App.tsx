import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLocaleProvider } from "@/contexts/AppLocaleContext";
import HomePage from "@/pages/HomePage";

const AppRuntime = lazy(() => import("@/AppRuntime"));

const appBasePath = (() => {
	const baseUrl = import.meta.env.BASE_URL ?? "/";
	if (baseUrl === "/") {
		return undefined;
	}

	return baseUrl.replace(/\/+$/, "");
})();

function RuntimeLoadingPage() {
	return (
		<main
			style={{
				fontFamily: "Arial, sans-serif",
				fontSize: "13.3333px",
				backgroundColor: "#f7f6f2",
				color: "#000000",
				position: "fixed",
				inset: 0,
				overflowY: "auto",
			}}
		>
			<div
				style={{ maxWidth: "760px", margin: "80px auto 0", padding: "0 16px" }}
			>
				<p>loading...</p>
			</div>
		</main>
	);
}

export default function App() {
	return (
		<BrowserRouter basename={appBasePath}>
			<AppLocaleProvider>
				<Routes>
					<Route path="/" element={<HomePage />} />
					<Route path="/home" element={<HomePage />} />
					<Route path="/home-v2" element={<Navigate to="/home" replace />} />
					<Route
						path="/app/home"
						element={<Navigate to="/home" replace />}
					/>
					<Route
						path="/app-v2/home"
						element={<Navigate to="/home" replace />}
					/>
					<Route
						path="/app/login"
						element={<Navigate to="/login" replace />}
					/>
					<Route
						path="/app-v2/login"
						element={<Navigate to="/login" replace />}
					/>
					<Route
						path="/app/signup"
						element={<Navigate to="/signup" replace />}
					/>
					<Route
						path="/app/onboarding"
						element={<Navigate to="/signup" replace />}
					/>
					<Route
						path="/app-v2/signup"
						element={<Navigate to="/signup" replace />}
					/>
					<Route
						path="/app-v2/onboarding"
						element={<Navigate to="/signup" replace />}
					/>
					<Route
						path="*"
						element={
							<Suspense fallback={<RuntimeLoadingPage />}>
								<AppRuntime />
							</Suspense>
						}
					/>
				</Routes>
			</AppLocaleProvider>
		</BrowserRouter>
	);
}
