import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { PENDING_REVIEWS_INVALIDATED_EVENT } from "@/lib/pendingReviewsEvents";

const REFRESH_INTERVAL_MS = 60_000;
const AUTO_REFRESH_COOLDOWN_MS = 30_000;
const REALTIME_REFRESH_DEBOUNCE_MS = 500;
const GUEST_FOUNDATION_REVIEW_UPDATED_EVENT =
	"arur:guest-foundation-review-updated";
const GUEST_PENDING_REVIEWS_SCOPE = "__guest__";
const DEFAULT_AUTHENTICATED_DECK_SCOPE = "personal_and_foundation";
const PENDING_REVIEWS_LOCAL_STORAGE_PREFIX = "arur:pending-reviews:v1:";
const PENDING_REVIEWS_PERSISTED_MAX_AGE_MS = 30_000;

export type PendingReviewsDeckScope =
	| "personal_and_foundation"
	| "foundation"
	| "personal"
	| "personal_sent";

type PendingReviewsSnapshot = {
	scope: string;
	count: number;
	error: string | null;
	wasSuccessful: boolean;
	fetchedAt: number;
};

const inFlightPendingReviewsRequests = new Map<
	string,
	Promise<PendingReviewsSnapshot>
>();
const pendingReviewsSnapshotsByScope = new Map<
	string,
	PendingReviewsSnapshot
>();

const getPendingReviewsScope = (
	userId: string | null,
	authenticatedDeckScope: PendingReviewsDeckScope,
): string =>
	userId === null
		? GUEST_PENDING_REVIEWS_SCOPE
		: `${userId}:${authenticatedDeckScope}`;

const getPendingReviewsStorageKey = (scope: string): string =>
	`${PENDING_REVIEWS_LOCAL_STORAGE_PREFIX}${scope}`;

const readPersistedPendingReviewsSnapshot = (
	scope: string,
): PendingReviewsSnapshot | null => {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		const raw = window.localStorage.getItem(getPendingReviewsStorageKey(scope));
		if (!raw) {
			return null;
		}

		const parsed = JSON.parse(raw) as PendingReviewsSnapshot;
		if (
			typeof parsed?.scope !== "string" ||
			typeof parsed?.count !== "number" ||
			typeof parsed?.fetchedAt !== "number" ||
			typeof parsed?.wasSuccessful !== "boolean"
		) {
			return null;
		}

		if (
			parsed.scope !== scope ||
			Date.now() - parsed.fetchedAt > PENDING_REVIEWS_PERSISTED_MAX_AGE_MS
		) {
			return null;
		}

		return {
			scope,
			count: Math.max(0, Math.floor(parsed.count)),
			error: typeof parsed.error === "string" ? parsed.error : null,
			wasSuccessful: parsed.wasSuccessful,
			fetchedAt: parsed.fetchedAt,
		};
	} catch {
		return null;
	}
};

const persistPendingReviewsSnapshot = (
	snapshot: PendingReviewsSnapshot,
): void => {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(
			getPendingReviewsStorageKey(snapshot.scope),
			JSON.stringify(snapshot),
		);
	} catch {
		// Ignore cache write failures.
	}
};

const readPendingReviewsSnapshot = (
	scope: string,
): PendingReviewsSnapshot | null => {
	const inMemorySnapshot = pendingReviewsSnapshotsByScope.get(scope) ?? null;
	if (inMemorySnapshot) {
		return inMemorySnapshot;
	}

	const persistedSnapshot = readPersistedPendingReviewsSnapshot(scope);
	if (!persistedSnapshot) {
		return null;
	}

	pendingReviewsSnapshotsByScope.set(scope, persistedSnapshot);
	return persistedSnapshot;
};

const isPendingReviewsSnapshotFresh = (
	snapshot: PendingReviewsSnapshot,
	maxAgeMs: number,
): boolean => Date.now() - snapshot.fetchedAt <= maxAgeMs;

const storePendingReviewsSnapshot = (
	snapshot: PendingReviewsSnapshot,
): PendingReviewsSnapshot => {
	pendingReviewsSnapshotsByScope.set(snapshot.scope, snapshot);
	persistPendingReviewsSnapshot(snapshot);
	return snapshot;
};

const createPendingReviewsSnapshot = (
	scope: string,
	count: number,
	error: string | null,
): PendingReviewsSnapshot =>
	storePendingReviewsSnapshot({
		scope,
		count,
		error,
		wasSuccessful: error === null,
		fetchedAt: Date.now(),
	});

const isPendingReviewsSnapshotEligibleForCooldown = (
	snapshot: PendingReviewsSnapshot,
	maxAgeMs: number,
): boolean =>
	snapshot.wasSuccessful && isPendingReviewsSnapshotFresh(snapshot, maxAgeMs);

const loadPendingReviewsSnapshot = async (
	userId: string | null,
	authenticatedDeckScope: PendingReviewsDeckScope,
	maxAgeMs: number | null,
): Promise<PendingReviewsSnapshot> => {
	const scope = getPendingReviewsScope(userId, authenticatedDeckScope);
	const cachedSnapshot = readPendingReviewsSnapshot(scope);

	if (
		maxAgeMs !== null &&
		cachedSnapshot &&
		isPendingReviewsSnapshotEligibleForCooldown(cachedSnapshot, maxAgeMs)
	) {
		return cachedSnapshot;
	}

	const inFlightRequest = inFlightPendingReviewsRequests.get(scope);
	if (inFlightRequest) {
		return inFlightRequest;
	}

	const request = (async (): Promise<PendingReviewsSnapshot> => {
		try {
			if (!userId) {
				const { getGuestFoundationDueCount } = await import(
					"@/lib/guestFoundationReviewStore"
				);

				return createPendingReviewsSnapshot(
					scope,
					getGuestFoundationDueCount(),
					null,
				);
			}

			const { fetchDueReviewCount } = await import(
				"@/services/deckPersoService"
			);
			const result = await fetchDueReviewCount(authenticatedDeckScope);

			if (result.ok) {
				return createPendingReviewsSnapshot(
					scope,
					Math.max(0, result.data),
					null,
				);
			}

			return createPendingReviewsSnapshot(scope, 0, result.error.message);
		} catch (refreshError) {
			return createPendingReviewsSnapshot(
				scope,
				0,
				refreshError instanceof Error
					? refreshError.message
					: "Unable to load pending reviews count.",
			);
		}
	})();

	const trackedRequest = request.finally(() => {
		if (inFlightPendingReviewsRequests.get(scope) === trackedRequest) {
			inFlightPendingReviewsRequests.delete(scope);
		}
	});

	inFlightPendingReviewsRequests.set(scope, trackedRequest);

	return trackedRequest;
};

export interface UsePendingReviewsCountOptions {
	initialLoadDelayMs?: number;
	authenticatedDeckScope?: PendingReviewsDeckScope;
	enableAutoRefresh?: boolean;
}

export interface UsePendingReviewsCountResult {
	count: number;
	loading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
}

export const __resetPendingReviewsCountCacheForTests = (): void => {
	inFlightPendingReviewsRequests.clear();
	pendingReviewsSnapshotsByScope.clear();

	if (typeof window !== "undefined") {
		const keysToDelete: string[] = [];
		for (let index = 0; index < window.localStorage.length; index += 1) {
			const key = window.localStorage.key(index);
			if (
				typeof key === "string" &&
				key.startsWith(PENDING_REVIEWS_LOCAL_STORAGE_PREFIX)
			) {
				keysToDelete.push(key);
			}
		}

		keysToDelete.forEach((key) => {
			window.localStorage.removeItem(key);
		});
	}
};

export const usePendingReviewsCount = (
	options: UsePendingReviewsCountOptions = {},
): UsePendingReviewsCountResult => {
	const { user, loading: authLoading } = useAuth();
	const userId = user?.id ?? null;
	const initialLoadDelayMs = Math.max(0, options.initialLoadDelayMs ?? 0);
	const authenticatedDeckScope =
		options.authenticatedDeckScope ?? DEFAULT_AUTHENTICATED_DECK_SCOPE;
	const enableAutoRefresh = options.enableAutoRefresh ?? true;
	const initialScope = getPendingReviewsScope(userId, authenticatedDeckScope);
	const initialSnapshot = readPendingReviewsSnapshot(initialScope);

	const [count, setCount] = useState(initialSnapshot?.count ?? 0);
	const [loading, setLoading] = useState(() =>
		authLoading ? true : initialSnapshot === null,
	);
	const [error, setError] = useState<string | null>(
		initialSnapshot?.error ?? null,
	);
	const requestIdRef = useRef(0);

	const refreshInternal = useCallback(
		async (force: boolean) => {
			const requestId = requestIdRef.current + 1;
			requestIdRef.current = requestId;

			if (authLoading) {
				setLoading(true);
				return;
			}

			const scope = getPendingReviewsScope(userId, authenticatedDeckScope);
			const cachedSnapshot = !force ? readPendingReviewsSnapshot(scope) : null;

			if (cachedSnapshot) {
				setCount(cachedSnapshot.count);
				setError(cachedSnapshot.error);
			}

			if (
				cachedSnapshot &&
				isPendingReviewsSnapshotEligibleForCooldown(
					cachedSnapshot,
					AUTO_REFRESH_COOLDOWN_MS,
				)
			) {
				setCount(cachedSnapshot.count);
				setError(cachedSnapshot.error);
				setLoading(false);
				return;
			}

			setLoading(cachedSnapshot === null);
			if (!cachedSnapshot) {
				setError(null);
			}

			const snapshot = await loadPendingReviewsSnapshot(
				userId,
				authenticatedDeckScope,
				force ? null : AUTO_REFRESH_COOLDOWN_MS,
			);

			if (requestIdRef.current !== requestId) {
				return;
			}

			setCount(snapshot.count);
			setError(snapshot.error);
			setLoading(false);
		},
		[authLoading, authenticatedDeckScope, userId],
	);

	const refresh = useCallback(async () => {
		await refreshInternal(true);
	}, [refreshInternal]);

	useEffect(() => {
		if (initialLoadDelayMs === 0) {
			void refreshInternal(false);
			return;
		}

		const timeoutId = window.setTimeout(() => {
			void refreshInternal(false);
		}, initialLoadDelayMs);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [initialLoadDelayMs, refreshInternal]);

	useEffect(() => {
		if (authLoading || !enableAutoRefresh) {
			return;
		}

		const intervalId = window.setInterval(() => {
			if (document.visibilityState !== "visible") {
				return;
			}

			void refreshInternal(false);
		}, REFRESH_INTERVAL_MS);

		const handleWindowFocus = () => {
			void refreshInternal(false);
		};

		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				void refreshInternal(false);
			}
		};

		const handleGuestFoundationReviewUpdate = () => {
			void refreshInternal(true);
		};

		const handlePendingReviewsInvalidated = () => {
			void refreshInternal(true);
		};

		window.addEventListener("focus", handleWindowFocus);
		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener(
			GUEST_FOUNDATION_REVIEW_UPDATED_EVENT,
			handleGuestFoundationReviewUpdate as EventListener,
		);
		window.addEventListener(
			PENDING_REVIEWS_INVALIDATED_EVENT,
			handlePendingReviewsInvalidated as EventListener,
		);

		return () => {
			window.clearInterval(intervalId);
			window.removeEventListener("focus", handleWindowFocus);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener(
				GUEST_FOUNDATION_REVIEW_UPDATED_EVENT,
				handleGuestFoundationReviewUpdate as EventListener,
			);
			window.removeEventListener(
				PENDING_REVIEWS_INVALIDATED_EVENT,
				handlePendingReviewsInvalidated as EventListener,
			);
		};
	}, [authLoading, enableAutoRefresh, refreshInternal]);

	useEffect(() => {
		if (authLoading || !enableAutoRefresh || !userId) {
			return;
		}

		let refreshTimeoutId: number | null = null;
		const scheduleRefresh = () => {
			if (refreshTimeoutId !== null) {
				window.clearTimeout(refreshTimeoutId);
			}

			refreshTimeoutId = window.setTimeout(() => {
				refreshTimeoutId = null;
				void refreshInternal(true);
			}, REALTIME_REFRESH_DEBOUNCE_MS);
		};

		const channel = supabase
			.channel(`pending-reviews:${userId}`)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "learning",
					table: "user_cards",
					filter: `user_id=eq.${userId}`,
				},
				() => {
					scheduleRefresh();
				},
			)
			.subscribe();

		return () => {
			if (refreshTimeoutId !== null) {
				window.clearTimeout(refreshTimeoutId);
			}

			void supabase.removeChannel(channel);
		};
	}, [authLoading, enableAutoRefresh, refreshInternal, userId]);

	return {
		count,
		loading,
		error,
		refresh,
	};
};

export default usePendingReviewsCount;
