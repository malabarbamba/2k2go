/**
 * usePreviewMode Hook
 *
 * Manages preview mode state for pages that show demo data.
 *
 * Logic:
 * - All users (guests and logged-in) see preview mode by default
 * - Guests: clicking "Mes données à moi" shows auth prompt
 * - Logged-in users: can toggle between preview and their real data
 * - Banner is shown for 3 days after first visit, persists across refreshes
 *
 * Persistence:
 * - First visit date is stored in localStorage (for 3-day persistence)
 * - Data mode (preview/real) is stored in localStorage
 * - Banner dismissal is LOCAL STATE ONLY (resets on page refresh, reappears on reload)
 */

import { useCallback, useEffect, useState } from "react";
import { getCutoverPolicy } from "@/config/cutoverFlags";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseLoose } from "@/lib/deck-perso-adapters";

// Storage keys
const FIRST_VISIT_KEY = "progression_first_visit_date";
const DATA_MODE_KEY = "progression_data_mode";
const PROGRESSION_PREVIEW_BOOTSTRAP_SEEN_KEY =
	"progression_preview_bootstrap_seen";
const PROGRESSION_FIRST_VISIT_DONE_KEY = "progression_first_visit_done";

// Configuration
const BANNER_PERSISTENCE_DAYS = 3;

export type DataMode = "preview" | "real";

export interface UsePreviewModeOptions {
	scope?: "deck" | "progression";
}

export interface UsePreviewModeResult {
	/** True if user is not logged in (guest) */
	isGuest: boolean;
	/** Number of collected cards (null for guests or while loading) */
	cardCount: number | null;
	/** True if should use demo data (guest or user chose preview) */
	isPreviewMode: boolean;
	/** True if banner should be shown */
	showBanner: boolean;
	/** Loading state while fetching card count */
	isLoading: boolean;
	/** Current data mode (preview or real) */
	dataMode: DataMode;
	/** True if banner is still within 3-day persistence window */
	isWithinPersistenceWindow: boolean;
	/** Toggle between preview and real data (only works for logged-in users) */
	toggleDataMode: () => void;
	/** Switch to preview data */
	switchToPreview: () => void;
	/** Switch to real data */
	switchToRealData: () => void;
	/** Dismiss the banner (only hides until page refresh) */
	dismissBanner: () => void;
	/** Try to switch to real data - returns true if switched, false if guest (needs auth) */
	trySwitchToRealData: () => boolean;
	/** True if runtime guard enforces preview mode */
	previewForced: boolean;
	/** True if runtime guard enforces real mode */
	realForced: boolean;
	/** True once account-scoped mode has been resolved */
	isModeReady: boolean;
	/** Current cutover reason (if any) */
	cutoverReason: string | null;
	/** Optional operator rollback hint */
	rollbackHook: string | null;
	/** True when user may access real data */
	realModeAvailable: boolean;
}

/**
 * Check if the first visit date is within the persistence window (3 days)
 */
function buildScopedStorageKey(
	baseKey: string,
	accountId: string | null,
): string {
	if (!accountId) {
		return baseKey;
	}
	return `${baseKey}:${accountId}`;
}

function isWithinPersistenceWindow(accountId: string | null): boolean {
	const scopedFirstVisitKey = buildScopedStorageKey(FIRST_VISIT_KEY, accountId);
	const firstVisitStr = localStorage.getItem(scopedFirstVisitKey);

	if (!firstVisitStr) {
		// No first visit recorded - this is the first visit
		// Record it now
		localStorage.setItem(scopedFirstVisitKey, new Date().toISOString());
		return true;
	}

	const firstVisit = new Date(firstVisitStr);
	const now = new Date();
	const diffMs = now.getTime() - firstVisit.getTime();
	const diffDays = diffMs / (1000 * 60 * 60 * 24);

	return diffDays < BANNER_PERSISTENCE_DAYS;
}

/**
 * Get the initial data mode from localStorage
 */
function getInitialDataMode(accountId: string | null): DataMode {
	const scopedDataModeKey = buildScopedStorageKey(DATA_MODE_KEY, accountId);
	const stored = localStorage.getItem(scopedDataModeKey);
	if (stored === "preview" || stored === "real") {
		return stored;
	}
	return "preview"; // Default to preview mode
}

export function usePreviewMode(
	options?: UsePreviewModeOptions,
): UsePreviewModeResult {
	const { user, loading: authLoading } = useAuth();
	const [cardCount, setCardCount] = useState<number | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [dataMode, setDataMode] = useState<DataMode>(() =>
		getInitialDataMode(null),
	);
	const [isModeReady, setIsModeReady] = useState(false);
	// Local state only - resets on every page load/refresh
	const [isDismissed, setIsDismissed] = useState(false);
	const [isWithinWindow, setIsWithinWindow] = useState(true);
	const scope = options?.scope ?? "deck";
	const cutoverPolicy = getCutoverPolicy(scope);
	const previewForced = cutoverPolicy.previewForced;
	const realForced = cutoverPolicy.realForced;
	const enforcedMode: DataMode | null = previewForced
		? "preview"
		: realForced
			? "real"
			: null;
	const cutoverReason = cutoverPolicy.reason;
	const accountId = user?.id ?? null;
	const scopedDataModeKey = buildScopedStorageKey(DATA_MODE_KEY, accountId);
	const scopedBootstrapKey = buildScopedStorageKey(
		PROGRESSION_PREVIEW_BOOTSTRAP_SEEN_KEY,
		accountId,
	);
	const scopedFirstVisitKey = buildScopedStorageKey(
		PROGRESSION_FIRST_VISIT_DONE_KEY,
		accountId,
	);

	// Check persistence window when account changes
	useEffect(() => {
		setIsWithinWindow(isWithinPersistenceWindow(accountId));
	}, [accountId]);

	// First visit on progression page should always start in preview mode
	useEffect(() => {
		if (authLoading || scope !== "progression") {
			return;
		}

		const hasVisitedProgression =
			localStorage.getItem(scopedFirstVisitKey) === "true";
		if (!hasVisitedProgression) {
			localStorage.setItem(scopedFirstVisitKey, "true");
			if (!previewForced && !realForced) {
				localStorage.setItem(scopedDataModeKey, "preview");
				setDataMode("preview");
			}
		}
	}, [
		authLoading,
		previewForced,
		realForced,
		scope,
		scopedDataModeKey,
		scopedFirstVisitKey,
	]);

	// Sync data mode with account-scoped storage and apply one-time progression bootstrap
	useEffect(() => {
		if (authLoading) {
			setIsModeReady(false);
			return;
		}

		if (!accountId) {
			setDataMode(getInitialDataMode(null));
			setIsModeReady(true);
			return;
		}

		const storedMode = getInitialDataMode(accountId);
		const shouldBootstrapPreview =
			scope === "progression" &&
			localStorage.getItem(scopedBootstrapKey) !== "true";

		if (shouldBootstrapPreview) {
			localStorage.setItem(scopedBootstrapKey, "true");
			localStorage.setItem(scopedDataModeKey, "preview");
			setDataMode("preview");
			setIsModeReady(true);
			return;
		}

		setDataMode(storedMode);
		setIsModeReady(true);
	}, [accountId, authLoading, scope, scopedBootstrapKey, scopedDataModeKey]);

	// Determine if user is a guest
	const isGuest = !user && !authLoading;

	// Fetch card count for logged-in users
	useEffect(() => {
		if (authLoading) {
			return;
		}

		if (scope === "progression") {
			setCardCount(null);
			setIsLoading(false);
			return;
		}

		if (!user) {
			setCardCount(null);
			setIsLoading(false);
			return;
		}

		const fetchCardCount = async () => {
			setIsLoading(true);
			try {
				const supabaseClient = getSupabaseLoose();
				if (!supabaseClient) {
					setCardCount(0);
					return;
				}

				// Query user_card_state for collected cards count
				const { count, error } = await (supabaseClient as any)
					.from("user_card_state")
					.select("*", { count: "exact", head: true })
					.eq("user_id", user.id)
					.not("added_to_deck_at", "is", null);

				if (error) {
					console.error("Failed to fetch card count:", error);
					setCardCount(0);
				} else {
					setCardCount(count ?? 0);
				}
			} catch (err) {
				console.error("Error fetching card count:", err);
				setCardCount(0);
			} finally {
				setIsLoading(false);
			}
		};

		fetchCardCount();
	}, [authLoading, scope, user]);

	// Determine if in preview mode based on effective data mode selection
	// - Guests: always preview mode (they don't have data)
	// - Logged-in users: depends on dataMode state after cutover guards
	const effectiveDataMode: DataMode = enforcedMode ?? dataMode;
	const isPreviewMode = isGuest || effectiveDataMode === "preview";

	// Determine if banner should be shown
	// - Show for ALL users (guests and logged-in) within 3-day window AND not dismissed
	// - Dismissal is LOCAL STATE - resets on page refresh
	const showBanner = isWithinWindow && !isDismissed;

	// Toggle between preview and real data
	const toggleDataMode = useCallback(() => {
		setDataMode((prev) => {
			if (previewForced || realForced) {
				return prev;
			}
			const newMode: DataMode = prev === "preview" ? "real" : "preview";
			localStorage.setItem(scopedDataModeKey, newMode);
			return newMode;
		});
	}, [previewForced, realForced, scopedDataModeKey]);

	// Switch to preview data
	const switchToPreview = useCallback(() => {
		if (realForced) {
			return;
		}
		localStorage.setItem(scopedDataModeKey, "preview");
		setDataMode("preview");
	}, [realForced, scopedDataModeKey]);

	// Switch to real data
	const switchToRealData = useCallback(() => {
		if (previewForced) {
			return;
		}
		localStorage.setItem(scopedDataModeKey, "real");
		setDataMode("real");
	}, [previewForced, scopedDataModeKey]);

	// Try to switch to real data
	// Returns true if switched (logged-in user), false if guest (needs auth prompt)
	const trySwitchToRealData = useCallback((): boolean => {
		if (isGuest || previewForced) {
			return false; // Guest or blocked by cutover - caller should handle
		}
		switchToRealData();
		return true; // Successfully switched
	}, [isGuest, previewForced, switchToRealData]);

	// Dismiss banner - LOCAL STATE ONLY
	// Banner will reappear on page refresh
	const dismissBanner = useCallback(() => {
		setIsDismissed(true);
	}, []);

	return {
		isGuest,
		cardCount: isGuest ? null : cardCount,
		isPreviewMode,
		showBanner,
		isLoading: authLoading || isLoading,
		dataMode: effectiveDataMode,
		isWithinPersistenceWindow: isWithinWindow,
		toggleDataMode,
		switchToPreview,
		switchToRealData,
		dismissBanner,
		trySwitchToRealData,
		previewForced,
		realForced,
		isModeReady,
		cutoverReason,
		rollbackHook: cutoverPolicy.rollbackHook,
		realModeAvailable: !previewForced,
	};
}

export default usePreviewMode;
