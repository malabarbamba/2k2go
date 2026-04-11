import type { Session, User } from "@supabase/supabase-js";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import {
	clearAccountSwitchArtifacts,
	clearPersistedAuthArtifacts,
	readActiveUserId,
	writeActiveUserId,
} from "@/lib/authPersistence";
import { clearGuestSession } from "@/lib/guestSession";

interface AuthContextType {
	user: User | null;
	session: Session | null;
	loading: boolean;
	signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
	signUp: (
		email: string,
		password: string,
		options?: { emailRedirectPath?: string },
	) => Promise<{ error: Error | null; emailConfirmationSent: boolean }>;
	resendConfirmation: (
		email: string,
		options?: { emailRedirectPath?: string },
	) => Promise<{ error: Error | null; resent: boolean }>;
	signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(
	undefined,
);

export const useAuth = () => {
	const context = useContext(AuthContext);
	if (context === undefined) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
};

interface AuthProviderProps {
	children: ReactNode;
}

const isAuthSessionError = (error: unknown): boolean => {
	if (!error || typeof error !== "object") {
		return false;
	}

	const message =
		typeof (error as { message?: unknown }).message === "string"
			? (error as { message: string }).message.toLowerCase()
			: "";

	return (
		message.includes("invalid jwt") ||
		message.includes("jwt expired") ||
		message.includes("refresh token") ||
		message.includes("session from session_id claim") ||
		message.includes("session does not exist") ||
		message.includes("auth session missing") ||
		message.includes("already signed out")
	);
};

const resolveEmailRedirectUrl = (redirectPath: string): string => {
	if (/^https?:\/\//i.test(redirectPath)) {
		return redirectPath;
	}

	const normalizedRedirectPath = redirectPath.startsWith("/")
		? redirectPath
		: `/${redirectPath}`;
	const basePath = (import.meta.env.BASE_URL ?? "/").trim();
	const normalizedBasePath =
		basePath === "/" ? "" : `/${basePath.replace(/^\/+|\/+$/g, "")}`;

	return new URL(
		`${normalizedBasePath}${normalizedRedirectPath}`,
		window.location.origin,
	).toString();
};

const DAILY_CONNECTION_TRACKED_KEY_PREFIX =
	"app:daily-connection-tracked-at:v1:";

const getDailyConnectionTrackedKey = (userId: string): string =>
	`${DAILY_CONNECTION_TRACKED_KEY_PREFIX}${userId}`;

const readDailyConnectionTrackedAt = (userId: string): string | null => {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		const value = window.localStorage.getItem(getDailyConnectionTrackedKey(userId));
		return typeof value === "string" && value.length > 0 ? value : null;
	} catch {
		return null;
	}
};

const writeDailyConnectionTrackedAt = (userId: string, activityDate: string): void => {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(
			getDailyConnectionTrackedKey(userId),
			activityDate,
		);
	} catch {
		// Ignore storage write failures.
	}
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
	const AUTH_INIT_TIMEOUT_MS = 12000;
	const [user, setUser] = useState<User | null>(null);
	const [session, setSession] = useState<Session | null>(null);
	const [loading, setLoading] = useState(true);
	const sessionRef = useRef<Session | null>(null);
	const signOutInFlightRef = useRef<Promise<void> | null>(null);

	useEffect(() => {
		sessionRef.current = session;
	}, [session]);

	const clearLocalAuthState = useCallback(() => {
		try {
			clearPersistedAuthArtifacts();
		} catch {
			// Ignore storage cleanup failures.
		}

		sessionRef.current = null;
		setSession(null);
		setUser(null);
	}, []);

	const resolveCurrentSession = useCallback(async () => {
		let { data, error } = await supabase.auth.getSession();

		if (error && isAuthSessionError(error)) {
			clearLocalAuthState();
			const { error: localSignOutError } = await supabase.auth.signOut({
				scope: "local",
			});

			if (localSignOutError && !isAuthSessionError(localSignOutError)) {
				console.error(
					"Error clearing stale auth session during initialization:",
					localSignOutError,
				);
			}

			({ data, error } = await supabase.auth.getSession());
		}

		if (error && !isAuthSessionError(error)) {
			console.error("Error resolving auth session:", error);
		}

		return data.session;
	}, [clearLocalAuthState]);

	const trackDailyConnection = useCallback(async (userId: string) => {
		const activityDate = new Date().toISOString().split("T")[0];
		if (readDailyConnectionTrackedAt(userId) === activityDate) {
			return;
		}

		const { error } = await (supabase as any).rpc("upsert_daily_activity", {
			p_user_id: userId,
			p_activity_date: activityDate,
			p_reviews_count: 0,
			p_new_words: 0,
			p_time_spent_minutes: 0,
		});

		if (!error) {
			writeDailyConnectionTrackedAt(userId, activityDate);
			return;
		}

		const { error: fallbackError } = await (supabase as any)
			.from("user_daily_activity")
			.upsert(
				{
					user_id: userId,
					activity_date: activityDate,
					reviews_count: 0,
					new_words: 0,
					time_spent_minutes: 0,
				},
				{ onConflict: "user_id,activity_date", ignoreDuplicates: true },
			);

		if (fallbackError) {
			console.error("Error tracking daily connection:", fallbackError);
			return;
		}

		writeDailyConnectionTrackedAt(userId, activityDate);
	}, []);

	const syncSessionPersistenceArtifacts = useCallback(
		(nextSession: Session | null) => {
			try {
				const nextUserId = nextSession?.user?.id ?? "";
				if (!nextUserId) {
					clearPersistedAuthArtifacts();
					return;
				}

				clearGuestSession();

				const previousUserId = readActiveUserId();
				if (previousUserId && previousUserId !== nextUserId) {
					clearAccountSwitchArtifacts();
				}

				writeActiveUserId(nextUserId);
			} catch {
				// Ignore storage synchronization failures.
			}
		},
		[],
	);

	useEffect(() => {
		let settled = false;
		const initTimeoutId = setTimeout(() => {
			if (!settled) {
				console.error("Auth initialization timeout, forcing loading=false");
				setLoading(false);
			}
		}, AUTH_INIT_TIMEOUT_MS);

		// Set up auth state listener FIRST
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((event, session) => {
			settled = true;
			clearTimeout(initTimeoutId);
			setSession(session);
			setUser(session?.user ?? null);
			setLoading(false);
			syncSessionPersistenceArtifacts(session);

			if (
				session?.user?.id &&
				(event === "SIGNED_IN" || event === "INITIAL_SESSION")
			) {
				void trackDailyConnection(session.user.id);
			}
		});

		// THEN check for existing session
		void resolveCurrentSession().then((resolvedSession) => {
			settled = true;
			clearTimeout(initTimeoutId);
			setSession(resolvedSession);
			setUser(resolvedSession?.user ?? null);
			setLoading(false);
			syncSessionPersistenceArtifacts(resolvedSession);
		});

		return () => {
			clearTimeout(initTimeoutId);
			subscription.unsubscribe();
		};
	}, [
		resolveCurrentSession,
		syncSessionPersistenceArtifacts,
		trackDailyConnection,
	]);

	const signIn = async (email: string, password: string) => {
		if (signOutInFlightRef.current) {
			try {
				await signOutInFlightRef.current;
			} catch {
				// Continue sign-in after best-effort sign-out cleanup.
			}
		}

		const signInOnce = () =>
			supabase.auth.signInWithPassword({
				email,
				password,
			});

		let { error } = await signInOnce();

		if (error && isAuthSessionError(error)) {
			clearLocalAuthState();
			const { error: localSignOutError } = await supabase.auth.signOut({
				scope: "local",
			});
			if (localSignOutError && !isAuthSessionError(localSignOutError)) {
				console.error("Error clearing stale auth session:", localSignOutError);
			}
			({ error } = await signInOnce());
		}

		return { error };
	};

	const signUp = async (
		email: string,
		password: string,
		options?: { emailRedirectPath?: string },
	) => {
		const redirectPath = options?.emailRedirectPath ?? "/";
		const redirectUrl = resolveEmailRedirectUrl(redirectPath);

		const { data, error } = await supabase.auth.signUp({
			email,
			password,
			options: {
				emailRedirectTo: redirectUrl,
			},
		});
		const emailConfirmationSent =
			!error && Boolean(data.user) && data.session === null;
		return { error, emailConfirmationSent };
	};

	const signOut = async () => {
		if (signOutInFlightRef.current) {
			return signOutInFlightRef.current;
		}

		const signOutTargetToken = sessionRef.current?.access_token ?? null;

		const signOutTask = (async () => {
			let nonRecoverableError: Error | null = null;

			const { error: globalSignOutError } = await supabase.auth.signOut({
				scope: "global",
			});

			if (globalSignOutError && !isAuthSessionError(globalSignOutError)) {
				nonRecoverableError = globalSignOutError;
			}

			if (globalSignOutError) {
				const { error: localSignOutError } = await supabase.auth.signOut({
					scope: "local",
				});
				if (
					localSignOutError &&
					!isAuthSessionError(localSignOutError) &&
					nonRecoverableError === null
				) {
					nonRecoverableError = localSignOutError;
				}
			}

			const latestToken = sessionRef.current?.access_token ?? null;
			const hasNewerSession =
				typeof signOutTargetToken === "string" &&
				signOutTargetToken.length > 0 &&
				typeof latestToken === "string" &&
				latestToken.length > 0 &&
				signOutTargetToken !== latestToken;

			if (!hasNewerSession) {
				clearLocalAuthState();
			}

			if (nonRecoverableError) {
				throw nonRecoverableError;
			}
		})();

		signOutInFlightRef.current = signOutTask.finally(() => {
			if (signOutInFlightRef.current === signOutTask) {
				signOutInFlightRef.current = null;
			}
		});

		return signOutInFlightRef.current;
	};

	const resendConfirmation = async (
		email: string,
		options?: { emailRedirectPath?: string },
	) => {
		const redirectPath = options?.emailRedirectPath ?? "/";
		const redirectUrl = resolveEmailRedirectUrl(redirectPath);
		const { error } = await supabase.auth.resend({
			type: "signup",
			email,
			options: {
				emailRedirectTo: redirectUrl,
			},
		});

		return { error, resent: !error };
	};

	return (
		<AuthContext.Provider
			value={{
				user,
				session,
				loading,
				signIn,
				signUp,
				resendConfirmation,
				signOut,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
};
