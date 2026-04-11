import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const ADMIN_ROLE_CHECK_TIMEOUT_MS = 10000;
const ADMIN_AUTH_LOADING_TIMEOUT_MS = 12000;

type UseIsAdminResult = {
	isAdmin: boolean | null;
	loading: boolean;
	timedOut: boolean;
	error: string | null;
	refresh: () => void;
};

const ADMIN_ROLE_TIMEOUT_ERROR = "admin_role_check_timeout";
const ADMIN_ROLE_GENERIC_ERROR_MESSAGE =
	"Erreur lors de la verification du role admin.";
const ADMIN_ROLE_TIMEOUT_ERROR_MESSAGE = "Verification du role admin expiree.";
const ADMIN_AUTH_LOADING_TIMEOUT_ERROR_MESSAGE =
	"Initialisation de session admin trop longue.";
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuidString = (value: string): boolean => UUID_PATTERN.test(value);

export const useIsAdmin = (): UseIsAdminResult => {
	const { user, loading: authLoading } = useAuth();
	const userId = user?.id ?? null;
	const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
	const [loading, setLoading] = useState(true);
	const [timedOut, setTimedOut] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [refreshNonce, setRefreshNonce] = useState(0);

	const refresh = useCallback(() => {
		setRefreshNonce((previousNonce) => previousNonce + 1);
	}, []);

	useEffect(() => {
		let cancelled = false;
		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		let authLoadingTimeoutId: ReturnType<typeof setTimeout> | null = null;
		const isManualRefresh = refreshNonce > 0;

		const checkAdminStatus = async () => {
			if (cancelled) return;
			setTimedOut(false);
			setError(null);
			if (isManualRefresh) {
				setIsAdmin(null);
			}

			if (!userId) {
				if (cancelled) return;
				setIsAdmin(false);
				setLoading(false);
				return;
			}

			if (!isUuidString(userId)) {
				if (cancelled) return;
				setIsAdmin(false);
				setLoading(false);
				return;
			}

			if (cancelled) return;
			setLoading(true);

			try {
				const roleCheckPromise = supabase
					.from("user_roles")
					.select("role")
					.eq("user_id", userId)
					.eq("role", "admin")
					.maybeSingle();

				const timeoutPromise = new Promise<never>((_, reject) => {
					timeoutId = setTimeout(() => {
						reject(new Error(ADMIN_ROLE_TIMEOUT_ERROR));
					}, ADMIN_ROLE_CHECK_TIMEOUT_MS);
				});

				const { data, error: roleError } = await Promise.race([
					roleCheckPromise,
					timeoutPromise,
				]);

				if (timeoutId) {
					clearTimeout(timeoutId);
					timeoutId = null;
				}

				if (cancelled) return;

				if (roleError) {
					console.error("Error checking admin status:", roleError);
					setIsAdmin(null);
					setError(ADMIN_ROLE_GENERIC_ERROR_MESSAGE);
				} else {
					setIsAdmin(!!data);
				}
			} catch (caughtError) {
				if (timeoutId) {
					clearTimeout(timeoutId);
					timeoutId = null;
				}

				if (cancelled) return;

				if (
					caughtError instanceof Error &&
					caughtError.message === ADMIN_ROLE_TIMEOUT_ERROR
				) {
					setTimedOut(true);
					setError(ADMIN_ROLE_TIMEOUT_ERROR_MESSAGE);
				} else {
					console.error("Error checking admin status:", caughtError);
					setError(ADMIN_ROLE_GENERIC_ERROR_MESSAGE);
				}
				setIsAdmin(null);
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		};

		if (authLoading) {
			setLoading(true);
			authLoadingTimeoutId = setTimeout(() => {
				if (cancelled) return;
				setTimedOut(true);
				setError(ADMIN_AUTH_LOADING_TIMEOUT_ERROR_MESSAGE);
				setIsAdmin(null);
				setLoading(false);
			}, ADMIN_AUTH_LOADING_TIMEOUT_MS);

			return () => {
				cancelled = true;
				if (timeoutId) {
					clearTimeout(timeoutId);
				}
				if (authLoadingTimeoutId) {
					clearTimeout(authLoadingTimeoutId);
				}
			};
		}

		void checkAdminStatus();

		return () => {
			cancelled = true;
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
			if (authLoadingTimeoutId) {
				clearTimeout(authLoadingTimeoutId);
			}
		};
	}, [userId, authLoading, refreshNonce]);

	return {
		isAdmin,
		loading,
		timedOut,
		error,
		refresh,
	};
};
