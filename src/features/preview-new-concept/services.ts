import type { ReviewFilter } from "@/components/deck-perso-visual/ReviewFilterDropdown";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables, TablesUpdate } from "@/integrations/supabase/types";
import type { ReviewType, VocabCard } from "@/lib/deck-perso-adapters";
import { normalizeAppNavigationTarget } from "@/lib/appPathNormalizer";
import { resolveWordsMilestoneMeta } from "@/lib/wordsMilestones";
import {
	type IncomingFriendRequest,
	type FriendListItem,
	type FriendRequestAction,
	type OutgoingFriendRequest,
	listIncomingFriendRequests,
	listOutgoingFriendRequests,
	listMyFriends,
	respondToFriendRequest,
	sendFriendRequestByUsername,
} from "@/services/friendsService";
import { getProfileProgressionSummary } from "@/services/profilePageService";
import { GUEST_NOTIFICATION_FEED } from "./data";
import {
	buildPreviewProfilePath,
	formatPreviewCompletionStatus,
	formatPreviewNotificationTime,
	getFriendAvatarSeed,
	getFriendInitials,
	getFriendPrimaryName,
} from "./helpers";
import type {
	FeedItem,
	FeedItemNotifType,
	NotificationFeedCategory,
	PreviewMetricSlide,
	PreviewStreakFriendRow,
	PreviewStreakReminderStatus,
	PreviewYoutubeRecommendation,
	PreviewYoutubeRecommendationsResult,
	ReviewDueNotificationSlot,
} from "./types";

type PreviewNotificationRow = Pick<
	Tables<"user_notifications">,
	| "id"
	| "category"
	| "notification_type"
	| "title"
	| "body"
	| "payload_json"
	| "read_at"
	| "dismissed_at"
	| "archived_at"
	| "created_at"
>;
type PreviewNotificationUpdate = TablesUpdate<"user_notifications">;

type NotificationErrorLike = {
	code?: string | null;
	details?: string | null;
	message?: string | null;
};

type PreviewReminderRpcErrorLike = {
	code?: string | null;
	details?: string | null;
	hint?: string | null;
	message?: string | null;
};

type PreviewReadyMetricsQueryBuilder = {
	select: (columns: string) => PreviewReadyMetricsQueryBuilder;
	eq: (column: string, value: string) => PreviewReadyMetricsQueryBuilder;
	in: (column: string, values: string[]) => PreviewReadyMetricsQueryBuilder;
	gte: (column: string, value: string) => PreviewReadyMetricsQueryBuilder;
	lt: (column: string, value: string) => PreviewReadyMetricsQueryBuilder;
	lte: (column: string, value: string) => PreviewReadyMetricsQueryBuilder;
	order: (
		column: string,
		options?: { ascending?: boolean },
	) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type PreviewReadyMetricsClient = {
	from: (table: string) => PreviewReadyMetricsQueryBuilder;
};

type PreviewReminderRpcClient = {
	rpc: (
		functionName: string,
		args?: Record<string, unknown>,
	) => Promise<{ data: unknown; error: PreviewReminderRpcErrorLike | null }>;
};

type PreviewDailyActivityRow = {
	userId: string;
	activityDate: string;
	reviewsCount: number;
};

type PreviewActivityLogRow = {
	userId: string;
	createdAt: string;
	activityType: string;
	completed: boolean;
};

type PreviewStreakReminderStatusRow = PreviewStreakReminderStatus & {
	recipientUserId: string;
};

export type PreviewReadyMetricsSnapshot = {
	acquiredWords: number;
	wordsTarget: number;
	validatedTodayCount: number;
	validatedTodayTarget: number;
	validatedTodayProgressPct: number;
	personalStreakDays: number;
	streakFriends: PreviewStreakFriendRow[];
};

export type LoadPreviewReadyMetricsSnapshotOptions = {
	userId: string | null;
	acquiredWords: number;
	wordsTarget?: number;
	referenceDate?: Date;
};

export type PreviewNotificationPayload = {
	actionUrl?: string;
	actionLabel?: string;
	actorDisplayName?: string;
	actorAvatarUrl?: string | null;
	targetUserId?: string;
	targetUsername?: string;
	requesterUserId?: string;
	recipientUserId?: string;
	senderUserId?: string;
	dueCount?: number;
	entityId?: string;
	entityType?: string;
	highlight?: string;
	localDate?: string;
	slot?: ReviewDueNotificationSlot;
};

const PREVIEW_NOTIFICATION_LIMIT = 50;
const PREVIEW_CONNECTIONS_PATH = "/app/contacts";
const SIDEBAR_PROFILE_ROOT_PATH = "/app-legacy/profil";
const SIDEBAR_PROFILE_PATH_PATTERN = /^\/app-legacy\/profil\/([^/?#]+)/i;
const PREVIEW_SHARED_STREAK_MAX_DAYS = 366;
const PREVIEW_NUMBER_FORMATTER = new Intl.NumberFormat("fr-FR");
const PREVIEW_STREAK_FRIEND_VISIBLE_COUNT = 2;
const PREVIEW_YOUTUBE_RECOMMENDATIONS_CACHE_KEY_PREFIX =
	"preview-youtube-recommendations:v1";
const NOTIFICATION_CATEGORY_VALUES: NotificationFeedCategory[] = [
	"for-me",
	"friends",
	"correct",
];

const NOTIFICATION_TYPE_TO_FEED_NOTIF_TYPE = {
	friend_request_received: "friend-request",
	friend_request_accepted: "friend-accepted",
	friend_streak_nudge: "streak-reminder",
	review_due_reminder: "review-reminder",
} as const satisfies Record<string, FeedItemNotifType>;

export const PREVIEW_REVIEW_FILTER_DEFINITIONS = [
	{ id: 1, label: "Fondations 2000", reviewType: "foundation" },
	{ id: 2, label: "Cartes collectées", reviewType: "collected" },
	{ id: 3, label: "Cartes de mon Prof", reviewType: "sent" },
] as const satisfies ReadonlyArray<{
	id: number;
	label: string;
	reviewType: ReviewType;
}>;

export async function loadPreviewConnections() {
	return listMyFriends();
}

export async function loadPreviewConnectionRequests(): Promise<{
	incomingRequests: IncomingFriendRequest[];
	outgoingRequests: OutgoingFriendRequest[];
}> {
	const [incomingRequests, outgoingRequests] = await Promise.all([
		listIncomingFriendRequests(),
		listOutgoingFriendRequests(),
	]);

	return {
		incomingRequests,
		outgoingRequests,
	};
}

export async function sendPreviewConnectionRequest(usernameInput: string) {
	return sendFriendRequestByUsername(usernameInput);
}

export async function respondToPreviewConnectionRequest(
	requestId: string,
	action: FriendRequestAction,
) {
	return respondToFriendRequest(requestId, action);
}

const getPreviewReadyMetricsClient = (): PreviewReadyMetricsClient =>
	supabase as unknown as PreviewReadyMetricsClient;

const getPreviewReminderRpcClient = (): PreviewReminderRpcClient =>
	supabase as unknown as PreviewReminderRpcClient;

const clampProgressPct = (value: number): number =>
	Math.max(0, Math.min(100, Number(value.toFixed(1))));

const normalizeMetricCount = (value: number): number =>
	Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

const DEFAULT_PREVIEW_STREAK_REMINDER_STATUS: PreviewStreakReminderStatus = {
	canSend: true,
	cooldownEndsAt: null,
	secondsRemaining: 0,
	sent: false,
	reason: "ready",
};

const PREVIEW_STREAK_REMINDER_BACKEND_UNAVAILABLE_STATUS: PreviewStreakReminderStatus =
	{
		canSend: false,
		cooldownEndsAt: null,
		secondsRemaining: 0,
		sent: false,
		reason: "backend_unavailable",
	};

const PREVIEW_STREAK_REMINDER_BACKEND_UNAVAILABLE_MESSAGE =
	"Le rappel de flamme active est temporairement indisponible. Réessaie dans quelques instants.";

const PREVIEW_STREAK_REMINDER_AUTH_REQUIRED_STATUS: PreviewStreakReminderStatus =
	{
		canSend: false,
		cooldownEndsAt: null,
		secondsRemaining: 0,
		sent: false,
		reason: "auth_required",
	};

const formatMetricCount = (value: number): string =>
	PREVIEW_NUMBER_FORMATTER.format(normalizeMetricCount(value));

const toIsoDateKeyUtc = (value: Date): string =>
	value.toISOString().slice(0, 10);

const fromIsoDateKeyUtc = (value: string): Date => {
	const [year, month, day] = value.split("-").map(Number);
	return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
};

const resolveWordProgressPct = (
	acquiredWords: number,
	wordsTarget: number,
): number => {
	if (wordsTarget <= 0) {
		return 0;
	}

	return clampProgressPct(
		(normalizeMetricCount(acquiredWords) / wordsTarget) * 100,
	);
};

const createEmptyPreviewReadyMetricsSnapshot = (
	acquiredWords: number,
	wordsTarget: number,
): PreviewReadyMetricsSnapshot => ({
	acquiredWords: normalizeMetricCount(acquiredWords),
	wordsTarget,
	validatedTodayCount: 0,
	validatedTodayTarget: 0,
	validatedTodayProgressPct: 0,
	personalStreakDays: 0,
	streakFriends: [],
});

const findReviewDailyObjective = (
	objectives: Array<{
		id: string;
		current: number;
		target: number;
		progress: number;
	}>,
) => objectives.find((objective) => objective.id === "review-daily");

const parsePreviewDailyActivityRows = (
	data: unknown,
): PreviewDailyActivityRow[] => {
	if (!Array.isArray(data)) {
		return [];
	}

	return data.flatMap((row) => {
		if (!row || typeof row !== "object") {
			return [];
		}

		const source = row as {
			user_id?: unknown;
			activity_date?: unknown;
			reviews_count?: unknown;
		};

		if (
			typeof source.user_id !== "string" ||
			typeof source.activity_date !== "string"
		) {
			return [];
		}

		return [
			{
				userId: source.user_id,
				activityDate: source.activity_date,
				reviewsCount:
					typeof source.reviews_count === "number" &&
					Number.isFinite(source.reviews_count)
						? Math.max(0, Math.floor(source.reviews_count))
						: 0,
			},
		];
	});
};

const parsePreviewActivityLogRows = (
	data: unknown,
): PreviewActivityLogRow[] => {
	if (!Array.isArray(data)) {
		return [];
	}

	return data.flatMap((row) => {
		if (!row || typeof row !== "object") {
			return [];
		}

		const source = row as {
			activity_type?: unknown;
			created_at?: unknown;
			metadata?: Json | null;
			user_id?: unknown;
		};

		if (
			typeof source.user_id !== "string" ||
			typeof source.activity_type !== "string" ||
			typeof source.created_at !== "string"
		) {
			return [];
		}

		const completed =
			source.activity_type === "review_completed" ||
			(Boolean(source.metadata) &&
				typeof source.metadata === "object" &&
				!Array.isArray(source.metadata) &&
				(source.metadata as Record<string, Json | undefined>).completed ===
					true);

		return [
			{
				userId: source.user_id,
				createdAt: source.created_at,
				activityType: source.activity_type,
				completed,
			},
		];
	});
};

const parsePreviewStreakReminderStatusRows = (
	data: unknown,
): PreviewStreakReminderStatusRow[] => {
	if (!Array.isArray(data)) {
		return [];
	}

	return data.flatMap((row) => {
		if (!row || typeof row !== "object") {
			return [];
		}

		const source = row as {
			can_send?: unknown;
			cooldown_ends_at?: unknown;
			reason?: unknown;
			recipient_user_id?: unknown;
			seconds_remaining?: unknown;
			sent?: unknown;
		};

		if (typeof source.recipient_user_id !== "string") {
			return [];
		}

		return [
			{
				recipientUserId: source.recipient_user_id,
				canSend: source.can_send === true,
				cooldownEndsAt:
					typeof source.cooldown_ends_at === "string"
						? source.cooldown_ends_at
						: null,
				reason:
					typeof source.reason === "string"
						? (source.reason as PreviewStreakReminderStatus["reason"])
						: undefined,
				secondsRemaining:
					typeof source.seconds_remaining === "number" &&
					Number.isFinite(source.seconds_remaining)
						? Math.max(0, Math.ceil(source.seconds_remaining))
						: 0,
				sent: source.sent === true,
			},
		];
	});
};

const buildCombinedReminderRpcMessage = (
	error: PreviewReminderRpcErrorLike | null | undefined,
): string => {
	if (!error) {
		return "";
	}

	return [error.message, error.details, error.hint]
		.filter(
			(part): part is string =>
				typeof part === "string" && part.trim().length > 0,
		)
		.join(" ")
		.toLowerCase();
};

const normalizeReminderErrorPart = (value: unknown): string | null =>
	typeof value === "string" && value.trim().length > 0 ? value : null;

const coercePreviewReminderRpcError = (
	error: unknown,
): PreviewReminderRpcErrorLike | null => {
	if (!error) {
		return null;
	}

	if (typeof error === "string") {
		const message = normalizeReminderErrorPart(error);
		return message ? { message } : null;
	}

	if (typeof error !== "object") {
		return null;
	}

	const candidate = error as Record<string, unknown>;
	const nestedCause =
		typeof candidate.cause === "object" && candidate.cause !== null
			? (candidate.cause as Record<string, unknown>)
			: null;

	const message =
		normalizeReminderErrorPart(candidate.message) ??
		normalizeReminderErrorPart(nestedCause?.message);
	const code =
		normalizeReminderErrorPart(candidate.code) ??
		normalizeReminderErrorPart(nestedCause?.code);
	const details =
		normalizeReminderErrorPart(candidate.details) ??
		normalizeReminderErrorPart(nestedCause?.details);
	const hint =
		normalizeReminderErrorPart(candidate.hint) ??
		normalizeReminderErrorPart(nestedCause?.hint);

	if (!message && !code && !details && !hint) {
		return null;
	}

	return { code, details, hint, message };
};

const isMissingPreviewStreakReminderRpcError = (
	error: PreviewReminderRpcErrorLike | null | undefined,
): boolean => {
	if (!error) {
		return false;
	}

	const combinedMessage = buildCombinedReminderRpcMessage(error);
	const referencesReminderRpc = combinedMessage.includes("friend_streak_nudge");

	return (
		error.code === "PGRST202" ||
		error.code === "42883" ||
		((combinedMessage.includes("schema cache") ||
			combinedMessage.includes("could not find the function") ||
			combinedMessage.includes("function public.")) &&
			referencesReminderRpc)
	);
};

const isPreviewStreakReminderAuthError = (
	error: PreviewReminderRpcErrorLike | null | undefined,
): boolean => {
	if (!error) {
		return false;
	}

	const combinedMessage = buildCombinedReminderRpcMessage(error);
	return (
		error.code === "PGRST301" ||
		combinedMessage.includes("jwt") ||
		combinedMessage.includes("auth") ||
		combinedMessage.includes("permission") ||
		combinedMessage.includes("token")
	);
};

const normalizePreviewStreakReminderErrorMessage = (
	error: PreviewReminderRpcErrorLike | null | undefined,
	fallbackMessage: string,
): string => {
	if (isMissingPreviewStreakReminderRpcError(error)) {
		return PREVIEW_STREAK_REMINDER_BACKEND_UNAVAILABLE_MESSAGE;
	}

	if (isPreviewStreakReminderAuthError(error)) {
		return "Ta session n'autorise plus l'envoi de rappels. Reconnecte-toi puis reessaie.";
	}

	return typeof error?.message === "string" && error.message.trim().length > 0
		? error.message
		: fallbackMessage;
};

const createUnavailablePreviewStreakReminderStatus = () => ({
	...PREVIEW_STREAK_REMINDER_BACKEND_UNAVAILABLE_STATUS,
});

const createAuthRequiredPreviewStreakReminderStatus = () => ({
	...PREVIEW_STREAK_REMINDER_AUTH_REQUIRED_STATUS,
});

const createReminderStatusMap = (
	recipientUserIds: string[],
	createStatus: () => PreviewStreakReminderStatus,
): Map<string, PreviewStreakReminderStatus> =>
	new Map(
		recipientUserIds.map((recipientUserId) => [
			recipientUserId,
			createStatus(),
		]),
	);

export const resolvePreviewWordsMilestoneMeta = resolveWordsMilestoneMeta;

export const PREVIEW_ACTIVE_FLAMES_LABEL = "flammes actives🔥";

const resolvePreviewYoutubeRecommendationsCacheKey = (
	cacheIdentity: string,
): string =>
	`${PREVIEW_YOUTUBE_RECOMMENDATIONS_CACHE_KEY_PREFIX}:${cacheIdentity}`;

const canUseBrowserStorage = (): boolean =>
	typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const isValidPreviewYoutubeRecommendationsCache = (
	value: PreviewYoutubeRecommendationsResult,
	referenceDate = new Date(),
): boolean => {
	if (value.isLocked) {
		return false;
	}

	if (
		typeof value.dayEndsAt !== "string" ||
		value.dayEndsAt.trim().length === 0
	) {
		return false;
	}

	const dayEndsAt = new Date(value.dayEndsAt);
	if (Number.isNaN(dayEndsAt.getTime())) {
		return false;
	}

	return dayEndsAt.getTime() > referenceDate.getTime();
};

export function readCachedPreviewYoutubeRecommendations(
	cacheIdentity: string | null,
	referenceDate = new Date(),
): PreviewYoutubeRecommendationsResult | null {
	if (!cacheIdentity || !canUseBrowserStorage()) {
		return null;
	}

	try {
		const rawValue = window.localStorage.getItem(
			resolvePreviewYoutubeRecommendationsCacheKey(cacheIdentity),
		);
		if (!rawValue) {
			return null;
		}

		const parsedValue = JSON.parse(rawValue) as unknown;
		if (!isPreviewYoutubeRecommendationsResult(parsedValue)) {
			window.localStorage.removeItem(
				resolvePreviewYoutubeRecommendationsCacheKey(cacheIdentity),
			);
			return null;
		}

		if (
			!isValidPreviewYoutubeRecommendationsCache(parsedValue, referenceDate)
		) {
			window.localStorage.removeItem(
				resolvePreviewYoutubeRecommendationsCacheKey(cacheIdentity),
			);
			return null;
		}

		return parsedValue;
	} catch {
		return null;
	}
}

export function clearCachedPreviewYoutubeRecommendations(
	cacheIdentity: string | null,
): void {
	if (!cacheIdentity || !canUseBrowserStorage()) {
		return;
	}

	window.localStorage.removeItem(
		resolvePreviewYoutubeRecommendationsCacheKey(cacheIdentity),
	);
}

const writeCachedPreviewYoutubeRecommendations = (
	cacheIdentity: string | null,
	result: PreviewYoutubeRecommendationsResult,
): void => {
	if (!cacheIdentity || !canUseBrowserStorage()) {
		return;
	}

	if (!isValidPreviewYoutubeRecommendationsCache(result)) {
		clearCachedPreviewYoutubeRecommendations(cacheIdentity);
		return;
	}

	window.localStorage.setItem(
		resolvePreviewYoutubeRecommendationsCacheKey(cacheIdentity),
		JSON.stringify(result),
	);
};

const getSharedStreakAnchorDateKey = (
	sharedActiveDateKeys: Set<string>,
	referenceDate: Date,
): string | null => {
	const todayKey = toIsoDateKeyUtc(referenceDate);
	if (sharedActiveDateKeys.has(todayKey)) {
		return todayKey;
	}

	const yesterday = new Date(referenceDate);
	yesterday.setUTCDate(yesterday.getUTCDate() - 1);
	const yesterdayKey = toIsoDateKeyUtc(yesterday);
	return sharedActiveDateKeys.has(yesterdayKey) ? yesterdayKey : null;
};

const computeSharedStreakDays = (
	sharedActiveDateKeys: Set<string>,
	referenceDate: Date,
): number => {
	const anchorDateKey = getSharedStreakAnchorDateKey(
		sharedActiveDateKeys,
		referenceDate,
	);
	if (!anchorDateKey) {
		return 0;
	}

	let streakDays = 0;
	for (let offset = 0; offset < PREVIEW_SHARED_STREAK_MAX_DAYS; offset += 1) {
		const date = fromIsoDateKeyUtc(anchorDateKey);
		date.setUTCDate(date.getUTCDate() - offset);
		const dateKey = toIsoDateKeyUtc(date);
		if (!sharedActiveDateKeys.has(dateKey)) {
			break;
		}
		streakDays += 1;
	}

	return streakDays;
};

const computeSharedStreakDaysForFriend = ({
	friendActiveDateKeys,
	referenceDate,
	userActiveDateKeys,
}: {
	friendActiveDateKeys: Set<string>;
	referenceDate: Date;
	userActiveDateKeys: Set<string>;
}): number => {
	const sharedActiveDateKeys = new Set<string>();
	for (const dateKey of userActiveDateKeys) {
		if (friendActiveDateKeys.has(dateKey)) {
			sharedActiveDateKeys.add(dateKey);
		}
	}

	return computeSharedStreakDays(sharedActiveDateKeys, referenceDate);
};

type PreviewDailyStreakByFriend = {
	friendReviewedTodayByFriend: Set<string>;
	sharedReviewedTodayByFriend: Set<string>;
	sharedStreakDaysByFriend: Map<string, number>;
};

const fetchSharedStreakDaysByFriend = async ({
	userId,
	friendIds,
	personalStreakDays,
	referenceDate,
}: {
	userId: string;
	friendIds: string[];
	personalStreakDays: number;
	referenceDate: Date;
}): Promise<PreviewDailyStreakByFriend> => {
	if (friendIds.length === 0) {
		return {
			friendReviewedTodayByFriend: new Set(),
			sharedReviewedTodayByFriend: new Set(),
			sharedStreakDaysByFriend: new Map(),
		};
	}

	const lookbackDays = Math.min(
		PREVIEW_SHARED_STREAK_MAX_DAYS,
		Math.max(personalStreakDays, 1),
	);
	const startDate = new Date(referenceDate);
	startDate.setUTCHours(0, 0, 0, 0);
	startDate.setUTCDate(startDate.getUTCDate() - lookbackDays);

	const query = getPreviewReadyMetricsClient()
		.from("user_daily_activity")
		.select("user_id, activity_date, reviews_count")
		.in("user_id", [userId, ...friendIds])
		.gte("activity_date", toIsoDateKeyUtc(startDate))
		.lte("activity_date", toIsoDateKeyUtc(referenceDate))
		.order("activity_date", { ascending: false }) as unknown as Promise<{
		data: unknown;
		error: { message?: string } | null;
	}>;
	const response = await query;

	if (response.error) {
		throw new Error(
			response.error.message ??
				"Impossible de lire l'activite quotidienne partagee.",
		);
	}

	const rows = parsePreviewDailyActivityRows(response.data);
	const activeDatesByUserId = new Map<string, Set<string>>();
	const todayKey = toIsoDateKeyUtc(referenceDate);

	for (const row of rows) {
		if (row.reviewsCount <= 0) {
			continue;
		}

		const activeDates =
			activeDatesByUserId.get(row.userId) ?? new Set<string>();
		activeDates.add(row.activityDate);
		activeDatesByUserId.set(row.userId, activeDates);
	}

	const userActiveDateKeys =
		activeDatesByUserId.get(userId) ?? new Set<string>();
	const friendReviewedTodayByFriend = new Set<string>();
	const sharedStreakDaysByFriend = new Map<string, number>();
	const sharedReviewedTodayByFriend = new Set<string>();
	const userReviewedToday = userActiveDateKeys.has(todayKey);

	for (const friendId of friendIds) {
		const friendActiveDateKeys =
			activeDatesByUserId.get(friendId) ?? new Set<string>();
		if (friendActiveDateKeys.has(todayKey)) {
			friendReviewedTodayByFriend.add(friendId);
		}
		if (userReviewedToday && friendActiveDateKeys.has(todayKey)) {
			sharedReviewedTodayByFriend.add(friendId);
		}
		sharedStreakDaysByFriend.set(
			friendId,
			computeSharedStreakDaysForFriend({
				friendActiveDateKeys,
				referenceDate,
				userActiveDateKeys,
			}),
		);
	}

	return {
		friendReviewedTodayByFriend,
		sharedReviewedTodayByFriend,
		sharedStreakDaysByFriend,
	};
};

const fetchPreviewStreakReminderStatuses = async (
	recipientUserIds: string[],
): Promise<Map<string, PreviewStreakReminderStatus>> => {
	if (recipientUserIds.length === 0) {
		return new Map();
	}

	let data: unknown;
	let error: PreviewReminderRpcErrorLike | null = null;

	try {
		const response = await getPreviewReminderRpcClient().rpc(
			"get_friend_streak_nudge_statuses_v1",
			{
				p_recipient_user_ids: recipientUserIds,
			},
		);
		data = response.data;
		error = response.error;
	} catch (caughtError) {
		const normalizedCaughtError = coercePreviewReminderRpcError(caughtError);

		if (isMissingPreviewStreakReminderRpcError(normalizedCaughtError)) {
			return createReminderStatusMap(
				recipientUserIds,
				createUnavailablePreviewStreakReminderStatus,
			);
		}

		if (isPreviewStreakReminderAuthError(normalizedCaughtError)) {
			return createReminderStatusMap(
				recipientUserIds,
				createAuthRequiredPreviewStreakReminderStatus,
			);
		}

		return createReminderStatusMap(
			recipientUserIds,
			createUnavailablePreviewStreakReminderStatus,
		);
	}

	if (error) {
		if (isMissingPreviewStreakReminderRpcError(error)) {
			return createReminderStatusMap(
				recipientUserIds,
				createUnavailablePreviewStreakReminderStatus,
			);
		}

		if (isPreviewStreakReminderAuthError(error)) {
			return createReminderStatusMap(
				recipientUserIds,
				createAuthRequiredPreviewStreakReminderStatus,
			);
		}

		return createReminderStatusMap(
			recipientUserIds,
			createUnavailablePreviewStreakReminderStatus,
		);
	}

	const statusByFriend = new Map<string, PreviewStreakReminderStatus>();
	for (const row of parsePreviewStreakReminderStatusRows(data)) {
		statusByFriend.set(row.recipientUserId, {
			canSend: row.canSend,
			cooldownEndsAt: row.cooldownEndsAt,
			reason: row.reason,
			secondsRemaining: row.secondsRemaining,
			sent: row.sent,
		});
	}

	for (const recipientUserId of recipientUserIds) {
		if (!statusByFriend.has(recipientUserId)) {
			statusByFriend.set(
				recipientUserId,
				createUnavailablePreviewStreakReminderStatus(),
			);
		}
	}

	return statusByFriend;
};

export async function sendPreviewStreakReminder(
	recipientUserId: string,
): Promise<PreviewStreakReminderStatus> {
	const normalizedRecipientUserId = recipientUserId.trim();
	if (!normalizedRecipientUserId) {
		throw new Error("RECIPIENT_REQUIRED");
	}

	let data: unknown;
	let error: PreviewReminderRpcErrorLike | null;

	try {
		const response = await getPreviewReminderRpcClient().rpc(
			"send_friend_streak_nudge_v1",
			{
				p_recipient_user_id: normalizedRecipientUserId,
			},
		);
		data = response.data;
		error = response.error;
	} catch (caughtError) {
		const normalizedCaughtError = coercePreviewReminderRpcError(caughtError);

		if (isMissingPreviewStreakReminderRpcError(normalizedCaughtError)) {
			return createUnavailablePreviewStreakReminderStatus();
		}

		if (isPreviewStreakReminderAuthError(normalizedCaughtError)) {
			return createAuthRequiredPreviewStreakReminderStatus();
		}

		throw new Error(
			normalizePreviewStreakReminderErrorMessage(
				normalizedCaughtError,
				"Impossible d'envoyer le rappel de streak.",
			),
		);
	}

	if (error) {
		if (isMissingPreviewStreakReminderRpcError(error)) {
			return createUnavailablePreviewStreakReminderStatus();
		}

		if (isPreviewStreakReminderAuthError(error)) {
			return createAuthRequiredPreviewStreakReminderStatus();
		}

		throw new Error(
			normalizePreviewStreakReminderErrorMessage(
				error,
				"Impossible d'envoyer le rappel de streak.",
			),
		);
	}

	const [status] = parsePreviewStreakReminderStatusRows(data);
	if (!status) {
		throw new Error("INVALID_STREAK_REMINDER_RESPONSE");
	}

	return {
		canSend: status.canSend,
		cooldownEndsAt: status.cooldownEndsAt,
		reason: status.reason,
		secondsRemaining: status.secondsRemaining,
		sent: status.sent,
	};
}

const fetchCompletedTodayByFriend = async ({
	friendIds,
	referenceDate,
}: {
	friendIds: string[];
	referenceDate: Date;
}): Promise<Map<string, string>> => {
	if (friendIds.length === 0) {
		return new Map();
	}

	const dayStart = new Date(referenceDate);
	dayStart.setUTCHours(0, 0, 0, 0);
	const dayEnd = new Date(dayStart);
	dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

	const query = getPreviewReadyMetricsClient()
		.from("user_activity_log")
		.select("user_id, activity_type, metadata, created_at")
		.in("user_id", friendIds)
		.in("activity_type", ["card_reviewed", "review_completed", "submit_review"])
		.gte("created_at", dayStart.toISOString())
		.lt("created_at", dayEnd.toISOString())
		.order("created_at", { ascending: false }) as unknown as Promise<{
		data: unknown;
		error: { message?: string } | null;
	}>;
	const response = await query;

	if (response.error) {
		throw new Error(
			response.error.message ??
				"Impossible de lire les completions du jour pour les camarades.",
		);
	}

	const latestCompletionByFriend = new Map<string, string>();
	for (const row of parsePreviewActivityLogRows(response.data)) {
		if (
			row.activityType !== "card_reviewed" &&
			row.activityType !== "review_completed" &&
			!(row.activityType === "submit_review" && row.completed)
		) {
			continue;
		}

		if (!latestCompletionByFriend.has(row.userId)) {
			latestCompletionByFriend.set(row.userId, row.createdAt);
		}
	}

	return latestCompletionByFriend;
};

const sortPreviewStreakFriends = (
	friends: PreviewStreakFriendRow[],
): PreviewStreakFriendRow[] =>
	[...friends].sort((left, right) => {
		if (left.status !== right.status) {
			return left.status === "done" ? -1 : 1;
		}

		if (left.sharedStreakDays !== right.sharedStreakDays) {
			return right.sharedStreakDays - left.sharedStreakDays;
		}

		return left.name.localeCompare(right.name, "fr", { sensitivity: "base" });
	});

const buildPreviewStreakFriendRow = ({
	completedTodayAt,
	friend,
	friendReviewedToday,
	referenceDate,
	reminderStatus,
	sharedReviewedToday,
	sharedStreakDays,
}: {
	completedTodayAt: string | null;
	friend: FriendListItem;
	friendReviewedToday: boolean;
	referenceDate: Date;
	reminderStatus?: PreviewStreakReminderStatus | null;
	sharedReviewedToday: boolean;
	sharedStreakDays: number;
}): PreviewStreakFriendRow => {
	const completedStatusLabel = formatPreviewCompletionStatus(
		completedTodayAt,
		referenceDate,
	);
	const normalizedSharedStreakDays = normalizeMetricCount(sharedStreakDays);
	// Core rule: the daily validation badge resets with the new day and is only
	// restored when both sides have at least one server-recorded review today.
	// The streak flame can carry over from yesterday independently until the next
	// missed shared day makes the shared streak drop to zero.
	const isDone = sharedReviewedToday;
	return {
		userId: friend.userId,
		name: getFriendPrimaryName(friend),
		initials: getFriendInitials(friend),
		avatarSeed: getFriendAvatarSeed(friend),
		avatarUrl: friend.avatarUrl,
		friendReviewedToday,
		profilePath: buildPreviewProfilePath(friend.username),
		reminderStatus: reminderStatus ?? null,
		sharedStreakDays: normalizedSharedStreakDays,
		status: isDone ? "done" : "pending",
		statusText: isDone
			? completedTodayAt && completedStatusLabel
				? completedStatusLabel
				: "fait il y a 0 sec"
			: "en attente...",
	};
};

export const buildPreviewReadyMetricSlides = (
	snapshot: PreviewReadyMetricsSnapshot,
): PreviewMetricSlide[] => {
	const wordsTarget = Math.max(1, normalizeMetricCount(snapshot.wordsTarget));
	const acquiredWords = normalizeMetricCount(snapshot.acquiredWords);
	const validatedTodayCount = normalizeMetricCount(
		snapshot.validatedTodayCount,
	);
	const validatedTodayTarget = normalizeMetricCount(
		snapshot.validatedTodayTarget,
	);
	const activeFlamesCount = snapshot.streakFriends.reduce(
		(sum, friend) => sum + normalizeMetricCount(friend.sharedStreakDays),
		0,
	);
	const wordsProgressPct = resolveWordProgressPct(acquiredWords, wordsTarget);
	const progressTierMeta = resolvePreviewWordsMilestoneMeta({
		value: acquiredWords,
		wordsTarget,
	});

	return [
		{
			id: "acquired-words",
			variant: "progress",
			value: acquiredWords,
			label: `mots acquis sur ${formatMetricCount(wordsTarget)}`,
			accentLabel:
				validatedTodayCount > 0
					? `+${formatMetricCount(validatedTodayCount)} aujourd'hui`
					: undefined,
			progressPct: wordsProgressPct,
			progressLabel:
				validatedTodayCount > 0 && validatedTodayTarget > 0
					? `${formatMetricCount(acquiredWords)} mots acquis sur ${formatMetricCount(wordsTarget)} et +${formatMetricCount(validatedTodayCount)} aujourd'hui sur ${formatMetricCount(validatedTodayTarget)}`
					: `${formatMetricCount(acquiredWords)} mots acquis sur ${formatMetricCount(wordsTarget)}`,
			footerStartLabel: progressTierMeta.footerStartLabel,
			footerEndLabel: progressTierMeta.footerEndLabel,
		},
		{
			id: "shared-streak",
			variant: "streak",
			value: activeFlamesCount,
			label: PREVIEW_ACTIVE_FLAMES_LABEL,
			friends: [...snapshot.streakFriends],
			initialVisibleCount: PREVIEW_STREAK_FRIEND_VISIBLE_COUNT,
		},
	];
};

export async function loadPreviewReadyMetricsSnapshot({
	userId,
	acquiredWords,
	wordsTarget = 2000,
	referenceDate = new Date(),
}: LoadPreviewReadyMetricsSnapshotOptions): Promise<PreviewReadyMetricsSnapshot> {
	const emptySnapshot = createEmptyPreviewReadyMetricsSnapshot(
		acquiredWords,
		wordsTarget,
	);
	if (!userId) {
		return emptySnapshot;
	}

	const [summary, friends] = await Promise.all([
		getProfileProgressionSummary(userId),
		listMyFriends().catch((error) => {
			console.error(
				"Error loading preview connections for shared streak:",
				error,
			);
			return [];
		}),
	]);
	const reviewDailyObjective = findReviewDailyObjective(summary.objectives);
	const friendIds = friends.map((friend) => friend.userId);
	let sharedStreakDaysByFriend = new Map<string, number>();
	let completedTodayByFriend = new Map<string, string>();
	let friendReviewedTodayByFriend = new Set<string>();
	let reminderStatusByFriend = new Map<string, PreviewStreakReminderStatus>();
	let sharedReviewedTodayByFriend = new Set<string>();

	if (friendIds.length > 0) {
		try {
			const streakSnapshot = await fetchSharedStreakDaysByFriend({
				userId,
				friendIds,
				personalStreakDays: summary.reviewStreakDays,
				referenceDate,
			});
			friendReviewedTodayByFriend = streakSnapshot.friendReviewedTodayByFriend;
			sharedStreakDaysByFriend = streakSnapshot.sharedStreakDaysByFriend;
			sharedReviewedTodayByFriend = streakSnapshot.sharedReviewedTodayByFriend;
		} catch (error) {
			console.error("Error loading preview shared streaks by friend:", error);
		}

		try {
			reminderStatusByFriend =
				await fetchPreviewStreakReminderStatuses(friendIds);
		} catch (error) {
			console.error("Error loading preview streak reminder statuses:", error);
		}

		try {
			completedTodayByFriend = await fetchCompletedTodayByFriend({
				friendIds,
				referenceDate,
			});
		} catch (error) {
			console.error("Error loading preview friend completions:", error);
		}
	}

	const realStreakFriends = sortPreviewStreakFriends(
		friends.map((friend) =>
			buildPreviewStreakFriendRow({
				completedTodayAt: completedTodayByFriend.get(friend.userId) ?? null,
				friend,
				friendReviewedToday: friendReviewedTodayByFriend.has(friend.userId),
				referenceDate,
				reminderStatus: friendReviewedTodayByFriend.has(friend.userId)
					? null
					: (reminderStatusByFriend.get(friend.userId) ??
						DEFAULT_PREVIEW_STREAK_REMINDER_STATUS),
				sharedReviewedToday: sharedReviewedTodayByFriend.has(friend.userId),
				sharedStreakDays: sharedStreakDaysByFriend.get(friend.userId) ?? 0,
			}),
		),
	);

	return {
		acquiredWords: Math.max(acquiredWords, summary.wordsAcquiredCount),
		wordsTarget,
		validatedTodayCount: normalizeMetricCount(
			reviewDailyObjective?.current ?? 0,
		),
		validatedTodayTarget: normalizeMetricCount(
			reviewDailyObjective?.target ?? 0,
		),
		validatedTodayProgressPct: clampProgressPct(
			reviewDailyObjective?.progress ?? 0,
		),
		personalStreakDays: normalizeMetricCount(summary.reviewStreakDays),
		streakFriends: realStreakFriends,
	};
}

function isNotificationCategory(
	value: string,
): value is NotificationFeedCategory {
	return NOTIFICATION_CATEGORY_VALUES.includes(
		value as NotificationFeedCategory,
	);
}

function normalizeNotificationUserId(
	value: Json | undefined,
): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const normalizedValue = value.trim();
	return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function normalizeNotificationUsername(
	value: Json | undefined,
): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const normalizedValue = value.trim().replace(/^@+/, "");
	return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function resolveNotificationTargetUserId(
	notificationType: string,
	payload: PreviewNotificationPayload,
): string | undefined {
	if (payload.targetUserId) {
		return payload.targetUserId;
	}

	switch (notificationType) {
		case "friend_request_received":
			return payload.requesterUserId;
		case "friend_request_accepted":
			return payload.recipientUserId;
		case "friend_streak_nudge":
			return payload.senderUserId;
		default:
			return undefined;
	}
}

function mapNotificationTypeToFeedItemNotifType(
	notificationType: string,
): FeedItemNotifType | undefined {
	return (
		NOTIFICATION_TYPE_TO_FEED_NOTIF_TYPE as Record<string, FeedItemNotifType>
	)[notificationType];
}

function decodeNotificationUsername(
	encodedUsername: string | null | undefined,
): string | null {
	if (!encodedUsername) {
		return null;
	}

	try {
		const decodedUsername = decodeURIComponent(encodedUsername).trim();
		return decodedUsername.length > 0 ? decodedUsername : null;
	} catch {
		const trimmedUsername = encodedUsername.trim();
		return trimmedUsername.length > 0 ? trimmedUsername : null;
	}
}

function extractSidebarProfileUsernameFromPath(
	navigationTarget: string | null,
): string | null {
	if (!navigationTarget) {
		return null;
	}

	let pathname = "";

	try {
		const parsed = new URL(navigationTarget, "https://app.local");
		pathname = parsed.pathname;
	} catch {
		return null;
	}

	const match = pathname.match(SIDEBAR_PROFILE_PATH_PATTERN);
	if (!match || !match[1]) {
		return null;
	}

	return decodeNotificationUsername(match[1]);
}

async function fetchNotificationTargetUsernameByUserId(
	userIds: string[],
): Promise<Map<string, string>> {
	const normalizedUserIds = Array.from(
		new Set(
			userIds
				.map((userId) => userId.trim())
				.filter((userId) => userId.length > 0),
		),
	);

	if (normalizedUserIds.length === 0) {
		return new Map<string, string>();
	}

	const { data, error } = await (supabase as unknown as {
		rpc: (
			fn: string,
			args?: Record<string, unknown>,
		) => Promise<{
			data: Array<{ user_id?: unknown; username?: unknown }> | null;
			error: { message?: string } | null;
		}>;
	}).rpc("list_profiles_by_user_ids_v1", {
		p_user_ids: normalizedUserIds,
	});

	if (error) {
		console.error(
			"Error loading profile usernames for preview notification targets:",
			error,
		);
		return new Map<string, string>();
	}

	const usernameByUserId = new Map<string, string>();
	for (const row of data ?? []) {
		if (typeof row.user_id !== "string" || typeof row.username !== "string") {
			continue;
		}

		const normalizedUsername = row.username.trim();
		if (!normalizedUsername) {
			continue;
		}

		usernameByUserId.set(row.user_id, normalizedUsername);
	}

	return usernameByUserId;
}

async function hydrateNotificationTargetUsernames(
	items: FeedItem[],
): Promise<FeedItem[]> {
	const unresolvedTargetUserIds = items
		.filter((item) => !item.targetUsername && item.targetUserId)
		.map((item) => item.targetUserId as string);
	if (unresolvedTargetUserIds.length === 0) {
		return items;
	}

	const usernameByUserId = await fetchNotificationTargetUsernameByUserId(
		unresolvedTargetUserIds,
	);
	if (usernameByUserId.size === 0) {
		return items;
	}

	return items.map((item) => {
		if (item.targetUsername || !item.targetUserId) {
			return item;
		}

		const targetUsername = usernameByUserId.get(item.targetUserId);
		if (!targetUsername) {
			return item;
		}

		return {
			...item,
			targetUsername,
		};
	});
}

export function resolvePreviewNotificationDestination(
	item: FeedItem,
): string | null {
	const normalizedTargetUsername = item.targetUsername?.trim();
	if (normalizedTargetUsername) {
		return buildPreviewProfilePath(normalizedTargetUsername);
	}

	const normalizedActionTarget = item.actionUrl
		? normalizeAppNavigationTarget(item.actionUrl)
		: null;
	const usernameFromSidebarProfilePath = extractSidebarProfileUsernameFromPath(
		normalizedActionTarget,
	);
	if (usernameFromSidebarProfilePath) {
		return buildPreviewProfilePath(usernameFromSidebarProfilePath);
	}

	if (
		normalizedActionTarget === "/profil/amis" ||
		normalizedActionTarget === SIDEBAR_PROFILE_ROOT_PATH ||
		item.notifType === "friend-request" ||
		item.notifType === "friend-accepted" ||
		item.notifType === "streak-reminder"
	) {
		return PREVIEW_CONNECTIONS_PATH;
	}

	return normalizedActionTarget;
}

function normalizePreviewNotificationPayload(
	value: Json | null | undefined,
): PreviewNotificationPayload {
	if (!value || Array.isArray(value) || typeof value !== "object") {
		return {};
	}

	const candidate = value as Record<string, Json | undefined>;
	const payload: PreviewNotificationPayload = {};

	if (typeof candidate.actionUrl === "string") {
		payload.actionUrl =
			normalizeAppNavigationTarget(candidate.actionUrl) ?? undefined;
	}
	if (typeof candidate.actionLabel === "string") {
		payload.actionLabel = candidate.actionLabel;
	}
	if (typeof candidate.actorDisplayName === "string") {
		payload.actorDisplayName = candidate.actorDisplayName;
	}
	if (typeof candidate.actorAvatarUrl === "string") {
		payload.actorAvatarUrl = candidate.actorAvatarUrl;
	}

	payload.targetUserId = normalizeNotificationUserId(candidate.targetUserId);
	payload.targetUsername = normalizeNotificationUsername(
		candidate.targetUsername,
	);
	payload.requesterUserId = normalizeNotificationUserId(
		candidate.requesterUserId,
	);
	payload.recipientUserId = normalizeNotificationUserId(
		candidate.recipientUserId,
	);
	payload.senderUserId = normalizeNotificationUserId(candidate.senderUserId);
	if (
		typeof candidate.dueCount === "number" &&
		Number.isFinite(candidate.dueCount)
	) {
		payload.dueCount = Math.max(0, Math.floor(candidate.dueCount));
	}
	if (typeof candidate.entityId === "string") {
		payload.entityId = candidate.entityId;
	}
	if (typeof candidate.entityType === "string") {
		payload.entityType = candidate.entityType;
	}
	if (typeof candidate.highlight === "string") {
		payload.highlight = candidate.highlight;
	}
	if (typeof candidate.localDate === "string") {
		payload.localDate = candidate.localDate;
	}
	if (
		typeof candidate.slot === "string" &&
		(candidate.slot === "morning" ||
			candidate.slot === "midday" ||
			candidate.slot === "evening")
	) {
		payload.slot = candidate.slot;
	}

	return payload;
}

function isMissingNotificationsTableError(error: NotificationErrorLike) {
	const haystack =
		`${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`
			.toLowerCase()
			.trim();

	return (
		haystack.includes("user_notifications") &&
		(haystack.includes("does not exist") ||
			haystack.includes("42p01") ||
			haystack.includes("pgrst205"))
	);
}

function isNotificationAuthError(error: NotificationErrorLike) {
	const haystack =
		`${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`
			.toLowerCase()
			.trim();

	return (
		haystack.includes("jwt") ||
		haystack.includes("auth") ||
		haystack.includes("permission") ||
		haystack.includes("token") ||
		error.code === "PGRST301"
	);
}

function normalizeNotificationsErrorMessage(error: NotificationErrorLike) {
	if (isMissingNotificationsTableError(error)) {
		return "Le backend notifications n'est pas encore disponible sur cet environnement.";
	}

	if (isNotificationAuthError(error)) {
		return "Ta session n'autorise plus l'acces aux notifications. Reconnecte-toi puis reessaie.";
	}

	return typeof error.message === "string" && error.message.trim().length > 0
		? error.message
		: "Impossible de charger les notifications pour le moment.";
}

function normalizeNotificationIds(ids: string[]) {
	return Array.from(
		new Set(
			ids.map((value) => value.trim()).filter((value) => value.length > 0),
		),
	);
}

function mapPreviewNotificationRowToFeedItem(
	row: PreviewNotificationRow,
): FeedItem {
	const normalizedNotificationType =
		typeof row.notification_type === "string"
			? row.notification_type.trim()
			: "";
	const category = isNotificationCategory(row.category)
		? row.category
		: "for-me";
	const payload = normalizePreviewNotificationPayload(row.payload_json);
	const targetUserId = resolveNotificationTargetUserId(
		normalizedNotificationType,
		payload,
	);
	const title = row.title.trim().length > 0 ? row.title.trim() : "Notification";
	const fallbackBody =
		row.body.trim().length > 0 ? row.body.trim() : (payload.highlight ?? "");
	const actorName = payload.actorDisplayName?.trim();
	const body =
		normalizedNotificationType === "friend_request_received" && actorName
			? `${actorName} t'a envoyé une demande pour devenir camarade.`
			: normalizedNotificationType === "friend_request_accepted" && actorName
				? `${actorName} a accepté de devenir camarade. 🤝`
				: fallbackBody;

	return {
		id: row.id,
		category,
		title,
		body,
		time: formatPreviewNotificationTime(row.created_at),
		unread: row.read_at === null,
		actionUrl: payload.actionUrl,
		actionLabel: payload.actionLabel,
		targetUserId,
		targetUsername: payload.targetUsername,
		actorAvatarUrl: payload.actorAvatarUrl ?? null,
		actorName: payload.actorDisplayName,
		notifType: mapNotificationTypeToFeedItemNotifType(
			normalizedNotificationType,
		),
		dueCount: payload.dueCount,
		localDate: payload.localDate,
		slot: payload.slot,
	};
}

export function getGuestPreviewNotificationFeed(): FeedItem[] {
	return GUEST_NOTIFICATION_FEED.map((item) => ({ ...item }));
}

export async function listAuthenticatedPreviewNotifications(): Promise<
	FeedItem[]
> {
	const { data, error } = await supabase
		.from("user_notifications")
		.select(
			"id, category, notification_type, title, body, payload_json, read_at, dismissed_at, archived_at, created_at",
		)
		.is("dismissed_at", null)
		.is("archived_at", null)
		.order("created_at", { ascending: false })
		.limit(PREVIEW_NOTIFICATION_LIMIT);

	if (error) {
		throw new Error(normalizeNotificationsErrorMessage(error));
	}

	const mappedNotifications = (data ?? []).map((row) =>
		mapPreviewNotificationRowToFeedItem(row as PreviewNotificationRow),
	);

	return hydrateNotificationTargetUsernames(mappedNotifications);
}

export async function markPreviewNotificationsRead(
	ids: string[],
): Promise<void> {
	const normalizedIds = normalizeNotificationIds(ids);
	if (normalizedIds.length === 0) {
		return;
	}

	const update: PreviewNotificationUpdate = {
		read_at: new Date().toISOString(),
	};

	const { error } = await supabase
		.from("user_notifications")
		.update(update)
		.in("id", normalizedIds)
		.is("read_at", null)
		.is("dismissed_at", null)
		.is("archived_at", null);

	if (error) {
		throw new Error(normalizeNotificationsErrorMessage(error));
	}
}

export async function dismissPreviewNotification(id: string): Promise<void> {
	const normalizedId = id.trim();
	if (!normalizedId) {
		return;
	}

	const update: PreviewNotificationUpdate = {
		dismissed_at: new Date().toISOString(),
	};

	const { error } = await supabase
		.from("user_notifications")
		.update(update)
		.eq("id", normalizedId)
		.is("dismissed_at", null);

	if (error) {
		throw new Error(normalizeNotificationsErrorMessage(error));
	}
}

const isPreviewYoutubeRecommendation = (
	value: unknown,
): value is PreviewYoutubeRecommendation => {
	if (!value || typeof value !== "object") {
		return false;
	}

	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.id === "string" &&
		typeof candidate.youtubeId === "string" &&
		typeof candidate.title === "string" &&
		typeof candidate.channelTitle === "string" &&
		typeof candidate.videoUrl === "string" &&
		(candidate.thumbnailUrl === null ||
			typeof candidate.thumbnailUrl === "string") &&
		(candidate.durationSeconds === null ||
			typeof candidate.durationSeconds === "number") &&
		typeof candidate.durationLabel === "string" &&
		(candidate.comprehensionPercentage === null ||
			typeof candidate.comprehensionPercentage === "number") &&
		(candidate.subtitleKind === "manual" ||
			candidate.subtitleKind === "automatic" ||
			candidate.subtitleKind === "unknown") &&
		(candidate.transcriptSnippet === null ||
			typeof candidate.transcriptSnippet === "string") &&
		(candidate.summaryFr === null || typeof candidate.summaryFr === "string") &&
		typeof candidate.query === "string"
	);
};

const isPreviewYoutubeRecommendationsResult = (
	value: unknown,
): value is PreviewYoutubeRecommendationsResult => {
	if (!value || typeof value !== "object") {
		return false;
	}

	const candidate = value as Record<string, unknown>;
	const strategy = candidate.strategy;
	return (
		typeof candidate.generatedAt === "string" &&
		(candidate.recommendationDay === null ||
			typeof candidate.recommendationDay === "string") &&
		(candidate.dayEndsAt === null || typeof candidate.dayEndsAt === "string") &&
		Array.isArray(candidate.seedWords) &&
		candidate.seedWords.every((item) => typeof item === "string") &&
		(candidate.knownWordsCount === null ||
			typeof candidate.knownWordsCount === "number") &&
		typeof candidate.recommendationLimit === "number" &&
		typeof candidate.minimumWordsRequired === "number" &&
		typeof candidate.isLocked === "boolean" &&
		(candidate.lockMessage === null ||
			typeof candidate.lockMessage === "string") &&
		Array.isArray(candidate.queries) &&
		candidate.queries.every((item) => typeof item === "string") &&
		Array.isArray(candidate.warnings) &&
		candidate.warnings.every((item) => typeof item === "string") &&
		Array.isArray(candidate.recommendations) &&
		candidate.recommendations.every(isPreviewYoutubeRecommendation) &&
		!!strategy &&
		typeof strategy === "object" &&
		typeof (strategy as Record<string, unknown>).discovery === "string" &&
		typeof (strategy as Record<string, unknown>).subtitles === "string" &&
		typeof (strategy as Record<string, unknown>).model === "string"
	);
};

const normalizeFunctionError = (value: unknown): string => {
	if (!value || typeof value !== "object") {
		return "Impossible de charger les recommandations YouTube pour le moment.";
	}

	const candidate = value as Record<string, unknown>;
	const message = candidate.error;
	return typeof message === "string" && message.trim().length > 0
		? message.trim()
		: "Impossible de charger les recommandations YouTube pour le moment.";
};

export async function fetchPreviewYoutubeRecommendations(
	seedWords: string[],
	knownWordsCount: number | null,
	maxResults = 3,
	options?: { forceRefresh?: boolean; cacheIdentity?: string | null },
): Promise<PreviewYoutubeRecommendationsResult> {
	const normalizedSeedWords = Array.from(
		new Set(
			seedWords
				.map((value) => (typeof value === "string" ? value.trim() : ""))
				.filter((value) => value.length > 0),
		),
	);

	const { data, error } = await supabase.functions.invoke(
		"preview-youtube-recommendations",
		{
			body: {
				seedWords: normalizedSeedWords,
				knownWordsCount,
				maxResults,
				forceRefresh: options?.forceRefresh === true,
			},
		},
	);

	if (error) {
		throw new Error(normalizeFunctionError(data));
	}

	if (!isPreviewYoutubeRecommendationsResult(data)) {
		throw new Error("Reponse invalide recue depuis le backend YouTube.");
	}

	writeCachedPreviewYoutubeRecommendations(
		options?.cacheIdentity ?? null,
		data,
	);

	return data;
}

export function createPreviewReviewFilters() {
	return PREVIEW_REVIEW_FILTER_DEFINITIONS.map(({ id, label }) => ({
		id,
		label,
		checked: true,
		count: 0,
	}));
}

export function getActivePreviewReviewTypes(filters: ReviewFilter[]) {
	const types: ReviewType[] = [];

	PREVIEW_REVIEW_FILTER_DEFINITIONS.forEach((filterDefinition) => {
		const isActive = filters.some(
			(filter) => filter.id === filterDefinition.id && filter.checked,
		);
		if (isActive) {
			types.push(filterDefinition.reviewType);
		}
	});

	return types;
}

export function resolvePreviewCardReviewType(
	card: Pick<VocabCard, "source" | "sourceType" | "tags">,
): ReviewType {
	const sourceType = card.sourceType ?? null;

	if (card.source === "foundation") {
		return "foundation";
	}
	if (sourceType === "sent") {
		return "sent";
	}
	if (sourceType === "collected") {
		return "collected";
	}

	const hasProfTag = card.tags.some((tag) => tag.toLowerCase() === "prof");
	return hasProfTag ? "sent" : "collected";
}
