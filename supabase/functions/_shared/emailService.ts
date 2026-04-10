declare const Deno: {
	env: {
		get: (key: string) => string | undefined;
	};
};

const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_MAX_ATTEMPTS = 2;
const RESEND_REQUEST_TIMEOUT_MS = 8000;
const RESEND_RETRY_BASE_DELAY_MS = 750;
const RESEND_FALLBACK_FROM_EMAIL = "arabeurgence@gmail.com";
const RESEND_FALLBACK_FROM_NAME = "2k2go";
const RESEND_FROM_ERROR_PATTERN =
	/(invalid\s+from|from\s+address|sender\s+address|domain).*(invalid|verify|verified|not allowed|not verified|unauthorized|does not match)|not\s+verified\s+sender/i;

export const EMAIL_PROVIDER_ERROR_MESSAGE =
	"Service email indisponible. Contactez le support.";
export const EMAIL_PROVIDER_UNAVAILABLE_CODE = "EMAIL_PROVIDER_UNAVAILABLE";

export type EmailTag = {
	name: string;
	value: string;
};

export type EmailAttachment = {
	filename: string;
	content: string;
};

export type SendEmailParams = {
	to: string[];
	subject: string;
	html: string;
	text?: string;
	from: string;
	replyTo?: string;
	tags?: EmailTag[];
	attachments?: EmailAttachment[];
};

export type SendEmailResult =
	| { ok: true; id: string }
	| { ok: false; error: string; status: number; retryable: boolean };

type EmailUnavailableResponseOptions = {
	corsHeaders?: Record<string, string>;
	providerStatus?: number;
	retryAfterSeconds?: number;
};

const sleep = (ms: number) =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

const isRetryableStatus = (status: number) =>
	status === 408 || status === 429 || status >= 500;

const extractDisplayName = (from: string): string => {
	const namedFromMatch = from.match(/^\s*"?([^<"]+)"?\s*</);
	if (!namedFromMatch) return "";
	return namedFromMatch[1].trim();
};

const normalizeSenderName = (value: string): string => {
	const trimmed = value.trim();
	if (!trimmed) return RESEND_FALLBACK_FROM_NAME;
	return trimmed;
};

const buildFallbackFrom = (from: string): string => {
	const fallbackName = normalizeSenderName(extractDisplayName(from));
	return `${fallbackName} <${RESEND_FALLBACK_FROM_EMAIL}>`;
};

const shouldRetryWithFallbackFrom = (
	status: number,
	errorMessage: string,
): boolean => {
	if (![400, 401, 403, 422].includes(status)) return false;
	return RESEND_FROM_ERROR_PATTERN.test(errorMessage);
};

const extractError = (
	payload: unknown,
	text: string,
	status: number,
): string => {
	if (payload && typeof payload === "object") {
		const record = payload as Record<string, unknown>;
		if (typeof record.message === "string" && record.message.length > 0) {
			return record.message;
		}
		if (typeof record.error === "string" && record.error.length > 0) {
			return record.error;
		}
	}

	if (text.length > 0) {
		return text;
	}

	return `Resend request failed with status ${status}`;
};

export function isEmailServiceConfigured(): boolean {
	if (!Deno.env.get("RESEND_API_KEY")) {
		console.error("Missing RESEND_API_KEY in function secrets");
		return false;
	}

	return true;
}

export async function sendEmail(
	params: SendEmailParams,
): Promise<SendEmailResult> {
	const resendApiKey = Deno.env.get("RESEND_API_KEY");
	if (!resendApiKey) {
		console.error("Missing RESEND_API_KEY in function secrets");
		return {
			ok: false,
			error: "Missing RESEND_API_KEY in function secrets",
			status: 503,
			retryable: false,
		};
	}

	const requestBody: Record<string, unknown> = {
		from: params.from,
		to: params.to,
		subject: params.subject,
		html: params.html,
	};
	if (params.text) requestBody.text = params.text;
	if (params.replyTo) requestBody.reply_to = params.replyTo;
	if (params.tags && params.tags.length > 0) requestBody.tags = params.tags;
	if (params.attachments && params.attachments.length > 0) {
		requestBody.attachments = params.attachments;
	}

	let lastFailure: SendEmailResult = {
		ok: false,
		error: "Email provider request failed",
		status: 0,
		retryable: true,
	};
	let fallbackFromRetried = false;

	for (let attempt = 1; attempt <= RESEND_MAX_ATTEMPTS; attempt += 1) {
		const controller = new AbortController();
		const timeoutId = setTimeout(
			() => controller.abort("resend_timeout"),
			RESEND_REQUEST_TIMEOUT_MS,
		);

		try {
			const response = await fetch(RESEND_API_URL, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${resendApiKey}`,
				},
				body: JSON.stringify(requestBody),
				signal: controller.signal,
			});
			clearTimeout(timeoutId);

			let payload: unknown = null;
			let responseText = "";
			try {
				payload = await response.clone().json();
			} catch {
				try {
					responseText = await response.text();
				} catch {
					responseText = "";
				}
			}

			if (response.ok) {
				const id =
					payload &&
					typeof payload === "object" &&
					typeof (payload as Record<string, unknown>).id === "string"
						? ((payload as Record<string, unknown>).id as string)
						: "";
				return { ok: true, id };
			}

			lastFailure = {
				ok: false,
				error: extractError(payload, responseText, response.status),
				status: response.status,
				retryable: isRetryableStatus(response.status),
			};

			console.error("Resend API error:", lastFailure.status, lastFailure.error);

			if (
				!fallbackFromRetried &&
				shouldRetryWithFallbackFrom(lastFailure.status, lastFailure.error) &&
				attempt < RESEND_MAX_ATTEMPTS
			) {
				requestBody.from = buildFallbackFrom(params.from);
				fallbackFromRetried = true;
				console.warn(
					"Retrying Resend request with fallback sender",
					requestBody.from,
				);
				continue;
			}

			if (attempt < RESEND_MAX_ATTEMPTS && lastFailure.retryable) {
				const jitterMs = Math.floor(Math.random() * 250);
				await sleep(RESEND_RETRY_BASE_DELAY_MS * attempt + jitterMs);
				continue;
			}

			return lastFailure;
		} catch (error: unknown) {
			clearTimeout(timeoutId);
			const message = error instanceof Error ? error.message : String(error);
			lastFailure = { ok: false, error: message, status: 0, retryable: true };
			console.error("Resend transport error:", message);

			if (attempt < RESEND_MAX_ATTEMPTS) {
				const jitterMs = Math.floor(Math.random() * 250);
				await sleep(RESEND_RETRY_BASE_DELAY_MS * attempt + jitterMs);
				continue;
			}

			return lastFailure;
		}
	}

	return lastFailure;
}

export function emailUnavailableResponse(
	options: EmailUnavailableResponseOptions = {},
): Response {
	const body: Record<string, unknown> = {
		error: EMAIL_PROVIDER_ERROR_MESSAGE,
		code: EMAIL_PROVIDER_UNAVAILABLE_CODE,
	};
	if (
		typeof options.providerStatus === "number" &&
		options.providerStatus > 0
	) {
		body.providerStatus = Math.floor(options.providerStatus);
	}

	const headers: Record<string, string> = {
		...(options.corsHeaders ?? {}),
		"Content-Type": "application/json",
	};
	if (
		typeof options.retryAfterSeconds === "number" &&
		options.retryAfterSeconds > 0
	) {
		headers["Retry-After"] = String(Math.floor(options.retryAfterSeconds));
	}

	return new Response(JSON.stringify(body), { status: 503, headers });
}
