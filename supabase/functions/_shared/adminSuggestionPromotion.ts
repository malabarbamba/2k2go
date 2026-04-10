import {
	type AdminAuthContext,
	type AuthGuardFailure,
	resolveAdminAuthFailure,
} from "./edgeAuth.ts";

export { resolveAdminAuthFailure };

export type AdminAuthFailure = AuthGuardFailure;

export interface ContractFailure {
	status: number;
	error: string;
}

export interface AdminAuditMutationRunner {
	writeAudit: () => Promise<void>;
	writeMutation: () => Promise<void>;
}

export interface CreateSuggestionPayload {
	theme: SuggestionTheme;
	message: string;
	screenshot_url: string | null;
	user_id: string | null;
	status: SuggestionStatus;
}

export interface PromoteSuggestionPayload {
	suggestion_id: string | null;
	title: string | null;
	details: string | null;
	status: DevelopmentPlanItemStatus;
	sort_order: number | null;
	allow_duplicate: boolean;
}

export interface SuggestionDuplicatePolicyInput {
	hasActivePlanItem: boolean;
	allowDuplicate: boolean;
}

export type SuggestionTheme =
	| "methode"
	| "anki"
	| "immersion"
	| "site"
	| "autre";
export type SuggestionStatus = "non_traitee" | "en_cours" | "validee";
export type DevelopmentPlanItemStatus = "todo" | "in_progress" | "done";

export const ACTIVE_DEVELOPMENT_PLAN_ITEM_STATUSES = [
	"todo",
	"in_progress",
] as const;

const SUGGESTION_THEMES = [
	"methode",
	"anki",
	"immersion",
	"site",
	"autre",
] as const;
const SUGGESTION_STATUSES = ["non_traitee", "en_cours", "validee"] as const;
const DEVELOPMENT_PLAN_ITEM_STATUSES = ["todo", "in_progress", "done"] as const;

function isObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
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

function normalizeInteger(value: unknown): number | null {
	if (typeof value === "number" && Number.isInteger(value)) {
		return value;
	}
	if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
		const parsed = Number.parseInt(value, 10);
		return Number.isInteger(parsed) ? parsed : null;
	}
	return null;
}

export function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
		value,
	);
}

export function parseCreateSuggestionPayload(
	payload: unknown,
): CreateSuggestionPayload | ContractFailure {
	if (!isObject(payload)) {
		return {
			status: 400,
			error: "Payload JSON invalide.",
		};
	}

	if (
		typeof payload.theme !== "string" ||
		!(SUGGESTION_THEMES as readonly string[]).includes(payload.theme)
	) {
		return {
			status: 400,
			error: "Le champ 'theme' est invalide.",
		};
	}

	if (
		typeof payload.message !== "string" ||
		payload.message.trim().length < 5 ||
		payload.message.trim().length > 700
	) {
		return {
			status: 400,
			error: "Le champ 'message' doit contenir entre 5 et 700 caracteres.",
		};
	}

	if (
		payload.screenshot_url !== undefined &&
		payload.screenshot_url !== null &&
		typeof payload.screenshot_url !== "string"
	) {
		return {
			status: 400,
			error: "Le champ 'screenshot_url' est invalide.",
		};
	}

	const userId = payload.user_id;
	if (userId !== undefined && userId !== null) {
		if (typeof userId !== "string" || !isUuid(userId)) {
			return {
				status: 400,
				error: "Le champ 'user_id' est invalide.",
			};
		}
	}

	const status = payload.status === undefined ? "non_traitee" : payload.status;
	if (
		typeof status !== "string" ||
		!(SUGGESTION_STATUSES as readonly string[]).includes(status)
	) {
		return {
			status: 400,
			error: "Le champ 'status' est invalide.",
		};
	}

	return {
		theme: payload.theme,
		message: payload.message.trim(),
		screenshot_url:
			typeof payload.screenshot_url === "string"
				? payload.screenshot_url.trim() || null
				: null,
		user_id: typeof userId === "string" ? userId : null,
		status,
	};
}

export function parsePromoteSuggestionPayload(
	payload: unknown,
): PromoteSuggestionPayload | ContractFailure {
	if (!isObject(payload)) {
		return {
			status: 400,
			error: "Payload JSON invalide.",
		};
	}

	const suggestionId = payload.suggestion_id;
	if (suggestionId !== undefined && suggestionId !== null) {
		if (typeof suggestionId !== "string" || !isUuid(suggestionId)) {
			return {
				status: 400,
				error: "Le champ 'suggestion_id' est invalide.",
			};
		}
	}

	if (
		payload.title !== undefined &&
		payload.title !== null &&
		typeof payload.title !== "string"
	) {
		return {
			status: 400,
			error: "Le champ 'title' est invalide.",
		};
	}

	if (
		payload.details !== undefined &&
		payload.details !== null &&
		typeof payload.details !== "string"
	) {
		return {
			status: 400,
			error: "Le champ 'details' est invalide.",
		};
	}

	const status = payload.status === undefined ? "todo" : payload.status;
	if (
		typeof status !== "string" ||
		!(DEVELOPMENT_PLAN_ITEM_STATUSES as readonly string[]).includes(status)
	) {
		return {
			status: 400,
			error: "Le champ 'status' est invalide.",
		};
	}

	const sortOrder =
		payload.sort_order === undefined
			? null
			: normalizeInteger(payload.sort_order);
	if (payload.sort_order !== undefined && sortOrder === null) {
		return {
			status: 400,
			error: "Le champ 'sort_order' doit etre un entier.",
		};
	}

	const allowDuplicateRaw = payload.allow_duplicate;
	if (
		allowDuplicateRaw !== undefined &&
		typeof allowDuplicateRaw !== "boolean"
	) {
		return {
			status: 400,
			error: "Le champ 'allow_duplicate' doit etre un booleen explicite.",
		};
	}

	const allowDuplicate = normalizeBoolean(allowDuplicateRaw) ?? false;

	return {
		suggestion_id: typeof suggestionId === "string" ? suggestionId : null,
		title:
			typeof payload.title === "string" ? payload.title.trim() || null : null,
		details:
			typeof payload.details === "string"
				? payload.details.trim() || null
				: null,
		status,
		sort_order: sortOrder,
		allow_duplicate: allowDuplicate,
	};
}

export function resolveSuggestionResourceId(
	url: URL,
	functionName: string,
): string | null {
	const byQuery =
		url.searchParams.get("suggestion_id")?.trim() ||
		url.searchParams.get("id")?.trim();
	if (byQuery) {
		return byQuery;
	}

	const marker = `/functions/v1/${functionName}`;
	const index = url.pathname.indexOf(marker);
	if (index < 0) {
		return null;
	}

	const suffix = url.pathname.slice(index + marker.length);
	const suggestionId = suffix.replace(/^\/+/, "").split("/")[0]?.trim();
	return suggestionId || null;
}

export function resolveSuggestionPromotionDuplicateFailure(
	input: SuggestionDuplicatePolicyInput,
): ContractFailure | null {
	if (input.hasActivePlanItem && !input.allowDuplicate) {
		return {
			status: 409,
			error:
				"Promotion bloquee: un item actif existe deja pour cette suggestion.",
		};
	}

	return null;
}

export function buildDevelopmentPlanItemKey(
	suggestionId: string,
	duplicateIndex: number,
): string {
	const sanitizedSuggestionId = suggestionId
		.replace(/[^a-zA-Z0-9]/g, "")
		.toLowerCase()
		.slice(0, 24);
	const suffix = `${Date.now()}${Math.max(0, duplicateIndex)}`;
	return `suggestion-${sanitizedSuggestionId || "item"}-${suffix}`;
}

export async function runAdminMutationWithBlockingAudit(
	runner: AdminAuditMutationRunner,
): Promise<void> {
	await runner.writeAudit();
	await runner.writeMutation();
}
