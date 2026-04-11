import type { DistinctionId } from "@/components/progression/distinctionsData";
import type { Objective } from "@/hooks/useObjectives";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
	type FriendRequestAction,
	getRpcErrorCode,
	respondToFriendRequest,
	type SendFriendRequestStatus,
	sendFriendRequestByUsername,
} from "@/services/friendsService";

export type ProfileConnectionRelationshipState =
	| "self"
	| "none"
	| "outgoing_pending"
	| "incoming_pending"
	| "connected";

export type ProfileConnectionListItem = {
	userId: string;
	username: string | null;
	firstName: string | null;
	lastName: string | null;
	avatarUrl: string | null;
	connectedAt: string;
};

export type ProfileIncomingRequestItem = {
	requestId: string;
	requesterUserId: string;
	username: string | null;
	firstName: string | null;
	lastName: string | null;
	avatarUrl: string | null;
	requestedAt: string;
};

export type ProfileConnectionContext = {
	relationshipState: ProfileConnectionRelationshipState;
	connectionCount: number;
	connections: ProfileConnectionListItem[];
	incomingRequestCount: number;
	incomingRequests: ProfileIncomingRequestItem[];
};

export type ProfileProgressionSummary = {
	wordsAcquiredCount: number;
	totalImmersionMinutes: number;
	reviewStreakDays: number;
	longestReviewStreakDays: number;
	connectionStreakRecordDays: number;
	masteredWords: number;
	masteryProgress: number;
	objectives: Objective[];
	unlockedDistinctionIds: DistinctionId[];
};

export type ProfileSocialSummary = {
	audioRecordedCount: number;
	lastActivityAt: string | null;
};

type ConnectionContextRow = {
	relationship_state: string;
	connection_count: number;
	connections: Json;
	incoming_request_count: number;
	incoming_requests: Json;
};

type ProgressionSummaryRow = {
	words_acquired_count: number;
	total_immersion_minutes: number;
	review_streak_days: number;
	longest_streak_days: number;
	connection_streak_record_days: number;
	review_current: number;
	review_target: number;
	review_progress: number;
	mastered_words: number;
	mastery_progress: number;
	monthly_review_days_current: number;
	monthly_review_days_target: number;
	monthly_review_days_progress: number;
	unlocked_distinction_ids: string[];
};

const clampProgress = (value: number | null | undefined): number =>
	Math.max(0, Math.min(100, value ?? 0));

const DAY_MS = 24 * 60 * 60 * 1000;

const toUtcDayTimestamp = (activityDate: string): number | null => {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(activityDate)) {
		return null;
	}

	const timestamp = Date.parse(`${activityDate}T00:00:00.000Z`);
	return Number.isFinite(timestamp) ? timestamp : null;
};

const computeLongestStreakFromActivityDates = (
	activityDates: string[],
): number => {
	const timestamps = activityDates
		.map((activityDate) => toUtcDayTimestamp(activityDate))
		.filter((timestamp): timestamp is number => timestamp !== null)
		.sort((left, right) => left - right);

	if (timestamps.length === 0) {
		return 0;
	}

	let longestStreak = 1;
	let currentStreak = 1;

	for (let index = 1; index < timestamps.length; index += 1) {
		const dayDiff = Math.round(
			(timestamps[index] - timestamps[index - 1]) / DAY_MS,
		);

		if (dayDiff === 0) {
			continue;
		}

		if (dayDiff === 1) {
			currentStreak += 1;
		} else {
			currentStreak = 1;
		}

		longestStreak = Math.max(longestStreak, currentStreak);
	}

	return longestStreak;
};

const getHeatmapSourceConnectionStreakRecordDays = async (
	targetUserId: string,
): Promise<number | null> => {
	const { data, error } = await supabase
		.from("user_daily_activity")
		.select("activity_date")
		.eq("user_id", targetUserId)
		.order("activity_date", { ascending: true });

	if (error || !data) {
		return null;
	}

	return computeLongestStreakFromActivityDates(
		data
			.map((row) => row.activity_date)
			.filter(
				(activityDate): activityDate is string =>
					typeof activityDate === "string",
			),
	);
};

const isRecord = (value: Json): value is Record<string, Json> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: Json | undefined): string | null =>
	typeof value === "string" ? value : null;

const asNumber = (value: Json | undefined): number | null =>
	typeof value === "number" && Number.isFinite(value) ? value : null;

const RELATIONSHIP_STATES: readonly ProfileConnectionRelationshipState[] = [
	"self",
	"none",
	"outgoing_pending",
	"incoming_pending",
	"connected",
];

const isRelationshipState = (
	value: string | null | undefined,
): value is ProfileConnectionRelationshipState =>
	typeof value === "string" &&
	RELATIONSHIP_STATES.includes(value as ProfileConnectionRelationshipState);

const parseConnectionListItem = (
	value: Json,
): ProfileConnectionListItem | null => {
	if (!isRecord(value)) {
		return null;
	}

	const userId = asString(value.user_id);
	const connectedAt = asString(value.connected_at);
	if (!userId || !connectedAt) {
		return null;
	}

	return {
		userId,
		username: asString(value.username),
		firstName: asString(value.first_name),
		lastName: asString(value.last_name),
		avatarUrl: asString(value.avatar_url),
		connectedAt,
	};
};

const parseIncomingRequestItem = (
	value: Json,
): ProfileIncomingRequestItem | null => {
	if (!isRecord(value)) {
		return null;
	}

	const requestId = asString(value.request_id);
	const requesterUserId = asString(value.requester_user_id);
	const requestedAt = asString(value.requested_at);
	if (!requestId || !requesterUserId || !requestedAt) {
		return null;
	}

	return {
		requestId,
		requesterUserId,
		username: asString(value.username),
		firstName: asString(value.first_name),
		lastName: asString(value.last_name),
		avatarUrl: asString(value.avatar_url),
		requestedAt,
	};
};

const parseJsonArray = <T>(
	value: Json,
	parser: (entry: Json) => T | null,
): T[] => {
	if (!Array.isArray(value)) {
		return [];
	}

	return value
		.map((entry) => parser(entry))
		.filter((entry): entry is T => entry !== null);
};

const buildObjectives = (row: ProgressionSummaryRow): Objective[] => [
	{
		id: "review-daily",
		type: "review",
		label: "Revues du jour",
		current: Math.max(0, row.review_current ?? 0),
		target: Math.max(0, row.review_target ?? 0),
		progress: clampProgress(row.review_progress),
	},
	{
		id: "new-cards-daily",
		type: "new_cards",
		label: "Maitrise des 2000 mots",
		current: Math.max(0, row.words_acquired_count ?? 0),
		target: 2000,
		progress: clampProgress(row.mastery_progress),
	},
];

export const getProfileConnectionContext = async (
	targetUserId: string,
	limit = 200,
): Promise<ProfileConnectionContext> => {
	const { data, error } = await supabase.rpc(
		"get_profile_connection_context_v1",
		{
			p_limit: limit,
			p_target_user_id: targetUserId,
		},
	);

	if (error) {
		throw new Error(getRpcErrorCode(error.message));
	}

	const row = (data?.[0] ?? null) as ConnectionContextRow | null;
	if (!row || !isRelationshipState(row.relationship_state)) {
		throw new Error("INVALID_PROFILE_CONNECTION_CONTEXT_RESPONSE");
	}

	return {
		relationshipState: row.relationship_state,
		connectionCount: Math.max(0, row.connection_count ?? 0),
		connections: parseJsonArray(row.connections, parseConnectionListItem),
		incomingRequestCount: Math.max(0, row.incoming_request_count ?? 0),
		incomingRequests: parseJsonArray(
			row.incoming_requests,
			parseIncomingRequestItem,
		),
	};
};

export const getProfileProgressionSummary = async (
	targetUserId: string,
): Promise<ProfileProgressionSummary> => {
	const { data, error } = await supabase.rpc(
		"get_profile_progression_summary_v1",
		{
			p_target_user_id: targetUserId,
		},
	);

	if (error) {
		throw new Error(getRpcErrorCode(error.message));
	}

	const row = (data?.[0] ?? null) as ProgressionSummaryRow | null;
	if (!row) {
		throw new Error("INVALID_PROFILE_PROGRESSION_SUMMARY_RESPONSE");
	}

	const heatmapSourceConnectionStreakRecordDays =
		await getHeatmapSourceConnectionStreakRecordDays(targetUserId);

	return {
		wordsAcquiredCount: Math.max(0, row.words_acquired_count ?? 0),
		totalImmersionMinutes: Math.max(0, row.total_immersion_minutes ?? 0),
		reviewStreakDays: Math.max(0, row.review_streak_days ?? 0),
		longestReviewStreakDays: Math.max(0, row.longest_streak_days ?? 0),
		connectionStreakRecordDays:
			heatmapSourceConnectionStreakRecordDays ??
			Math.max(0, row.connection_streak_record_days ?? 0),
		masteredWords: Math.max(0, row.mastered_words ?? 0),
		masteryProgress: clampProgress(row.mastery_progress),
		objectives: buildObjectives(row),
		unlockedDistinctionIds: (row.unlocked_distinction_ids ??
			[]) as DistinctionId[],
	};
};

export const getProfileSocialSummary = async (
	targetUserId: string,
): Promise<ProfileSocialSummary> => {
	const { data, error } = await supabase.rpc("get_profile_social_summary_v1", {
		p_target_user_id: targetUserId,
	});

	if (error) {
		throw new Error(getRpcErrorCode(error.message));
	}

	const row = (data?.[0] ?? null) as {
		audio_recorded_count?: number | null;
		last_activity_at?: string | null;
	} | null;

	if (!row) {
		throw new Error("INVALID_PROFILE_SOCIAL_SUMMARY_RESPONSE");
	}

	return {
		audioRecordedCount: Math.max(0, Math.floor(row.audio_recorded_count ?? 0)),
		lastActivityAt:
			typeof row.last_activity_at === "string" && row.last_activity_at.trim().length > 0
				? row.last_activity_at
				: null,
	};
};

export const sendProfileConnectionRequest = async (
	username: string,
): Promise<SendFriendRequestStatus> => sendFriendRequestByUsername(username);

export const respondToProfileConnectionRequest = async (
	requestId: string,
	action: FriendRequestAction,
): Promise<"accepted" | "declined"> =>
	respondToFriendRequest(requestId, action);
