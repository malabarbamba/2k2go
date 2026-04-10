export type AuthUserSnapshot = {
	id: string;
	email?: string | null;
	user_metadata?: Record<string, unknown> | null;
};

type SupabaseAdminListUsersClient = {
	auth: {
		admin: {
			listUsers: (params: { page: number; perPage: number }) => Promise<{
				data: {
					users?: Array<{
						id: string;
						email?: string | null;
						user_metadata?: Record<string, unknown> | null;
					}>;
				} | null;
				error: {
					message: string;
				} | null;
			}>;
		};
	};
};

export type OnboardingProfileSnapshot = {
	birthdate?: string | null;
	learning_level?: string | null;
	onboarding_assessment?: unknown;
};

const hasNonEmptyValue = (value: unknown): boolean => {
	if (value === null || value === undefined) return false;
	if (typeof value === "string") return value.trim().length > 0;
	if (Array.isArray(value)) return value.length > 0;
	if (typeof value === "object") {
		return Object.keys(value as Record<string, unknown>).length > 0;
	}
	return true;
};

const metadataSignalsCompletedOnboarding = (metadata: unknown): boolean => {
	if (!metadata || typeof metadata !== "object") {
		return false;
	}

	const userMetadata = metadata as Record<string, unknown>;
	const levelFromMetadata = userMetadata.learning_level ?? userMetadata.niveau;

	return (
		hasNonEmptyValue(userMetadata.birthdate) &&
		hasNonEmptyValue(levelFromMetadata) &&
		hasNonEmptyValue(userMetadata.onboarding_assessment)
	);
};

export const hasCompletedOnboarding = (
	profile: OnboardingProfileSnapshot | null,
	metadata: unknown,
): boolean => {
	if (profile) {
		const hasProfileSignals =
			hasNonEmptyValue(profile.birthdate) &&
			hasNonEmptyValue(profile.learning_level) &&
			hasNonEmptyValue(profile.onboarding_assessment);

		if (hasProfileSignals) {
			return true;
		}
	}

	return metadataSignalsCompletedOnboarding(metadata);
};

export const findAuthUserByEmail = async (
	supabaseAdmin: SupabaseAdminListUsersClient,
	normalizedEmail: string,
): Promise<AuthUserSnapshot | null> => {
	let page = 1;
	const perPage = 1000;

	while (true) {
		const { data, error } = await supabaseAdmin.auth.admin.listUsers({
			page,
			perPage,
		});

		if (error) {
			throw error;
		}

		const users = data?.users ?? [];
		const user = users.find(
			(entry) => entry.email?.toLowerCase() === normalizedEmail,
		);

		if (user) {
			return {
				id: user.id,
				email: user.email,
				user_metadata:
					typeof user.user_metadata === "object" && user.user_metadata
						? (user.user_metadata as Record<string, unknown>)
						: null,
			};
		}

		if (users.length < perPage) {
			return null;
		}

		page += 1;
	}
};
