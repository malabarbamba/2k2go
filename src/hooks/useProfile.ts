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
}

interface UseProfileReturn {
	profile: UserProfile | null;
	loading: boolean;
	error: string | null;
	isOwnProfile: boolean;
	refetch: () => void;
	updateName: (firstName: string, lastName: string) => Promise<void>;
	updateProfile: (data: {
		bio?: string;
		motto?: string;
		location?: string;
		fsrs_target_retention?: number;
		new_cards_per_day?: number;
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

			let query = supabase.from("profiles").select("*");

			// Query by username or userId
			if (userId) {
				query = query.eq("user_id", userId);
			} else if (normalizedUsername) {
				query = query.ilike("username", normalizedUsername);
			}

			const { data, error: fetchError } = await query.maybeSingle();

			if (fetchError) {
				console.error("Error fetching profile:", fetchError);
				setError(fetchError.message);
				setProfile(null);
			} else {
				// Gracefully handle not found - return null profile, no throw
				const nextProfile = data as UserProfile | null;
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
	}, [normalizedUsername, userId, user?.id]);

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

			const { error: updateError } = await supabase
				.from("profiles")
				.update({
					first_name: firstName,
					last_name: lastName,
					updated_at: updatedAt,
				})
				.eq("user_id", user.id);

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

			const { error: updateError } = await supabase
				.from("profiles")
				.update({
					...normalizedData,
					updated_at: updatedAt,
				})
				.eq("user_id", user.id);

			if (updateError) {
				throw updateError;
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
		[profile?.username, user?.id],
	);

	return {
		profile,
		loading: authLoading || loading,
		error,
		isOwnProfile,
		refetch: fetchProfile,
		updateName,
		updateProfile,
	};
};
