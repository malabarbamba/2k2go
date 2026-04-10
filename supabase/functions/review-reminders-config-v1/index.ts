import "../types.d.ts";

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
	createServiceClient,
	resolveRequestAuth,
} from "../_shared/edgeAuth.ts";
import { jsonResponse, optionsResponse } from "../_shared/httpSecurity.ts";
import {
	buildReviewReminderCalendarFeedUrl,
	buildReviewReminderCalendarHandoffUrl,
	buildReviewReminderCalendarSubscribeUrl,
	getReviewReminderWebPushPublicConfig,
	resolveReviewReminderAppUrl,
} from "../_shared/reviewReminders.ts";
import {
	normalizeReviewReminderPreferencesPatch,
	type ReviewReminderPreferenceState,
	type ReviewReminderPreferencesPatch,
} from "./preferences.ts";

const CORS_OPTIONS = { methods: "GET, PATCH, POST, OPTIONS" };

type JsonRecord = Record<string, unknown>;

type ReminderConfigRpcRow = {
	user_id: string;
	enabled: boolean;
	email_enabled: boolean;
	calendar_enabled: boolean;
	web_push_enabled: boolean;
	created_at: string;
	updated_at: string;
	calendar_token: string;
	active_subscription_count: number;
};

function isJsonRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePreferencesPatch(body: unknown): {
	ok: boolean;
	patch?: ReviewReminderPreferencesPatch;
	error?: string;
} {
	if (!isJsonRecord(body)) {
		return { ok: false, error: "Invalid request body" };
	}

	const candidate = isJsonRecord(body.preferences) ? body.preferences : body;
	const patch: ReviewReminderPreferencesPatch = {};

	const maybeBoolean = (key: keyof ReviewReminderPreferencesPatch) => {
		if (!(key in candidate)) {
			return;
		}

		if (typeof candidate[key] !== "boolean") {
			throw new Error(`${key} must be a boolean`);
		}

		patch[key] = candidate[key] as boolean;
	};

	try {
		maybeBoolean("enabled");
		maybeBoolean("email_enabled");
		maybeBoolean("calendar_enabled");
		maybeBoolean("web_push_enabled");
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Invalid preferences",
		};
	}

	if (Object.keys(patch).length === 0) {
		return { ok: false, error: "No valid preferences provided" };
	}

	return { ok: true, patch };
}

function readForwardedHeader(req: Request, key: string): string | null {
	const raw = req.headers.get(key);
	if (!raw) {
		return null;
	}

	const first = raw
		.split(",")
		.map((value) => value.trim())
		.find((value) => value.length > 0);
	return first ?? null;
}

function hasExplicitPort(host: string): boolean {
	if (host.startsWith("[")) {
		return /\]:\d+$/.test(host);
	}

	return /:\d+$/.test(host);
}

function isDefaultPort(protocol: string, port: string): boolean {
	return (
		(protocol === "http" && port === "80") ||
		(protocol === "https" && port === "443")
	);
}

function buildRequestScopedFunctionsBaseUrl(req: Request): string {
	const requestUrl = new URL(req.url);
	const forwardedHost =
		readForwardedHeader(req, "x-forwarded-host") ??
		readForwardedHeader(req, "host");
	const forwardedProtoRaw =
		readForwardedHeader(req, "x-forwarded-proto") ??
		requestUrl.protocol.replace(/:$/, "");
	const forwardedProto =
		forwardedProtoRaw === "https" || forwardedProtoRaw === "http"
			? forwardedProtoRaw
			: requestUrl.protocol.replace(/:$/, "");
	const forwardedPortCandidate = readForwardedHeader(req, "x-forwarded-port");
	const forwardedPort =
		forwardedPortCandidate && /^\d+$/.test(forwardedPortCandidate)
			? forwardedPortCandidate
			: requestUrl.port && /^\d+$/.test(requestUrl.port)
				? requestUrl.port
				: null;

	if (forwardedHost) {
		const authority =
			forwardedPort &&
			!hasExplicitPort(forwardedHost) &&
			!isDefaultPort(forwardedProto, forwardedPort)
				? `${forwardedHost}:${forwardedPort}`
				: forwardedHost;
		return `${forwardedProto}://${authority}/functions/v1`;
	}

	return `${requestUrl.origin}/functions/v1`;
}

function buildRequestScopedCalendarFeedUrl(
	req: Request,
	token: string,
): string {
	return `${buildRequestScopedFunctionsBaseUrl(req)}/review-reminders-calendar-v1?token=${encodeURIComponent(token)}`;
}

function buildRequestScopedCalendarSubscribeUrl(
	req: Request,
	token: string,
): string {
	return buildRequestScopedCalendarFeedUrl(req, token).replace(
		/^https?:\/\//i,
		"webcal://",
	);
}

function toReminderConfigRpcRow(value: unknown): ReminderConfigRpcRow | null {
	if (!isJsonRecord(value)) {
		return null;
	}

	if (
		typeof value.user_id !== "string" ||
		typeof value.enabled !== "boolean" ||
		typeof value.email_enabled !== "boolean" ||
		typeof value.calendar_enabled !== "boolean" ||
		typeof value.web_push_enabled !== "boolean" ||
		typeof value.created_at !== "string" ||
		typeof value.updated_at !== "string" ||
		typeof value.calendar_token !== "string"
	) {
		return null;
	}

	const rawCount = value.active_subscription_count;
	const parsedCount =
		typeof rawCount === "number"
			? rawCount
			: typeof rawCount === "string"
				? Number.parseInt(rawCount, 10)
				: NaN;

	return {
		user_id: value.user_id,
		enabled: value.enabled,
		email_enabled: value.email_enabled,
		calendar_enabled: value.calendar_enabled,
		web_push_enabled: value.web_push_enabled,
		created_at: value.created_at,
		updated_at: value.updated_at,
		calendar_token: value.calendar_token,
		active_subscription_count: Number.isFinite(parsedCount)
			? Math.max(0, parsedCount)
			: 0,
	};
}

async function readConfig(
	req: Request,
	supabaseAdmin: ReturnType<typeof createServiceClient>,
	userId: string,
): Promise<
	| {
			ok: true;
			data: {
				preferences: ReviewReminderPreferenceState;
				calendar: {
					token: string;
					feed_url_https: string | null;
					subscribe_url_webcal: string | null;
					handoff_url: string | null;
				};
				web_push: {
					enabled: boolean;
					vapid_configured: boolean;
					vapid_public_key: string | null;
					active_subscription_count: number;
				};
				reminder_app_url: string;
			};
	  }
	| { ok: false; status: number; error: string }
> {
	const configRpcResult = await supabaseAdmin.rpc(
		"get_review_reminder_config_state_v1",
		{
			p_user_id: userId,
		},
	);
	if (configRpcResult.error) {
		console.error("get_review_reminder_config_state_v1 failed", {
			message: configRpcResult.error.message,
			details: configRpcResult.error.details,
			hint: configRpcResult.error.hint,
			code: configRpcResult.error.code,
		});
		return {
			ok: false,
			status: 500,
			error: "Unable to load reminder preferences",
		};
	}

	const configRow = toReminderConfigRpcRow(
		Array.isArray(configRpcResult.data)
			? (configRpcResult.data[0] ?? null)
			: configRpcResult.data,
	);
	if (!configRow) {
		return {
			ok: false,
			status: 500,
			error: "Reminder config payload is invalid",
		};
	}

	const compatibilityPreferences: ReviewReminderPreferenceState = {
		user_id: configRow.user_id,
		enabled: configRow.enabled,
		email_enabled: configRow.email_enabled,
		calendar_enabled: configRow.calendar_enabled,
		web_push_enabled: configRow.web_push_enabled,
		created_at: configRow.created_at,
		updated_at: configRow.updated_at,
	};

	const webPushConfig = getReviewReminderWebPushPublicConfig();
	const activeSubscriptionCount = configRow.active_subscription_count;
	const calendarFeedUrl =
		buildReviewReminderCalendarFeedUrl(configRow.calendar_token) ??
		buildRequestScopedCalendarFeedUrl(req, configRow.calendar_token);
	const subscribeCalendarUrl =
		buildReviewReminderCalendarSubscribeUrl(configRow.calendar_token) ??
		buildRequestScopedCalendarSubscribeUrl(req, configRow.calendar_token);
	const handoffUrl = buildReviewReminderCalendarHandoffUrl(
		configRow.calendar_token,
	);
	return {
		ok: true,
		data: {
			preferences: compatibilityPreferences,
			calendar: {
				token: configRow.calendar_token,
				feed_url_https: calendarFeedUrl,
				subscribe_url_webcal: subscribeCalendarUrl,
				handoff_url: handoffUrl,
			},
			web_push: {
				enabled:
					compatibilityPreferences.enabled &&
					compatibilityPreferences.web_push_enabled &&
					webPushConfig.enabled &&
					activeSubscriptionCount > 0,
				vapid_configured: webPushConfig.enabled,
				vapid_public_key: webPushConfig.publicKey,
				active_subscription_count: activeSubscriptionCount,
			},
			reminder_app_url: resolveReviewReminderAppUrl(),
		},
	};
}

serve(async (req) => {
	if (req.method === "OPTIONS") {
		return optionsResponse(req, CORS_OPTIONS);
	}

	if (!["GET", "PATCH", "POST"].includes(req.method)) {
		return jsonResponse(
			req,
			{ error: "Method not allowed" },
			405,
			CORS_OPTIONS,
		);
	}

	const supabaseAdmin = createServiceClient();
	const auth = await resolveRequestAuth(req, supabaseAdmin);
	if (!auth.isAuthenticated || !auth.user) {
		return jsonResponse(
			req,
			{ error: "Authentication failed" },
			401,
			CORS_OPTIONS,
		);
	}

	const userId = auth.user.id;

	if (req.method === "PATCH") {
		let parsedBody: unknown = {};
		try {
			const rawBody = await req.text();
			parsedBody = rawBody.trim().length > 0 ? JSON.parse(rawBody) : {};
		} catch {
			return jsonResponse(
				req,
				{ error: "Request body must be valid JSON" },
				400,
				CORS_OPTIONS,
			);
		}

		const patch = parsePreferencesPatch(parsedBody);
		if (!patch.ok || !patch.patch) {
			return jsonResponse(
				req,
				{ error: patch.error ?? "Invalid preferences" },
				400,
				CORS_OPTIONS,
			);
		}

		const currentConfigResult = await supabaseAdmin.rpc(
			"get_review_reminder_config_state_v1",
			{
				p_user_id: userId,
			},
		);
		if (currentConfigResult.error) {
			console.error("get_review_reminder_config_state_v1 failed", {
				message: currentConfigResult.error.message,
				details: currentConfigResult.error.details,
				hint: currentConfigResult.error.hint,
				code: currentConfigResult.error.code,
			});
			return jsonResponse(
				req,
				{ error: "Unable to load reminder preferences" },
				500,
				CORS_OPTIONS,
			);
		}

		const currentConfigRow = toReminderConfigRpcRow(
			Array.isArray(currentConfigResult.data)
				? (currentConfigResult.data[0] ?? null)
				: currentConfigResult.data,
		);
		if (!currentConfigRow) {
			return jsonResponse(
				req,
				{ error: "Reminder config payload is invalid" },
				500,
				CORS_OPTIONS,
			);
		}

		const normalizedPatch = normalizeReviewReminderPreferencesPatch(
			{
				user_id: currentConfigRow.user_id,
				enabled: currentConfigRow.enabled,
				email_enabled: currentConfigRow.email_enabled,
				calendar_enabled: currentConfigRow.calendar_enabled,
				web_push_enabled: currentConfigRow.web_push_enabled,
				created_at: currentConfigRow.created_at,
				updated_at: currentConfigRow.updated_at,
			},
			patch.patch,
		);

		const updateResult = await supabaseAdmin.rpc(
			"patch_review_reminder_preferences_v1",
			{
				p_user_id: userId,
				p_enabled:
					typeof normalizedPatch.enabled === "boolean"
						? normalizedPatch.enabled
						: null,
				p_email_enabled:
					typeof normalizedPatch.email_enabled === "boolean"
						? normalizedPatch.email_enabled
						: null,
				p_calendar_enabled:
					typeof normalizedPatch.calendar_enabled === "boolean"
						? normalizedPatch.calendar_enabled
						: null,
				p_web_push_enabled:
					typeof normalizedPatch.web_push_enabled === "boolean"
						? normalizedPatch.web_push_enabled
						: null,
			},
		);
		if (updateResult.error) {
			console.error("patch_review_reminder_preferences_v1 failed", {
				message: updateResult.error.message,
				details: updateResult.error.details,
				hint: updateResult.error.hint,
				code: updateResult.error.code,
			});
			return jsonResponse(
				req,
				{ error: "Unable to update reminder preferences" },
				500,
				CORS_OPTIONS,
			);
		}
	}

	if (req.method === "POST") {
		let parsedBody: unknown = {};
		try {
			const rawBody = await req.text();
			parsedBody = rawBody.trim().length > 0 ? JSON.parse(rawBody) : {};
		} catch {
			return jsonResponse(
				req,
				{ error: "Request body must be valid JSON" },
				400,
				CORS_OPTIONS,
			);
		}

		if (!isJsonRecord(parsedBody)) {
			return jsonResponse(
				req,
				{ error: "Invalid request body" },
				400,
				CORS_OPTIONS,
			);
		}

		if (parsedBody.action !== "rotate_calendar_token") {
			return jsonResponse(
				req,
				{ error: "Unsupported action" },
				400,
				CORS_OPTIONS,
			);
		}

		const rotateResult = await supabaseAdmin.rpc(
			"rotate_review_reminder_calendar_token_v2",
			{
				p_user_id: userId,
			},
		);
		if (rotateResult.error) {
			console.error("rotate_review_reminder_calendar_token_v2 failed", {
				message: rotateResult.error.message,
				details: rotateResult.error.details,
				hint: rotateResult.error.hint,
				code: rotateResult.error.code,
			});
			return jsonResponse(
				req,
				{ error: "Unable to rotate calendar token" },
				500,
				CORS_OPTIONS,
			);
		}
	}

	const configResult = await readConfig(req, supabaseAdmin, userId);
	if (!configResult.ok) {
		return jsonResponse(
			req,
			{ error: configResult.error },
			configResult.status,
			CORS_OPTIONS,
		);
	}

	return jsonResponse(req, configResult.data, 200, CORS_OPTIONS);
});
