export const normalizeProfileUsername = (
	value: string | null | undefined,
): string => {
	if (typeof value !== "string") {
		return "";
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return "";
	}

	let decoded = trimmed;
	try {
		decoded = decodeURIComponent(trimmed);
	} catch {
		decoded = trimmed;
	}

	return decoded.replace(/^@+/, "").trim().toLowerCase();
};

export const resolveProfileAvatarSeed = ({
	username,
	email,
	displayName,
	userId,
	fallback = "user",
}: {
	username?: string | null;
	email?: string | null;
	displayName?: string | null;
	userId?: string | null;
	fallback?: string;
}): string => {
	const values = [displayName, username, email, userId, fallback];
	for (const value of values) {
		if (typeof value !== "string") {
			continue;
		}

		const trimmed = value.trim();
		if (trimmed.length > 0) {
			return trimmed;
		}
	}

	return "user";
};
