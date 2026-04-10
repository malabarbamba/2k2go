export const SUGGESTION_SCREENSHOT_BUCKET = "suggestion-screenshots";
export const SUGGESTION_SCREENSHOT_RETENTION_DAYS = 10;

const STORAGE_REF_PREFIX = "storage://";

export type SuggestionScreenshotObjectRef = {
	bucketId: string;
	objectPath: string;
};

const normalizeObjectPath = (value: string): string =>
	value.replace(/^\/+/, "").trim();

const decodePathSegment = (value: string): string => {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
};

const parseStorageRef = (
	rawReference: string,
): SuggestionScreenshotObjectRef | null => {
	if (!rawReference.startsWith(STORAGE_REF_PREFIX)) {
		return null;
	}

	const withoutPrefix = rawReference.slice(STORAGE_REF_PREFIX.length);
	const slashIndex = withoutPrefix.indexOf("/");
	if (slashIndex <= 0) {
		return null;
	}

	const bucketId = withoutPrefix.slice(0, slashIndex).trim();
	const objectPath = normalizeObjectPath(withoutPrefix.slice(slashIndex + 1));

	if (!bucketId || !objectPath) {
		return null;
	}

	return { bucketId, objectPath };
};

const parseSupabaseStorageUrl = (
	rawReference: string,
): SuggestionScreenshotObjectRef | null => {
	try {
		const url = new URL(rawReference);
		const segments = url.pathname.split("/").filter(Boolean);
		const objectIndex = segments.findIndex((segment) => segment === "object");

		if (objectIndex < 0) {
			return null;
		}

		const mode = segments[objectIndex + 1];
		if (mode !== "public" && mode !== "authenticated" && mode !== "sign") {
			return null;
		}

		const bucketId = decodePathSegment(segments[objectIndex + 2] ?? "").trim();
		const objectPath = normalizeObjectPath(
			segments
				.slice(objectIndex + 3)
				.map((segment) => decodePathSegment(segment))
				.join("/"),
		);

		if (!bucketId || !objectPath) {
			return null;
		}

		return { bucketId, objectPath };
	} catch {
		return null;
	}
};

const parseDefaultBucketPath = (
	rawReference: string,
): SuggestionScreenshotObjectRef | null => {
	const trimmed = rawReference.trim();
	if (!trimmed) {
		return null;
	}

	if (trimmed.startsWith(`${SUGGESTION_SCREENSHOT_BUCKET}/`)) {
		const objectPath = normalizeObjectPath(
			trimmed.slice(SUGGESTION_SCREENSHOT_BUCKET.length + 1),
		);
		if (!objectPath) {
			return null;
		}

		return {
			bucketId: SUGGESTION_SCREENSHOT_BUCKET,
			objectPath,
		};
	}

	if (trimmed.includes("/")) {
		return {
			bucketId: SUGGESTION_SCREENSHOT_BUCKET,
			objectPath: normalizeObjectPath(trimmed),
		};
	}

	return null;
};

export const parseSuggestionScreenshotObjectRef = (
	rawReference: string,
): SuggestionScreenshotObjectRef | null => {
	const trimmed = rawReference.trim();
	if (!trimmed) {
		return null;
	}

	return (
		parseStorageRef(trimmed) ??
		parseSupabaseStorageUrl(trimmed) ??
		parseDefaultBucketPath(trimmed)
	);
};
