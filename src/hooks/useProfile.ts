import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
	dispatchProfileUpdated,
	doesProfileUpdateMatchTarget,
	PROFILE_UPDATED_EVENT,
	type ProfileUpdatedDetail,
} from "@/lib/profileEvents";
import { normalizeProfileUsername } from "@/lib/profileIdentity";
import { clampProfileNewCardsPerDay } from "@/lib/profilePreferences";

const schedulerTimezoneAutoSetInFlight = new Set<string>();
const schedulerTimezoneAutoSetDone = new Set<string>();

const normalizeSchedulerTimezone = (
	value: string | null | undefined,
): string => (typeof value === "string" ? value.trim() : "");

const resolveBrowserTimeZone = (): string | null => {
	try {
		const value = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (typeof value !== "string") {
			return null;
		}

		const timezone = value.trim();
		return timezone.length > 0 ? timezone : null;
	} catch {
		return null;
	}
};

export interface UserProfile {
	id: string;
	user_id: string;
	username: string | null;
	first_name: string | null;
	last_name: string | null;
	avatar_url: string | null;
	bio: string | null;
	motto: string | null;
	location: string | null;
	followers_count: number;
	following_count: number;
	is_public: boolean;
	notifications_email?: boolean | null;
	email: string | null;
	fsrs_target_retention: number;
	new_cards_per_day: number;
	scheduler_timezone: string;
	scheduler_day_cutoff_hour: number;
	plan?: "free" | "pro" | null;
	pro_status?: "inactive" | "active" | "past_due" | "canceled" | null;
	admin_override_pro?: boolean | null;
	admin_override_expires_at?: string | null;
	created_at: string;
	updated_at: string;
	username_change_count?: number;
	username_changed_at?: string | null;
}

interface UseProfileReturn {
	profile: UserProfile | null;
	loading: boolean;
	error: string | null;
	isOwnProfile: boolean;
	refetch: () => void;
	updateName: (firstName: string, lastName: string) => Promise<void>;
	changeUsername: (nextUsername: string) => Promise<void>;
	updateProfile: (data: {
		bio?: string;
		motto?: string;
		location?: string;
		fsrs_target_retention?: number;
		new_cards_per_day?: number;
		avatar_url?: string;
	}) => Promise<void>;
}

export const useProfile = (
	username?: string,
	userId?: string,
): UseProfileReturn => {
	const { user, loading: authLoading } = useAuth();
	const normalizedUsername = normalizeProfileUsername(username);
	const [profile, setProfile] = useState<UserProfile | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const mapCanonicalProfileToUserProfile = useCallback(
		(
			profileRow: {
				user_id: string;
				username: string | null;
				display_name: string | null;
				avatar_url: string | null;
				bio: string | null;
				email_notifications_enabled?: boolean | null;
				timezone?: string | null;
				created_at: string;
				updated_at: string;
				username_change_count?: number;
				username_changed_at?: string | null;
			},
			schedulerRow?: {
				desired_retention: number;
				max_daily_new: number;
				timezone: string;
			} | null,
		): UserProfile => {
			const displayName = profileRow.display_name?.trim() ?? "";
			const [firstName, ...rest] = displayName.length > 0 ? displayName.split(/\s+/) : [];
			const lastName = rest.join(" ").trim();

			return {
				id: profileRow.user_id,
				user_id: profileRow.user_id,
				username: profileRow.username,
				first_name: firstName ?? null,
				last_name: lastName.length > 0 ? lastName : null,
				avatar_url: profileRow.avatar_url,
				bio: profileRow.bio,
				motto: null,
				location: null,
				followers_count: 0,
				following_count: 0,
				is_public: true,
				notifications_email:
					typeof profileRow.email_notifications_enabled === "boolean"
						? profileRow.email_notifications_enabled
						: null,
				email: null,
				fsrs_target_retention: schedulerRow?.desired_retention ?? 0.9,
				new_cards_per_day: schedulerRow?.max_daily_new ?? 20,
				scheduler_timezone:
					normalizeSchedulerTimezone(schedulerRow?.timezone) ||
					normalizeSchedulerTimezone(profileRow.timezone) ||
					"UTC",
				scheduler_day_cutoff_hour: 4,
				plan: null,
				pro_status: null,
				admin_override_pro: null,
				admin_override_expires_at: null,
				created_at: profileRow.created_at,
				updated_at: profileRow.updated_at,
				username_change_count: profileRow.username_change_count ?? 0,
				username_changed_at: profileRow.username_changed_at ?? null,
			};
		},
		[],
	);

	const normalizeSingleRpcRow = useCallback(
		<T extends object>(value: unknown): T | null => {
			if (Array.isArray(value)) {
				const firstRow = value[0];
				return firstRow && typeof firstRow === "object" ? (firstRow as T) : null;
			}

			return value && typeof value === "object" ? (value as T) : null;
		},
		[],
	);

	const fetchProfile = useCallback(async () => {
		// Need at least one identifier
		if (!normalizedUsername && !userId) {
			setProfile(null);
			setLoading(false);
			setError(null);
			return;
		}

		try {
			setLoading(true);
			setError(null);

			const authenticatedUserId = user?.id;
			const targetUserId = userId?.trim() || null;
			const isOwnProfileRequest =
				typeof authenticatedUserId === "string" &&
				targetUserId === authenticatedUserId;

			if (isOwnProfileRequest) {
				const [profileRpcResult, schedulerResult] = await Promise.all([
					supabase.rpc("get_my_profile_v1"),
					supabase
						.from("scheduler_profiles")
						.select("desired_retention,max_daily_new,timezone")
						.eq("user_id", authenticatedUserId)
						.maybeSingle(),
				]);

				if (profileRpcResult.error) {
					setError(profileRpcResult.error.message);
					setProfile(null);
					return;
				}

				if (schedulerResult.error) {
					console.error("Error fetching scheduler profile:", schedulerResult.error);
				}

				if (!profileRpcResult.data) {
					setError(null);
					setProfile(null);
					return;
				}

				const nextProfile = mapCanonicalProfileToUserProfile(
					profileRpcResult.data,
					schedulerResult.data,
				);
				setProfile(nextProfile);
				setError(null);
				return;
			}

			const { data, error: fetchError } = userId
				? await supabase.rpc("get_profile_by_user_id_v1", {
						p_target_user_id: userId,
					})
				: await supabase.rpc("get_profile_by_username_v1", {
						p_username: normalizedUsername,
					});

			if (fetchError) {
				console.error("Error fetching profile:", fetchError);
				setError(fetchError.message);
				setProfile(null);
			} else {
				// Gracefully handle not found - return null profile, no throw
				const profileRow = normalizeSingleRpcRow<{
					user_id: string;
					username: string | null;
					display_name: string | null;
					avatar_url: string | null;
					bio: string | null;
					created_at: string;
					updated_at: string;
					username_change_count?: number;
					username_changed_at?: string | null;
				}>(data);
				const nextProfile = profileRow
					? mapCanonicalProfileToUserProfile(profileRow, null)
					: null;
				setProfile(nextProfile);
				setError(null);

				const authenticatedUserId = user?.id;
				const hasSchedulerTimezoneField =
					nextProfile !== null &&
					Object.hasOwn(nextProfile, "scheduler_timezone");
				const currentTimezone = normalizeSchedulerTimezone(
					nextProfile?.scheduler_timezone,
				).toUpperCase();

				const shouldAutoSetTimezone =
					hasSchedulerTimezoneField &&
					nextProfile !== null &&
					typeof authenticatedUserId === "string" &&
					nextProfile.user_id === authenticatedUserId &&
					(currentTimezone === "" || currentTimezone === "UTC") &&
					!schedulerTimezoneAutoSetDone.has(authenticatedUserId) &&
					!schedulerTimezoneAutoSetInFlight.has(authenticatedUserId);

				if (shouldAutoSetTimezone) {
					const browserTimezone = resolveBrowserTimeZone();
					const normalizedBrowserTimezone =
						normalizeSchedulerTimezone(browserTimezone);

					if (
						normalizedBrowserTimezone.length > 0 &&
						normalizedBrowserTimezone.toUpperCase() !== "UTC"
					) {
						schedulerTimezoneAutoSetInFlight.add(authenticatedUserId);

						try {
							const nowIso = new Date().toISOString();
							const { error: timezoneUpdateError } = await supabase
								.from("profiles")
								.update({
									scheduler_timezone: normalizedBrowserTimezone,
									updated_at: nowIso,
								})
								.eq("user_id", authenticatedUserId)
								.in("scheduler_timezone", ["UTC", ""]);

							if (timezoneUpdateError) {
								console.error(
									"Error auto-setting scheduler timezone:",
									timezoneUpdateError,
								);
							} else {
								schedulerTimezoneAutoSetDone.add(authenticatedUserId);
								setProfile((prev) =>
									prev?.user_id === authenticatedUserId
										? {
												...prev,
												scheduler_timezone: normalizedBrowserTimezone,
												updated_at: nowIso,
											}
										: prev,
								);
							}
						} finally {
							schedulerTimezoneAutoSetInFlight.delete(authenticatedUserId);
						}
					}
				}
			}
		} catch (err) {
			console.error("Error:", err);
			setError(err instanceof Error ? err.message : "Failed to fetch profile");
			setProfile(null);
		} finally {
			setLoading(false);
		}
	}, [mapCanonicalProfileToUserProfile, normalizeSingleRpcRow, normalizedUsername, userId, user?.id]);

	useEffect(() => {
		if (!authLoading) {
			fetchProfile();
		}
	}, [authLoading, fetchProfile]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const handleProfileUpdated = (event: Event) => {
			const detail = (event as CustomEvent<ProfileUpdatedDetail>).detail;
			if (
				!doesProfileUpdateMatchTarget({
					detail,
					targetUserId: userId,
					targetUsername: normalizedUsername,
					currentUserId: profile?.user_id,
					currentUsername: profile?.username,
				})
			) {
				return;
			}

			if (detail.patch && profile) {
				const patch = detail.patch;
				setProfile((currentProfile) => {
					if (!currentProfile) {
						return currentProfile;
					}

					return {
						...currentProfile,
						...patch,
						username:
							patch.username ?? detail.username ?? currentProfile.username,
					};
				});
				setError(null);
				setLoading(false);
				return;
			}

			void fetchProfile();
		};

		window.addEventListener(
			PROFILE_UPDATED_EVENT,
			handleProfileUpdated as EventListener,
		);

		return () => {
			window.removeEventListener(
				PROFILE_UPDATED_EVENT,
				handleProfileUpdated as EventListener,
			);
		};
	}, [fetchProfile, normalizedUsername, profile, userId]);

	// Calculate isOwnProfile by comparing with useAuth().user.id
	const isOwnProfile =
		user?.id !== undefined &&
		profile?.user_id !== null &&
		user?.id === profile?.user_id;

	// Update profile name
	const updateName = useCallback(
		async (firstName: string, lastName: string) => {
			if (!user?.id) {
				throw new Error("User not authenticated");
			}

			const updatedAt = new Date().toISOString();

			const displayName = [firstName.trim(), lastName.trim()]
				.filter((value) => value.length > 0)
				.join(" ");

			const { error: updateError } = await supabase.rpc("upsert_my_profile_v1", {
				p_display_name: displayName.length > 0 ? displayName : null,
			});

			if (updateError) {
				throw updateError;
			}

			// Update local state directly without refetching
			setProfile((prev) =>
				prev
					? {
							...prev,
							first_name: firstName,
							last_name: lastName,
							updated_at: updatedAt,
						}
					: null,
			);

			dispatchProfileUpdated({
				userId: user.id,
				username: profile?.username,
				patch: {
					first_name: firstName,
					last_name: lastName,
					updated_at: updatedAt,
				},
			});
		},
		[profile?.username, user?.id],
	);

	// Update profile fields (bio, motto, location)
	const updateProfile = useCallback(
		async (data: {
			bio?: string;
			motto?: string;
			location?: string;
			fsrs_target_retention?: number;
			new_cards_per_day?: number;
			avatar_url?: string;
		}) => {
			if (!user?.id) {
				throw new Error("User not authenticated");
			}

			const updatedAt = new Date().toISOString();

			const normalizedData: {
				bio?: string;
				motto?: string;
				location?: string;
				fsrs_target_retention?: number;
				new_cards_per_day?: number;
				avatar_url?: string;
			} = {};

			if (typeof data.bio === "string") {
				normalizedData.bio = data.bio;
			}

			if (typeof data.motto === "string") {
				normalizedData.motto = data.motto;
			}

			if (typeof data.location === "string") {
				const normalizedLocation = data.location.trim();
				if (normalizedLocation.length > 0) {
					normalizedData.location = normalizedLocation;
				}
			}

			if (typeof data.fsrs_target_retention === "number") {
				const roundedRetention = Number(data.fsrs_target_retention.toFixed(2));
				normalizedData.fsrs_target_retention = Math.min(
					0.97,
					Math.max(0.7, roundedRetention),
				);
			}

			if (typeof data.new_cards_per_day === "number") {
				normalizedData.new_cards_per_day = clampProfileNewCardsPerDay(
					data.new_cards_per_day,
				);
			}

			if (typeof data.avatar_url === "string") {
				const normalizedAvatarUrl = data.avatar_url.trim();
				if (normalizedAvatarUrl.length > 0) {
					normalizedData.avatar_url = normalizedAvatarUrl;
				}
			}

			const { error: profileUpdateError } = await supabase.rpc(
				"upsert_my_profile_v1",
				{
					p_bio: normalizedData.bio,
					p_avatar_url: normalizedData.avatar_url,
				},
			);

			if (profileUpdateError) {
				throw profileUpdateError;
			}

			if (
				typeof normalizedData.fsrs_target_retention === "number" ||
				typeof normalizedData.new_cards_per_day === "number"
			) {
				const { error: schedulerUpdateError } = await supabase
					.from("profiles")
					.update({
						fsrs_target_retention:
							normalizedData.fsrs_target_retention ??
							profile?.fsrs_target_retention ??
							0.9,
						new_cards_per_day:
							normalizedData.new_cards_per_day ?? profile?.new_cards_per_day ?? 20,
						updated_at: updatedAt,
					})
					.eq("user_id", user.id);

				if (schedulerUpdateError) {
					throw schedulerUpdateError;
				}
			}

			if (typeof normalizedData.location === "string") {
				console.warn("Profile location is not persisted in baseline v1 schema.");
			}

			if (typeof normalizedData.motto === "string") {
				console.warn("Profile motto is not persisted in baseline v1 schema.");
			}

			// Update local state directly without refetching
			setProfile((prev) =>
				prev
					? {
							...prev,
							...normalizedData,
							updated_at: updatedAt,
						}
					: null,
			);

			dispatchProfileUpdated({
				userId: user.id,
				username: profile?.username,
				patch: {
					...normalizedData,
					updated_at: updatedAt,
				},
			});
		},
		[
			profile?.fsrs_target_retention,
			profile?.new_cards_per_day,
			profile?.username,
			user?.id,
		],
	);

	const changeUsername = useCallback(
		async (nextUsername: string) => {
			if (!user?.id) {
				throw new Error("User not authenticated");
			}

			const candidate = nextUsername.trim().toLowerCase();
			const { data, error: changeError } = await supabase.rpc(
				"change_my_username_v1",
				{
					p_username: candidate,
				},
			);

			if (changeError) {
				throw changeError;
			}

			if (!data) {
				return;
			}

			setProfile((prev) =>
				prev
					? {
							...prev,
							username: data.username,
							updated_at: data.updated_at,
							username_change_count: data.username_change_count ?? 1,
							username_changed_at: data.username_changed_at ?? new Date().toISOString(),
						}
					: prev,
			);

			dispatchProfileUpdated({
				userId: user.id,
				username: data.username,
				patch: {
					username: data.username,
					updated_at: data.updated_at,
				},
			});
		},
		[user?.id],
	);

	return {
		profile,
		loading: authLoading || loading,
		error,
		isOwnProfile,
		refetch: fetchProfile,
		updateName,
		changeUsername,
		updateProfile,
	};
};
