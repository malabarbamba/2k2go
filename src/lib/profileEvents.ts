import { normalizeProfileUsername } from "@/lib/profileIdentity";

export const PROFILE_UPDATED_EVENT = "app:profile-updated";

export type ProfileUpdatePatch = {
	username?: string | null;
	first_name?: string | null;
	last_name?: string | null;
	avatar_url?: string | null;
	bio?: string | null;
	motto?: string | null;
	location?: string | null;
	email?: string | null;
	fsrs_target_retention?: number;
	new_cards_per_day?: number;
	scheduler_timezone?: string;
	scheduler_day_cutoff_hour?: number;
	plan?: "free" | "pro" | null;
	pro_status?: "inactive" | "active" | "past_due" | "canceled" | null;
	admin_override_pro?: boolean | null;
	admin_override_expires_at?: string | null;
	updated_at?: string;
};

export type ProfileUpdatedDetail = {
	userId: string;
	username?: string | null;
	patch?: ProfileUpdatePatch;
};

export const dispatchProfileUpdated = (detail: ProfileUpdatedDetail): void => {
	if (typeof window === "undefined") {
		return;
	}

	window.dispatchEvent(
		new CustomEvent<ProfileUpdatedDetail>(PROFILE_UPDATED_EVENT, {
			detail,
		}),
	);
};

export const doesProfileUpdateMatchTarget = ({
	detail,
	targetUserId,
	targetUsername,
	currentUserId,
	currentUsername,
}: {
	detail: ProfileUpdatedDetail | null | undefined;
	targetUserId?: string | null;
	targetUsername?: string | null;
	currentUserId?: string | null;
	currentUsername?: string | null;
}): boolean => {
	if (!detail?.userId) {
		return false;
	}

	const normalizedDetailUsername = normalizeProfileUsername(detail.username);
	const normalizedTargetUsername = normalizeProfileUsername(targetUsername);
	const normalizedCurrentUsername = normalizeProfileUsername(currentUsername);

	return (
		detail.userId === targetUserId ||
		detail.userId === currentUserId ||
		(normalizedDetailUsername.length > 0 &&
			normalizedDetailUsername === normalizedTargetUsername) ||
		(normalizedDetailUsername.length > 0 &&
			normalizedDetailUsername === normalizedCurrentUsername)
	);
};
