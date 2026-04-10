import {
	BrowserRouter,
	Navigate,
	Route,
	Routes,
	useLocation,
	useParams,
} from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { HeatmapProvider } from "@/contexts/HeatmapContext";
import { ProfileInsightsProvider } from "@/contexts/ProfileInsightsContext";
import HomeV2Page from "@/pages/HomeV2Page";
import LoginV2Page from "@/pages/LoginV2Page";
import OnboardingV2Page from "@/pages/OnboardingV2Page";
import PreviewNewConceptV2Page from "@/pages/PreviewNewConceptV2Page";

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

export default function App() {
	return (
		<ThemeProvider
			attribute="class"
			defaultTheme="system"
			enableSystem
			enableColorScheme
			storageKey="theme"
		>
			<TooltipProvider>
				<Toaster richColors />
				<BrowserRouter>
					<AuthProvider>
						<HeatmapProvider>
							<ProfileInsightsProvider>
								<Routes>
									<Route path="/" element={<RootRedirect />} />
									<Route path="/home-v2" element={<HomeV2Page />} />
									<Route path="/login-v2" element={<LoginV2Page />} />
									<Route path="/onboarding-v2" element={<OnboardingV2Page />} />
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
									<Route
										path="/app-v2/docs/*"
										element={<AppV2DocsAliasRoute />}
									/>
									<Route
										path="/app-v2/*"
										element={<PreviewNewConceptV2Page />}
									/>
									<Route path="*" element={<UnknownRouteRedirect />} />
								</Routes>
							</ProfileInsightsProvider>
						</HeatmapProvider>
					</AuthProvider>
				</BrowserRouter>
			</TooltipProvider>
		</ThemeProvider>
	);
}
