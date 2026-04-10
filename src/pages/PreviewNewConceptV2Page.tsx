import type { FormEvent } from "react";
import {
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type {
	PreviewReviewCard,
	PreviewYoutubeRecommendationsResult,
} from "@/features/preview-new-concept/types";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useProfile, type UserProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import {
	clampProfileNewCardsPerDay,
	isSupportedProfileCountry,
	PROFILE_COUNTRY_OPTIONS,
	PROFILE_NEW_CARDS_PER_DAY_DEFAULT,
	PROFILE_NEW_CARDS_PER_DAY_MAX,
	PROFILE_NEW_CARDS_PER_DAY_MIN,
} from "@/lib/profilePreferences";
import {
	measureTextLayout,
	usePretextAutoResize,
	usePretextContainerWidth,
} from "@/features/preview-new-concept/usePretext";
import { ensureAppV2RuntimeProfiler } from "@/features/preview-new-concept/pretextRuntimeProfiler";
import { usePendingReviewsCount } from "@/hooks/usePendingReviewsCount";
import type { VocabGridData } from "@/lib/vocabGrid";
import type {
	DeckSourceType,
	SearchCardsV2Row,
} from "@/services/deckPersoService";
import type { FriendListItem } from "@/services/friendsService";
import { fetchWordsAcquiredCount } from "@/services/profileProgressService";

const LazyVocabGrid = lazy(() =>
	import("@/components/VocabGrid").then((module) => ({
		default: module.VocabGrid,
	})),
);
const LazyKeyboardWithPreviewDemo = lazy(
	() => import("@/components/keyboard-with-preview-demo"),
);
const LazyCardsReviewV2 = lazy(() =>
	import("@/components/deck-perso-visual-v2/CardsReviewV2").then((module) => ({
		default: module.CardsReviewV2,
	})),
);
const LazyAppV2WhyItWorksPage = lazy(
	() => import("@/pages/AppV2WhyItWorksPage"),
);

function useAppV2WordsAcquiredCount(userId: string | null | undefined): {
	wordsAcquiredCount: number;
	loading: boolean;
} {
	const [wordsAcquiredCount, setWordsAcquiredCount] = useState(0);
	const [loading, setLoading] = useState(Boolean(userId));

	useEffect(() => {
		let cancelled = false;

		if (!userId) {
			setWordsAcquiredCount(0);
			setLoading(false);
			return () => {
				cancelled = true;
			};
		}

		setLoading(true);

		void (async () => {
			try {
				const result = await fetchWordsAcquiredCount(userId);
				if (cancelled || !result.ok) {
					return;
				}

				setWordsAcquiredCount(result.data);
			} catch (error) {
				if (!cancelled) {
					console.error("Error loading app-v2 words acquired count:", error);
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [userId]);

	return { wordsAcquiredCount, loading };
}

const APP_V2_BASE_PATH = "/app-v2";
const HOME_V2_PATH = "/home-v2";
const LOGIN_V2_PATH = "/login-v2";
const DEFAULT_APP_V2_PROFILE_USERNAME = "user__eadd48eb";
const APP_V2_GUEST_REMAINING_CARDS = 47;
const APP_V2_TOTAL_DECK_CARDS = 2000;
const APP_V2_HOME_METRICS_CACHE_TTL_MS = 5_000;
const APP_V2_SESSION_VISITOR_STORAGE_KEY = "app_v2_session_visitor_id";
const APP_V2_ADMIN_UNIQUE_VISITORS_CACHE_KEY =
	"app-v2:session-unique-visitors-total:v1";
const APP_V2_ADMIN_UNIQUE_VISITORS_CACHE_TTL_MS = 60_000;
const APP_V2_PROFILE_CACHE_TTL_MS = 5 * 60_000;
const APP_V2_FOUNDATION_REMAINING_CACHE_TTL_MS = 5 * 60_000;
const APP_V2_ACCOUNT_BANK_SEARCH_LIMIT = 500;
const APP_V2_ACCOUNT_BANK_MAX_FETCH_PAGES = 24;
const APP_V2_ACCOUNT_BANK_CACHE_TTL_MS = 5 * 60_000;
const APP_V2_ACCOUNT_BANK_SOURCE_TYPES: DeckSourceType[] = [
	"foundation",
	"collected",
	"sent",
];
const APP_V2_ACCOUNT_BANK_GRADIENT_COLORS = [
	"#e62e2e",
	"#e6442e",
	"#e65a2e",
	"#e6702e",
	"#e6872e",
	"#e69d2e",
	"#e6b32e",
	"#e6c92e",
	"#e6df2e",
	"#d8e62e",
	"#c2e62e",
	"#abe62e",
	"#95e62e",
	"#7fe62e",
	"#69e62e",
	"#53e62e",
	"#3de62e",
	"#2ee635",
	"#2ee64c",
	"#2ee662",
	"#2ee678",
	"#2ee68e",
	"#2ee6a4",
	"#2ee6ba",
	"#2ee6d0",
	"#2ee6e6",
] as const;
const APP_V2_ACCOUNT_BANK_LEGEND_GRADIENT =
	"linear-gradient(90deg, #e62e2e, #e65a2e, #e6c92e, #2ee6a4, #2ee6e6)";

type AppV2HomeMetricsSnapshot = {
	weeklyRemainingCount: number;
	averageReviewsPerDay: number;
	finishInDays: number | null;
	updatedAt: number;
};

type AppV2ProfileCacheSnapshot = {
	profile: UserProfile;
	updatedAt: number;
};

type AppV2AccountBankCacheSnapshot = {
	gridData: VocabGridData;
	updatedAt: number;
};

const baseTextStyle = {
	fontSize: "13.3333px",
	fontFamily: "Arial, sans-serif",
} as const;

const plainLinkStyle = {
	...baseTextStyle,
	color: "#000000",
	textDecoration: "underline",
} as const;

function AppV2SectionLoading({ text = "chargement..." }: { text?: string }) {
	return <p style={{ ...baseTextStyle, marginTop: "14px" }}>{text}</p>;
}

const appV2MainStyle = {
	fontFamily: "Arial, sans-serif",
	fontSize: "13.3333px",
	backgroundColor: "#f7f6f2",
	color: "#000000",
	position: "fixed",
	inset: 0,
	overflowY: "auto",
} as const;

const appV2ButtonBaseStyle = {
	fontSize: "13.3333px",
	fontFamily: "Arial, sans-serif",
	color: "#000000",
	border: "1px solid #000000",
	borderRadius: "3px",
	padding: "1% 6px",
	paddingTop: "1px",
	paddingBottom: "1px",
} as const;

const appV2HighlightNumberStyle = {
	color: "#c61b1b",
	fontWeight: 700,
} as const;

const APP_V2_PRETEXT_BODY_FONT = "400 13.3333px Arial, sans-serif";
const APP_V2_PRETEXT_BODY_LINE_HEIGHT_PX = 18;
const APP_V2_PRETEXT_HOME_MAX_TITLE_FONT_PX = 96;
const APP_V2_PRETEXT_HOME_MIN_TITLE_FONT_PX = 44;

function findLargestSingleLineFontSize(
	text: string,
	maxWidth: number,
	maxFontSizePx: number,
	minFontSizePx: number,
	fontFamily: string,
	profileMeta?: { pagePath?: string; blockId?: string },
): number {
	if (!text.trim() || maxWidth <= 0) {
		return maxFontSizePx;
	}

	for (let fontSize = maxFontSizePx; fontSize >= minFontSizePx; fontSize -= 2) {
		const result = measureTextLayout(
			text,
			`400 ${fontSize}px ${fontFamily}`,
			maxWidth,
			fontSize,
			profileMeta,
		);
		if (result && result.lineCount <= 1) {
			return fontSize;
		}
	}

	return minFontSizePx;
}

function normalizePathname(pathname: string): string {
	const normalized = pathname.replace(/\/+$/g, "");
	return normalized.length > 0 ? normalized : APP_V2_BASE_PATH;
}

function decodePathSegment(value: string | undefined): string | null {
	if (!value) {
		return null;
	}

	try {
		const decoded = decodeURIComponent(value).trim();
		return decoded.length > 0 ? decoded : null;
	} catch {
		const fallback = value.trim();
		return fallback.length > 0 ? fallback : null;
	}
}

function normalizeProfileCacheKeySegment(value: string): string {
	return value.trim().toLowerCase();
}

function normalizeAppV2BankArabicWord(
	value: string | null | undefined,
): string {
	return (value ?? "").replace(/\u0640/g, "").trim();
}

function clampAppV2BankScore(value: number | null | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return 0;
	}

	return Math.max(0, Math.min(10, value * 10));
}

function getAppV2BankMasteryColor(score: number): string {
	const palette = APP_V2_ACCOUNT_BANK_GRADIENT_COLORS;
	const clampedScore = Math.max(0, Math.min(10, score));
	const position = (clampedScore / 10) * (palette.length - 1);
	const lowerIndex = Math.floor(position);
	const upperIndex = Math.ceil(position);

	if (lowerIndex === upperIndex) {
		return palette[lowerIndex];
	}

	const hexToRgb = (hex: string): [number, number, number] => {
		const normalized = hex.replace("#", "");
		return [
			Number.parseInt(normalized.slice(0, 2), 16),
			Number.parseInt(normalized.slice(2, 4), 16),
			Number.parseInt(normalized.slice(4, 6), 16),
		];
	};

	const toHex = (value: number): string =>
		Math.max(0, Math.min(255, Math.round(value)))
			.toString(16)
			.padStart(2, "0");

	const mixAmount = position - lowerIndex;
	const [startR, startG, startB] = hexToRgb(palette[lowerIndex]);
	const [endR, endG, endB] = hexToRgb(palette[upperIndex]);

	const mixedR = startR + (endR - startR) * mixAmount;
	const mixedG = startG + (endG - startG) * mixAmount;
	const mixedB = startB + (endB - startB) * mixAmount;

	return `#${toHex(mixedR)}${toHex(mixedG)}${toHex(mixedB)}`;
}

function toAppV2AccountBankGridData(rows: SearchCardsV2Row[]): VocabGridData {
	const uniqueByArabicWord = new Map<string, SearchCardsV2Row>();

	rows.forEach((row) => {
		const normalizedWord = normalizeAppV2BankArabicWord(row.word_ar);
		if (!normalizedWord) {
			return;
		}

		const currentRow = uniqueByArabicWord.get(normalizedWord);
		const currentScore = clampAppV2BankScore(
			currentRow?.maturity_score ?? currentRow?.score,
		);
		const nextScore = clampAppV2BankScore(row.maturity_score ?? row.score);

		if (!currentRow || nextScore >= currentScore) {
			uniqueByArabicWord.set(normalizedWord, row);
		}
	});

	const units = Array.from(uniqueByArabicWord.values()).map((row, index) => {
		const score = clampAppV2BankScore(row.maturity_score ?? row.score);
		const isSeen = Boolean(row.is_seen);
		const unitId =
			row.foundation_card_id ??
			row.vocabulary_card_id ??
			`app-v2-bank-unit-${row.word_ar ?? ""}-${index}`;
		const normalizedWord = normalizeAppV2BankArabicWord(row.word_ar);

		return {
			id: unitId,
			word: normalizedWord,
			vocabBase: normalizedWord,
			vocabFull: normalizedWord,
			score,
			seenCount: isSeen ? 1 : 0,
			unseenCount: isSeen ? 0 : 1,
			avgInterval: score,
			color: getAppV2BankMasteryColor(score),
			category: row.category || undefined,
		};
	});

	const known = units.filter((unit) => unit.seenCount > 0).length;
	const total = units.length;

	return {
		units,
		summary: {
			total,
			known,
			knownPercent: total === 0 ? 0 : Math.round((known / total) * 1000) / 10,
		},
	};
}

function getAppV2AccountBankCacheKey(userId: string): string {
	return `app-v2:account-bank:${userId.trim()}`;
}

function readAppV2AccountBankCache(userId: string): VocabGridData | null {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		const rawValue = window.localStorage.getItem(
			getAppV2AccountBankCacheKey(userId),
		);
		if (!rawValue) {
			return null;
		}

		const parsedValue = JSON.parse(rawValue) as AppV2AccountBankCacheSnapshot;
		if (
			!parsedValue ||
			typeof parsedValue !== "object" ||
			typeof parsedValue.updatedAt !== "number" ||
			typeof parsedValue.gridData !== "object" ||
			parsedValue.gridData === null
		) {
			return null;
		}

		if (Date.now() - parsedValue.updatedAt > APP_V2_ACCOUNT_BANK_CACHE_TTL_MS) {
			return null;
		}

		return parsedValue.gridData;
	} catch {
		return null;
	}
}

function writeAppV2AccountBankCache(
	userId: string,
	gridData: VocabGridData,
): void {
	if (typeof window === "undefined") {
		return;
	}

	try {
		const payload: AppV2AccountBankCacheSnapshot = {
			gridData,
			updatedAt: Date.now(),
		};
		window.localStorage.setItem(
			getAppV2AccountBankCacheKey(userId),
			JSON.stringify(payload),
		);
	} catch {
		// Ignore localStorage write failures.
	}
}

function getAppV2ProfileCacheByUsernameKey(username: string): string {
	return `app-v2:profile:username:${normalizeProfileCacheKeySegment(username)}`;
}

function getAppV2ProfileCacheByUserIdKey(userId: string): string {
	return `app-v2:profile:user:${userId.trim()}`;
}

function readAppV2ProfileCache(cacheKey: string): UserProfile | null {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		const rawValue = window.localStorage.getItem(cacheKey);
		if (!rawValue) {
			return null;
		}

		const parsedValue = JSON.parse(rawValue) as AppV2ProfileCacheSnapshot;
		if (
			!parsedValue ||
			typeof parsedValue !== "object" ||
			typeof parsedValue.updatedAt !== "number" ||
			!parsedValue.profile ||
			typeof parsedValue.profile !== "object"
		) {
			return null;
		}

		if (Date.now() - parsedValue.updatedAt > APP_V2_PROFILE_CACHE_TTL_MS) {
			return null;
		}

		return parsedValue.profile;
	} catch {
		return null;
	}
}

function writeAppV2ProfileCache(profile: UserProfile): void {
	if (typeof window === "undefined") {
		return;
	}

	const snapshot: AppV2ProfileCacheSnapshot = {
		profile,
		updatedAt: Date.now(),
	};

	const nextUsername = profile.username?.trim();
	const keys = [
		profile.user_id ? getAppV2ProfileCacheByUserIdKey(profile.user_id) : null,
		nextUsername ? getAppV2ProfileCacheByUsernameKey(nextUsername) : null,
	].filter((cacheKey): cacheKey is string => Boolean(cacheKey));

	for (const cacheKey of keys) {
		try {
			window.localStorage.setItem(cacheKey, JSON.stringify(snapshot));
		} catch {
			// Ignore local cache write failures.
		}
	}
}

function buildAppV2AccountPath(username: string): string {
	return `${APP_V2_BASE_PATH}/account/${encodeURIComponent(username)}`;
}

function resolveAppV2ProfileUsername(value: string | null | undefined): string {
	return (
		decodePathSegment(value ?? undefined) ?? DEFAULT_APP_V2_PROFILE_USERNAME
	);
}

function resolveCanonicalAppV2Path(pathname: string): string | null {
	const profilePathMatch = pathname.match(
		new RegExp(
			`^${APP_V2_BASE_PATH}/(account|compte|profil|profile)(?:/(.+))?$`,
		),
	);

	if (profilePathMatch) {
		const [, slug, usernameSegment] = profilePathMatch;
		const canonicalUsername = resolveAppV2ProfileUsername(usernameSegment);
		const canonicalProfilePath = buildAppV2AccountPath(canonicalUsername);

		if (slug !== "account" || canonicalProfilePath !== pathname) {
			return canonicalProfilePath;
		}

		return null;
	}

	if (pathname === `${APP_V2_BASE_PATH}/camarades`) {
		return `${APP_V2_BASE_PATH}/contacts`;
	}

	if (pathname === `${APP_V2_BASE_PATH}/end`) {
		return `${APP_V2_BASE_PATH}/immersion-video`;
	}

	return null;
}

function useAppV2InlineMessage(durationMs = 2000) {
	const [message, setMessage] = useState<string | null>(null);
	const timeoutRef = useRef<number | null>(null);

	const showMessage = useCallback(
		(nextMessage: string) => {
			setMessage(nextMessage);
			if (timeoutRef.current !== null) {
				window.clearTimeout(timeoutRef.current);
			}
			timeoutRef.current = window.setTimeout(() => {
				setMessage(null);
				timeoutRef.current = null;
			}, durationMs);
		},
		[durationMs],
	);

	useEffect(() => {
		return () => {
			if (timeoutRef.current !== null) {
				window.clearTimeout(timeoutRef.current);
			}
		};
	}, []);

	return { message, showMessage };
}

function AppV2ToastSuppressionStyle() {
	return (
		<style>{`
			[data-sonner-toaster],
			[data-sonner-toast] {
				display: none !important;
			}
		`}</style>
	);
}

function resolveContactDisplayName(friend: FriendListItem): string {
	const fullName = [friend.firstName, friend.lastName]
		.filter(Boolean)
		.join(" ")
		.trim();

	if (fullName) {
		return fullName;
	}

	if (friend.username?.trim()) {
		return `@${friend.username.trim()}`;
	}

	return "contact";
}

function formatLastActivityLabel(connectedAt: string): string | null {
	const date = new Date(connectedAt);
	if (Number.isNaN(date.getTime())) {
		return null;
	}

	const now = Date.now();
	const elapsedSeconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));

	if (elapsedSeconds < 60) {
		return `dernière activité il y a ${elapsedSeconds} seconde${elapsedSeconds > 1 ? "s" : ""}`;
	}

	const elapsedMinutes = Math.floor(elapsedSeconds / 60);
	if (elapsedMinutes < 60) {
		return `dernière activité il y a ${elapsedMinutes} minute${elapsedMinutes > 1 ? "s" : ""}`;
	}

	const elapsedHours = Math.floor(elapsedMinutes / 60);
	if (elapsedHours < 24) {
		return `dernière activité il y a ${elapsedHours} heure${elapsedHours > 1 ? "s" : ""}`;
	}

	const elapsedDays = Math.floor(elapsedHours / 24);
	if (elapsedDays < 7) {
		return `dernière activité il y a ${elapsedDays} jour${elapsedDays > 1 ? "s" : ""}`;
	}

	const elapsedWeeks = Math.floor(elapsedDays / 7);
	return `dernière activité il y a ${elapsedWeeks} semaine${elapsedWeeks > 1 ? "s" : ""}`;
}

function resolveProfileDisplayName(
	profile: {
		first_name: string | null;
		last_name: string | null;
		username: string | null;
	} | null,
): string {
	if (!profile) {
		return "compte";
	}

	const fullName =
		`${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
	if (fullName.length > 0) {
		return fullName;
	}

	return profile.username?.trim() || "compte";
}

function getAppV2HomeMetricsCacheKey(userId: string): string {
	return `app-v2:home-metrics:v2:${userId}`;
}

function getAppV2FoundationRemainingCacheKey(userId: string | null): string {
	return userId
		? `app-v2:foundation-remaining:${userId}`
		: "app-v2:foundation-remaining:guest";
}

function readAppV2FoundationRemainingCache(
	userId: string | null,
): number | null {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		const rawValue = window.localStorage.getItem(
			getAppV2FoundationRemainingCacheKey(userId),
		);
		if (!rawValue) {
			return null;
		}

		const parsedValue = JSON.parse(rawValue) as {
			remaining?: unknown;
			updatedAt?: unknown;
		};
		const remaining = Number(parsedValue?.remaining);
		const updatedAt = Number(parsedValue?.updatedAt);
		if (!Number.isFinite(remaining) || !Number.isFinite(updatedAt)) {
			return null;
		}

		if (Date.now() - updatedAt > APP_V2_FOUNDATION_REMAINING_CACHE_TTL_MS) {
			return null;
		}

		return Math.max(0, Math.floor(remaining));
	} catch {
		return null;
	}
}

function writeAppV2FoundationRemainingCache(
	userId: string | null,
	remaining: number,
): void {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(
			getAppV2FoundationRemainingCacheKey(userId),
			JSON.stringify({
				remaining: Math.max(0, Math.floor(remaining)),
				updatedAt: Date.now(),
			}),
		);
	} catch {
		// Ignore local cache write failures.
	}
}

type AppV2AdminUniqueVisitorsCacheSnapshot = {
	total: number;
	updatedAt: number;
};

function readAppV2AdminUniqueVisitorsCache(): AppV2AdminUniqueVisitorsCacheSnapshot | null {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		const rawValue = window.localStorage.getItem(
			APP_V2_ADMIN_UNIQUE_VISITORS_CACHE_KEY,
		);
		if (!rawValue) {
			return null;
		}

		const parsedValue = JSON.parse(
			rawValue,
		) as AppV2AdminUniqueVisitorsCacheSnapshot;
		if (
			typeof parsedValue?.total !== "number" ||
			typeof parsedValue?.updatedAt !== "number"
		) {
			return null;
		}

		return {
			total: Math.max(0, Math.floor(parsedValue.total)),
			updatedAt: parsedValue.updatedAt,
		};
	} catch {
		return null;
	}
}

function writeAppV2AdminUniqueVisitorsCache(total: number): void {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(
			APP_V2_ADMIN_UNIQUE_VISITORS_CACHE_KEY,
			JSON.stringify({
				total: Math.max(0, Math.floor(total)),
				updatedAt: Date.now(),
			}),
		);
	} catch {
		// Ignore local cache write failures.
	}
}

function createAppV2SessionVisitorId(): string {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return crypto.randomUUID();
	}

	return `fallback-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getOrCreateAppV2SessionVisitorId(): string {
	if (typeof window === "undefined") {
		return createAppV2SessionVisitorId();
	}

	try {
		const storedValue = window.localStorage.getItem(
			APP_V2_SESSION_VISITOR_STORAGE_KEY,
		);
		if (storedValue && storedValue.trim().length > 0) {
			return storedValue;
		}
	} catch {
		// Ignore localStorage read failures.
	}

	const nextVisitorId = createAppV2SessionVisitorId();

	try {
		window.localStorage.setItem(
			APP_V2_SESSION_VISITOR_STORAGE_KEY,
			nextVisitorId,
		);
	} catch {
		// Ignore localStorage write failures.
	}

	return nextVisitorId;
}

function readAppV2HomeMetricsCache(
	userId: string,
): AppV2HomeMetricsSnapshot | null {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		const rawValue = window.localStorage.getItem(
			getAppV2HomeMetricsCacheKey(userId),
		);
		if (!rawValue) {
			return null;
		}

		const parsedValue = JSON.parse(rawValue) as AppV2HomeMetricsSnapshot;
		if (
			typeof parsedValue?.weeklyRemainingCount !== "number" ||
			typeof parsedValue?.averageReviewsPerDay !== "number" ||
			typeof parsedValue?.updatedAt !== "number"
		) {
			return null;
		}

		const finishInDays =
			typeof parsedValue.finishInDays === "number"
				? Math.max(0, Math.floor(parsedValue.finishInDays))
				: null;

		return {
			weeklyRemainingCount: Math.max(
				0,
				Math.floor(parsedValue.weeklyRemainingCount),
			),
			averageReviewsPerDay: Math.max(
				0,
				Math.floor(parsedValue.averageReviewsPerDay),
			),
			finishInDays,
			updatedAt: parsedValue.updatedAt,
		};
	} catch {
		return null;
	}
}

function writeAppV2HomeMetricsCache(
	userId: string,
	snapshot: AppV2HomeMetricsSnapshot,
): void {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(
			getAppV2HomeMetricsCacheKey(userId),
			JSON.stringify(snapshot),
		);
	} catch {
		// Ignore local cache write failures.
	}
}

function AppV2TopNav({ monComptePath }: { monComptePath: string }) {
	const [isOtherMenuOpen, setIsOtherMenuOpen] = useState(false);
	const otherMenuRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!isOtherMenuOpen) {
			return;
		}

		const handleClickOutside = (event: MouseEvent | TouchEvent) => {
			const target = event.target as Node | null;
			if (!target || !otherMenuRef.current) {
				return;
			}

			if (!otherMenuRef.current.contains(target)) {
				setIsOtherMenuOpen(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("touchstart", handleClickOutside);

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("touchstart", handleClickOutside);
		};
	}, [isOtherMenuOpen]);

	return (
		<div style={{ ...baseTextStyle, textAlign: "center", marginTop: "8px" }}>
			<Link
				to={APP_V2_BASE_PATH}
				style={plainLinkStyle}
				onClick={(event) => {
					if (
						normalizePathname(window.location.pathname) === APP_V2_BASE_PATH
					) {
						event.preventDefault();
						window.location.reload();
					}
				}}
			>
				accueil
			</Link>
			{" • "}
			<Link
				to={monComptePath}
				style={plainLinkStyle}
				onClick={(event) => {
					if (normalizePathname(window.location.pathname) === monComptePath) {
						event.preventDefault();
						window.location.reload();
					}
				}}
			>
				mon compte
			</Link>
			{" • "}
			<div
				ref={otherMenuRef}
				style={{ display: "inline-block", position: "relative" }}
			>
				<button
					type="button"
					onClick={() => {
						setIsOtherMenuOpen((previous) => !previous);
					}}
					aria-haspopup="menu"
					aria-expanded={isOtherMenuOpen}
					style={{
						...plainLinkStyle,
						display: "inline",
						cursor: "pointer",
						background: "none",
						border: 0,
						padding: 0,
					}}
				>
					plus
				</button>
				{isOtherMenuOpen ? (
					<div
						role="menu"
						style={{
							position: "absolute",
							right: 0,
							marginTop: "4px",
							padding: "6px 8px",
							border: "1px solid #000000",
							backgroundColor: "#ffffff",
							textAlign: "left",
							whiteSpace: "nowrap",
							zIndex: 30,
						}}
					>
						<p style={{ ...baseTextStyle, margin: 0 }}>
							<Link
								to={`${APP_V2_BASE_PATH}/pourquoi-ca-marche`}
								style={plainLinkStyle}
								onClick={() => {
									setIsOtherMenuOpen(false);
								}}
							>
								pourquoi ca marche ?
							</Link>
						</p>
						<p style={{ ...baseTextStyle, margin: 0 }}>
							<Link
								to={`${APP_V2_BASE_PATH}/clavier-arabe-en-ligne`}
								style={plainLinkStyle}
								onClick={() => {
									setIsOtherMenuOpen(false);
								}}
							>
								clavier arabe en ligne
							</Link>{" "}
							<span>(bêta)</span>
						</p>
						<p style={{ ...baseTextStyle, margin: "4px 0 0 0" }}>
							<span style={{ color: "#cc0000", fontWeight: 700 }}>New!</span>{" "}
							<Link
								to={`${APP_V2_BASE_PATH}/immersion-video`}
								style={plainLinkStyle}
								onClick={() => {
									setIsOtherMenuOpen(false);
								}}
							>
								immersion vidéo
							</Link>{" "}
							<span>(bêta)</span>
						</p>
					</div>
				) : null}
			</div>
		</div>
	);
}

function AppV2ErrorPage() {
	const navigate = useNavigate();
	const [isRetryHovered, setIsRetryHovered] = useState(false);
	const [isHomeHovered, setIsHomeHovered] = useState(false);

	return (
		<main
			style={{
				fontFamily: "Arial, sans-serif",
				fontSize: "13.3333px",
				backgroundColor: "#ffffff",
				color: "#000000",
				position: "fixed",
				inset: 0,
				overflowY: "auto",
			}}
		>
			<AppV2ToastSuppressionStyle />
			<div
				style={{ maxWidth: "760px", margin: "80px auto 0", padding: "0 16px" }}
			>
				<p style={baseTextStyle}>erreur</p>
				<p style={baseTextStyle}>une erreur est survenue.</p>
				<p style={{ ...baseTextStyle, marginTop: "10px" }}>
					<button
						type="button"
						onMouseEnter={() => {
							setIsRetryHovered(true);
						}}
						onMouseLeave={() => {
							setIsRetryHovered(false);
						}}
						onClick={() => {
							window.location.reload();
						}}
						style={{
							...appV2ButtonBaseStyle,
							backgroundColor: isRetryHovered ? "#e3e3e3" : "#efefef",
						}}
					>
						réessayer
					</button>{" "}
					<button
						type="button"
						onMouseEnter={() => {
							setIsHomeHovered(true);
						}}
						onMouseLeave={() => {
							setIsHomeHovered(false);
						}}
						onClick={() => {
							navigate(HOME_V2_PATH);
						}}
						style={{
							...appV2ButtonBaseStyle,
							backgroundColor: isHomeHovered ? "#e3e3e3" : "#efefef",
						}}
					>
						accueil
					</button>
				</p>
			</div>
		</main>
	);
}

function AppV2KeyboardPage() {
	return (
		<div style={{ textAlign: "left", marginTop: "14px" }}>
			<p style={baseTextStyle}>clavier arabe en ligne (bêta)</p>
			<style>{`
				[data-testid="keyboard-preview-text"] {
					border: 1px solid #000000 !important;
					border-radius: 0 !important;
					background: #ffffff !important;
					padding: 6px !important;
					color: #000000 !important;
					font-family: Arial, sans-serif !important;
					font-size: 14px !important;
					font-weight: 400 !important;
					line-height: 1.35 !important;
				}

				[data-testid="keyboard-preview-content"] {
					font-family: Arial, sans-serif !important;
					font-size: 14px !important;
					font-weight: 400 !important;
				}

				[data-testid="keyboard-placeholder-text"] {
					color: #666666 !important;
					font-family: Arial, sans-serif !important;
					font-size: 14px !important;
					font-weight: 400 !important;
				}

				[data-testid="keyboard-inline-suggestion"] {
					color: #777777 !important;
					font-family: Arial, sans-serif !important;
					font-size: 14px !important;
					font-weight: 400 !important;
				}

				[data-testid="keyboard-copy-action"],
				[data-testid="keyboard-clear-action"],
				[data-testid="keyboard-translate-action"] {
					color: #7a7a7a !important;
				}

				[data-testid="keyboard-copy-action"]:not(:disabled),
				[data-testid="keyboard-clear-action"]:not(:disabled),
				[data-testid="keyboard-translate-action"]:not(:disabled) {
					color: #000000 !important;
				}
			`}</style>
			<div style={{ marginTop: "10px" }}>
				<Suspense fallback={<AppV2SectionLoading />}>
					<LazyKeyboardWithPreviewDemo compactSpacing plainHtmlMode />
				</Suspense>
			</div>
		</div>
	);
}

function AppV2ImmersionVideoPage({
	hasSession,
	userId,
	wordsAcquiredCount,
	wordsAcquiredCountLoading,
}: {
	hasSession: boolean;
	userId: string | null;
	wordsAcquiredCount: number;
	wordsAcquiredCountLoading: boolean;
}) {
	const [recommendationsLoading, setRecommendationsLoading] = useState(false);
	const [result, setResult] =
		useState<PreviewYoutubeRecommendationsResult | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const { message: inlineMessage, showMessage } = useAppV2InlineMessage();
	const [isRefreshHovered, setIsRefreshHovered] = useState(false);
	const [calculationStatus, setCalculationStatus] = useState<string | null>(
		null,
	);
	const [loadingDotsCount, setLoadingDotsCount] = useState(1);
	const wordsKnownCacheKey = userId
		? `app-v2:words-known-count:${userId}`
		: "app-v2:words-known-count:guest";
	const recommendationsCacheKey = userId
		? `app-v2:immersion-video-recommendations:${userId}`
		: null;
	const [cachedWordsKnownCount, setCachedWordsKnownCount] = useState<number>(
		() => {
			if (typeof window === "undefined") {
				return 0;
			}

			const rawValue = window.localStorage.getItem(
				userId
					? `app-v2:words-known-count:${userId}`
					: "app-v2:words-known-count:guest",
			);
			const parsedValue = rawValue ? Number(rawValue) : Number.NaN;
			return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 0;
		},
	);
	const displayedWordsKnownCount =
		wordsAcquiredCountLoading && cachedWordsKnownCount > 0
			? cachedWordsKnownCount
			: wordsAcquiredCount;

	const recommendationCacheIdentity = userId ? `user:${userId}:app-v2` : null;

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const rawValue = window.localStorage.getItem(wordsKnownCacheKey);
		const parsedValue = rawValue ? Number(rawValue) : Number.NaN;
		setCachedWordsKnownCount(
			Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 0,
		);
	}, [wordsKnownCacheKey]);

	useEffect(() => {
		if (wordsAcquiredCountLoading || typeof window === "undefined") {
			return;
		}

		setCachedWordsKnownCount(wordsAcquiredCount);
		try {
			window.localStorage.setItem(
				wordsKnownCacheKey,
				String(wordsAcquiredCount),
			);
		} catch {
			// Ignore cache write failures.
		}
	}, [wordsAcquiredCountLoading, wordsAcquiredCount, wordsKnownCacheKey]);

	useEffect(() => {
		if (!recommendationsCacheKey || typeof window === "undefined") {
			return;
		}

		const cachedValue = window.localStorage.getItem(recommendationsCacheKey);
		if (!cachedValue) {
			return;
		}

		try {
			const parsedValue = JSON.parse(
				cachedValue,
			) as PreviewYoutubeRecommendationsResult;
			if (parsedValue && Array.isArray(parsedValue.recommendations)) {
				setResult(parsedValue);
			}
		} catch {
			// Ignore malformed cache payloads.
		}
	}, [recommendationsCacheKey]);

	useEffect(() => {
		if (!recommendationsLoading) {
			setLoadingDotsCount(1);
			return;
		}

		const intervalId = window.setInterval(() => {
			setLoadingDotsCount((previous) => (previous >= 3 ? 1 : previous + 1));
		}, 320);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [recommendationsLoading]);

	const loadRecommendations = useCallback(
		async (forceRefresh = false) => {
			if (!hasSession) {
				showMessage(
					"Connecte-toi pour calculer des suggestions d'immersion vidéo.",
				);
				return;
			}

			setRecommendationsLoading(true);
			setErrorMessage(null);
			setCalculationStatus(
				"Regroupement de tous tes mots de vocabulaire appris...",
			);
			try {
				const [
					{ fetchDueCardsByReviewTypes },
					{ fetchPreviewYoutubeRecommendations },
				] = await Promise.all([
					import("@/services/deckPersoDueReviewService"),
					import("@/features/preview-new-concept/services"),
				]);

				const cardsResponse = await fetchDueCardsByReviewTypes([
					"foundation",
					"collected",
					"sent",
				]);

				if (!cardsResponse.ok) {
					throw new Error("Impossible de charger les cartes source.");
				}

				const seedWords = Array.from(
					new Set(
						cardsResponse.data
							.map((card: PreviewReviewCard) => card.vocabBase.trim())
							.filter((word) => word.length > 0),
					),
				);

				setCalculationStatus(
					"Génération des termes de recherche basés sur ton vocabulaire...",
				);

				setCalculationStatus("Analyse des meilleures vidéos pertinentes...");
				const data = await fetchPreviewYoutubeRecommendations(
					seedWords,
					wordsAcquiredCount,
					3,
					{
						cacheIdentity: recommendationCacheIdentity,
						forceRefresh,
					},
				);
				setCalculationStatus("Finalisation de tes suggestions d'immersion...");
				setResult(data);
				if (recommendationsCacheKey && typeof window !== "undefined") {
					try {
						window.localStorage.setItem(
							recommendationsCacheKey,
							JSON.stringify(data),
						);
					} catch {
						// Ignore cache write failures.
					}
				}
				showMessage("Suggestions vidéo mises à jour.");
			} catch (error) {
				const nextMessage =
					error instanceof Error && error.message.trim().length > 0
						? error.message
						: "Impossible de calculer les suggestions vidéo.";
				setErrorMessage(nextMessage);
				showMessage(nextMessage);
			} finally {
				setRecommendationsLoading(false);
				setCalculationStatus(null);
			}
		},
		[
			hasSession,
			recommendationCacheIdentity,
			recommendationsCacheKey,
			showMessage,
			wordsAcquiredCount,
		],
	);

	return (
		<div style={{ textAlign: "left", marginTop: "14px" }}>
			<p style={baseTextStyle}>
				<span style={{ color: "#cc0000", fontWeight: 700 }}>New!</span>{" "}
				immersion vidéo (bêta)
			</p>

			<div
				style={{
					marginTop: "10px",
					padding: "10px",
					backgroundColor: "#efefef",
					border: "1px solid #d6d6d6",
				}}
			>
				<p style={baseTextStyle}>
					mots connus à ce jour: {displayedWordsKnownCount}
				</p>

				<p style={{ ...baseTextStyle, marginTop: "8px" }}>
					<button
						type="button"
						onMouseEnter={() => {
							setIsRefreshHovered(true);
						}}
						onMouseLeave={() => {
							setIsRefreshHovered(false);
						}}
						onClick={() => {
							void loadRecommendations(true);
						}}
						disabled={!hasSession || recommendationsLoading}
						style={{
							...appV2ButtonBaseStyle,
							backgroundColor: isRefreshHovered ? "#e3e3e3" : "#efefef",
						}}
					>
						{recommendationsLoading
							? `calcul${".".repeat(loadingDotsCount)}`
							: "calculer les suggestions"}
					</button>
				</p>

				{calculationStatus ? (
					<p style={{ ...baseTextStyle, marginTop: "6px", marginBottom: 0 }}>
						{calculationStatus}
					</p>
				) : null}

				{inlineMessage ? (
					<p style={{ ...baseTextStyle, marginTop: "6px", marginBottom: 0 }}>
						{inlineMessage}
					</p>
				) : null}

				{!hasSession ? (
					<p style={{ ...baseTextStyle, marginTop: "8px" }}>
						connecte-toi pour débloquer le calcul des suggestions vidéo.
					</p>
				) : null}

				{errorMessage ? (
					<p style={{ ...baseTextStyle, marginTop: "8px" }}>{errorMessage}</p>
				) : null}

				{result?.isLocked ? null : null}

				{result && !result.isLocked && result.recommendations.length > 0 ? (
					<ul
						style={{ ...baseTextStyle, marginTop: "8px", paddingLeft: "18px" }}
					>
						{result.recommendations.map((recommendation) => (
							<li key={recommendation.id} style={{ marginBottom: "10px" }}>
								<a
									href={recommendation.videoUrl}
									target="_blank"
									rel="noopener noreferrer"
									style={plainLinkStyle}
								>
									{recommendation.title}
								</a>
								<div style={baseTextStyle}>
									{recommendation.channelTitle} • {recommendation.durationLabel}{" "}
									• compréhension{" "}
									{recommendation.comprehensionPercentage ?? "--"}
									{recommendation.comprehensionPercentage !== null ? "%" : ""}
								</div>
								{recommendation.summaryFr ? (
									<div style={{ ...baseTextStyle, marginTop: "2px" }}>
										{recommendation.summaryFr}
									</div>
								) : null}
							</li>
						))}
					</ul>
				) : null}
			</div>
		</div>
	);
}

function AppV2ProfilePage({
	username,
	onSignOut,
}: {
	username: string;
	onSignOut: () => void;
}) {
	const { user } = useAuth();
	const { profile, loading, error, isOwnProfile, updateProfile } =
		useProfile(username);
	const [isEditingBio, setIsEditingBio] = useState(false);
	const [bioInput, setBioInput] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [isEditButtonHovered, setIsEditButtonHovered] = useState(false);
	const [isSignOutHovered, setIsSignOutHovered] = useState(false);
	const [bankGridData, setBankGridData] = useState<VocabGridData | null>(null);
	const [isBankGridLoading, setIsBankGridLoading] = useState(false);
	const [bankGridError, setBankGridError] = useState<string | null>(null);
	const [cachedProfile, setCachedProfile] = useState<UserProfile | null>(() =>
		readAppV2ProfileCache(getAppV2ProfileCacheByUsernameKey(username)),
	);
	const { message: bioInlineMessage, showMessage: showBioInlineMessage } =
		useAppV2InlineMessage();

	useEffect(() => {
		setCachedProfile(
			readAppV2ProfileCache(getAppV2ProfileCacheByUsernameKey(username)),
		);
	}, [username]);

	useEffect(() => {
		if (!profile) {
			return;
		}

		setCachedProfile(profile);
		writeAppV2ProfileCache(profile);
	}, [profile]);

	const displayedProfile = profile ?? cachedProfile;
	const isOwnDisplayedProfile =
		isOwnProfile ||
		(Boolean(user?.id) && displayedProfile?.user_id === user?.id);

	useEffect(() => {
		setBioInput(displayedProfile?.bio ?? "");
	}, [displayedProfile?.bio]);

	useEffect(() => {
		if (!isOwnDisplayedProfile || !user?.id) {
			setBankGridData(null);
			setBankGridError(null);
			setIsBankGridLoading(false);
			return;
		}

		let cancelled = false;
		const cachedGridData = readAppV2AccountBankCache(user.id);
		if (cachedGridData) {
			setBankGridData(cachedGridData);
			setBankGridError(null);
		}

		const loadBankGridData = async () => {
			setIsBankGridLoading(!cachedGridData);
			setBankGridError(null);

			try {
				const { searchAppV2VocabularyBank } = await import(
					"@/services/appV2VocabularySearchService"
				);
				const allRows: SearchCardsV2Row[] = [];
				let offset = 0;

				for (
					let pageIndex = 0;
					pageIndex < APP_V2_ACCOUNT_BANK_MAX_FETCH_PAGES;
					pageIndex += 1
				) {
					const result = await searchAppV2VocabularyBank(
						"",
						APP_V2_ACCOUNT_BANK_SEARCH_LIMIT,
						APP_V2_ACCOUNT_BANK_SOURCE_TYPES,
						offset,
					);

					if (!result.ok) {
						throw new Error(result.error.message);
					}

					const pageRows = Array.isArray(result.data) ? result.data : [];
					allRows.push(...pageRows.filter((row) => Boolean(row.is_seen)));

					if (pageIndex === 0 && pageRows.length > 0 && !cancelled) {
						setBankGridData(toAppV2AccountBankGridData(allRows));
					}

					if (pageRows.length < APP_V2_ACCOUNT_BANK_SEARCH_LIMIT) {
						break;
					}

					offset += pageRows.length;
				}

				if (cancelled) {
					return;
				}

				const nextGridData = toAppV2AccountBankGridData(allRows);
				setBankGridData(nextGridData);
				writeAppV2AccountBankCache(user.id, nextGridData);
			} catch (loadError) {
				if (cancelled) {
					return;
				}

				console.error("Error loading app-v2 account bank grid:", loadError);
				if (!cachedGridData) {
					setBankGridData(null);
					setBankGridError("Impossible de charger ta banque de vocabulaire.");
				}
			} finally {
				if (!cancelled) {
					setIsBankGridLoading(false);
				}
			}
		};

		void loadBankGridData();

		return () => {
			cancelled = true;
		};
	}, [isOwnDisplayedProfile, user?.id]);

	const displayName = resolveProfileDisplayName(displayedProfile);
	const usernameValue = displayedProfile?.username?.trim() || username;
	const countryValue = displayedProfile?.location?.trim() || "";
	const rawProfileBio = displayedProfile?.bio?.trim() || "";
	const displayedProfileBio = rawProfileBio.length > 0 ? rawProfileBio : "...";
	const bioTextareaRef = usePretextAutoResize(
		bioInput,
		APP_V2_PRETEXT_BODY_FONT,
		APP_V2_PRETEXT_BODY_LINE_HEIGHT_PX,
		8,
		80,
		260,
		{ blockId: "app-v2-profile:bio-textarea" },
	);

	const handleSaveBio = useCallback(async () => {
		if (!isOwnDisplayedProfile) {
			showBioInlineMessage("Tu peux modifier uniquement ta propre bio.");
			return;
		}

		setIsSaving(true);
		try {
			await updateProfile({ bio: bioInput });
			setIsEditingBio(false);
			showBioInlineMessage("Bio mise à jour.");
		} catch (saveError) {
			console.error("Error saving app-v2 bio:", saveError);
			showBioInlineMessage("Impossible de mettre à jour la bio.");
		} finally {
			setIsSaving(false);
		}
	}, [bioInput, isOwnDisplayedProfile, showBioInlineMessage, updateProfile]);

	if (loading && !displayedProfile) {
		return <p style={baseTextStyle}>chargement du compte...</p>;
	}

	if (error && !displayedProfile) {
		return (
			<p style={baseTextStyle}>
				{error && error.trim().length > 0
					? error
					: "compte introuvable pour le moment."}
			</p>
		);
	}

	if (!displayedProfile) {
		return <p style={baseTextStyle}>compte introuvable pour le moment.</p>;
	}

	return (
		<div style={{ textAlign: "left", marginTop: "14px" }}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "12px",
				}}
			>
				{isOwnDisplayedProfile ? (
					<p style={{ ...baseTextStyle, margin: 0 }}>mon compte</p>
				) : (
					<Link to={`${APP_V2_BASE_PATH}/contacts`} style={plainLinkStyle}>
						← retour à mes contacts
					</Link>
				)}
				{isOwnDisplayedProfile ? (
					<div style={{ ...baseTextStyle, textAlign: "right" }}>
						<Link to={`${APP_V2_BASE_PATH}/contacts`} style={plainLinkStyle}>
							mes contacts
						</Link>
						{" • "}
						<Link to={`${APP_V2_BASE_PATH}/settings`} style={plainLinkStyle}>
							paramètres
						</Link>
						{" • "}
						<button
							type="button"
							onMouseEnter={() => {
								setIsSignOutHovered(true);
							}}
							onMouseLeave={() => {
								setIsSignOutHovered(false);
							}}
							onClick={onSignOut}
							style={{
								...baseTextStyle,
								color: "#000000",
								textDecoration: "underline",
								background: "none",
								border: 0,
								padding: 0,
								cursor: "pointer",
								opacity: isSignOutHovered ? 0.8 : 1,
							}}
						>
							déconnexion
						</button>
					</div>
				) : null}
			</div>

			<div
				style={{
					marginTop: "10px",
					padding: "10px",
					backgroundColor: "#efefef",
					border: "1px solid #d6d6d6",
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "flex-start",
						gap: "6px",
					}}
				>
					{displayedProfile.avatar_url ? (
						<img
							src={displayedProfile.avatar_url}
							alt={displayName}
							style={{
								width: "88px",
								height: "88px",
								borderRadius: 0,
								objectFit: "cover",
							}}
						/>
					) : (
						<div
							aria-hidden="true"
							style={{
								width: "88px",
								height: "88px",
								borderRadius: 0,
								backgroundColor: "#d9d9d9",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								...baseTextStyle,
							}}
						>
							{displayName.slice(0, 1).toUpperCase()}
						</div>
					)}

					<div style={{ marginTop: "2px" }}>
						<p style={{ ...baseTextStyle, margin: 0, lineHeight: 1.15 }}>
							{displayName}
						</p>
						<p style={{ ...baseTextStyle, margin: 0, lineHeight: 1.15 }}>
							@{usernameValue}
						</p>
						{countryValue.length > 0 ? (
							<p style={{ ...baseTextStyle, margin: 0, lineHeight: 1.15 }}>
								{countryValue}
							</p>
						) : null}
					</div>
				</div>
			</div>

			<div
				style={{
					marginTop: "10px",
					padding: "10px",
					backgroundColor: "#efefef",
					border: "1px solid #d6d6d6",
				}}
			>
				<p style={{ ...baseTextStyle, marginBottom: 0 }}>bio :</p>
				{isEditingBio ? (
					<div>
						<textarea
							ref={bioTextareaRef}
							value={bioInput}
							onChange={(event) => {
								setBioInput(event.target.value);
							}}
							rows={4}
							style={{
								...baseTextStyle,
								width: "100%",
								maxWidth: "520px",
								padding: "4px 6px",
								border: "1px solid #000000",
								backgroundColor: "#ffffff",
								lineHeight: `${APP_V2_PRETEXT_BODY_LINE_HEIGHT_PX}px`,
								resize: "vertical",
							}}
						/>
						<div style={{ marginTop: "8px" }}>
							<button
								type="button"
								onClick={() => {
									void handleSaveBio();
								}}
								disabled={isSaving}
								style={{
									...appV2ButtonBaseStyle,
									backgroundColor: "#efefef",
								}}
							>
								{isSaving ? "enregistrement..." : "enregistrer"}
							</button>{" "}
							<button
								type="button"
								onClick={() => {
									setIsEditingBio(false);
									setBioInput(displayedProfile.bio ?? "");
								}}
								style={{
									...appV2ButtonBaseStyle,
									backgroundColor: "#efefef",
								}}
							>
								annuler
							</button>
						</div>
					</div>
				) : (
					<>
						<p style={{ ...baseTextStyle, marginTop: 0 }}>
							{displayedProfileBio}
						</p>
						{isOwnDisplayedProfile ? (
							<p style={{ marginTop: "8px" }}>
								<button
									type="button"
									onMouseEnter={() => {
										setIsEditButtonHovered(true);
									}}
									onMouseLeave={() => {
										setIsEditButtonHovered(false);
									}}
									onClick={() => {
										setIsEditingBio(true);
									}}
									style={{
										...appV2ButtonBaseStyle,
										backgroundColor: isEditButtonHovered
											? "#e3e3e3"
											: "#efefef",
									}}
								>
									modifier ma bio
								</button>
							</p>
						) : null}
					</>
				)}
				{bioInlineMessage ? (
					<p style={{ ...baseTextStyle, marginTop: "6px", marginBottom: 0 }}>
						{bioInlineMessage}
					</p>
				) : null}
			</div>

			{isOwnDisplayedProfile ? (
				<div
					style={{
						marginTop: "10px",
						marginBottom: "18px",
						padding: "10px 10px 12px 10px",
						backgroundColor: "#efefef",
						border: "1px solid #d6d6d6",
					}}
				>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "flex-end",
							gap: "6px",
							...baseTextStyle,
						}}
					>
						<span style={{ whiteSpace: "nowrap" }}>Non maîtrisé</span>
						<div
							style={{
								width: "120px",
								height: "10px",
								background: APP_V2_ACCOUNT_BANK_LEGEND_GRADIENT,
							}}
						/>
						<span style={{ whiteSpace: "nowrap" }}>Maîtrisé</span>
					</div>

					<div style={{ marginTop: "8px", width: "100%" }}>
						{isBankGridLoading && !bankGridData ? (
							<p style={{ ...baseTextStyle, margin: "0 0 6px 0" }}>
								chargement du vocabulaire...
							</p>
						) : null}
						<Suspense fallback={<AppV2SectionLoading />}>
							<LazyVocabGrid
								data={bankGridData}
								loading={false}
								error={bankGridError}
								groupings={[]}
								searchQuery=""
								categoryFilter={null}
								maxRows={4}
								hideUnseenUnits
								gridOnly
								gridJustify="center"
							/>
						</Suspense>
					</div>
				</div>
			) : null}
		</div>
	);
}

function AppV2SettingsPage({ monComptePath }: { monComptePath: string }) {
	const { user } = useAuth();
	const { profile, loading, updateName, updateProfile } = useProfile(
		undefined,
		user?.id,
	);
	const [firstName, setFirstName] = useState("");
	const [selectedCountry, setSelectedCountry] = useState("");
	const [newCardsPerDay, setNewCardsPerDay] = useState(
		PROFILE_NEW_CARDS_PER_DAY_DEFAULT,
	);
	const [reviewReminderEmailEnabled, setReviewReminderEmailEnabled] =
		useState(false);
	const [isSavingProfile, setIsSavingProfile] = useState(false);
	const [isSaveButtonHovered, setIsSaveButtonHovered] = useState(false);
	const {
		message: profileInlineMessage,
		showMessage: showProfileInlineMessage,
	} = useAppV2InlineMessage();
	const reviewReminderEmailCacheKey = user?.id
		? `app-v2:review-reminder-email-enabled:${user.id}`
		: null;

	useEffect(() => {
		if (!profile) {
			return;
		}

		const savedLocationValue =
			typeof profile.location === "string" ? profile.location.trim() : "";

		setFirstName(profile.first_name ?? "");
		setSelectedCountry(
			isSupportedProfileCountry(savedLocationValue) ? savedLocationValue : "",
		);
		setNewCardsPerDay(
			clampProfileNewCardsPerDay(
				profile.new_cards_per_day ?? PROFILE_NEW_CARDS_PER_DAY_DEFAULT,
			),
		);
	}, [profile]);

	useEffect(() => {
		if (!reviewReminderEmailCacheKey) {
			setReviewReminderEmailEnabled(false);
			return;
		}

		try {
			const cachedValue = window.localStorage.getItem(
				reviewReminderEmailCacheKey,
			);
			if (cachedValue === "1") {
				setReviewReminderEmailEnabled(true);
				return;
			}
		} catch {
			// Ignore localStorage read errors and keep safe default (non).
		}

		setReviewReminderEmailEnabled(false);
	}, [reviewReminderEmailCacheKey]);

	const handleSaveProfile = useCallback(async () => {
		if (!user?.id) {
			showProfileInlineMessage("Connecte-toi pour enregistrer tes paramètres.");
			return;
		}

		setIsSavingProfile(true);
		try {
			const { updateReviewReminderPreferences } = await import(
				"@/services/reviewRemindersService"
			);
			const reminderEmailEnabled = reviewReminderEmailEnabled;

			const [nameResult, profileResult, reminderResult] = await Promise.all([
				updateName(firstName.trim(), ""),
				updateProfile({
					location: selectedCountry || undefined,
					new_cards_per_day: clampProfileNewCardsPerDay(newCardsPerDay),
				}),
				supabase
					.from("profiles")
					.update({ notifications_email: reminderEmailEnabled })
					.eq("user_id", user.id),
			]);

			void nameResult;
			void profileResult;

			if (reminderResult.error) {
				throw reminderResult.error;
			}

			const reminderPreferencesResult = await updateReviewReminderPreferences(
				{
					enabled: reminderEmailEnabled,
					email_enabled: reminderEmailEnabled,
				},
				{ userId: user.id },
			);

			if (!reminderPreferencesResult.ok) {
				throw new Error(reminderPreferencesResult.error.message);
			}

			if (reviewReminderEmailCacheKey) {
				try {
					window.localStorage.setItem(
						reviewReminderEmailCacheKey,
						reminderEmailEnabled ? "1" : "0",
					);
				} catch {
					// Ignore localStorage write errors.
				}
			}

			showProfileInlineMessage("Paramètres enregistrés.");
		} catch (saveError) {
			console.error("Error saving app-v2 settings:", saveError);
			showProfileInlineMessage("Impossible d'enregistrer les paramètres.");
		} finally {
			setIsSavingProfile(false);
		}
	}, [
		firstName,
		newCardsPerDay,
		selectedCountry,
		reviewReminderEmailCacheKey,
		reviewReminderEmailEnabled,
		showProfileInlineMessage,
		updateName,
		updateProfile,
		user?.id,
	]);

	if (!user) {
		return (
			<p style={{ ...baseTextStyle, marginTop: "14px" }}>
				connecte-toi pour accéder aux paramètres.
			</p>
		);
	}

	if (loading) {
		return (
			<p style={{ ...baseTextStyle, marginTop: "14px" }}>
				chargement des paramètres...
			</p>
		);
	}

	const settingsEmailValue =
		profile?.email?.trim() || user.email?.trim() || "email indisponible";
	const baseRadioStyle = {
		appearance: "none" as const,
		WebkitAppearance: "none" as const,
		MozAppearance: "none" as const,
		width: "12px",
		height: "12px",
		borderRadius: "50%",
		border: "1px solid #000000",
		backgroundColor: "#ffffff",
		verticalAlign: "middle" as const,
	};

	const resolveRadioStyle = (checked: boolean) => ({
		...baseRadioStyle,
		backgroundImage: checked
			? "radial-gradient(circle, #000000 0 3px, transparent 3px)"
			: "none",
		backgroundRepeat: "no-repeat",
		backgroundPosition: "center",
	});

	return (
		<div style={{ textAlign: "left", marginTop: "14px" }}>
			<p style={{ ...baseTextStyle, margin: 0 }}>
				<Link to={monComptePath} style={plainLinkStyle}>
					← retour à mon compte
				</Link>
			</p>
			<style>{`
				#app-v2-settings-range,
				#app-v2-settings-number {
					appearance: auto;
					-webkit-appearance: auto;
					-moz-appearance: auto;
				}

				#app-v2-settings-number::-webkit-outer-spin-button,
				#app-v2-settings-number::-webkit-inner-spin-button {
					-webkit-appearance: auto;
					opacity: 1;
				}
			`}</style>

			<div
				style={{
					marginTop: "10px",
					padding: "10px",
					backgroundColor: "#efefef",
					border: "1px solid #d6d6d6",
				}}
			>
				<p style={{ ...baseTextStyle, marginTop: "6px" }}>
					prénom
					<br />
					<input
						type="text"
						value={firstName}
						onChange={(event) => {
							setFirstName(event.target.value);
						}}
						style={{
							...baseTextStyle,
							width: "240px",
							padding: "2px 6px",
							border: "1px solid #000000",
							backgroundColor: "#ffffff",
						}}
					/>
				</p>
				<p style={{ ...baseTextStyle, marginTop: "8px" }}>
					adresse e-mail
					<br />
					<span style={baseTextStyle}>{settingsEmailValue}</span>
				</p>
				<p style={{ ...baseTextStyle, marginTop: "8px" }}>
					pays
					<br />
					<select
						value={selectedCountry}
						onChange={(event) => {
							setSelectedCountry(event.target.value);
						}}
						disabled={isSavingProfile}
						style={{
							...baseTextStyle,
							width: "240px",
							padding: "2px 6px",
							border: "1px solid #000000",
							backgroundColor: "#ffffff",
						}}
					>
						<option value="">choisir un pays</option>
						{PROFILE_COUNTRY_OPTIONS.map((countryOption) => (
							<option key={countryOption.value} value={countryOption.value}>
								{countryOption.label}
							</option>
						))}
					</select>
				</p>
			</div>

			<div
				style={{
					marginTop: "10px",
					padding: "10px",
					backgroundColor: "#efefef",
					border: "1px solid #d6d6d6",
				}}
			>
				<p style={baseTextStyle}>nouvelles cartes / jour</p>
				<div style={{ marginTop: "6px" }}>
					<input
						id="app-v2-settings-range"
						type="range"
						min={PROFILE_NEW_CARDS_PER_DAY_MIN}
						max={PROFILE_NEW_CARDS_PER_DAY_MAX}
						step={1}
						value={newCardsPerDay}
						onChange={(event) => {
							setNewCardsPerDay(
								clampProfileNewCardsPerDay(Number(event.target.value)),
							);
						}}
						style={{
							width: "260px",
							accentColor: "#000000",
							appearance: "auto",
						}}
					/>{" "}
					<input
						id="app-v2-settings-number"
						type="number"
						min={PROFILE_NEW_CARDS_PER_DAY_MIN}
						max={PROFILE_NEW_CARDS_PER_DAY_MAX}
						value={newCardsPerDay}
						onChange={(event) => {
							setNewCardsPerDay(
								clampProfileNewCardsPerDay(Number(event.target.value)),
							);
						}}
						style={{
							...baseTextStyle,
							width: "74px",
							padding: "2px 6px",
							border: "1px solid #000000",
							backgroundColor: "#ffffff",
							appearance: "auto",
						}}
					/>
				</div>

				<p style={{ ...baseTextStyle, marginTop: "10px" }}>rappels</p>
				<div style={{ marginTop: "8px" }}>
					<p style={{ ...baseTextStyle, margin: 0 }}>
						email de rappel de révision{" "}
						<label style={baseTextStyle}>
							<input
								type="radio"
								name="app-v2-review-reminder-email"
								checked={reviewReminderEmailEnabled}
								onChange={() => {
									setReviewReminderEmailEnabled(true);
								}}
								disabled={isSavingProfile}
								style={{
									...resolveRadioStyle(reviewReminderEmailEnabled),
								}}
							/>{" "}
							oui
						</label>
						<label style={{ ...baseTextStyle, marginLeft: "14px" }}>
							<input
								type="radio"
								name="app-v2-review-reminder-email"
								checked={!reviewReminderEmailEnabled}
								onChange={() => {
									setReviewReminderEmailEnabled(false);
								}}
								disabled={isSavingProfile}
								style={{
									...resolveRadioStyle(!reviewReminderEmailEnabled),
								}}
							/>{" "}
							non
						</label>
					</p>
				</div>
			</div>

			<p style={{ marginTop: "10px" }}>
				<button
					type="button"
					onMouseEnter={() => {
						setIsSaveButtonHovered(true);
					}}
					onMouseLeave={() => {
						setIsSaveButtonHovered(false);
					}}
					onClick={() => {
						void handleSaveProfile();
					}}
					disabled={isSavingProfile}
					style={{
						...appV2ButtonBaseStyle,
						backgroundColor: isSaveButtonHovered ? "#e3e3e3" : "#efefef",
					}}
				>
					{isSavingProfile ? "enregistrement..." : "enregistrer"}
				</button>
				{profileInlineMessage ? (
					<p style={{ ...baseTextStyle, marginTop: "6px", marginBottom: 0 }}>
						{profileInlineMessage}
					</p>
				) : null}
			</p>
		</div>
	);
}

function AppV2ContactsPage({
	hasSession,
	monComptePath,
	onOpenContact,
}: {
	hasSession: boolean;
	monComptePath: string;
	onOpenContact: (friend: FriendListItem) => void;
}) {
	const [contacts, setContacts] = useState<FriendListItem[]>([]);
	const [isLoading, setIsLoading] = useState(hasSession);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [usernameInput, setUsernameInput] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isAddButtonHovered, setIsAddButtonHovered] = useState(false);
	const {
		message: contactInlineMessage,
		showMessage: showContactInlineMessage,
	} = useAppV2InlineMessage();

	const refreshContacts = useCallback(async () => {
		if (!hasSession) {
			setContacts([]);
			setIsLoading(false);
			setErrorMessage(null);
			return;
		}

		setIsLoading(true);
		setErrorMessage(null);

		try {
			const { loadPreviewConnections } = await import(
				"@/features/preview-new-concept/services"
			);
			const result = await loadPreviewConnections();
			setContacts(result);
		} catch (error) {
			console.error("Error loading app-v2 contacts:", error);
			setErrorMessage("Impossible de charger les contacts pour le moment.");
		} finally {
			setIsLoading(false);
		}
	}, [hasSession]);

	useEffect(() => {
		void refreshContacts();
	}, [refreshContacts]);

	const handleAddContact = useCallback(
		async (event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			setIsSubmitting(true);

			try {
				const { sendPreviewConnectionRequest } = await import(
					"@/features/preview-new-concept/services"
				);
				const status = await sendPreviewConnectionRequest(usernameInput);

				switch (status) {
					case "sent":
						showContactInlineMessage("Demande de contact envoyée.");
						break;
					case "already_pending":
						showContactInlineMessage("Une demande est déjà en attente.");
						break;
					case "already_friends":
						showContactInlineMessage("Vous êtes déjà connectés.");
						break;
					case "accepted_reverse_request":
						showContactInlineMessage(
							"Demande croisée détectée : vous êtes maintenant connectés.",
						);
						break;
				}

				setUsernameInput("");
				await refreshContacts();
			} catch (error) {
				const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
				switch (code) {
					case "USERNAME_REQUIRED":
						showContactInlineMessage("Renseigne le @username de ce contact.");
						break;
					case "USER_NOT_FOUND":
						showContactInlineMessage(
							"Aucun utilisateur trouvé avec ce username.",
						);
						break;
					case "CANNOT_ADD_SELF":
						showContactInlineMessage("Tu ne peux pas t'ajouter toi-même.");
						break;
					default:
						showContactInlineMessage(
							"Impossible d'envoyer la demande de contact.",
						);
				}
			} finally {
				setIsSubmitting(false);
			}
		},
		[refreshContacts, showContactInlineMessage, usernameInput],
	);

	return (
		<div style={{ textAlign: "left", marginTop: "14px" }}>
			<p style={{ ...baseTextStyle, margin: 0 }}>
				<Link to={monComptePath} style={plainLinkStyle}>
					← retour à mon compte
				</Link>
			</p>
			<form onSubmit={handleAddContact} style={{ marginTop: "10px" }}>
				<label htmlFor="app-v2-contact-username" style={baseTextStyle}>
					ajouter un contact (@username)
				</label>
				<div style={{ marginTop: "6px" }}>
					<input
						id="app-v2-contact-username"
						type="text"
						value={usernameInput}
						onChange={(event) => {
							setUsernameInput(event.target.value);
						}}
						disabled={!hasSession || isSubmitting}
						placeholder="@username"
						style={{
							...baseTextStyle,
							width: "260px",
							padding: "2px 6px",
							border: "1px solid #000000",
							backgroundColor: "#ffffff",
						}}
					/>{" "}
					<button
						type="submit"
						onMouseEnter={() => {
							setIsAddButtonHovered(true);
						}}
						onMouseLeave={() => {
							setIsAddButtonHovered(false);
						}}
						disabled={!hasSession || isSubmitting}
						style={{
							...appV2ButtonBaseStyle,
							backgroundColor: isAddButtonHovered ? "#e3e3e3" : "#efefef",
						}}
					>
						{isSubmitting ? "envoi..." : "ajouter"}
					</button>
					{contactInlineMessage ? (
						<p style={{ ...baseTextStyle, marginTop: "6px", marginBottom: 0 }}>
							{contactInlineMessage}
						</p>
					) : null}
				</div>
			</form>

			<div style={{ marginTop: "14px" }}>
				{!hasSession ? (
					<p style={baseTextStyle}>connecte-toi pour afficher tes contacts.</p>
				) : isLoading ? (
					<p style={baseTextStyle}>chargement...</p>
				) : errorMessage ? (
					<p style={baseTextStyle}>{errorMessage}</p>
				) : contacts.length === 0 ? (
					<p style={baseTextStyle}>aucun contact pour le moment.</p>
				) : (
					<ul style={{ margin: 0, paddingLeft: "18px" }}>
						{contacts.map((friend) => {
							const displayName = resolveContactDisplayName(friend);
							const connectedLabel = formatLastActivityLabel(
								friend.connectedAt,
							);

							return (
								<li key={friend.userId} style={{ marginBottom: "6px" }}>
									{friend.username ? (
										<Link
											to={buildAppV2AccountPath(friend.username)}
											style={plainLinkStyle}
											onClick={(event) => {
												event.preventDefault();
												onOpenContact(friend);
											}}
										>
											{displayName}
										</Link>
									) : (
										<span style={baseTextStyle}>{displayName}</span>
									)}
									{friend.email ? ` — ${friend.email}` : ""}
									{connectedLabel ? ` — ${connectedLabel}` : ""}
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</div>
	);
}

export default function PreviewNewConceptV2Page() {
	const [isButtonHovered, setIsButtonHovered] = useState(false);
	const [contentRef, contentWidth] = usePretextContainerWidth<HTMLDivElement>();
	const location = useLocation();
	const navigate = useNavigate();
	const { user, signOut } = useAuth();
	const { wordsAcquiredCount, loading: wordsAcquiredCountLoading } =
		useAppV2WordsAcquiredCount(user?.id);
	const { isAdmin } = useIsAdmin();
	const { count: remainingCardsCount } = usePendingReviewsCount({
		authenticatedDeckScope: "personal_and_foundation",
	});
	const [weeklyRemainingCount, setWeeklyRemainingCount] = useState(0);
	const [averageReviewsPerDay, setAverageReviewsPerDay] = useState(0);
	const [finishInDays, setFinishInDays] = useState<number | null>(null);
	const [adminUniqueVisitorsTotal, setAdminUniqueVisitorsTotal] = useState<
		number | null
	>(() => readAppV2AdminUniqueVisitorsCache()?.total ?? null);
	const [cachedFoundationRemainingCount, setCachedFoundationRemainingCount] =
		useState<number | null>(() =>
			readAppV2FoundationRemainingCache(user?.id ?? null),
		);

	const todayRemainingCount = user
		? Math.max(0, remainingCardsCount)
		: Math.max(remainingCardsCount, APP_V2_GUEST_REMAINING_CARDS);
	const totalFoundationRemainingCount = user
		? Math.max(0, APP_V2_TOTAL_DECK_CARDS - wordsAcquiredCount)
		: APP_V2_TOTAL_DECK_CARDS;
	const displayedTotalFoundationRemainingCount =
		user && wordsAcquiredCountLoading
			? (cachedFoundationRemainingCount ?? totalFoundationRemainingCount)
			: totalFoundationRemainingCount;
	const totalRemainingCardsLabel = String(
		displayedTotalFoundationRemainingCount,
	);
	const normalizedPathname = normalizePathname(location.pathname);
	const canonicalPathname = useMemo(
		() => resolveCanonicalAppV2Path(normalizedPathname),
		[normalizedPathname],
	);
	const profileRegex = new RegExp(
		`^${APP_V2_BASE_PATH}/(?:account|compte|profil|profile)(?:/(.+))?$`,
	);
	const profileMatch = normalizedPathname.match(profileRegex);
	const isHomePage = normalizedPathname === APP_V2_BASE_PATH;
	const isErrorPage = normalizedPathname === `${APP_V2_BASE_PATH}/error`;
	const isSessionPage = normalizedPathname === `${APP_V2_BASE_PATH}/session`;
	const isSettingsPage = normalizedPathname === `${APP_V2_BASE_PATH}/settings`;
	const isKeyboardPage =
		normalizedPathname === `${APP_V2_BASE_PATH}/clavier-arabe-en-ligne`;
	const isImmersionVideoPage =
		normalizedPathname === `${APP_V2_BASE_PATH}/immersion-video` ||
		normalizedPathname === `${APP_V2_BASE_PATH}/end`;
	const isWhyItWorksPage =
		normalizedPathname === `${APP_V2_BASE_PATH}/pourquoi-ca-marche` ||
		normalizedPathname.startsWith(`${APP_V2_BASE_PATH}/pourquoi-ca-marche/`);
	const isContactsPage =
		normalizedPathname === `${APP_V2_BASE_PATH}/contacts` ||
		normalizedPathname === `${APP_V2_BASE_PATH}/camarades`;
	const isProfilePage = Boolean(profileMatch);
	const isKnownRoute =
		isHomePage ||
		isErrorPage ||
		isSessionPage ||
		isSettingsPage ||
		isKeyboardPage ||
		isImmersionVideoPage ||
		isWhyItWorksPage ||
		isContactsPage ||
		isProfilePage;
	const activeProfileUsername = resolveAppV2ProfileUsername(profileMatch?.[1]);
	const isNarrowContentPage =
		isProfilePage || isSettingsPage || isContactsPage || isImmersionVideoPage;
	const [ownAccountUsername, setOwnAccountUsername] = useState<string>(() =>
		resolveAppV2ProfileUsername(
			user?.id
				? readAppV2ProfileCache(getAppV2ProfileCacheByUserIdKey(user.id))
						?.username
				: null,
		),
	);
	const monComptePath = useMemo(
		() => buildAppV2AccountPath(ownAccountUsername),
		[ownAccountUsername],
	);
	const shouldShowAdminUniqueVisitors = isHomePage && isAdmin === true;
	const appV2HomeTextMaxWidth = useMemo(() => {
		if (contentWidth <= 0) {
			return 700;
		}
		return Math.min(700, Math.max(220, contentWidth - 32));
	}, [contentWidth]);
	const totalRemainingTitleFontSizePx = useMemo(
		() =>
			findLargestSingleLineFontSize(
				totalRemainingCardsLabel,
				appV2HomeTextMaxWidth,
				APP_V2_PRETEXT_HOME_MAX_TITLE_FONT_PX,
				APP_V2_PRETEXT_HOME_MIN_TITLE_FONT_PX,
				"Arial, sans-serif",
				{
					pagePath: normalizedPathname,
					blockId: "app-v2-home:total-remaining-title",
				},
			),
		[appV2HomeTextMaxWidth, normalizedPathname, totalRemainingCardsLabel],
	);
	const [isSigningOut, setIsSigningOut] = useState(false);

	useEffect(() => {
		ensureAppV2RuntimeProfiler(normalizedPathname);
	}, [normalizedPathname]);

	const handleSignOut = useCallback(async () => {
		if (isSigningOut) {
			return;
		}

		setIsSigningOut(true);
		try {
			await signOut();
		} catch (error) {
			console.error("App V2 sign-out failed, retrying with Supabase:", error);
			const { error: globalSignOutError } = await supabase.auth.signOut({
				scope: "global",
			});
			if (globalSignOutError) {
				console.error(
					"App V2 fallback global sign-out failed:",
					globalSignOutError,
				);
			}

			const { error: localSignOutError } = await supabase.auth.signOut({
				scope: "local",
			});
			if (localSignOutError) {
				console.error(
					"App V2 fallback local sign-out failed:",
					localSignOutError,
				);
			}
		} finally {
			navigate(HOME_V2_PATH, { replace: true });
			window.setTimeout(() => {
				window.location.assign(HOME_V2_PATH);
			}, 0);
			setIsSigningOut(false);
		}
	}, [isSigningOut, navigate, signOut]);

	useEffect(() => {
		if (!user?.id) {
			setOwnAccountUsername(DEFAULT_APP_V2_PROFILE_USERNAME);
			return;
		}

		const cachedProfile = readAppV2ProfileCache(
			getAppV2ProfileCacheByUserIdKey(user.id),
		);
		setOwnAccountUsername(resolveAppV2ProfileUsername(cachedProfile?.username));
	}, [user?.id]);

	useEffect(() => {
		setCachedFoundationRemainingCount(
			readAppV2FoundationRemainingCache(user?.id ?? null),
		);
	}, [user?.id]);

	useEffect(() => {
		if (!user || wordsAcquiredCountLoading) {
			return;
		}

		setCachedFoundationRemainingCount(totalFoundationRemainingCount);
		writeAppV2FoundationRemainingCache(user.id, totalFoundationRemainingCount);
	}, [wordsAcquiredCountLoading, totalFoundationRemainingCount, user]);

	useEffect(() => {
		if (!user?.id) {
			return;
		}

		const cachedByUserId = readAppV2ProfileCache(
			getAppV2ProfileCacheByUserIdKey(user.id),
		);
		if (cachedByUserId) {
			setOwnAccountUsername(
				resolveAppV2ProfileUsername(cachedByUserId.username),
			);
			return;
		}

		let cancelled = false;

		const warmAccountProfileCache = async () => {
			const { data, error } = await supabase
				.from("profiles")
				.select("*")
				.eq("user_id", user.id)
				.maybeSingle();

			if (cancelled || error || !data) {
				return;
			}

			writeAppV2ProfileCache(data as UserProfile);
			setOwnAccountUsername(resolveAppV2ProfileUsername(data.username));
		};

		void warmAccountProfileCache();

		return () => {
			cancelled = true;
		};
	}, [user?.id]);

	useEffect(() => {
		if (!user?.id) {
			setWeeklyRemainingCount(todayRemainingCount);
			setAverageReviewsPerDay(0);
			setFinishInDays(null);
			return;
		}

		const cachedSnapshot = readAppV2HomeMetricsCache(user.id);
		if (!cachedSnapshot) {
			return;
		}

		setWeeklyRemainingCount(cachedSnapshot.weeklyRemainingCount);
		setAverageReviewsPerDay(cachedSnapshot.averageReviewsPerDay);
		setFinishInDays(cachedSnapshot.finishInDays);
	}, [todayRemainingCount, user?.id]);

	useEffect(() => {
		if (!user?.id) {
			return;
		}

		const cachedSnapshot = readAppV2HomeMetricsCache(user.id);
		if (
			cachedSnapshot &&
			cachedSnapshot.weeklyRemainingCount > todayRemainingCount &&
			Date.now() - cachedSnapshot.updatedAt <= APP_V2_HOME_METRICS_CACHE_TTL_MS
		) {
			return;
		}

		let cancelled = false;

		const refreshHomeMetrics = async () => {
			let nextWeeklyRemainingCount = todayRemainingCount;
			let nextAverageReviewsPerDay = 0;
			let schedulerWeeklyCount = todayRemainingCount;
			const monthAgo = new Date();
			monthAgo.setDate(monthAgo.getDate() - 30);
			const { fetchDueCardsByReviewTypes } = await import(
				"@/services/deckPersoDueReviewService"
			);

			const [reviewAverageResult, weeklyDueResult] = await Promise.allSettled([
				supabase
					.from("user_daily_activity")
					.select("activity_date,reviews_count")
					.eq("user_id", user.id)
					.gte("activity_date", monthAgo.toISOString().slice(0, 10)),
				fetchDueCardsByReviewTypes(["foundation", "collected", "sent"], 320),
			]);

			if (reviewAverageResult.status === "fulfilled") {
				const { data, error } = reviewAverageResult.value;
				if (!error && Array.isArray(data)) {
					const activeRows = data.filter(
						(row) =>
							typeof row.reviews_count === "number" && row.reviews_count > 0,
					);
					if (activeRows.length > 0) {
						const totalReviews = activeRows.reduce(
							(sum, row) => sum + Math.max(0, row.reviews_count ?? 0),
							0,
						);
						nextAverageReviewsPerDay = Math.floor(
							totalReviews / activeRows.length,
						);
					}
				}
			} else {
				console.error(
					"Error loading app-v2 review average:",
					reviewAverageResult.reason,
				);
			}

			if (weeklyDueResult.status === "fulfilled") {
				const dueCardsResult = weeklyDueResult.value;
				if (dueCardsResult.ok) {
					const now = Date.now();
					const weekEndTs = now + 7 * 24 * 60 * 60 * 1000;
					schedulerWeeklyCount = dueCardsResult.data.reduce((count, card) => {
						if (!card.nextReviewAt) {
							return count + 1;
						}
						const nextReviewAtMs = Date.parse(card.nextReviewAt);
						if (Number.isNaN(nextReviewAtMs)) {
							return count;
						}
						return nextReviewAtMs <= weekEndTs ? count + 1 : count;
					}, 0);
				}
			} else {
				console.error(
					"Error loading app-v2 weekly remaining cards:",
					weeklyDueResult.reason,
				);
			}

			const projectionDailyPace =
				nextAverageReviewsPerDay > 0
					? nextAverageReviewsPerDay
					: Math.max(1, Math.floor(todayRemainingCount / 7));
			const projectedWeeklyFromPace = Math.max(
				todayRemainingCount,
				todayRemainingCount + Math.floor(projectionDailyPace * 6),
			);
			nextWeeklyRemainingCount = Math.max(
				todayRemainingCount,
				schedulerWeeklyCount,
				projectedWeeklyFromPace,
			);

			const totalCardsRemaining = Math.max(
				0,
				APP_V2_TOTAL_DECK_CARDS - wordsAcquiredCount,
			);
			const nextFinishInDays =
				nextAverageReviewsPerDay > 0
					? Math.floor(totalCardsRemaining / nextAverageReviewsPerDay)
					: null;

			if (cancelled) {
				return;
			}

			setWeeklyRemainingCount(nextWeeklyRemainingCount);
			setAverageReviewsPerDay(nextAverageReviewsPerDay);
			setFinishInDays(nextFinishInDays);

			writeAppV2HomeMetricsCache(user.id, {
				weeklyRemainingCount: nextWeeklyRemainingCount,
				averageReviewsPerDay: nextAverageReviewsPerDay,
				finishInDays: nextFinishInDays,
				updatedAt: Date.now(),
			});
		};

		void refreshHomeMetrics();

		return () => {
			cancelled = true;
		};
	}, [todayRemainingCount, user?.id, wordsAcquiredCount]);

	useEffect(() => {
		if (!user) {
			return;
		}

		if (averageReviewsPerDay <= 0) {
			setFinishInDays(null);
			return;
		}

		const totalCardsRemaining = Math.max(
			0,
			APP_V2_TOTAL_DECK_CARDS - wordsAcquiredCount,
		);
		setFinishInDays(Math.floor(totalCardsRemaining / averageReviewsPerDay));
	}, [averageReviewsPerDay, user, wordsAcquiredCount]);

	useEffect(() => {
		if (!canonicalPathname || canonicalPathname === normalizedPathname) {
			return;
		}

		navigate(canonicalPathname, { replace: true });
	}, [canonicalPathname, navigate, normalizedPathname]);

	useEffect(() => {
		if (isKnownRoute) {
			return;
		}

		navigate(`${APP_V2_BASE_PATH}/error`, { replace: true });
	}, [isKnownRoute, navigate]);

	useEffect(() => {
		if (!isSessionPage) {
			return;
		}

		const visitorId = getOrCreateAppV2SessionVisitorId();

		const trackUniqueVisitor = async () => {
			const { error } = await supabase.rpc(
				"track_app_v2_session_unique_visitor",
				{
					p_visitor_id: visitorId,
					p_user_id: user?.id ?? null,
				},
			);

			if (error) {
				console.error("Error tracking app-v2 session unique visitor:", error);
			}
		};

		void trackUniqueVisitor();
	}, [isSessionPage, user?.id]);

	useEffect(() => {
		if (!user?.id) {
			setAdminUniqueVisitorsTotal(null);
			return;
		}

		if (isAdmin === false) {
			setAdminUniqueVisitorsTotal(null);
			return;
		}

		if (isAdmin !== true) {
			return;
		}

		let cancelled = false;
		const cachedSnapshot = readAppV2AdminUniqueVisitorsCache();
		if (cachedSnapshot) {
			setAdminUniqueVisitorsTotal(cachedSnapshot.total);
			if (
				Date.now() - cachedSnapshot.updatedAt <=
				APP_V2_ADMIN_UNIQUE_VISITORS_CACHE_TTL_MS
			) {
				return () => {
					cancelled = true;
				};
			}
		}

		const loadAdminUniqueVisitorsTotal = async () => {
			const { data, error } = await supabase.rpc(
				"get_app_v2_session_unique_visitors_total",
			);

			if (error) {
				console.error(
					"Error loading app-v2 session unique visitors total:",
					error,
				);
				return;
			}

			if (cancelled) {
				return;
			}

			const parsedValue =
				typeof data === "number"
					? data
					: typeof data === "string"
						? Number.parseInt(data, 10)
						: Number.NaN;
			const nextValue = Number.isFinite(parsedValue)
				? Math.max(0, Math.floor(parsedValue))
				: 0;

			setAdminUniqueVisitorsTotal(nextValue);
			writeAppV2AdminUniqueVisitorsCache(nextValue);
		};

		void loadAdminUniqueVisitorsTotal();

		return () => {
			cancelled = true;
		};
	}, [user?.id, isAdmin]);

	if (isSessionPage) {
		return (
			<main style={appV2MainStyle}>
				<AppV2ToastSuppressionStyle />
				<div style={{ height: "100vh" }}>
					<Suspense fallback={<AppV2SectionLoading />}>
						<LazyCardsReviewV2
							isPreviewMode
							forceLiveSubmission
							sessionChromeVariant="plain_html"
							onBackClick={() => {
								navigate(APP_V2_BASE_PATH);
							}}
						/>
					</Suspense>
				</div>
			</main>
		);
	}

	if (isErrorPage || !isKnownRoute) {
		return <AppV2ErrorPage />;
	}

	return (
		<main style={appV2MainStyle}>
			<AppV2ToastSuppressionStyle />
			<div
				ref={contentRef}
				style={{
					maxWidth: isNarrowContentPage ? "560px" : "1120px",
					margin: "0 auto",
					padding: "0 16px",
				}}
			>
				{user ? (
					<AppV2TopNav monComptePath={monComptePath} />
				) : (
					<p
						style={{ ...baseTextStyle, textAlign: "center", marginTop: "8px" }}
					>
						<Link
							to={LOGIN_V2_PATH}
							style={{ ...plainLinkStyle, textDecoration: "none" }}
						>
							<span style={{ textDecoration: "underline" }}>Clique ici</span>{" "}
							pour te connecter et sauvegarder ta progression pour toujours
						</Link>
					</p>
				)}

				{isSettingsPage ? (
					<AppV2SettingsPage monComptePath={monComptePath} />
				) : isKeyboardPage ? (
					<AppV2KeyboardPage />
				) : isImmersionVideoPage ? (
					<AppV2ImmersionVideoPage
						hasSession={Boolean(user)}
						userId={user?.id ?? null}
						wordsAcquiredCount={wordsAcquiredCount}
						wordsAcquiredCountLoading={wordsAcquiredCountLoading}
					/>
				) : isWhyItWorksPage ? (
					<Suspense fallback={<AppV2SectionLoading />}>
						<LazyAppV2WhyItWorksPage />
					</Suspense>
				) : isProfilePage ? (
					<AppV2ProfilePage
						username={activeProfileUsername}
						onSignOut={handleSignOut}
					/>
				) : isContactsPage ? (
					<AppV2ContactsPage
						hasSession={Boolean(user)}
						monComptePath={monComptePath}
						onOpenContact={(friend) => {
							const nextUsername =
								friend.username?.trim() || DEFAULT_APP_V2_PROFILE_USERNAME;
							navigate(buildAppV2AccountPath(nextUsername));
						}}
					/>
				) : (
					<div
						style={{
							width: "100%",
							maxWidth: "760px",
							margin: "0 auto",
							textAlign: "left",
						}}
					>
						<div style={{ textAlign: "center" }}>
							<br />
							<br />

							<h1
								style={{
									fontSize: `${totalRemainingTitleFontSizePx}px`,
									fontWeight: 400,
									lineHeight: 1,
									margin: 0,
								}}
							>
								{totalRemainingCardsLabel}
							</h1>
							<p
								style={{
									...baseTextStyle,
									marginTop: "0.16em",
									marginBottom: 0,
								}}
							>
								cartes restantes au total
							</p>

							<p style={{ ...baseTextStyle, marginTop: "12px" }}>
								<button
									type="button"
									onMouseEnter={() => {
										setIsButtonHovered(true);
									}}
									onMouseLeave={() => {
										setIsButtonHovered(false);
									}}
									onClick={() => {
										navigate(`${APP_V2_BASE_PATH}/session`);
									}}
									style={{
										...appV2ButtonBaseStyle,
										backgroundColor: isButtonHovered ? "#e3e3e3" : "#efefef",
									}}
								>
									ready to go
								</button>
							</p>

							<br />
						</div>

						<div style={{ textAlign: "center" }}>
							<div
								style={{
									...baseTextStyle,
									display: "inline-block",
									textAlign: "left",
								}}
							>
								<span style={appV2HighlightNumberStyle}>
									{todayRemainingCount}
								</span>{" "}
								cartes restantes aujourd'hui
								<br />
								<span style={appV2HighlightNumberStyle}>
									{weeklyRemainingCount}
								</span>{" "}
								cartes restantes cette semaine
								<br />
								<br />
								tu as une moyenne de{" "}
								<span style={appV2HighlightNumberStyle}>
									{averageReviewsPerDay}
								</span>{" "}
								cartes/jour
								<br />à ce rythme, tu auras tout fini dans{" "}
								<span style={appV2HighlightNumberStyle}>
									{finishInDays === null ? "--" : finishInDays}
								</span>{" "}
								jours
								{shouldShowAdminUniqueVisitors ? (
									<>
										<br />
										<br />
										nombre d'utilisateurs uniques total :{" "}
										{adminUniqueVisitorsTotal === null
											? "..."
											: adminUniqueVisitorsTotal}
									</>
								) : null}
							</div>
						</div>
					</div>
				)}
			</div>
		</main>
	);
}
