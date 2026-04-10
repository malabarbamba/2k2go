import { supabase } from "@/integrations/supabase/client";

export type SendFriendRequestStatus =
	| "sent"
	| "already_pending"
	| "already_friends"
	| "accepted_reverse_request";

export type FriendRequestAction = "accept" | "decline";

export type FriendListItem = {
	userId: string;
	username: string | null;
	email: string | null;
	firstName: string | null;
	lastName: string | null;
	avatarUrl: string | null;
	connectedAt: string;
};

export type IncomingFriendRequest = {
	requestId: string;
	requesterUserId: string;
	username: string | null;
	email: string | null;
	firstName: string | null;
	lastName: string | null;
	avatarUrl: string | null;
	requestedAt: string;
};

const FRIEND_REQUEST_STATUSES: readonly SendFriendRequestStatus[] = [
	"sent",
	"already_pending",
	"already_friends",
	"accepted_reverse_request",
];

const isSendFriendRequestStatus = (
	value: string | null | undefined,
): value is SendFriendRequestStatus => {
	if (!value) {
		return false;
	}

	return FRIEND_REQUEST_STATUSES.includes(value as SendFriendRequestStatus);
};

const normalizeInputUsername = (value: string): string => {
	const trimmed = value.trim();
	const withoutAtPrefix = trimmed.replace(/^@+/, "");
	return withoutAtPrefix.trim();
};

const getRpcErrorCode = (message: string | null | undefined): string => {
	if (typeof message !== "string") {
		return "UNKNOWN_ERROR";
	}

	const normalized = message.trim();
	return normalized.length > 0 ? normalized : "UNKNOWN_ERROR";
};

export const sendFriendRequestByUsername = async (
	usernameInput: string,
): Promise<SendFriendRequestStatus> => {
	const normalizedUsername = normalizeInputUsername(usernameInput);

	if (!normalizedUsername) {
		throw new Error("USERNAME_REQUIRED");
	}

	const { data, error } = await supabase.rpc(
		"send_friend_request_by_username",
		{
			p_recipient_username: normalizedUsername,
		},
	);

	if (error) {
		throw new Error(getRpcErrorCode(error.message));
	}

	const status = data?.[0]?.status;
	if (!isSendFriendRequestStatus(status)) {
		throw new Error("INVALID_SEND_FRIEND_REQUEST_RESPONSE");
	}

	return status;
};

export const listMyFriends = async (): Promise<FriendListItem[]> => {
	const { data, error } = await supabase.rpc("list_my_friends");

	if (error) {
		throw new Error(getRpcErrorCode(error.message));
	}

	return (data ?? []).map((row) => ({
		userId: row.friend_user_id,
		username: row.username,
		email: row.email,
		firstName: row.first_name,
		lastName: row.last_name,
		avatarUrl: row.avatar_url,
		connectedAt: row.connected_at,
	}));
};

export const listIncomingFriendRequests = async (): Promise<
	IncomingFriendRequest[]
> => {
	const { data, error } = await supabase.rpc("list_incoming_friend_requests");

	if (error) {
		throw new Error(getRpcErrorCode(error.message));
	}

	return (data ?? []).map((row) => ({
		requestId: row.request_id,
		requesterUserId: row.requester_user_id,
		username: row.requester_username,
		email: row.requester_email,
		firstName: row.requester_first_name,
		lastName: row.requester_last_name,
		avatarUrl: row.requester_avatar_url,
		requestedAt: row.requested_at,
	}));
};

export const respondToFriendRequest = async (
	requestId: string,
	action: FriendRequestAction,
): Promise<"accepted" | "declined"> => {
	const { data, error } = await supabase.rpc("respond_friend_request", {
		p_request_id: requestId,
		p_action: action,
	});

	if (error) {
		throw new Error(getRpcErrorCode(error.message));
	}

	const status = data?.[0]?.status;
	if (status === "accepted" || status === "declined") {
		return status;
	}

	throw new Error("INVALID_RESPOND_FRIEND_REQUEST_RESPONSE");
};

export { getRpcErrorCode, normalizeInputUsername };
