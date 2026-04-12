import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { Toaster } from "sonner";
import { AppLocaleProvider } from "@/contexts/AppLocaleContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { detectNavigatorLocale } from "@/lib/appLocale";

const LoginPage = lazy(() => import("@/pages/LoginPage"));
const SignupPage = lazy(() => import("@/pages/SignupPage"));
const AppShell = lazy(() => import("@/pages/AppShell"));

const APP_DOCS_BASE_PATH = "/app/why-2000-to-go";
const LEGACY_APP_DOCS_BASE_PATH = "/app-v2/pourquoi-2000-to-go";

function LoadingPage() {
	const isEnglish = detectNavigatorLocale() === "en";
	return (
		<main
			style={{
				fontFamily: "Arial, sans-serif",
				fontSize: "13.3333px",
				backgroundColor: "#f3f4f6",
				color: "#000000",
				position: "fixed",
				inset: 0,
				overflowY: "auto",
			}}
		>
			<div
				style={{ maxWidth: "760px", margin: "80px auto 0", padding: "0 16px" }}
			>
				<p>{isEnglish ? "loading..." : "chargement..."}</p>
			</div>
		</main>
	);
}

function AppDocsAliasRoute() {
	const params = useParams();
	const wildcard = params["*"]?.replace(/^\/+|\/+$/g, "") ?? "";
	const target = wildcard
		? `${APP_DOCS_BASE_PATH}/${wildcard}`
		: APP_DOCS_BASE_PATH;

	return <Navigate to={target} replace />;
}

function LegacyAppAliasRoute() {
	const location = useLocation();
	const params = useParams();
	const wildcard = params["*"]?.replace(/^\/+|\/+$/g, "") ?? "";

	if (!wildcard) {
		return <Navigate to={`/app${location.search}${location.hash}`} replace />;
	}

	const [head, ...rest] = wildcard.split("/");
	const tail = rest.length > 0 ? `/${rest.join("/")}` : "";

	const target = (() => {
		switch (head) {
			case "home":
				return "/home";
			case "login":
				return "/login";
			case "signup":
			case "onboarding":
				return "/signup";
			case "docs":
				return tail ? `${APP_DOCS_BASE_PATH}${tail}` : APP_DOCS_BASE_PATH;
			default:
				return `/app/${wildcard}`;
		}
	})();

	return <Navigate to={`${target}${location.search}${location.hash}`} replace />;
}

function UnknownRouteRedirect() {
	const location = useLocation();

	if (
		location.pathname.startsWith("/app-v2") ||
		location.pathname === "/app" ||
		location.pathname.startsWith("/app/")
	) {
		return <Navigate to="/app/error" replace />;
	}

	return <Navigate to="/home" replace />;
}

function LazyRoute({ children }: { children: ReactNode }) {
	return <Suspense fallback={<LoadingPage />}>{children}</Suspense>;
}

export default function AppRuntime() {
	return (
		<>
			<Toaster richColors />
			<AppLocaleProvider>
				<AuthProvider>
					<Routes>
						<Route
							path="/login"
							element={
								<LazyRoute>
									<LoginPage />
								</LazyRoute>
							}
						/>
						<Route
							path="/signup"
							element={
								<LazyRoute>
									<SignupPage />
								</LazyRoute>
							}
						/>
						<Route path="/onboarding" element={<Navigate to="/signup" replace />} />
						<Route path="/login-v2" element={<Navigate to="/login" replace />} />
						<Route
							path="/onboarding-v2"
							element={<Navigate to="/signup" replace />}
						/>
						<Route
							path="/signup-v2"
							element={<Navigate to="/signup" replace />}
						/>
						<Route path="/app/docs/*" element={<AppDocsAliasRoute />} />
						<Route path={LEGACY_APP_DOCS_BASE_PATH + "/*"} element={<AppDocsAliasRoute />} />
						<Route path="/app-v2/docs/*" element={<AppDocsAliasRoute />} />
						<Route path="/app-v2/*" element={<LegacyAppAliasRoute />} />
						<Route
							path="/app/*"
							element={
								<LazyRoute>
									<AppShell />
								</LazyRoute>
							}
						/>
						<Route path="*" element={<UnknownRouteRedirect />} />
					</Routes>
				</AuthProvider>
			</AppLocaleProvider>
		</>
	);
}
