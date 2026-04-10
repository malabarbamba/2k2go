import type { SubtitlePayload } from "../../../src/interfaces/video.ts";
import { normalizeArabicToken } from "../../../src/lib/arabicText.ts";
import {
	createServiceClient,
	requireAdminAccessForAuth,
	resolveRequestAuth,
} from "../_shared/edgeAuth.ts";
import {
	buildCorsHeaders,
	jsonResponse as buildJsonResponse,
	isAllowedOrigin,
	optionsResponse,
} from "../_shared/httpSecurity.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";

const CORS_OPTIONS = { methods: "POST, OPTIONS" } as const;
const OPENAI_MODEL = "gpt-5-nano";
const FALLBACK_QUERY_MODEL = "local-fallback";
const DEFAULT_MAX_RESULTS = 3;
const MAX_MAX_RESULTS = 3;
const MAX_QUERY_COUNT = 4;
const SEARCH_RESULTS_PER_QUERY = 6;
const MAX_ANALYSIS_CANDIDATES = 6;
const ANALYSIS_CONCURRENCY = 2;
const MIN_DURATION_SECONDS = 120;
const MAX_DURATION_SECONDS = 900;
const DEFAULT_REGION_CODE = "EG";
const USER_AGENT = "Mozilla/5.0 (compatible; 2k2go Preview Bot)";
const WORKER_REQUEST_TIMEOUT_MS = 45_000;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 12;
const QUERY_STOPWORDS = new Set([
	"كيف",
	"ماذا",
	"لماذا",
	"متى",
	"اين",
	"أين",
	"عن",
	"مع",
	"في",
	"من",
	"الى",
	"إلى",
	"على",
	"هذا",
	"هذه",
	"ذلك",
	"تلك",
	"ثم",
	"لكن",
	"لان",
	"لأن",
	"يغير",
	"حياتك",
]);
const MINIMUM_WORDS_TO_SHOW_RECOMMENDATION_HINT = 10;
const MINIMUM_WORDS_TO_UNLOCK_RECOMMENDATIONS = 40;
const ESTABLISHED_USER_WORDS_THRESHOLD = 50;
const ESTABLISHED_MIN_COMPREHENSION_PERCENTAGE = 2;
const SUMMARY_MAX_VISIBLE_WARNINGS = 2;
const ROLLING_RECOMMENDATION_HISTORY_DAYS = 6;

type RequestPayload = {
	seedWords?: unknown;
	knownWordsCount?: unknown;
	maxResults?: unknown;
	forceRefresh?: unknown;
};

type SearchCandidate = {
	youtubeId: string;
	title: string;
	channelTitle: string;
	descriptionText: string | null;
	thumbnailUrl: string | null;
	durationSeconds: number | null;
	durationLabel: string;
	query: string;
	queryIndex: number;
	initialRank: number;
	discoverySource: "youtube-data-api" | "youtube-search-page";
};

type Recommendation = {
	id: string;
	youtubeId: string;
	title: string;
	channelTitle: string;
	videoUrl: string;
	thumbnailUrl: string | null;
	durationSeconds: number | null;
	durationLabel: string;
	comprehensionPercentage: number | null;
	subtitleKind: "manual" | "automatic" | "unknown";
	transcriptSnippet: string | null;
	summaryFr: string | null;
	query: string;
};

type PreparedRecommendation = Recommendation & {
	descriptionText: string | null;
};

type RecommendationPayload = PreviewYoutubeRecommendationsResponse;

type StoredDailyRecommendationsRow = {
	user_id: string;
	recommendation_day: string;
	known_words_count: number;
	completed_reviews_count: number;
	recommended_video_ids: string[] | null;
	payload: RecommendationPayload | Record<string, unknown> | null;
	created_at: string;
	updated_at: string;
};

type DailyRecommendationContext = {
	recommendationDay: string;
	dayStartUtc: string;
	dayEndUtc: string;
	completedReviewsCount: number;
	hasCompletedReviews: boolean;
};

type KnownVocabularyContext = {
	knownKeys: Set<string>;
	knownNormalizedWords: Set<string>;
};

type QueryGenerationResult = {
	queries: string[];
	model: string;
};

type SubtitleStrategy =
	| "youtube-caption-track"
	| "yt-dlp-worker"
	| "yt-dlp-worker+watch-page-fallback";

type SubtitleTrack = {
	baseUrl: string;
	languageCode: string;
	label: string;
	kind: "manual" | "automatic";
};

type WatchPageCaptionResult = {
	title: string;
	channelTitle: string;
	durationSeconds: number | null;
	thumbnailUrl: string | null;
	subtitleKind: "manual" | "automatic" | "unknown";
	payload: SubtitlePayload | null;
};

type PreviewYoutubeRecommendationsResponse = {
	generatedAt: string;
	recommendationDay: string | null;
	dayEndsAt: string | null;
	seedWords: string[];
	knownWordsCount: number | null;
	recommendationLimit: number;
	minimumWordsRequired: number;
	isLocked: boolean;
	lockMessage: string | null;
	queries: string[];
	warnings: string[];
	strategy: {
		discovery: string;
		subtitles: string;
		model: string;
	};
	recommendations: Recommendation[];
};

type SubtitleWorkerResponse = WatchPageCaptionResult;

type VideoComprehensionUnit = {
	lexiconEntryId?: string | number | null;
	word?: string | null;
	normalizedWord?: string | null;
	knownWeight?: number | null;
};

const jsonResponse = (
	req: Request,
	status: number,
	payload: Record<string, unknown>,
) => buildJsonResponse(req, payload, status, CORS_OPTIONS);

const resolveOpenAiApiKey = (): string =>
	toTrimmedString(Deno.env.get("YOUTUBE_RECO_GPT_API")) ||
	toTrimmedString(Deno.env.get("OPENAI_API_KEY"));

const toTrimmedString = (value: unknown): string =>
	typeof value === "string" ? value.trim() : "";

const containsArabicCharacters = (value: string): boolean =>
	/[\u0600-\u06FF]/.test(value);

const clampInteger = (
	value: unknown,
	fallback: number,
	min: number,
	max: number,
) => {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}

	return Math.min(max, Math.max(min, Math.round(value)));
};

const normalizeSeedWords = (value: unknown): string[] => {
	if (!Array.isArray(value)) {
		return [];
	}

	return Array.from(
		new Set(
			value
				.map((item) => normalizeArabicToken(toTrimmedString(item)))
				.filter((item) => item.length > 0),
		),
	);
};

const buildVideoUrl = (youtubeId: string): string =>
	`https://www.youtube.com/watch?v=${youtubeId}`;

const formatDurationLabel = (durationSeconds: number | null): string => {
	if (
		typeof durationSeconds !== "number" ||
		!Number.isFinite(durationSeconds)
	) {
		return "duree inconnue";
	}

	const totalSeconds = Math.max(0, Math.round(durationSeconds));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
	}

	return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const parseDurationLabelToSeconds = (value: string): number | null => {
	const parts = value
		.split(":")
		.map((part) => Number.parseInt(part.trim(), 10))
		.filter((part) => Number.isFinite(part));

	if (parts.length < 2 || parts.length > 3) {
		return null;
	}

	if (parts.some((part) => !Number.isFinite(part) || part < 0)) {
		return null;
	}

	if (parts.length === 2) {
		return parts[0] * 60 + parts[1];
	}

	return parts[0] * 3600 + parts[1] * 60 + parts[2];
};

const parseIso8601DurationToSeconds = (value: string): number | null => {
	const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
	if (!match) {
		return null;
	}

	const hours = Number.parseInt(match[1] ?? "0", 10);
	const minutes = Number.parseInt(match[2] ?? "0", 10);
	const seconds = Number.parseInt(match[3] ?? "0", 10);
	return hours * 3600 + minutes * 60 + seconds;
};

const clampKnownWeight = (value: number): number => {
	if (!Number.isFinite(value) || value <= 0) {
		return 0;
	}
	if (value >= 1) {
		return 1;
	}
	return value;
};

const getVideoComprehensionUnitKey = (
	unit: VideoComprehensionUnit,
): string | null => {
	const lexiconEntryId = String(unit.lexiconEntryId ?? "").trim();
	if (lexiconEntryId) {
		return `lexicon:${lexiconEntryId}`;
	}

	const normalizedWord = normalizeArabicToken(
		unit.normalizedWord ?? unit.word ?? "",
	);
	return normalizedWord ? `word:${normalizedWord}` : null;
};

const computeVideoComprehensionPercentage = (
	units: VideoComprehensionUnit[],
): number | null => {
	const stateByKey = new Map<string, { knownWeight: number }>();

	for (const unit of units) {
		const key = getVideoComprehensionUnitKey(unit);
		if (!key) {
			continue;
		}

		const previous = stateByKey.get(key);
		const knownWeight = clampKnownWeight(
			typeof unit.knownWeight === "number" ? unit.knownWeight : 0,
		);
		stateByKey.set(key, {
			knownWeight: Math.max(previous?.knownWeight ?? 0, knownWeight),
		});
	}

	if (stateByKey.size === 0) {
		return null;
	}

	let knownEligibleWeight = 0;
	for (const state of stateByKey.values()) {
		knownEligibleWeight += state.knownWeight;
	}

	return Math.round((knownEligibleWeight / stateByKey.size) * 100);
};

const decodeHtmlEntities = (value: string): string =>
	value
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#x27;/gi, "'")
		.replace(/&#x2F;/gi, "/")
		.replace(/&#(\d+);/g, (_, rawCode: string) => {
			const code = Number.parseInt(rawCode, 10);
			return Number.isFinite(code) ? String.fromCharCode(code) : _;
		});

const stripHtmlTags = (value: string): string =>
	value
		.replace(/<[^>]*>/g, " ")
		.replace(/\s+/g, " ")
		.trim();

const readTextValue = (value: unknown): string => {
	if (!value || typeof value !== "object") {
		return "";
	}

	const candidate = value as Record<string, unknown>;
	const simpleText = toTrimmedString(candidate.simpleText);
	if (simpleText) {
		return simpleText;
	}

	if (!Array.isArray(candidate.runs)) {
		return "";
	}

	return candidate.runs
		.map((item) => {
			if (!item || typeof item !== "object") {
				return "";
			}
			return toTrimmedString((item as Record<string, unknown>).text);
		})
		.join("")
		.trim();
};

const extractJsonBlockAfterMarker = (
	source: string,
	marker: string,
): string | null => {
	const markerIndex = source.indexOf(marker);
	if (markerIndex < 0) {
		return null;
	}

	let index = markerIndex + marker.length;
	while (index < source.length && /\s/.test(source[index])) {
		index += 1;
	}

	const startChar = source[index];
	if (startChar !== "{" && startChar !== "[") {
		return null;
	}

	const stack: string[] = [startChar === "{" ? "}" : "]"];
	let inString = false;
	let isEscaped = false;

	for (let cursor = index + 1; cursor < source.length; cursor += 1) {
		const char = source[cursor];

		if (inString) {
			if (isEscaped) {
				isEscaped = false;
				continue;
			}

			if (char === "\\") {
				isEscaped = true;
				continue;
			}

			if (char === '"') {
				inString = false;
			}
			continue;
		}

		if (char === '"') {
			inString = true;
			continue;
		}

		if (char === "{") {
			stack.push("}");
			continue;
		}

		if (char === "[") {
			stack.push("]");
			continue;
		}

		if (char === stack[stack.length - 1]) {
			stack.pop();
			if (stack.length === 0) {
				return source.slice(index, cursor + 1);
			}
		}
	}

	return null;
};

const extractJsonFromHtml = (
	html: string,
	markers: string[],
): Record<string, unknown> | null => {
	for (const marker of markers) {
		const block = extractJsonBlockAfterMarker(html, marker);
		if (!block) {
			continue;
		}

		try {
			const parsed = JSON.parse(block) as unknown;
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>;
			}
		} catch {
			// Ignore malformed JSON candidates and keep scanning other markers.
		}
	}

	return null;
};

const collectObjectsByKey = (
	value: unknown,
	targetKey: string,
	results: Record<string, unknown>[] = [],
): Record<string, unknown>[] => {
	if (Array.isArray(value)) {
		for (const item of value) {
			collectObjectsByKey(item, targetKey, results);
		}
		return results;
	}

	if (!value || typeof value !== "object") {
		return results;
	}

	for (const [key, child] of Object.entries(value)) {
		if (
			key === targetKey &&
			child &&
			typeof child === "object" &&
			!Array.isArray(child)
		) {
			results.push(child as Record<string, unknown>);
		}
		collectObjectsByKey(child, targetKey, results);
	}

	return results;
};

const chunkStrings = (values: string[], chunkSize: number): string[][] => {
	const chunks: string[][] = [];
	for (let index = 0; index < values.length; index += chunkSize) {
		chunks.push(values.slice(index, index + chunkSize));
	}
	return chunks;
};

const normalizeKnownWordsCount = (value: unknown): number | null => {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return null;
	}

	return Math.max(0, Math.round(value));
};

const normalizeForceRefresh = (value: unknown): boolean => value === true;

const subtractIsoDateDays = (isoDate: string, days: number): string => {
	const date = new Date(`${isoDate}T00:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() - days);
	return date.toISOString().slice(0, 10);
};

const createLockedRecommendationsPayload = (
	seedWords: string[],
	knownWordsCount: number,
	maxResults: number,
	lockMessage: string,
	options?: {
		recommendationDay?: string | null;
		dayEndsAt?: string | null;
	},
): RecommendationPayload => ({
	generatedAt: new Date().toISOString(),
	recommendationDay: options?.recommendationDay ?? null,
	dayEndsAt: options?.dayEndsAt ?? null,
	seedWords,
	knownWordsCount,
	recommendationLimit: maxResults,
	minimumWordsRequired: MINIMUM_WORDS_TO_UNLOCK_RECOMMENDATIONS,
	isLocked: true,
	lockMessage,
	queries: [],
	warnings: [],
	strategy: {
		discovery: "locked",
		subtitles: "locked",
		model: "locked",
	},
	recommendations: [],
});

const withRecommendationDayContext = (
	payload: RecommendationPayload,
	context: DailyRecommendationContext | null,
): RecommendationPayload => ({
	...payload,
	recommendationDay:
		payload.recommendationDay ?? context?.recommendationDay ?? null,
	dayEndsAt: payload.dayEndsAt ?? context?.dayEndUtc ?? null,
});

const normalizeStoredRecommendation = (
	value: unknown,
): Recommendation | null => {
	if (!value || typeof value !== "object") {
		return null;
	}

	const candidate = value as Record<string, unknown>;
	const id = toTrimmedString(candidate.id);
	const youtubeId = toTrimmedString(candidate.youtubeId);
	const title = toTrimmedString(candidate.title);
	if (!id || !youtubeId || !title) {
		return null;
	}

	const subtitleKind = toTrimmedString(candidate.subtitleKind);
	return {
		id,
		youtubeId,
		title,
		channelTitle: toTrimmedString(candidate.channelTitle) || "YouTube",
		videoUrl: toTrimmedString(candidate.videoUrl) || buildVideoUrl(youtubeId),
		thumbnailUrl:
			typeof candidate.thumbnailUrl === "string"
				? candidate.thumbnailUrl
				: null,
		durationSeconds:
			typeof candidate.durationSeconds === "number" &&
			Number.isFinite(candidate.durationSeconds)
				? candidate.durationSeconds
				: null,
		durationLabel:
			toTrimmedString(candidate.durationLabel) ||
			formatDurationLabel(
				typeof candidate.durationSeconds === "number"
					? candidate.durationSeconds
					: null,
			),
		comprehensionPercentage:
			typeof candidate.comprehensionPercentage === "number" &&
			Number.isFinite(candidate.comprehensionPercentage)
				? candidate.comprehensionPercentage
				: null,
		subtitleKind:
			subtitleKind === "manual" ||
			subtitleKind === "automatic" ||
			subtitleKind === "unknown"
				? subtitleKind
				: "unknown",
		transcriptSnippet:
			typeof candidate.transcriptSnippet === "string"
				? candidate.transcriptSnippet
				: null,
		summaryFr:
			typeof candidate.summaryFr === "string"
				? clampFrenchSummary(candidate.summaryFr)
				: null,
		query: toTrimmedString(candidate.query),
	};
};

const normalizeStoredRecommendationPayload = (
	value: unknown,
): RecommendationPayload | null => {
	if (!value || typeof value !== "object") {
		return null;
	}

	const candidate = value as Record<string, unknown>;
	const strategy =
		candidate.strategy && typeof candidate.strategy === "object"
			? (candidate.strategy as Record<string, unknown>)
			: {};
	const recommendations = Array.isArray(candidate.recommendations)
		? candidate.recommendations
				.map(normalizeStoredRecommendation)
				.filter(
					(recommendation): recommendation is Recommendation =>
						recommendation !== null,
				)
		: [];

	return {
		generatedAt:
			toTrimmedString(candidate.generatedAt) || new Date().toISOString(),
		recommendationDay:
			typeof candidate.recommendationDay === "string"
				? candidate.recommendationDay
				: null,
		dayEndsAt:
			typeof candidate.dayEndsAt === "string" ? candidate.dayEndsAt : null,
		seedWords: Array.isArray(candidate.seedWords)
			? candidate.seedWords
					.map((item) => toTrimmedString(item))
					.filter((item) => item.length > 0)
			: [],
		knownWordsCount: normalizeKnownWordsCount(candidate.knownWordsCount),
		recommendationLimit: clampInteger(
			candidate.recommendationLimit,
			DEFAULT_MAX_RESULTS,
			1,
			MAX_MAX_RESULTS,
		),
		minimumWordsRequired: clampInteger(
			candidate.minimumWordsRequired,
			MINIMUM_WORDS_TO_UNLOCK_RECOMMENDATIONS,
			0,
			100000,
		),
		isLocked: candidate.isLocked === true,
		lockMessage:
			typeof candidate.lockMessage === "string" ? candidate.lockMessage : null,
		queries: Array.isArray(candidate.queries)
			? candidate.queries
					.map((item) => toTrimmedString(item))
					.filter((item) => item.length > 0)
			: [],
		warnings: Array.isArray(candidate.warnings)
			? candidate.warnings
					.map((item) => toTrimmedString(item))
					.filter((item) => item.length > 0)
			: [],
		strategy: {
			discovery: toTrimmedString(strategy.discovery) || "unknown",
			subtitles: toTrimmedString(strategy.subtitles) || "unknown",
			model: toTrimmedString(strategy.model) || "unknown",
		},
		recommendations,
	};
};

const resolveRecommendationDayContext = async (
	supabaseAdmin: ReturnType<typeof createServiceClient>,
	userId: string,
): Promise<DailyRecommendationContext> => {
	const fallbackNow = new Date();
	const fallbackRecommendationDay = fallbackNow.toISOString().slice(0, 10);
	const fallbackDayStart = `${fallbackRecommendationDay}T00:00:00.000Z`;
	const fallbackDayEnd = new Date(
		Date.parse(fallbackDayStart) + 24 * 60 * 60 * 1000,
	).toISOString();

	const fallbackContext: DailyRecommendationContext = {
		recommendationDay: fallbackRecommendationDay,
		dayStartUtc: fallbackDayStart,
		dayEndUtc: fallbackDayEnd,
		completedReviewsCount: 0,
		hasCompletedReviews: false,
	};

	let timezone = "UTC";
	let cutoffHour = 4;
	const { data: profileData, error: profileError } = await supabaseAdmin
		.from("profiles")
		.select("scheduler_timezone, scheduler_day_cutoff_hour")
		.eq("user_id", userId)
		.maybeSingle();
	if (!profileError && profileData && typeof profileData === "object") {
		const candidate = profileData as Record<string, unknown>;
		timezone = toTrimmedString(candidate.scheduler_timezone) || timezone;
		cutoffHour = clampInteger(
			candidate.scheduler_day_cutoff_hour,
			cutoffHour,
			0,
			23,
		);
	}

	const nowIso = fallbackNow.toISOString();
	let recommendationDay = fallbackRecommendationDay;
	let dayStartUtc = fallbackDayStart;
	let dayEndUtc = fallbackDayEnd;

	const { data: dayIdData } = await supabaseAdmin.rpc("collection_day_id", {
		now_utc: nowIso,
		tz: timezone,
		cutoff_hour: cutoffHour,
	});
	if (typeof dayIdData === "string" && dayIdData.trim().length > 0) {
		recommendationDay = dayIdData;
	}

	const { data: boundsData } = await supabaseAdmin.rpc(
		"collection_day_bounds",
		{
			now_utc: nowIso,
			tz: timezone,
			cutoff_hour: cutoffHour,
		},
	);
	const boundsRow = Array.isArray(boundsData) ? boundsData[0] : boundsData;
	if (boundsRow && typeof boundsRow === "object") {
		const candidate = boundsRow as Record<string, unknown>;
		const nextStart = toTrimmedString(candidate.day_start_utc);
		const nextEnd = toTrimmedString(candidate.day_end_utc);
		if (nextStart) {
			dayStartUtc = nextStart;
		}
		if (nextEnd) {
			dayEndUtc = nextEnd;
		}
	}

	const { data: activityData, error: activityError } = await supabaseAdmin
		.from("user_activity_log")
		.select("activity_type, metadata, created_at")
		.eq("user_id", userId)
		.gte("created_at", dayStartUtc)
		.lt("created_at", dayEndUtc)
		.in("activity_type", ["card_reviewed", "review_completed"])
		.order("created_at", { ascending: false });

	if (activityError || !Array.isArray(activityData)) {
		return fallbackContext;
	}

	let completedReviewsCount = 0;
	let hasCompletedReviews = false;
	for (const row of activityData) {
		if (!row || typeof row !== "object") {
			continue;
		}

		const activityType = toTrimmedString(
			(row as Record<string, unknown>).activity_type,
		).toLowerCase();
		const metadata =
			(row as Record<string, unknown>).metadata &&
			typeof (row as Record<string, unknown>).metadata === "object"
				? ((row as Record<string, unknown>).metadata as Record<string, unknown>)
				: null;
		const countValue = metadata?.count;
		if (typeof countValue === "number" && Number.isFinite(countValue)) {
			completedReviewsCount = Math.max(
				completedReviewsCount,
				Math.max(0, Math.floor(countValue)),
			);
		}
		if (activityType === "review_completed" || metadata?.completed === true) {
			hasCompletedReviews = true;
		}
	}

	return {
		recommendationDay,
		dayStartUtc,
		dayEndUtc,
		completedReviewsCount,
		hasCompletedReviews,
	};
};

const loadStoredDailyRecommendations = async (
	supabaseAdmin: ReturnType<typeof createServiceClient>,
	userId: string,
	recommendationDay: string,
): Promise<StoredDailyRecommendationsRow | null> => {
	const { data, error } = await supabaseAdmin
		.from("user_daily_immersion_recommendations")
		.select(
			"user_id, recommendation_day, known_words_count, completed_reviews_count, recommended_video_ids, payload, created_at, updated_at",
		)
		.eq("user_id", userId)
		.eq("recommendation_day", recommendationDay)
		.maybeSingle();

	if (error || !data) {
		return null;
	}

	return data as StoredDailyRecommendationsRow;
};

const loadRollingExcludedVideoIds = async (
	supabaseAdmin: ReturnType<typeof createServiceClient>,
	userId: string,
	recommendationDay: string,
	includeCurrentDay: boolean,
): Promise<Set<string>> => {
	const windowStartDay = subtractIsoDateDays(
		recommendationDay,
		ROLLING_RECOMMENDATION_HISTORY_DAYS,
	);
	const query = supabaseAdmin
		.from("user_daily_immersion_recommendations")
		.select("recommendation_day, recommended_video_ids")
		.eq("user_id", userId)
		.gte("recommendation_day", windowStartDay)
		.lte("recommendation_day", recommendationDay)
		.order("recommendation_day", { ascending: false });
	const { data, error } = await query;
	if (error || !Array.isArray(data)) {
		return new Set<string>();
	}

	const excludedIds = new Set<string>();
	for (const row of data) {
		if (!row || typeof row !== "object") {
			continue;
		}
		const day = toTrimmedString(
			(row as Record<string, unknown>).recommendation_day,
		);
		if (!includeCurrentDay && day === recommendationDay) {
			continue;
		}
		const ids = (row as Record<string, unknown>).recommended_video_ids;
		if (!Array.isArray(ids)) {
			continue;
		}
		for (const id of ids) {
			const normalizedId = toTrimmedString(id);
			if (normalizedId) {
				excludedIds.add(normalizedId);
			}
		}
	}

	return excludedIds;
};

const persistDailyRecommendations = async (
	supabaseAdmin: ReturnType<typeof createServiceClient>,
	userId: string,
	context: DailyRecommendationContext,
	knownWordsCount: number,
	payload: RecommendationPayload,
): Promise<void> => {
	await supabaseAdmin.from("user_daily_immersion_recommendations").upsert(
		{
			user_id: userId,
			recommendation_day: context.recommendationDay,
			known_words_count: knownWordsCount,
			completed_reviews_count: context.completedReviewsCount,
			recommended_video_ids: payload.recommendations.map(
				(recommendation) => recommendation.youtubeId,
			),
			payload,
		},
		{ onConflict: "user_id,recommendation_day" },
	);
};

const compactArabicQuery = (value: string): string => {
	const tokens = value
		.split(/\s+/)
		.map((token) => normalizeArabicToken(token))
		.filter(
			(token) =>
				token.length > 0 &&
				containsArabicCharacters(token) &&
				!QUERY_STOPWORDS.has(token),
		)
		.map((token) => token.replace(/^ال/u, ""))
		.filter((token) => token.length > 0);

	return Array.from(new Set(tokens)).slice(0, 4).join(" ").trim();
};

const buildCompactQueryList = (queries: string[]): string[] =>
	Array.from(
		new Set(
			queries
				.map((query) => compactArabicQuery(query))
				.filter((query) => query.length > 0),
		),
	);

const readRendererDescription = (value: Record<string, unknown>): string => {
	const descriptionSnippet =
		readTextValue(value.descriptionSnippet) ||
		readTextValue(value.detailedMetadataSnippets);
	if (descriptionSnippet) {
		return descriptionSnippet;
	}

	if (!Array.isArray(value.detailedMetadataSnippets)) {
		return "";
	}

	return value.detailedMetadataSnippets
		.map((item) => {
			if (!item || typeof item !== "object") {
				return "";
			}
			return readTextValue((item as Record<string, unknown>).snippetText);
		})
		.filter((item) => item.length > 0)
		.join(" ")
		.trim();
};

const mapWithConcurrency = async <TInput, TOutput>(
	items: TInput[],
	concurrency: number,
	mapper: (item: TInput) => Promise<TOutput>,
): Promise<TOutput[]> => {
	const results: TOutput[] = [];
	for (const chunk of chunkStrings(items, concurrency)) {
		const settledChunk = await Promise.all(chunk.map((item) => mapper(item)));
		results.push(...settledChunk);
	}
	return results;
};

const toBaseUrl = (rawValue: string): string | null => {
	try {
		const parsedUrl = new URL(rawValue);
		if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
			return null;
		}

		const normalizedPath = parsedUrl.pathname.replace(/\/+$/, "");
		return normalizedPath.length > 0
			? `${parsedUrl.origin}${normalizedPath}`
			: parsedUrl.origin;
	} catch {
		return null;
	}
};

const fetchWithTimeout = async (
	input: RequestInfo | URL,
	init: RequestInit,
	timeoutMs: number,
): Promise<Response> => {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		return await fetch(input, {
			...init,
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timeoutId);
	}
};

const isSubtitlePayload = (value: unknown): value is SubtitlePayload =>
	!!value &&
	typeof value === "object" &&
	Array.isArray((value as Record<string, unknown>).cues);

const toSubtitleKind = (value: unknown): "manual" | "automatic" | "unknown" => {
	const normalized = toTrimmedString(value);
	if (normalized === "manual" || normalized === "automatic") {
		return normalized;
	}
	return "unknown";
};

const fetchWorkerCaptionResult = async (
	workerBaseUrl: string,
	youtubeId: string,
	workerSecret: string,
): Promise<SubtitleWorkerResponse | null> => {
	let response: Response;
	try {
		response = await fetchWithTimeout(
			`${workerBaseUrl}/v1/subtitles`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-worker-secret": workerSecret,
				},
				body: JSON.stringify({
					youtubeId,
				}),
			},
			WORKER_REQUEST_TIMEOUT_MS,
		);
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			throw new Error("Subtitle worker timed out");
		}
		throw error;
	}

	if (response.status === 404) {
		return null;
	}

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`Subtitle worker returned ${response.status}: ${errorText.slice(0, 200)}`,
		);
	}

	const payload = (await response.json()) as Record<string, unknown>;
	if (!isSubtitlePayload(payload.payload)) {
		throw new Error("Subtitle worker response payload is invalid.");
	}

	return {
		title: toTrimmedString(payload.title),
		channelTitle: toTrimmedString(payload.channelTitle) || "YouTube",
		durationSeconds:
			typeof payload.durationSeconds === "number" &&
			Number.isFinite(payload.durationSeconds)
				? payload.durationSeconds
				: null,
		thumbnailUrl:
			payload.thumbnailUrl === null || typeof payload.thumbnailUrl === "string"
				? (payload.thumbnailUrl as string | null)
				: null,
		subtitleKind: toSubtitleKind(payload.subtitleKind),
		payload: payload.payload,
	};
};

const buildFallbackQueries = (seedWords: string[]): string[] => {
	const words = buildCompactQueryList(seedWords.slice(0, 6));
	const first = words[0] ?? "العربية";
	const second = words[1] ?? first;
	const third = words[2] ?? second;
	const fourth = words[3] ?? third;

	return buildCompactQueryList([
		[first, second].filter(Boolean).join(" "),
		[first, third].filter(Boolean).join(" "),
		[second, third].filter(Boolean).join(" "),
		["تعلم", first, second].filter(Boolean).join(" "),
		["قصة", first, second].filter(Boolean).join(" "),
		["حوار", second, fourth].filter(Boolean).join(" "),
	]);
};

const toPublicWarning = (warning: string): string | null => {
	if (warning.startsWith("OpenAI indisponible")) {
		return "La generation IA est indisponible pour le moment. Des requetes locales sont utilisees a la place.";
	}
	if (warning.startsWith("OpenAI quota epuise")) {
		return "Le quota de la cle GPT est epuise pour le moment. Des requetes locales sont utilisees a la place.";
	}

	if (warning.startsWith("yt-dlp worker failed")) {
		return "Certaines videos n'ont pas pu etre analysees automatiquement par le worker de sous-titres.";
	}

	if (warning.startsWith("yt-dlp worker found no Arabic subtitles")) {
		return "Certaines videos n'ont pas pu etre analysees automatiquement par le worker de sous-titres.";
	}

	if (warning.startsWith("Recherche indisponible")) {
		return "Certaines recherches YouTube n'ont pas abouti correctement.";
	}

	if (warning.startsWith("Fallback HTML YouTube utilise")) {
		return null;
	}

	if (warning.startsWith("Fallback HTML indisponible")) {
		return null;
	}

	if (warning.startsWith("Aucune video arabe courte")) {
		return "Aucune video arabe courte avec sous-titres exploitables n'a ete trouvee pour cette session.";
	}

	return warning.length > 220 ? `${warning.slice(0, 217).trim()}...` : warning;
};

const toPublicWarnings = (
	warnings: string[],
	options: {
		hasRecommendations: boolean;
		isLocked: boolean;
	},
): string[] => {
	if (options.isLocked) {
		return [];
	}

	const mappedWarnings = Array.from(
		new Set(
			warnings
				.map((warning) => toPublicWarning(warning)?.trim() ?? "")
				.filter((warning) => warning.length > 0),
		),
	);

	if (options.hasRecommendations) {
		return mappedWarnings
			.filter(
				(warning) =>
					warning.startsWith("Le quota de la cle GPT") ||
					warning.startsWith("La generation IA"),
			)
			.slice(0, 1);
	}

	return mappedWarnings.slice(0, SUMMARY_MAX_VISIBLE_WARNINGS);
};

const buildFallbackFrenchSummary = (
	recommendation: PreparedRecommendation,
): string => {
	const topicSource =
		recommendation.descriptionText?.trim() || recommendation.title.trim();
	const topic =
		topicSource.length > 120
			? `${topicSource.slice(0, 117).trim()}...`
			: topicSource;
	const comprehensionPart =
		typeof recommendation.comprehensionPercentage === "number"
			? `Avec environ ${recommendation.comprehensionPercentage}% de comprehension, `
			: "Avec ce contenu court, ";

	return `Cette video porte sur « ${topic.replace(/"/g, "'")} ». ${comprehensionPart}elle t'aide a progresser en immersion avec un sujet concret et du vocabulaire deja proche de ton niveau.`;
};

const clampFrenchSummary = (value: string): string => {
	const normalized = value.replace(/\s+/g, " ").trim();
	if (!normalized) {
		return "";
	}

	const parts = normalized
		.split(/(?<=[.!?])\s+/)
		.map((part) => part.trim())
		.filter((part) => part.length > 0);

	if (parts.length <= 2) {
		return normalized;
	}

	return parts.slice(0, 2).join(" ").trim();
};

const generateFrenchRecommendationSummaries = async (
	recommendations: PreparedRecommendation[],
): Promise<Map<string, string>> => {
	const fallbackSummaries = new Map(
		recommendations.map((recommendation) => [
			recommendation.id,
			clampFrenchSummary(buildFallbackFrenchSummary(recommendation)),
		]),
	);

	if (recommendations.length === 0) {
		return fallbackSummaries;
	}

	const openAiApiKey = resolveOpenAiApiKey();
	if (!openAiApiKey) {
		return fallbackSummaries;
	}

	const systemPrompt = [
		"En francais uniquement.",
		"Retourne un JSON valide uniquement.",
		'Schema: {"summaries":[{"id":"...","summaryFr":"..."}]}.',
		"Chaque summaryFr doit tenir en 1 ou 2 phrases courtes maximum.",
		"La premiere phrase explique le contexte ou le sujet de la video.",
		"La seconde phrase explique comment elle aide l'apprenant a progresser en immersion.",
		"Ecris un texte naturel, sans libelles du type 'Contexte:' ou 'Phrase 2:'.",
		"N'invente pas d'informations precises absentes des donnees.",
	].join(" ");

	const userPrompt = JSON.stringify({
		recommendations: recommendations.map((recommendation) => ({
			id: recommendation.id,
			title: recommendation.title,
			channelTitle: recommendation.channelTitle,
			descriptionText: recommendation.descriptionText,
			transcriptSnippet: recommendation.transcriptSnippet,
			query: recommendation.query,
			comprehensionPercentage: recommendation.comprehensionPercentage,
			durationLabel: recommendation.durationLabel,
		})),
	});

	try {
		const response = await fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${openAiApiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: OPENAI_MODEL,
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: userPrompt },
				],
				response_format: { type: "json_object" },
				reasoning_effort: "minimal",
				max_completion_tokens: 420,
			}),
		});

		if (!response.ok) {
			return fallbackSummaries;
		}

		const payload = (await response.json()) as Record<string, unknown>;
		const choices = Array.isArray(payload.choices) ? payload.choices : [];
		const firstChoice = choices[0];
		if (!firstChoice || typeof firstChoice !== "object") {
			return fallbackSummaries;
		}

		const message = (firstChoice as Record<string, unknown>).message;
		const content =
			message && typeof message === "object"
				? toTrimmedString((message as Record<string, unknown>).content)
				: "";
		if (!content) {
			return fallbackSummaries;
		}

		const parsed = JSON.parse(content) as Record<string, unknown>;
		const summaries = Array.isArray(parsed.summaries) ? parsed.summaries : [];
		for (const item of summaries) {
			if (!item || typeof item !== "object") {
				continue;
			}

			const summaryRecord = item as Record<string, unknown>;
			const id = toTrimmedString(summaryRecord.id);
			const summaryFr = clampFrenchSummary(
				toTrimmedString(summaryRecord.summaryFr),
			);
			if (id && summaryFr) {
				fallbackSummaries.set(id, summaryFr);
			}
		}
	} catch {
		return fallbackSummaries;
	}

	return fallbackSummaries;
};

const sanitizeQueryList = (value: unknown, seedWords: string[]): string[] => {
	const rawQueries = Array.isArray(value)
		? value
		: value &&
				typeof value === "object" &&
				Array.isArray((value as Record<string, unknown>).queries)
			? ((value as Record<string, unknown>).queries as unknown[])
			: [];

	const cleaned = Array.from(
		new Set(
			rawQueries
				.map((item) => toTrimmedString(item))
				.filter((item) => item.length > 0),
		),
	);

	const normalized = buildCompactQueryList([
		...buildFallbackQueries(seedWords),
		...cleaned,
	]);
	return normalized.slice(0, MAX_QUERY_COUNT);
};

const generateQueries = async (
	seedWords: string[],
	warnings: string[],
): Promise<QueryGenerationResult> => {
	const openAiApiKey = resolveOpenAiApiKey();
	if (!openAiApiKey) {
		warnings.push(
			"YOUTUBE_RECO_GPT_API absent: requetes generees via le fallback local.",
		);
		return {
			queries: sanitizeQueryList([], seedWords),
			model: FALLBACK_QUERY_MODEL,
		};
	}

	const systemPrompt = [
		"You generate compact Arabic YouTube search queries.",
		"Return valid JSON only.",
		'Schema: {"queries":[string,string,string,string]}',
		"Each query must be 2 to 4 Arabic words.",
		"Queries must be keyword-style, not sentences.",
		"Each query must include at least one seed word exactly as written.",
		"Do not use punctuation, Latin script, or motivational phrasing.",
		"Bad example: كتاب اليوم كيف يغير حياتك.",
		"Good example: كتاب مدرسة قصة.",
		"Queries must be natural for YouTube and suitable for short Arabic videos with subtitles.",
	].join(" ");

	const userPrompt = JSON.stringify({
		seedWords,
		instructions: [
			"Generate 4 distinct Arabic YouTube search queries.",
			"Each query must be 2 to 4 Arabic words only.",
			"Use concise keywords, not full sentences.",
			"Every query must contain at least one of the seed words verbatim.",
			"Prefer easy-to-understand spoken Arabic or MSA content.",
			"Prefer short explainers, stories, interviews, podcasts, or reportages.",
			"Do not include Latin script.",
		],
	});

	try {
		const response = await fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${openAiApiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: OPENAI_MODEL,
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: userPrompt },
				],
				response_format: { type: "json_object" },
				reasoning_effort: "minimal",
				max_completion_tokens: 320,
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			const quotaExceeded =
				errorText.includes("insufficient_quota") ||
				errorText.includes("You exceeded your current quota");
			warnings.push(
				quotaExceeded
					? `OpenAI quota epuise (${response.status}): fallback local utilise. ${errorText.slice(0, 180)}`
					: `OpenAI indisponible (${response.status}): fallback local utilise. ${errorText.slice(0, 180)}`,
			);
			return {
				queries: sanitizeQueryList([], seedWords),
				model: FALLBACK_QUERY_MODEL,
			};
		}

		const payload = (await response.json()) as Record<string, unknown>;
		const choices = Array.isArray(payload.choices) ? payload.choices : [];
		const firstChoice = choices[0];
		if (!firstChoice || typeof firstChoice !== "object") {
			warnings.push(
				"OpenAI a retourne une structure vide: fallback local utilise.",
			);
			return {
				queries: sanitizeQueryList([], seedWords),
				model: FALLBACK_QUERY_MODEL,
			};
		}

		const message = (firstChoice as Record<string, unknown>).message;
		const content =
			message && typeof message === "object"
				? toTrimmedString((message as Record<string, unknown>).content)
				: "";

		if (!content) {
			warnings.push(
				"OpenAI a retourne un contenu vide: fallback local utilise.",
			);
			return {
				queries: sanitizeQueryList([], seedWords),
				model: FALLBACK_QUERY_MODEL,
			};
		}

		try {
			const parsed = JSON.parse(content) as unknown;
			return {
				queries: sanitizeQueryList(parsed, seedWords),
				model: OPENAI_MODEL,
			};
		} catch {
			warnings.push(
				"OpenAI a retourne un JSON invalide: fallback local utilise.",
			);
			return {
				queries: sanitizeQueryList([], seedWords),
				model: FALLBACK_QUERY_MODEL,
			};
		}
	} catch (error) {
		warnings.push(
			`OpenAI indisponible: fallback local utilise. ${error instanceof Error ? error.message : String(error)}`,
		);
		return {
			queries: sanitizeQueryList([], seedWords),
			model: FALLBACK_QUERY_MODEL,
		};
	}
};

const fetchKnownVocabularyContext = async (
	supabaseAdmin: ReturnType<typeof createServiceClient>,
	userId: string | null,
	seedWords: string[],
	warnings: string[],
): Promise<KnownVocabularyContext> => {
	const knownKeys = new Set<string>();
	const knownNormalizedWords = new Set<string>();

	seedWords.forEach((word) => {
		const normalized = normalizeArabicToken(word);
		if (normalized) {
			knownNormalizedWords.add(normalized);
		}
	});

	try {
		const { data, error } = await supabaseAdmin
			.from("foundation_deck")
			.select("word_ar");
		if (error) {
			warnings.push(
				`Impossible de charger la base fondations: ${error.message}`,
			);
		} else {
			for (const row of data ?? []) {
				const normalized = normalizeArabicToken(
					toTrimmedString((row as Record<string, unknown>).word_ar),
				);
				if (normalized) {
					knownNormalizedWords.add(normalized);
				}
			}
		}
	} catch (error) {
		warnings.push(
			`Impossible de charger la base fondations: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	if (!userId) {
		return { knownKeys, knownNormalizedWords };
	}

	try {
		const vocabularyStateResult = await supabaseAdmin
			.from("user_card_state")
			.select("vocabulary_card_id")
			.eq("user_id", userId)
			.eq("status", "review")
			.not("vocabulary_card_id", "is", null);

		if (vocabularyStateResult.error) {
			warnings.push(
				`Impossible de charger les cartes connues de l'utilisateur: ${vocabularyStateResult.error.message}`,
			);
			return { knownKeys, knownNormalizedWords };
		}

		const vocabularyCardIds = Array.from(
			new Set(
				((vocabularyStateResult.data as Record<string, unknown>[] | null) ?? [])
					.map((row) => toTrimmedString(row.vocabulary_card_id))
					.filter((value) => value.length > 0),
			),
		);

		for (const idChunk of chunkStrings(vocabularyCardIds, 200)) {
			const { data, error } = await supabaseAdmin
				.from("vocabulary_cards")
				.select("lexicon_entry_id,word_ar")
				.in("id", idChunk);

			if (error) {
				warnings.push(
					`Impossible de charger les mots connus de l'utilisateur: ${error.message}`,
				);
				continue;
			}

			for (const row of (data as Record<string, unknown>[] | null) ?? []) {
				const key = getVideoComprehensionUnitKey({
					lexiconEntryId: row.lexicon_entry_id as
						| string
						| number
						| null
						| undefined,
					word: toTrimmedString(row.word_ar),
				});
				if (key) {
					knownKeys.add(key);
				}

				const normalized = normalizeArabicToken(toTrimmedString(row.word_ar));
				if (normalized) {
					knownNormalizedWords.add(normalized);
				}
			}
		}
	} catch (error) {
		warnings.push(
			`Impossible de charger le vocabulaire utilisateur: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	return { knownKeys, knownNormalizedWords };
};

const buildUnitsFromSubtitlePayload = (
	payload: SubtitlePayload | null,
	context: KnownVocabularyContext,
): VideoComprehensionUnit[] => {
	if (!payload?.cues) {
		return [];
	}

	const units: VideoComprehensionUnit[] = [];

	for (const cue of payload.cues) {
		const cueWords = Array.isArray(cue.words) ? cue.words : [];
		if (cueWords.length > 0) {
			for (const word of cueWords) {
				const rawWord = toTrimmedString(word.diacritized_text ?? word.text);
				const normalizedWord = normalizeArabicToken(rawWord);
				if (!normalizedWord) {
					continue;
				}
				const key = getVideoComprehensionUnitKey({
					lexiconEntryId: word.lexiconEntryId ?? word.lexicon_entry_id,
					word: rawWord,
					normalizedWord,
				});
				const isKnown =
					(key !== null && context.knownKeys.has(key)) ||
					context.knownNormalizedWords.has(normalizedWord);
				units.push({
					lexiconEntryId: word.lexiconEntryId ?? word.lexicon_entry_id,
					word: rawWord,
					normalizedWord,
					knownWeight: isKnown ? 1 : 0,
				});
			}
			continue;
		}

		const rawCueText = toTrimmedString(
			cue.diacritized_text ?? cue.text_ar ?? cue.text,
		);
		if (!rawCueText) {
			continue;
		}

		for (const token of rawCueText.split(/\s+/)) {
			const normalizedWord = normalizeArabicToken(token);
			if (!normalizedWord) {
				continue;
			}
			const key = getVideoComprehensionUnitKey({ word: token, normalizedWord });
			const isKnown =
				(key !== null && context.knownKeys.has(key)) ||
				context.knownNormalizedWords.has(normalizedWord);
			units.push({
				word: token,
				normalizedWord,
				knownWeight: isKnown ? 1 : 0,
			});
		}
	}

	return units;
};

const withinPreferredDurationRange = (
	durationSeconds: number | null,
): boolean => {
	if (
		typeof durationSeconds !== "number" ||
		!Number.isFinite(durationSeconds)
	) {
		return false;
	}
	return (
		durationSeconds >= MIN_DURATION_SECONDS &&
		durationSeconds <= MAX_DURATION_SECONDS
	);
};

const scoreSearchCandidate = (candidate: SearchCandidate): number => {
	const arabicBonus = containsArabicCharacters(candidate.title) ? 6 : 0;
	const durationBonus =
		typeof candidate.durationSeconds === "number" &&
		Number.isFinite(candidate.durationSeconds)
			? Math.max(0, MAX_DURATION_SECONDS - candidate.durationSeconds) / 60
			: 0;
	const queryBonus = Math.max(0, 5 - candidate.queryIndex);
	const rankPenalty = candidate.initialRank * 0.8;
	return arabicBonus + durationBonus + queryBonus - rankPenalty;
};

const mergeCandidates = (candidates: SearchCandidate[]): SearchCandidate[] => {
	const byYoutubeId = new Map<string, SearchCandidate>();

	for (const candidate of candidates) {
		if (!withinPreferredDurationRange(candidate.durationSeconds)) {
			continue;
		}

		const existing = byYoutubeId.get(candidate.youtubeId);
		if (
			!existing ||
			scoreSearchCandidate(candidate) > scoreSearchCandidate(existing)
		) {
			byYoutubeId.set(candidate.youtubeId, candidate);
		}
	}

	return Array.from(byYoutubeId.values())
		.sort(
			(left, right) => scoreSearchCandidate(right) - scoreSearchCandidate(left),
		)
		.slice(0, MAX_ANALYSIS_CANDIDATES);
};

const searchWithYoutubeDataApi = async (
	query: string,
	queryIndex: number,
	apiKey: string,
	regionCode: string,
): Promise<SearchCandidate[]> => {
	const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
	searchUrl.searchParams.set("part", "snippet");
	searchUrl.searchParams.set("type", "video");
	searchUrl.searchParams.set("q", query);
	searchUrl.searchParams.set("maxResults", String(SEARCH_RESULTS_PER_QUERY));
	searchUrl.searchParams.set("relevanceLanguage", "ar");
	searchUrl.searchParams.set("regionCode", regionCode);
	searchUrl.searchParams.set("videoCaption", "closedCaption");
	searchUrl.searchParams.set("key", apiKey);

	const searchResponse = await fetch(searchUrl, {
		headers: {
			Accept: "application/json",
		},
	});
	if (!searchResponse.ok) {
		throw new Error(`YouTube search API returned ${searchResponse.status}`);
	}

	const searchPayload = (await searchResponse.json()) as Record<
		string,
		unknown
	>;
	const searchItems = Array.isArray(searchPayload.items)
		? searchPayload.items
		: [];
	const ids = searchItems
		.map((item) => {
			if (!item || typeof item !== "object") {
				return "";
			}
			const id = (item as Record<string, unknown>).id;
			if (!id || typeof id !== "object") {
				return "";
			}
			return toTrimmedString((id as Record<string, unknown>).videoId);
		})
		.filter((value) => value.length > 0);

	if (ids.length === 0) {
		return [];
	}

	const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
	videosUrl.searchParams.set("part", "contentDetails,snippet");
	videosUrl.searchParams.set("id", ids.join(","));
	videosUrl.searchParams.set("key", apiKey);

	const videosResponse = await fetch(videosUrl, {
		headers: {
			Accept: "application/json",
		},
	});
	if (!videosResponse.ok) {
		throw new Error(`YouTube videos API returned ${videosResponse.status}`);
	}

	const videosPayload = (await videosResponse.json()) as Record<
		string,
		unknown
	>;
	const videoItems = Array.isArray(videosPayload.items)
		? videosPayload.items
		: [];
	const detailByYoutubeId = new Map<string, Record<string, unknown>>();
	for (const item of videoItems) {
		if (!item || typeof item !== "object") {
			continue;
		}
		const candidate = item as Record<string, unknown>;
		const youtubeId = toTrimmedString(candidate.id);
		if (youtubeId) {
			detailByYoutubeId.set(youtubeId, candidate);
		}
	}

	return ids.map((youtubeId, index) => {
		const detail = detailByYoutubeId.get(youtubeId) ?? {};
		const snippet =
			detail.snippet && typeof detail.snippet === "object"
				? (detail.snippet as Record<string, unknown>)
				: {};
		const thumbnails =
			snippet.thumbnails && typeof snippet.thumbnails === "object"
				? (snippet.thumbnails as Record<string, unknown>)
				: {};
		const thumbnailEntries = Object.values(thumbnails).filter(
			(entry): entry is Record<string, unknown> =>
				!!entry && typeof entry === "object",
		);
		const thumbnailUrl = thumbnailEntries.length
			? toTrimmedString(thumbnailEntries[thumbnailEntries.length - 1].url)
			: null;
		const contentDetails =
			detail.contentDetails && typeof detail.contentDetails === "object"
				? (detail.contentDetails as Record<string, unknown>)
				: {};
		const durationSeconds = parseIso8601DurationToSeconds(
			toTrimmedString(contentDetails.duration),
		);
		return {
			youtubeId,
			title: toTrimmedString(snippet.title),
			channelTitle: toTrimmedString(snippet.channelTitle) || "YouTube",
			descriptionText: toTrimmedString(snippet.description) || null,
			thumbnailUrl,
			durationSeconds,
			durationLabel: formatDurationLabel(durationSeconds),
			query,
			queryIndex,
			initialRank: index,
			discoverySource: "youtube-data-api" as const,
		};
	});
};

const searchWithYoutubeHtml = async (
	query: string,
	queryIndex: number,
): Promise<SearchCandidate[]> => {
	const searchUrl = new URL("https://www.youtube.com/results");
	searchUrl.searchParams.set("search_query", query);
	searchUrl.searchParams.set("hl", "ar");

	const response = await fetch(searchUrl, {
		headers: {
			"User-Agent": USER_AGENT,
			"Accept-Language": "ar,en;q=0.8",
		},
	});
	if (!response.ok) {
		throw new Error(`YouTube search page returned ${response.status}`);
	}

	const html = await response.text();
	const initialData = extractJsonFromHtml(html, [
		"var ytInitialData = ",
		"ytInitialData = ",
	]);
	if (!initialData) {
		return [];
	}

	const renderers = collectObjectsByKey(initialData, "videoRenderer");
	return renderers
		.map((renderer, index) => {
			const youtubeId = toTrimmedString(renderer.videoId);
			const title = readTextValue(renderer.title);
			const channelTitle =
				readTextValue(renderer.ownerText) ||
				readTextValue(renderer.longBylineText) ||
				"YouTube";
			const durationLabel = readTextValue(renderer.lengthText);
			const durationSeconds = parseDurationLabelToSeconds(durationLabel);
			const descriptionText = readRendererDescription(renderer) || null;
			const thumbnailRoot =
				renderer.thumbnail && typeof renderer.thumbnail === "object"
					? (renderer.thumbnail as Record<string, unknown>)
					: {};
			const thumbnails = Array.isArray(thumbnailRoot.thumbnails)
				? thumbnailRoot.thumbnails
				: [];
			const thumbnailUrl = thumbnails.length
				? toTrimmedString(
						(thumbnails[thumbnails.length - 1] as Record<string, unknown>).url,
					)
				: null;

			return {
				youtubeId,
				title,
				channelTitle,
				descriptionText,
				thumbnailUrl,
				durationSeconds,
				durationLabel: durationLabel || formatDurationLabel(durationSeconds),
				query,
				queryIndex,
				initialRank: index,
				discoverySource: "youtube-search-page" as const,
			};
		})
		.filter(
			(candidate) =>
				candidate.youtubeId.length > 0 && candidate.title.length > 0,
		)
		.slice(0, SEARCH_RESULTS_PER_QUERY);
};

const extractCaptionTracks = (
	playerResponse: Record<string, unknown>,
): SubtitleTrack[] => {
	const captions =
		playerResponse.captions && typeof playerResponse.captions === "object"
			? (playerResponse.captions as Record<string, unknown>)
			: null;
	if (!captions) {
		return [];
	}

	const trackListRenderer =
		captions.playerCaptionsTracklistRenderer &&
		typeof captions.playerCaptionsTracklistRenderer === "object"
			? (captions.playerCaptionsTracklistRenderer as Record<string, unknown>)
			: null;
	if (!trackListRenderer || !Array.isArray(trackListRenderer.captionTracks)) {
		return [];
	}

	return trackListRenderer.captionTracks
		.map((track) => {
			if (!track || typeof track !== "object") {
				return null;
			}

			const record = track as Record<string, unknown>;
			const baseUrl = toTrimmedString(record.baseUrl);
			const languageCode = toTrimmedString(record.languageCode);
			if (!baseUrl || !languageCode) {
				return null;
			}

			return {
				baseUrl,
				languageCode,
				label: readTextValue(record.name) || languageCode,
				kind: toTrimmedString(record.kind) === "asr" ? "automatic" : "manual",
			} satisfies SubtitleTrack;
		})
		.filter((track): track is SubtitleTrack => track !== null);
};

const selectArabicCaptionTrack = (
	tracks: SubtitleTrack[],
): SubtitleTrack | null => {
	const arabicTracks = tracks.filter((track) =>
		track.languageCode.toLowerCase().startsWith("ar"),
	);
	if (arabicTracks.length === 0) {
		return null;
	}

	const manualTrack = arabicTracks.find((track) => track.kind === "manual");
	return manualTrack ?? arabicTracks[0];
};

const buildSubtitlePayloadFromJson3 = (
	payload: Record<string, unknown>,
	youtubeId: string,
	subtitleKind: "manual" | "automatic",
): SubtitlePayload | null => {
	const events = Array.isArray(payload.events) ? payload.events : [];
	const cues = events
		.map((event, index) => {
			if (!event || typeof event !== "object") {
				return null;
			}

			const record = event as Record<string, unknown>;
			const segs = Array.isArray(record.segs) ? record.segs : [];
			const rawText = segs
				.map((segment) => {
					if (!segment || typeof segment !== "object") {
						return "";
					}
					return decodeHtmlEntities(
						toTrimmedString((segment as Record<string, unknown>).utf8),
					);
				})
				.join("")
				.replace(/\s+/g, " ")
				.trim();

			if (!rawText || !containsArabicCharacters(rawText)) {
				return null;
			}

			const startMs =
				typeof record.tStartMs === "number" && Number.isFinite(record.tStartMs)
					? record.tStartMs
					: 0;
			const durationMs =
				typeof record.dDurationMs === "number" &&
				Number.isFinite(record.dDurationMs)
					? record.dDurationMs
					: 0;

			return {
				id: index + 1,
				cue_id: index + 1,
				start: startMs / 1000,
				end: (startMs + durationMs) / 1000,
				text: rawText,
				text_ar: rawText,
			};
		})
		.filter((cue): cue is NonNullable<typeof cue> => cue !== null);

	if (cues.length === 0) {
		return null;
	}

	return {
		version: "1.0",
		generated_at: new Date().toISOString(),
		source: "youtube-caption-track",
		cues,
		meta: {
			youtubeId,
			subtitleKind,
			format: "json3",
		},
	};
};

const buildSubtitlePayloadFromXml = (
	xml: string,
	youtubeId: string,
	subtitleKind: "manual" | "automatic",
): SubtitlePayload | null => {
	const cues = Array.from(
		xml.matchAll(
			/<text[^>]*start="([^"]+)"[^>]*dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g,
		),
	)
		.map((match, index) => {
			const text = stripHtmlTags(decodeHtmlEntities(match[3] ?? ""));
			if (!text || !containsArabicCharacters(text)) {
				return null;
			}

			const start = Number.parseFloat(match[1] ?? "0");
			const duration = Number.parseFloat(match[2] ?? "0");
			return {
				id: index + 1,
				cue_id: index + 1,
				start,
				end: start + duration,
				text,
				text_ar: text,
			};
		})
		.filter((cue): cue is NonNullable<typeof cue> => cue !== null);

	if (cues.length === 0) {
		return null;
	}

	return {
		version: "1.0",
		generated_at: new Date().toISOString(),
		source: "youtube-caption-track",
		cues,
		meta: {
			youtubeId,
			subtitleKind,
			format: "xml",
		},
	};
};

const downloadCaptionPayload = async (
	track: SubtitleTrack,
	youtubeId: string,
): Promise<SubtitlePayload | null> => {
	const jsonUrl = new URL(track.baseUrl);
	jsonUrl.searchParams.set("fmt", "json3");

	const jsonResponse = await fetch(jsonUrl, {
		headers: {
			"User-Agent": USER_AGENT,
			"Accept-Language": "ar,en;q=0.8",
		},
	});
	if (jsonResponse.ok) {
		try {
			const payload = (await jsonResponse.json()) as Record<string, unknown>;
			const parsed = buildSubtitlePayloadFromJson3(
				payload,
				youtubeId,
				track.kind,
			);
			if (parsed) {
				return parsed;
			}
		} catch {
			// Fall back to XML timedtext when json3 parsing fails.
		}
	}

	const xmlResponse = await fetch(track.baseUrl, {
		headers: {
			"User-Agent": USER_AGENT,
			"Accept-Language": "ar,en;q=0.8",
		},
	});
	if (!xmlResponse.ok) {
		return null;
	}

	const xml = await xmlResponse.text();
	return buildSubtitlePayloadFromXml(xml, youtubeId, track.kind);
};

const extractTranscriptSnippet = (
	payload: SubtitlePayload | null,
): string | null => {
	if (!payload?.cues || payload.cues.length === 0) {
		return null;
	}

	const snippet = payload.cues
		.slice(0, 3)
		.map((cue) => toTrimmedString(cue.text_ar ?? cue.text))
		.filter((cue) => cue.length > 0)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();

	if (!snippet) {
		return null;
	}

	return snippet.length > 180 ? `${snippet.slice(0, 177).trim()}...` : snippet;
};

const fetchWatchPageCaptionResult = async (
	youtubeId: string,
): Promise<WatchPageCaptionResult | null> => {
	const response = await fetch(buildVideoUrl(youtubeId), {
		headers: {
			"User-Agent": USER_AGENT,
			"Accept-Language": "ar,en;q=0.8",
		},
	});
	if (!response.ok) {
		return null;
	}

	const html = await response.text();
	const playerResponse = extractJsonFromHtml(html, [
		"var ytInitialPlayerResponse = ",
		"ytInitialPlayerResponse = ",
	]);
	if (!playerResponse) {
		return null;
	}

	const videoDetails =
		playerResponse.videoDetails &&
		typeof playerResponse.videoDetails === "object"
			? (playerResponse.videoDetails as Record<string, unknown>)
			: {};
	const thumbnailRoot =
		videoDetails.thumbnail && typeof videoDetails.thumbnail === "object"
			? (videoDetails.thumbnail as Record<string, unknown>)
			: {};
	const thumbnails = Array.isArray(thumbnailRoot.thumbnails)
		? thumbnailRoot.thumbnails
		: [];
	const thumbnailUrl = thumbnails.length
		? toTrimmedString(
				(thumbnails[thumbnails.length - 1] as Record<string, unknown>).url,
			)
		: null;
	const tracks = extractCaptionTracks(playerResponse);
	const track = selectArabicCaptionTrack(tracks);
	if (!track) {
		return {
			title: toTrimmedString(videoDetails.title),
			channelTitle: toTrimmedString(videoDetails.author) || "YouTube",
			durationSeconds:
				Number.parseInt(
					toTrimmedString(videoDetails.lengthSeconds) || "0",
					10,
				) || null,
			thumbnailUrl,
			subtitleKind: "unknown",
			payload: null,
		};
	}

	const payload = await downloadCaptionPayload(track, youtubeId);
	return {
		title: toTrimmedString(videoDetails.title),
		channelTitle: toTrimmedString(videoDetails.author) || "YouTube",
		durationSeconds:
			Number.parseInt(toTrimmedString(videoDetails.lengthSeconds) || "0", 10) ||
			null,
		thumbnailUrl,
		subtitleKind: track.kind,
		payload,
	};
};

const fetchCaptionResult = async (
	youtubeId: string,
	workerBaseUrl: string | null,
	workerSecret: string | null,
	warnings: string[],
	subtitleStrategyState: { usedFallback: boolean },
): Promise<WatchPageCaptionResult | null> => {
	if (workerBaseUrl && workerSecret) {
		try {
			const workerResult = await fetchWorkerCaptionResult(
				workerBaseUrl,
				youtubeId,
				workerSecret,
			);
			if (workerResult?.payload) {
				return workerResult;
			}

			warnings.push(
				`yt-dlp worker found no Arabic subtitles for ${youtubeId}; watch-page fallback used.`,
			);
			return null;
		} catch (error) {
			warnings.push(
				`yt-dlp worker failed for ${youtubeId}: ${error instanceof Error ? error.message : String(error)}`,
			);
			return null;
		}
	}

	return fetchWatchPageCaptionResult(youtubeId);
};

const buildRecommendation = async (
	candidate: SearchCandidate,
	context: KnownVocabularyContext,
	workerBaseUrl: string | null,
	workerSecret: string | null,
	warnings: string[],
	subtitleStrategyState: { usedFallback: boolean },
): Promise<PreparedRecommendation | null> => {
	const watchPageResult = await fetchCaptionResult(
		candidate.youtubeId,
		workerBaseUrl,
		workerSecret,
		warnings,
		subtitleStrategyState,
	);
	if (!watchPageResult?.payload) {
		return null;
	}

	const units = buildUnitsFromSubtitlePayload(watchPageResult.payload, context);
	const comprehensionPercentage = computeVideoComprehensionPercentage(units);
	const durationSeconds =
		watchPageResult.durationSeconds ?? candidate.durationSeconds ?? null;

	return {
		id: candidate.youtubeId,
		youtubeId: candidate.youtubeId,
		title: watchPageResult.title || candidate.title,
		channelTitle: watchPageResult.channelTitle || candidate.channelTitle,
		videoUrl: buildVideoUrl(candidate.youtubeId),
		thumbnailUrl: watchPageResult.thumbnailUrl ?? candidate.thumbnailUrl,
		durationSeconds,
		durationLabel: formatDurationLabel(durationSeconds),
		comprehensionPercentage,
		subtitleKind: watchPageResult.subtitleKind,
		transcriptSnippet: extractTranscriptSnippet(watchPageResult.payload),
		summaryFr: null,
		query: candidate.query,
		descriptionText: candidate.descriptionText,
	};
};

const sortRecommendations = (
	recommendations: PreparedRecommendation[],
): PreparedRecommendation[] =>
	[...recommendations].sort((left, right) => {
		const leftScore = left.comprehensionPercentage ?? -1;
		const rightScore = right.comprehensionPercentage ?? -1;
		if (rightScore !== leftScore) {
			return rightScore - leftScore;
		}

		const leftDuration = left.durationSeconds ?? Number.MAX_SAFE_INTEGER;
		const rightDuration = right.durationSeconds ?? Number.MAX_SAFE_INTEGER;
		if (leftDuration !== rightDuration) {
			return leftDuration - rightDuration;
		}

		return left.title.localeCompare(right.title, "ar");
	});

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") {
		return optionsResponse(req, CORS_OPTIONS);
	}

	if (req.method !== "POST") {
		return jsonResponse(req, 405, { error: "Methode non autorisee." });
	}

	const requestOrigin = req.headers.get("origin");
	if (requestOrigin && !isAllowedOrigin(requestOrigin)) {
		return jsonResponse(req, 403, {
			error: "Origin non autorisee.",
			code: "ORIGIN_NOT_ALLOWED",
		});
	}

	try {
		const rawPayload = (await req.json()) as RequestPayload;
		const requestedSeedWords = normalizeSeedWords(rawPayload.seedWords);
		const requestedKnownWordsCount = normalizeKnownWordsCount(
			rawPayload.knownWordsCount,
		);
		const forceRefresh = normalizeForceRefresh(rawPayload.forceRefresh);
		const maxResults = clampInteger(
			rawPayload.maxResults,
			DEFAULT_MAX_RESULTS,
			1,
			MAX_MAX_RESULTS,
		);

		const supabaseAdmin = createServiceClient();
		const rateLimit = await enforceRateLimit(supabaseAdmin, req, {
			bucket: "preview-youtube-recommendations",
			maxRequests: RATE_LIMIT_MAX_REQUESTS,
			windowMs: RATE_LIMIT_WINDOW_MS,
		});
		if (!rateLimit.allowed) {
			return jsonResponse(req, 429, {
				error:
					rateLimit.reason ??
					"Trop de recommandations YouTube lancees. Reessaie plus tard.",
				code: "RATE_LIMIT_EXCEEDED",
			});
		}

		const auth = await resolveRequestAuth(req, supabaseAdmin);
		let adminForceRefresh = false;
		if (forceRefresh) {
			const adminAccess = await requireAdminAccessForAuth(auth, supabaseAdmin);
			if (!adminAccess.ok) {
				return jsonResponse(req, adminAccess.failure.status, {
					error: adminAccess.failure.error,
					code: adminAccess.failure.code,
				});
			}
			adminForceRefresh = true;
		}

		const warnings: string[] = [];
		const dailyRecommendationContext = auth.user
			? await resolveRecommendationDayContext(supabaseAdmin, auth.user.id)
			: null;
		const storedRecommendationsRow =
			auth.user && dailyRecommendationContext
				? await loadStoredDailyRecommendations(
						supabaseAdmin,
						auth.user.id,
						dailyRecommendationContext.recommendationDay,
					)
				: null;
		const storedPayload = storedRecommendationsRow
			? normalizeStoredRecommendationPayload(storedRecommendationsRow.payload)
			: null;
		if (storedPayload && !adminForceRefresh) {
			return new Response(
				JSON.stringify(
					withRecommendationDayContext(
						storedPayload,
						dailyRecommendationContext,
					),
				),
				{
					status: 200,
					headers: {
						...buildCorsHeaders(req, CORS_OPTIONS),
						"Content-Type": "application/json",
					},
				},
			);
		}

		const seedWords =
			requestedSeedWords.length > 0
				? requestedSeedWords
				: (storedPayload?.seedWords ?? []);
		const knownWordsCount =
			requestedKnownWordsCount ??
			storedPayload?.knownWordsCount ??
			seedWords.length;

		if (seedWords.length === 0) {
			return jsonResponse(req, 400, {
				error: "La liste de mots appris est requise.",
				code: "SEED_WORDS_REQUIRED",
			});
		}

		if (
			knownWordsCount < MINIMUM_WORDS_TO_SHOW_RECOMMENDATION_HINT &&
			!adminForceRefresh
		) {
			const lockedPayload = createLockedRecommendationsPayload(
				seedWords,
				knownWordsCount,
				maxResults,
				"Continue tes revues et atteins au moins 40 mots connus pour debloquer des recommandations video basees sur le vocabulaire que tu connais deja.",
				{
					recommendationDay:
						dailyRecommendationContext?.recommendationDay ?? null,
					dayEndsAt: dailyRecommendationContext?.dayEndUtc ?? null,
				},
			);
			return new Response(JSON.stringify(lockedPayload), {
				status: 200,
				headers: {
					...buildCorsHeaders(req, CORS_OPTIONS),
					"Content-Type": "application/json",
				},
			});
		}

		if (
			auth.user &&
			dailyRecommendationContext &&
			!dailyRecommendationContext.hasCompletedReviews &&
			!adminForceRefresh
		) {
			const lockedPayload = createLockedRecommendationsPayload(
				seedWords,
				knownWordsCount,
				maxResults,
				"Termine tes revues du jour pour debloquer tes 3 suggestions d'immersion aujourd'hui.",
				{
					recommendationDay:
						dailyRecommendationContext?.recommendationDay ?? null,
					dayEndsAt: dailyRecommendationContext?.dayEndUtc ?? null,
				},
			);
			return new Response(JSON.stringify(lockedPayload), {
				status: 200,
				headers: {
					...buildCorsHeaders(req, CORS_OPTIONS),
					"Content-Type": "application/json",
				},
			});
		}

		const knownVocabularyContext = await fetchKnownVocabularyContext(
			supabaseAdmin,
			auth.user?.id ?? null,
			seedWords,
			warnings,
		);

		const { queries, model: queryGenerationModel } = await generateQueries(
			seedWords,
			warnings,
		);
		const rawWorkerBaseUrl =
			toTrimmedString(Deno.env.get("YOUTUBE_SUBTITLES_WORKER_URL")) ||
			toTrimmedString(Deno.env.get("YTDLP_WORKER_URL"));
		const rawWorkerSecret =
			toTrimmedString(Deno.env.get("YOUTUBE_SUBTITLES_WORKER_SECRET")) ||
			toTrimmedString(Deno.env.get("YTDLP_WORKER_SECRET"));
		const configuredWorkerBaseUrl = rawWorkerBaseUrl
			? toBaseUrl(rawWorkerBaseUrl)
			: null;
		if (rawWorkerBaseUrl && !configuredWorkerBaseUrl) {
			warnings.push(
				"YOUTUBE_SUBTITLES_WORKER_URL is invalid; watch-page subtitle extraction remains active.",
			);
		}
		if (configuredWorkerBaseUrl && !rawWorkerSecret) {
			warnings.push(
				"YOUTUBE_SUBTITLES_WORKER_SECRET absent; yt-dlp worker disabled and watch-page fallback remains active.",
			);
		}
		const workerBaseUrl =
			configuredWorkerBaseUrl && rawWorkerSecret
				? configuredWorkerBaseUrl
				: null;
		const workerSecret = workerBaseUrl ? rawWorkerSecret : null;
		const youtubeApiKey =
			toTrimmedString(Deno.env.get("YOUTUBE_API_KEY")) ||
			toTrimmedString(Deno.env.get("YOUTUBE_DATA_API_KEY"));
		const regionCode =
			toTrimmedString(Deno.env.get("YOUTUBE_REGION_CODE")) ||
			DEFAULT_REGION_CODE;

		let discoverySource: "youtube-data-api" | "youtube-search-page" =
			youtubeApiKey.length > 0 ? "youtube-data-api" : "youtube-search-page";
		if (!youtubeApiKey) {
			warnings.push(
				"YOUTUBE_API_KEY absent: utilisation du fallback de recherche HTML YouTube.",
			);
		}

		const discoveredCandidates: SearchCandidate[] = [];
		for (const [queryIndex, query] of queries.entries()) {
			try {
				const results = youtubeApiKey
					? await searchWithYoutubeDataApi(
							query,
							queryIndex,
							youtubeApiKey,
							regionCode,
						)
					: await searchWithYoutubeHtml(query, queryIndex);
				discoveredCandidates.push(...results);
			} catch (error) {
				warnings.push(
					`Recherche indisponible pour "${query}": ${error instanceof Error ? error.message : String(error)}`,
				);
				if (youtubeApiKey) {
					try {
						const fallbackResults = await searchWithYoutubeHtml(
							query,
							queryIndex,
						);
						discoveredCandidates.push(...fallbackResults);
						discoverySource = "youtube-search-page";
						warnings.push(
							`Fallback HTML YouTube utilise pour "${query}" apres echec API.`,
						);
					} catch (fallbackError) {
						warnings.push(
							`Fallback HTML indisponible pour "${query}": ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
						);
					}
				}
			}
		}

		const excludedVideoIds =
			auth.user && dailyRecommendationContext
				? await loadRollingExcludedVideoIds(
						supabaseAdmin,
						auth.user.id,
						dailyRecommendationContext.recommendationDay,
						adminForceRefresh && storedRecommendationsRow !== null,
					)
				: new Set<string>();
		const filteredCandidates = discoveredCandidates.filter(
			(candidate) => !excludedVideoIds.has(candidate.youtubeId),
		);

		const rankedCandidates = mergeCandidates(filteredCandidates).slice(
			0,
			MAX_ANALYSIS_CANDIDATES,
		);
		const subtitleStrategyState = { usedFallback: false };
		const minimumComprehensionPercentage =
			knownWordsCount > ESTABLISHED_USER_WORDS_THRESHOLD
				? ESTABLISHED_MIN_COMPREHENSION_PERCENTAGE
				: null;
		const successfulRecommendations: PreparedRecommendation[] = [];
		for (const chunk of chunkStrings(rankedCandidates, ANALYSIS_CONCURRENCY)) {
			const settledChunk = await Promise.all(
				chunk.map((candidate) =>
					buildRecommendation(
						candidate,
						knownVocabularyContext,
						workerBaseUrl,
						workerSecret,
						warnings,
						subtitleStrategyState,
					).catch((error) => {
						warnings.push(
							`Subtitle analysis failed for ${candidate.youtubeId}: ${error instanceof Error ? error.message : String(error)}`,
						);
						return null;
					}),
				),
			);

			successfulRecommendations.push(
				...settledChunk.filter(
					(recommendation): recommendation is PreparedRecommendation =>
						recommendation !== null,
				),
			);

			const qualifyingRecommendations =
				typeof minimumComprehensionPercentage === "number"
					? successfulRecommendations.filter(
							(recommendation) =>
								(recommendation.comprehensionPercentage ?? -1) >=
								minimumComprehensionPercentage,
						)
					: successfulRecommendations;

			if (qualifyingRecommendations.length >= maxResults) {
				break;
			}
		}

		const filteredRecommendations =
			typeof minimumComprehensionPercentage === "number"
				? successfulRecommendations.filter(
						(recommendation) =>
							(recommendation.comprehensionPercentage ?? -1) >=
							minimumComprehensionPercentage,
					)
				: successfulRecommendations;
		const selectedRecommendations = sortRecommendations(
			filteredRecommendations,
		).slice(0, maxResults);
		const summaryMap = await generateFrenchRecommendationSummaries(
			selectedRecommendations,
		);
		const recommendations: Recommendation[] = selectedRecommendations.map(
			(recommendation) => ({
				id: recommendation.id,
				youtubeId: recommendation.youtubeId,
				title: recommendation.title,
				channelTitle: recommendation.channelTitle,
				videoUrl: recommendation.videoUrl,
				thumbnailUrl: recommendation.thumbnailUrl,
				durationSeconds: recommendation.durationSeconds,
				durationLabel: recommendation.durationLabel,
				comprehensionPercentage: recommendation.comprehensionPercentage,
				subtitleKind: recommendation.subtitleKind,
				transcriptSnippet: recommendation.transcriptSnippet,
				summaryFr:
					summaryMap.get(recommendation.id) ?? recommendation.summaryFr,
				query: recommendation.query,
			}),
		);

		const subtitleStrategy: SubtitleStrategy = workerBaseUrl
			? subtitleStrategyState.usedFallback
				? "yt-dlp-worker+watch-page-fallback"
				: "yt-dlp-worker"
			: "youtube-caption-track";

		if (recommendations.length === 0) {
			warnings.push(
				"Aucune video arabe courte avec sous-titres exploitables n'a ete trouvee pour cette session.",
			);
		}

		const responseWarnings = toPublicWarnings(warnings, {
			hasRecommendations: recommendations.length > 0,
			isLocked: false,
		});
		const responsePayload: RecommendationPayload = {
			generatedAt: new Date().toISOString(),
			recommendationDay: dailyRecommendationContext?.recommendationDay ?? null,
			dayEndsAt: dailyRecommendationContext?.dayEndUtc ?? null,
			seedWords,
			knownWordsCount,
			recommendationLimit: maxResults,
			minimumWordsRequired: MINIMUM_WORDS_TO_UNLOCK_RECOMMENDATIONS,
			isLocked: false,
			lockMessage: null,
			queries,
			warnings: responseWarnings,
			strategy: {
				discovery: discoverySource,
				subtitles: subtitleStrategy,
				model: queryGenerationModel,
			},
			recommendations,
		};
		const shouldPreserveStoredRecommendations =
			adminForceRefresh &&
			recommendations.length === 0 &&
			(storedPayload?.recommendations.length ?? 0) > 0;

		if (shouldPreserveStoredRecommendations && storedPayload) {
			const preservedWarnings = Array.from(
				new Set([
					...storedPayload.warnings,
					...responseWarnings,
					"Aucune nouvelle suggestion exploitable n'a ete trouvee. Les suggestions precedentes sont conservees.",
				]),
			);
			const preservedPayload: RecommendationPayload = {
				...withRecommendationDayContext(
					storedPayload,
					dailyRecommendationContext,
				),
				warnings: preservedWarnings.slice(0, SUMMARY_MAX_VISIBLE_WARNINGS),
			};

			return new Response(JSON.stringify(preservedPayload), {
				status: 200,
				headers: {
					...buildCorsHeaders(req, CORS_OPTIONS),
					"Content-Type": "application/json",
				},
			});
		}

		if (auth.user && dailyRecommendationContext) {
			await persistDailyRecommendations(
				supabaseAdmin,
				auth.user.id,
				dailyRecommendationContext,
				knownWordsCount,
				responsePayload,
			);
		}

		return new Response(JSON.stringify(responsePayload), {
			status: 200,
			headers: {
				...buildCorsHeaders(req, CORS_OPTIONS),
				"Content-Type": "application/json",
			},
		});
	} catch (error) {
		const message =
			error instanceof Error && error.message.trim().length > 0
				? error.message
				: "Erreur inattendue lors de la recommandation YouTube.";
		console.error("[preview-youtube-recommendations]", message);
		return jsonResponse(req, 500, {
			error: message,
			code: "PREVIEW_YOUTUBE_RECOMMENDATIONS_FAILED",
		});
	}
});
