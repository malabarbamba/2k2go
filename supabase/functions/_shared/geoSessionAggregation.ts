const REGION_UNKNOWN_LABEL = "Region non renseignee";

type GeoAggregationResult = {
	countryCounts: Map<string, number>;
	regionCounts: Map<string, number>;
};

const normalizeTextField = (value: unknown): string => {
	if (typeof value !== "string") {
		return "";
	}

	return value.trim();
};

const incrementCount = (map: Map<string, number>, key: string): void => {
	map.set(key, (map.get(key) ?? 0) + 1);
};

export function aggregateTrackedGeoSessions(
	sessions: readonly unknown[],
	trackedSessionIds: ReadonlySet<string>,
): GeoAggregationResult {
	const countryCounts = new Map<string, number>();
	const regionCounts = new Map<string, number>();

	for (const rawSession of sessions) {
		if (!rawSession || typeof rawSession !== "object") {
			continue;
		}

		const session = rawSession as Record<string, unknown>;
		const sessionId = normalizeTextField(session.id);
		if (!sessionId || !trackedSessionIds.has(sessionId)) {
			continue;
		}

		const country = normalizeTextField(session.country);
		if (!country) {
			continue;
		}

		const region =
			normalizeTextField(session.region) ||
			normalizeTextField(session.city) ||
			REGION_UNKNOWN_LABEL;

		incrementCount(countryCounts, country);
		incrementCount(regionCounts, `${country}@@${region}`);
	}

	return {
		countryCounts,
		regionCounts,
	};
}
