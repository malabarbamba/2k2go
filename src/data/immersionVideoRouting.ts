import { IMMERSION_LOCAL_SHORT_CATALOG } from "@/data/immersionLocalShortCatalog";
import type { Video } from "@/interfaces/video";

export interface ImmersionPlaybackPathOptions {
	autoplay?: boolean;
	t?: number | null;
}

export interface CollectedCardSourceLinkInput {
	sourceVideoId?: string | null;
	sourceVideoRouteId?: string | null;
	sourceVideoYoutubeId?: string | null;
	sourceVideoIsShort?: boolean | null;
	sourceWordStartSeconds?: number | null;
}

const normalizeOptionalString = (
	value: string | null | undefined,
): string | null => {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const CURATED_SHORT_ROUTE_ID_BY_YOUTUBE_ID = new Map(
	IMMERSION_LOCAL_SHORT_CATALOG.map((video) => {
		const youtubeId = normalizeOptionalString(video.youtubeId);
		const routeVideoId = normalizeOptionalString(video.videoId);
		return youtubeId && routeVideoId ? [youtubeId, routeVideoId] : null;
	}).filter((entry): entry is [string, string] => entry !== null),
);

const CURATED_SHORT_ROUTE_IDS = new Set(
	IMMERSION_LOCAL_SHORT_CATALOG.map((video) =>
		normalizeOptionalString(video.videoId),
	).filter((value): value is string => value !== null),
);

const resolveCollectedShortRouteId = (
	input: CollectedCardSourceLinkInput,
): string | null => {
	const explicitRouteId = normalizeOptionalString(input.sourceVideoRouteId);
	if (explicitRouteId) {
		return explicitRouteId;
	}

	const rawSourceVideoId = normalizeOptionalString(input.sourceVideoId);
	if (rawSourceVideoId && CURATED_SHORT_ROUTE_IDS.has(rawSourceVideoId)) {
		return rawSourceVideoId;
	}

	const youtubeId = normalizeOptionalString(input.sourceVideoYoutubeId);
	if (youtubeId) {
		const curatedRouteId = CURATED_SHORT_ROUTE_ID_BY_YOUTUBE_ID.get(youtubeId);
		if (curatedRouteId) {
			return curatedRouteId;
		}
	}

	return null;
};

const normalizePlaybackTimestamp = (
	value: number | null | undefined,
): number | null => {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		return null;
	}

	return Number(value.toFixed(3));
};

const buildPlaybackQueryString = (
	options?: ImmersionPlaybackPathOptions,
): string => {
	const params = new URLSearchParams();
	if (options?.autoplay) {
		params.set("autoplay", "1");
	}

	const playbackTimestamp = normalizePlaybackTimestamp(options?.t);
	if (playbackTimestamp !== null) {
		params.set("t", String(playbackTimestamp));
	}

	const query = params.toString();
	return query.length > 0 ? `?${query}` : "";
};

export const parseImmersionPlaybackTimestamp = (
	value: string | null | undefined,
): number | null => {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return null;
	}

	return normalizePlaybackTimestamp(Number(trimmed));
};

export const buildImmersionShortPath = (
	videoId: string,
	options?: ImmersionPlaybackPathOptions,
): string => {
	const normalizedVideoId = videoId.trim();
	const basePath = `/app-legacy/immersion/shorts/${encodeURIComponent(normalizedVideoId)}`;
	return `${basePath}${buildPlaybackQueryString(options)}`;
};

export const buildImmersionVideoPath = (
	video: Pick<Video, "videoId" | "youtubeId">,
	options?: ImmersionPlaybackPathOptions,
): string => {
	const normalizedYoutubeId =
		typeof video.youtubeId === "string" ? video.youtubeId.trim() : "";
	const normalizedVideoId = video.videoId.trim();
	const routeIdentifier = normalizedYoutubeId || normalizedVideoId;
	const basePath = `/app-legacy/immersion/video/${encodeURIComponent(routeIdentifier)}`;
	return `${basePath}${buildPlaybackQueryString(options)}`;
};

export const buildCollectedCardSourceLinkPath = (
	input: CollectedCardSourceLinkInput,
): string | null => {
	const sourceVideoId = normalizeOptionalString(input.sourceVideoId);
	if (sourceVideoId === null || typeof input.sourceVideoIsShort !== "boolean") {
		return null;
	}

	const sourceWordStartSeconds = normalizePlaybackTimestamp(
		input.sourceWordStartSeconds,
	);
	if (sourceWordStartSeconds === null) {
		return null;
	}

	if (input.sourceVideoIsShort) {
		const routeVideoId = resolveCollectedShortRouteId(input);
		if (routeVideoId) {
			return buildImmersionShortPath(routeVideoId, {
				t: sourceWordStartSeconds,
			});
		}

		return buildImmersionVideoPath(
			{
				videoId: sourceVideoId,
				youtubeId:
					normalizeOptionalString(input.sourceVideoYoutubeId) ?? undefined,
			},
			{ t: sourceWordStartSeconds },
		);
	}

	return buildImmersionVideoPath(
		{ videoId: sourceVideoId, youtubeId: undefined },
		{ t: sourceWordStartSeconds },
	);
};
