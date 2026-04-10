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

export interface CreateAdminUserPayload {
	email: string;
	password: string;
	first_name: string | null;
	last_name: string | null;
	user_type: "apprenant" | "professeur" | "parent";
	is_admin: boolean;
}

export interface ToggleUserAdminPayload {
	is_admin: boolean;
}

export interface HardDeleteDecision {
	confirm: boolean;
}

const USER_TYPES = ["apprenant", "professeur", "parent"] as const;

function isObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function isValidEmail(value: string): boolean {
	return value.includes("@") && value.includes(".") && value.length <= 320;
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

export function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
		value,
	);
}

export function resolveAdminUserResourceId(
	url: URL,
	functionName: string,
): string | null {
	const byQuery =
		url.searchParams.get("user_id")?.trim() ||
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
	const userId = suffix.replace(/^\/+/, "").split("/")[0]?.trim();
	return userId || null;
}

export function parseCreateAdminUserPayload(
	payload: unknown,
): CreateAdminUserPayload | ContractFailure {
	if (!isObject(payload)) {
		return {
			status: 400,
			error: "Payload JSON invalide.",
		};
	}

	if (
		typeof payload.email !== "string" ||
		!isValidEmail(payload.email.trim().toLowerCase())
	) {
		return {
			status: 400,
			error: "Le champ 'email' est invalide.",
		};
	}

	if (typeof payload.password !== "string" || payload.password.length < 8) {
		return {
			status: 400,
			error: "Le champ 'password' doit contenir au moins 8 caracteres.",
		};
	}

	const firstName =
		typeof payload.first_name === "string" ? payload.first_name.trim() : null;
	const lastName =
		typeof payload.last_name === "string" ? payload.last_name.trim() : null;
	const userType =
		typeof payload.user_type === "string" ? payload.user_type : "apprenant";

	if (!(USER_TYPES as readonly string[]).includes(userType)) {
		return {
			status: 400,
			error: "Le champ 'user_type' est invalide.",
		};
	}

	const isAdmin = normalizeBoolean(payload.is_admin) ?? false;

	return {
		email: payload.email.trim().toLowerCase(),
		password: payload.password,
		first_name: firstName && firstName.length > 0 ? firstName : null,
		last_name: lastName && lastName.length > 0 ? lastName : null,
		user_type: userType,
		is_admin: isAdmin,
	};
}

export function parseToggleUserAdminPayload(
	payload: unknown,
): ToggleUserAdminPayload | ContractFailure {
	if (!isObject(payload)) {
		return {
			status: 400,
			error: "Payload JSON invalide.",
		};
	}

	const keys = Object.keys(payload);
	if (keys.length !== 1 || !keys.includes("is_admin")) {
		return {
			status: 400,
			error: "Seul le champ 'is_admin' est autorise.",
		};
	}

	if (typeof payload.is_admin !== "boolean") {
		return {
			status: 400,
			error: "Le champ 'is_admin' doit etre un booleen explicite.",
		};
	}

	return {
		is_admin: payload.is_admin,
	};
}

export function resolveSelfDemotionFailure(
	actingAdminUserId: string,
	targetUserId: string,
	nextIsAdmin: boolean,
): ContractFailure | null {
	if (actingAdminUserId === targetUserId && !nextIsAdmin) {
		return {
			status: 400,
			error: "Impossible de retirer votre propre role admin.",
		};
	}

	return null;
}

export function resolveHardDeleteContract(
	url: URL,
	payload: unknown,
): HardDeleteDecision | ContractFailure {
	const payloadObject = isObject(payload) ? payload : {};
	const confirmFromQuery = normalizeBoolean(url.searchParams.get("confirm"));
	const confirmFromBody = normalizeBoolean(payloadObject.confirm);
	const confirm = confirmFromBody ?? confirmFromQuery ?? false;

	if (!confirm) {
		return {
			status: 400,
			error: "Suppression definitive non confirmee. Ajoutez confirm=true.",
		};
	}

	return { confirm };
}

export function resolveLastAdminDeleteFailure(
	targetIsAdmin: boolean,
	adminCount: number,
): ContractFailure | null {
	if (targetIsAdmin && adminCount <= 1) {
		return {
			status: 400,
			error: "Suppression impossible: dernier administrateur restant.",
		};
	}

	return null;
}

export async function runAdminMutationWithBlockingAudit(
	runner: AdminAuditMutationRunner,
): Promise<void> {
	await runner.writeAudit();
	await runner.writeMutation();
}
