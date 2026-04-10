import { lazy, Suspense, type ReactNode } from "react";
import {
	BrowserRouter,
	Navigate,
	Route,
	Routes,
	useLocation,
	useParams,
} from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

const HomeV2Page = lazy(() => import("@/pages/HomeV2Page"));
const LoginV2Page = lazy(() => import("@/pages/LoginV2Page"));
const OnboardingV2Page = lazy(() => import("@/pages/OnboardingV2Page"));
const AppV2Shell = lazy(() => import("@/pages/AppV2Shell"));

const APP_V2_DOCS_BASE_PATH = "/app-v2/pourquoi-ca-marche";

function LoadingPage() {
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
				<p>chargement...</p>
			</div>
		</main>
	);
}

function RootRedirect() {
	const { user, loading } = useAuth();

	if (loading) {
		return <LoadingPage />;
	}

	return <Navigate to={user ? "/app-v2" : "/home-v2"} replace />;
}

function AppV2DocsAliasRoute() {
	const params = useParams();
	const wildcard = params["*"]?.replace(/^\/+|\/+$/g, "") ?? "";
	const target = wildcard
		? `${APP_V2_DOCS_BASE_PATH}/${wildcard}`
		: APP_V2_DOCS_BASE_PATH;

	return <Navigate to={target} replace />;
}

function UnknownRouteRedirect() {
	const location = useLocation();

	if (location.pathname.startsWith("/app-v2")) {
		return <Navigate to="/app-v2/error" replace />;
	}

	return <Navigate to="/home-v2" replace />;
}

function LazyRoute({ children }: { children: ReactNode }) {
	return <Suspense fallback={<LoadingPage />}>{children}</Suspense>;
}

export default function App() {
	return (
		<>
			<Toaster richColors />
			<BrowserRouter>
				<AuthProvider>
					<Routes>
						<Route path="/" element={<RootRedirect />} />
						<Route
							path="/home-v2"
							element={
								<LazyRoute>
									<HomeV2Page />
								</LazyRoute>
							}
						/>
						<Route
							path="/login-v2"
							element={
								<LazyRoute>
									<LoginV2Page />
								</LazyRoute>
							}
						/>
						<Route
							path="/onboarding-v2"
							element={
								<LazyRoute>
									<OnboardingV2Page />
								</LazyRoute>
							}
						/>
						<Route
							path="/signup-v2"
							element={<Navigate to="/onboarding-v2" replace />}
						/>
						<Route
							path="/app-v2/home"
							element={<Navigate to="/home-v2" replace />}
						/>
						<Route
							path="/app-v2/login"
							element={<Navigate to="/login-v2" replace />}
						/>
						<Route
							path="/app-v2/signup"
							element={<Navigate to="/onboarding-v2" replace />}
						/>
						<Route
							path="/app-v2/onboarding"
							element={<Navigate to="/onboarding-v2" replace />}
						/>
						<Route path="/app-v2/docs/*" element={<AppV2DocsAliasRoute />} />
						<Route
							path="/app-v2/*"
							element={
								<LazyRoute>
									<AppV2Shell />
								</LazyRoute>
							}
						/>
						<Route path="*" element={<UnknownRouteRedirect />} />
					</Routes>
				</AuthProvider>
			</BrowserRouter>
		</>
	);
}
