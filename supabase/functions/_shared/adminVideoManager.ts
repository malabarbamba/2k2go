import {
	type AdminAuthContext,
	type AuthGuardFailure,
	resolveAdminAuthFailure,
} from "./edgeAuth.ts";

export { resolveAdminAuthFailure };

export type AdminAuthFailure = AuthGuardFailure;

export const ADMIN_VIDEO_MANAGER_DEFAULT_LIMIT = 20;
export const ADMIN_VIDEO_MANAGER_MAX_LIMIT = 100;
export const ADMIN_VIDEO_MANAGER_SORT_RECENT = "recent";

export interface VideoCursor {
	createdAt: string;
	id: string;
}

export type AdminVideoType = "short" | "long";

export interface AdminVideoListQuery {
	q: string | null;
	limit: number;
	sort: typeof ADMIN_VIDEO_MANAGER_SORT_RECENT;
	cursor: VideoCursor | null;
	videoType: AdminVideoType | null;
}

export interface AdminVideoPatchPayload {
	title?: string;
	description?: string | null;
	author?: string | null;
	category?: string | null;
	level?: string | null;
	thumbnail_url?: string | null;
	video_url?: string | null;
	duration?: number | null;
	is_published?: boolean;
}

export type AdminVideoPipelineAction =
	| "subtitle_trigger"
	| "subtitle_retry"
	| "subtitle_reset"
	| "cards_trigger"
	| "cards_retry"
	| "cards_reset";

export interface AdminVideoActionPayload {
	action: AdminVideoPipelineAction;
}

export type DeleteMode = "soft" | "hard";

export interface DeleteContractDecision {
	mode: DeleteMode;
	confirmHardDelete: boolean;
}

export interface ContractFailure {
	status: number;
	error: string;
}

export interface AdminAuditMutationRunner {
	writeAudit: () => Promise<void>;
	writeMutation: () => Promise<void>;
}

function parseInteger(raw: string | null): number | null {
	if (!raw) {
		return null;
	}

	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed)) {
		return null;
	}
	return parsed;
}

function normalizeBoolean(value: unknown): boolean | null {
	if (typeof value === "boolean") {
		return value;
	}
	if (typeof value === "string") {
		if (value === "true" || value === "1" || value === "oui") {
			return true;
		}
		if (value === "false" || value === "0" || value === "non") {
			return false;
		}
	}
	return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasNonEmptyCueList(payload: unknown): boolean {
	if (Array.isArray(payload)) {
		return payload.length > 0;
	}

	if (!payload || typeof payload !== "object") {
		return false;
	}

	const canonicalPayload = payload as { cues?: unknown };
	return (
		Array.isArray(canonicalPayload.cues) && canonicalPayload.cues.length > 0
	);
}

export function canTriggerCardsFromVideoState(video: {
	transcription_status?: unknown;
	subtitles_generated?: unknown;
	subtitles_ar?: unknown;
	subtitles_fr?: unknown;
}): boolean {
	return (
		video.transcription_status === "ready" &&
		video.subtitles_generated === true &&
		hasNonEmptyCueList(video.subtitles_ar) &&
		hasNonEmptyCueList(video.subtitles_fr)
	);
}

export function isAlreadyInProgress(status: unknown): boolean {
	return status === "pending" || status === "processing";
}

export function buildVideoCursor(value: VideoCursor): string {
	return btoa(JSON.stringify({ created_at: value.createdAt, id: value.id }));
}

function decodeVideoCursor(rawCursor: string): VideoCursor | null {
	try {
		const decoded = atob(rawCursor);
		const parsed = JSON.parse(decoded) as {
			created_at?: unknown;
			id?: unknown;
		};
		if (
			typeof parsed.created_at !== "string" ||
			typeof parsed.id !== "string"
		) {
			return null;
		}

		if (!parsed.created_at || !parsed.id) {
			return null;
		}

		const parsedDate = new Date(parsed.created_at);
		if (Number.isNaN(parsedDate.getTime())) {
			return null;
		}

		return {
			createdAt: parsedDate.toISOString(),
			id: parsed.id,
		};
	} catch {
		return null;
	}
}

export function parseAdminVideoListQuery(
	url: URL,
): AdminVideoListQuery | ContractFailure {
	const qValue = url.searchParams.get("q");
	const q = qValue ? qValue.trim() : null;

	const rawVideoType = url.searchParams.get("video_type")?.trim();
	let videoType: AdminVideoType | null = null;
	if (rawVideoType) {
		if (rawVideoType === "short" || rawVideoType === "long") {
			videoType = rawVideoType;
		} else {
			return {
				status: 400,
				error:
					"Parametre 'video_type' invalide. Valeurs autorisees: short, long.",
			};
		}
	}

	const sortValue = (
		url.searchParams.get("sort") || ADMIN_VIDEO_MANAGER_SORT_RECENT
	).trim();
	if (sortValue !== ADMIN_VIDEO_MANAGER_SORT_RECENT) {
		return {
			status: 400,
			error: "Parametre 'sort' invalide. Valeur attendue: recent.",
		};
	}

	const requestedLimit =
		parseInteger(url.searchParams.get("limit")) ??
		ADMIN_VIDEO_MANAGER_DEFAULT_LIMIT;
	if (requestedLimit < 1 || requestedLimit > ADMIN_VIDEO_MANAGER_MAX_LIMIT) {
		return {
			status: 400,
			error: `Parametre 'limit' invalide. Valeur autorisee: 1-${ADMIN_VIDEO_MANAGER_MAX_LIMIT}.`,
		};
	}

	const rawCursor = url.searchParams.get("cursor");
	const cursor = rawCursor ? decodeVideoCursor(rawCursor) : null;
	if (rawCursor && !cursor) {
		return {
			status: 400,
			error: "Cursor invalide.",
		};
	}

	return {
		q,
		limit: requestedLimit,
		sort: ADMIN_VIDEO_MANAGER_SORT_RECENT,
		cursor,
		videoType,
	};
}

function normalizeNullableString(value: unknown): string | null | undefined {
	if (typeof value === "undefined") {
		return undefined;
	}

	if (value === null) {
		return null;
	}

	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length ? trimmed : null;
}

export function parseAdminVideoPatchPayload(
	payload: unknown,
): AdminVideoPatchPayload | ContractFailure {
	if (!isObject(payload)) {
		return {
			status: 400,
			error: "Payload JSON invalide.",
		};
	}

	const keys = Object.keys(payload);
	if (keys.length === 0) {
		return {
			status: 400,
			error: "Au moins un champ a modifier est requis.",
		};
	}

	const allowedKeys = new Set([
		"title",
		"description",
		"author",
		"category",
		"level",
		"thumbnail_url",
		"video_url",
		"duration",
		"is_published",
	]);

	const invalidKeys = keys.filter((key) => !allowedKeys.has(key));
	if (invalidKeys.length) {
		return {
			status: 400,
			error: `Champs non autorises: ${invalidKeys.join(", ")}.`,
		};
	}

	const patch: AdminVideoPatchPayload = {};

	if (typeof payload.is_published !== "undefined") {
		if (typeof payload.is_published !== "boolean") {
			return {
				status: 400,
				error: "Le champ 'is_published' doit etre un booleen explicite.",
			};
		}
		patch.is_published = payload.is_published;
	}

	if (typeof payload.title !== "undefined") {
		if (typeof payload.title !== "string") {
			return {
				status: 400,
				error: "Le champ 'title' doit etre une chaine.",
			};
		}

		const trimmedTitle = payload.title.trim();
		if (!trimmedTitle.length) {
			return {
				status: 400,
				error: "Le champ 'title' ne peut pas etre vide.",
			};
		}

		patch.title = trimmedTitle;
	}

	const nullableStringFields: Array<
		keyof Pick<
			AdminVideoPatchPayload,
			| "description"
			| "author"
			| "category"
			| "level"
			| "thumbnail_url"
			| "video_url"
		>
	> = [
		"description",
		"author",
		"category",
		"level",
		"thumbnail_url",
		"video_url",
	];

	for (const field of nullableStringFields) {
		if (typeof payload[field] === "undefined") {
			continue;
		}

		const normalized = normalizeNullableString(payload[field]);
		if (typeof normalized === "undefined") {
			return {
				status: 400,
				error: `Le champ '${field}' doit etre une chaine ou null.`,
			};
		}

		patch[field] = normalized;
	}

	if (typeof payload.duration !== "undefined") {
		if (payload.duration === null) {
			patch.duration = null;
		} else if (
			typeof payload.duration === "number" &&
			Number.isFinite(payload.duration) &&
			payload.duration >= 0
		) {
			patch.duration = Math.floor(payload.duration);
		} else {
			return {
				status: 400,
				error: "Le champ 'duration' doit etre un nombre positif ou null.",
			};
		}
	}

	if (!Object.keys(patch).length) {
		return {
			status: 400,
			error: "Au moins un champ valide est requis.",
		};
	}

	return patch;
}

export function parseAdminVideoActionPayload(
	payload: unknown,
): AdminVideoActionPayload | ContractFailure {
	if (!isObject(payload)) {
		return {
			status: 400,
			error: "Payload JSON invalide.",
		};
	}

	const keys = Object.keys(payload);
	if (keys.length !== 1 || keys[0] !== "action") {
		return {
			status: 400,
			error:
				"Le payload d'action admin doit contenir uniquement le champ 'action'.",
		};
	}

	if (typeof payload.action !== "string") {
		return {
			status: 400,
			error: "Le champ 'action' doit etre une chaine.",
		};
	}

	const action = payload.action.trim() as AdminVideoPipelineAction;
	const allowedActions = new Set<AdminVideoPipelineAction>([
		"subtitle_trigger",
		"subtitle_retry",
		"subtitle_reset",
		"cards_trigger",
		"cards_retry",
		"cards_reset",
	]);

	if (!allowedActions.has(action)) {
		return {
			status: 400,
			error:
				"Action admin invalide. Valeurs autorisees: subtitle_trigger, subtitle_retry, subtitle_reset, cards_trigger, cards_retry, cards_reset.",
		};
	}

	return { action };
}

export function resolveDeleteContract(
	url: URL,
	payload: unknown,
): DeleteContractDecision | ContractFailure {
	const payloadObject = isObject(payload) ? payload : {};

	const permanentFromQuery = normalizeBoolean(
		url.searchParams.get("permanent"),
	);
	const permanentFromBody = normalizeBoolean(payloadObject.permanent);
	const permanent = permanentFromBody ?? permanentFromQuery ?? false;

	const confirmFromQuery = normalizeBoolean(url.searchParams.get("confirm"));
	const confirmFromBody = normalizeBoolean(payloadObject.confirm);
	const confirmHardDelete = confirmFromBody ?? confirmFromQuery ?? false;

	if (permanent && !confirmHardDelete) {
		return {
			status: 400,
			error: "Suppression permanente non confirmee. Ajoutez confirm=true.",
		};
	}

	return {
		mode: permanent ? "hard" : "soft",
		confirmHardDelete,
	};
}

export function resolveAdminVideoResourceId(
	url: URL,
	functionName: string,
): string | null {
	const byQuery = url.searchParams.get("id")?.trim();
	if (byQuery) {
		return byQuery;
	}

	const marker = `/functions/v1/${functionName}`;
	const index = url.pathname.indexOf(marker);
	if (index < 0) {
		return null;
	}

	const suffix = url.pathname.slice(index + marker.length);
	const id = suffix.replace(/^\/+/, "").split("/")[0]?.trim();
	return id || null;
}

export function resolveAdminVideoAuthFailure(
	context: AdminAuthContext,
): AdminAuthFailure | null {
	return resolveAdminAuthFailure(context);
}

export async function runAdminMutationWithBlockingAudit(
	runner: AdminAuditMutationRunner,
): Promise<void> {
	await runner.writeAudit();
	await runner.writeMutation();
}
