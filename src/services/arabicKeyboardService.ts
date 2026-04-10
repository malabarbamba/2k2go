import type { ClavierArabeLayoutId } from "@/data/clavierArabe/types";
import { supabase } from "@/integrations/supabase/client";

export const ARABIC_KEYBOARD_ACTION_FUNCTION = "arabic-keyboard-actions-v1";

export const ARABIC_KEYBOARD_ALLOWED_ACTIONS = [
	"translate",
	"correct",
	"arabizi",
	"tashkeel",
	"assist",
	"complete",
] as const;

export type ArabicKeyboardAction =
	(typeof ARABIC_KEYBOARD_ALLOWED_ACTIONS)[number];

export type ArabicKeyboardActionRequest = {
	action: ArabicKeyboardAction;
	text: string;
	sourceLanguage?: string;
	context?: string;
	layout?: ClavierArabeLayoutId;
};

export type ArabicKeyboardActionPreview = {
	action: ArabicKeyboardAction;
	outputText: string;
	provider: string | null;
	fallbackUsed: boolean;
	explanation: string | null;
	warnings: string[];
};

export type ArabicKeyboardServiceError = {
	code: string;
	message: string;
	status?: number;
};

export type ArabicKeyboardServiceResult =
	| { ok: true; data: ArabicKeyboardActionPreview }
	| { ok: false; error: ArabicKeyboardServiceError };

type JsonRecord = Record<string, unknown>;

type InvokeErrorDetails = {
	status?: number;
	code?: string;
	message: string;
	payload: unknown;
};

const ALLOWED_ACTION_SET = new Set<string>(ARABIC_KEYBOARD_ALLOWED_ACTIONS);
const GENERIC_ERROR_MESSAGE =
	"Le service clavier arabe est temporairement indisponible.";
const NETWORK_ERROR_MESSAGE =
	"Impossible de contacter le service clavier arabe pour le moment.";
const INVALID_ACTION_MESSAGE =
	"Cette action n'est pas disponible pour le moment.";
const TEXT_REQUIRED_MESSAGE = "Ajoute du texte avant de lancer cette action.";
const RATE_LIMITED_MESSAGE =
	"Trop de demandes pour le moment. Reessaie dans un instant.";
const ORIGIN_ERROR_MESSAGE =
	"Cette action n'est pas disponible depuis cet environnement.";
const TRANSLATION_UNAVAILABLE_MESSAGE =
	"La traduction vers l'arabe est temporairement indisponible.";
const ARABIZI_DAILY_LIMIT_REACHED_MESSAGE =
	"Tu as atteint la limite de conversions phonétiques vers l'arabe pour aujourd'hui. Reviens demain.";

function isJsonRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toTrimmedOptionalString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmedValue = value.trim();
	return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function extractPayloadMessage(payload: unknown): string | undefined {
	if (typeof payload === "string") {
		const trimmedPayload = payload.trim();
		return trimmedPayload || undefined;
	}

	if (!isJsonRecord(payload)) {
		return undefined;
	}

	for (const key of ["error", "message", "detail"] as const) {
		const candidate = payload[key];
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			return candidate.trim();
		}
	}

	return undefined;
}

function extractPayloadCode(payload: unknown): string | undefined {
	if (!isJsonRecord(payload)) {
		return undefined;
	}

	const candidate = payload.code;
	return typeof candidate === "string" && candidate.trim().length > 0
		? candidate.trim()
		: undefined;
}

function extractStatus(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (!isJsonRecord(value)) {
		return undefined;
	}

	const status = value.status;
	if (typeof status === "number" && Number.isFinite(status)) {
		return status;
	}

	if (typeof status === "string") {
		const parsedStatus = Number(status);
		return Number.isFinite(parsedStatus) ? parsedStatus : undefined;
	}

	return undefined;
}

function isTransportFailureMessage(message: string): boolean {
	const normalizedMessage = message.toLowerCase();
	return (
		normalizedMessage.includes(
			"failed to send a request to the edge function",
		) ||
		normalizedMessage.includes("failed to fetch") ||
		normalizedMessage.includes("network request failed") ||
		normalizedMessage.includes("load failed") ||
		normalizedMessage.includes("request timed out")
	);
}

async function readPayloadFromContext(context: unknown): Promise<unknown> {
	if (typeof Response === "undefined" || !(context instanceof Response)) {
		return null;
	}

	try {
		return await context.clone().json();
	} catch {
		try {
			const textPayload = await context.clone().text();
			return textPayload || null;
		} catch {
			return null;
		}
	}
}

async function extractInvokeErrorDetails(
	error: unknown,
	data: unknown,
): Promise<InvokeErrorDetails> {
	const errorRecord = isJsonRecord(error) ? error : null;
	const context = errorRecord?.context;
	const payload = data ?? (await readPayloadFromContext(context));

	const status =
		(typeof Response !== "undefined" && context instanceof Response
			? context.status
			: extractStatus(context)) ??
		extractStatus(errorRecord) ??
		extractStatus(payload);

	const code = extractPayloadCode(payload);
	const message = (
		extractPayloadMessage(payload) ||
		(errorRecord?.message as string | undefined) ||
		GENERIC_ERROR_MESSAGE
	).trim();

	return {
		status,
		code,
		message,
		payload,
	};
}

function mapArabicKeyboardErrorMessage(details: InvokeErrorDetails): string {
	if (details.code === "TEXT_REQUIRED") {
		return TEXT_REQUIRED_MESSAGE;
	}

	if (details.code === "INVALID_ACTION") {
		return INVALID_ACTION_MESSAGE;
	}

	if (details.code === "ORIGIN_NOT_ALLOWED") {
		return ORIGIN_ERROR_MESSAGE;
	}

	if (details.code === "TRANSLATION_UNAVAILABLE") {
		return TRANSLATION_UNAVAILABLE_MESSAGE;
	}

	if (details.code === "ARABIZI_DAILY_LIMIT_REACHED") {
		return ARABIZI_DAILY_LIMIT_REACHED_MESSAGE;
	}

	if (details.code === "RATE_LIMITED" || details.status === 429) {
		return RATE_LIMITED_MESSAGE;
	}

	if (isTransportFailureMessage(details.message)) {
		return NETWORK_ERROR_MESSAGE;
	}

	if (details.status !== undefined && details.status >= 500) {
		return GENERIC_ERROR_MESSAGE;
	}

	return GENERIC_ERROR_MESSAGE;
}

function normalizePreview(
	payload: unknown,
): ArabicKeyboardActionPreview | null {
	if (!isJsonRecord(payload)) {
		return null;
	}

	const action = payload.action;
	const outputText = payload.outputText;
	if (
		typeof action !== "string" ||
		!ALLOWED_ACTION_SET.has(action) ||
		typeof outputText !== "string"
	) {
		return null;
	}

	const warnings = Array.isArray(payload.warnings)
		? payload.warnings.filter(
				(warning): warning is string =>
					typeof warning === "string" && warning.trim().length > 0,
			)
		: [];

	return {
		action: action as ArabicKeyboardAction,
		outputText,
		provider: toTrimmedOptionalString(payload.provider) ?? null,
		fallbackUsed:
			typeof payload.fallbackUsed === "boolean" ? payload.fallbackUsed : false,
		explanation: toTrimmedOptionalString(payload.explanation) ?? null,
		warnings,
	};
}

export async function requestArabicKeyboardAction(
	request: ArabicKeyboardActionRequest,
): Promise<ArabicKeyboardServiceResult> {
	const body: Record<string, unknown> = {
		action: request.action,
		text: request.text,
	};

	const sourceLanguage = toTrimmedOptionalString(request.sourceLanguage);
	if (sourceLanguage) {
		body.sourceLanguage = sourceLanguage;
	}

	const context = toTrimmedOptionalString(request.context);
	if (context) {
		body.context = context;
	}

	const layout = toTrimmedOptionalString(request.layout);
	if (layout) {
		body.layout = layout;
	}

	const { data, error } = await supabase.functions.invoke(
		ARABIC_KEYBOARD_ACTION_FUNCTION,
		{
			body,
		},
	);

	if (error) {
		const details = await extractInvokeErrorDetails(error, data);
		return {
			ok: false,
			error: {
				code: details.code ?? "FUNCTION_ERROR",
				message: mapArabicKeyboardErrorMessage(details),
				status: details.status,
			},
		};
	}

	const preview = normalizePreview(data);
	if (!preview) {
		return {
			ok: false,
			error: {
				code: "INVALID_RESPONSE",
				message: GENERIC_ERROR_MESSAGE,
			},
		};
	}

	return { ok: true, data: preview };
}
