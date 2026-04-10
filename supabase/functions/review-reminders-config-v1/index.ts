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
	type ReviewReminderCalendarFeedTokenRow,
	type ReviewReminderPreferencesRow,
	resolveReviewReminderAppUrl,
} from "../_shared/reviewReminders.ts";
import {
	normalizeReviewReminderPreferencesPatch,
	REVIEW_REMINDER_PREFERENCES_SELECT,
	type ReviewReminderPreferencesPatch,
} from "./preferences.ts";

const CORS_OPTIONS = { methods: "GET, PATCH, POST, OPTIONS" };

type JsonRecord = Record<string, unknown>;

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

	const maybeBoolean = (key: string) => {
		if (!(key in candidate)) {
			return;
		}

		if (typeof candidate[key] !== "boolean") {
			throw new Error(`${key} must be a boolean`);
		}

		patch[key] = candidate[key];
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

async function readConfig(
	req: Request,
	supabaseAdmin: ReturnType<typeof createServiceClient>,
	userId: string,
): Promise<
	| {
			ok: true;
			data: {
				preferences: ReviewReminderPreferencesRow;
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
	const preferencesResult = await supabaseAdmin
		.from("user_review_reminder_preferences")
		.select(REVIEW_REMINDER_PREFERENCES_SELECT)
		.eq("user_id", userId)
		.maybeSingle<ReviewReminderPreferencesRow>();
	if (preferencesResult.error || !preferencesResult.data) {
		console.error("user_review_reminder_preferences lookup failed", {
			message: preferencesResult.error?.message,
			details: preferencesResult.error?.details,
			hint: preferencesResult.error?.hint,
			code: preferencesResult.error?.code,
		});
		return {
			ok: false,
			status: 500,
			error: "Unable to load reminder preferences",
		};
	}

	const calendarFeedResult = await supabaseAdmin
		.from("user_review_calendar_feeds")
		.select("user_id,token,created_at,updated_at")
		.eq("user_id", userId)
		.maybeSingle<ReviewReminderCalendarFeedTokenRow>();
	if (calendarFeedResult.error || !calendarFeedResult.data) {
		console.error("user_review_calendar_feeds lookup failed", {
			message: calendarFeedResult.error?.message,
			details: calendarFeedResult.error?.details,
			hint: calendarFeedResult.error?.hint,
			code: calendarFeedResult.error?.code,
		});
		return {
			ok: false,
			status: 500,
			error: "Unable to load reminder calendar feed",
		};
	}

	const subscriptionCountResult = await supabaseAdmin
		.from("user_review_web_push_subscriptions")
		.select("id", { count: "exact", head: true })
		.eq("user_id", userId)
		.eq("enabled", true);
	if (subscriptionCountResult.error) {
		console.error("user_review_web_push_subscriptions count failed", {
			message: subscriptionCountResult.error.message,
			details: subscriptionCountResult.error.details,
			hint: subscriptionCountResult.error.hint,
			code: subscriptionCountResult.error.code,
		});
		return {
			ok: false,
			status: 500,
			error: "Unable to load web push subscriptions",
		};
	}

	const webPushConfig = getReviewReminderWebPushPublicConfig();
	const activeSubscriptionCount = subscriptionCountResult.count ?? 0;
	const calendarFeedUrl =
		buildReviewReminderCalendarFeedUrl(calendarFeedResult.data.token) ??
		buildRequestScopedCalendarFeedUrl(req, calendarFeedResult.data.token);
	const subscribeCalendarUrl =
		buildReviewReminderCalendarSubscribeUrl(calendarFeedResult.data.token) ??
		buildRequestScopedCalendarSubscribeUrl(req, calendarFeedResult.data.token);
	const handoffUrl = buildReviewReminderCalendarHandoffUrl(
		calendarFeedResult.data.token,
	);
	return {
		ok: true,
		data: {
			preferences: preferencesResult.data,
			calendar: {
				token: calendarFeedResult.data.token,
				feed_url_https: calendarFeedUrl,
				subscribe_url_webcal: subscribeCalendarUrl,
				handoff_url: handoffUrl,
			},
			web_push: {
				enabled:
					preferencesResult.data.enabled &&
					preferencesResult.data.web_push_enabled &&
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

	const bootstrapPreferences = await supabaseAdmin
		.from("user_review_reminder_preferences")
		.upsert(
			{ user_id: userId },
			{ onConflict: "user_id", ignoreDuplicates: true },
		);
	if (bootstrapPreferences.error) {
		console.error("user_review_reminder_preferences bootstrap failed", {
			message: bootstrapPreferences.error.message,
			details: bootstrapPreferences.error.details,
			hint: bootstrapPreferences.error.hint,
			code: bootstrapPreferences.error.code,
		});
		return jsonResponse(
			req,
			{ error: "Unable to bootstrap reminder preferences" },
			500,
			CORS_OPTIONS,
		);
	}

	const bootstrapCalendarFeed = await supabaseAdmin
		.from("user_review_calendar_feeds")
		.upsert(
			{ user_id: userId },
			{ onConflict: "user_id", ignoreDuplicates: true },
		);
	if (bootstrapCalendarFeed.error) {
		console.error("user_review_calendar_feeds bootstrap failed", {
			message: bootstrapCalendarFeed.error.message,
			details: bootstrapCalendarFeed.error.details,
			hint: bootstrapCalendarFeed.error.hint,
			code: bootstrapCalendarFeed.error.code,
		});
		return jsonResponse(
			req,
			{ error: "Unable to bootstrap calendar feed" },
			500,
			CORS_OPTIONS,
		);
	}

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

		const currentPreferencesResult = await supabaseAdmin
			.from("user_review_reminder_preferences")
			.select(REVIEW_REMINDER_PREFERENCES_SELECT)
			.eq("user_id", userId)
			.maybeSingle<ReviewReminderPreferencesRow>();
		if (currentPreferencesResult.error || !currentPreferencesResult.data) {
			console.error("user_review_reminder_preferences current lookup failed", {
				message: currentPreferencesResult.error?.message,
				details: currentPreferencesResult.error?.details,
				hint: currentPreferencesResult.error?.hint,
				code: currentPreferencesResult.error?.code,
			});
			return jsonResponse(
				req,
				{ error: "Unable to load reminder preferences" },
				500,
				CORS_OPTIONS,
			);
		}

		const normalizedPatch = normalizeReviewReminderPreferencesPatch(
			currentPreferencesResult.data,
			patch.patch,
		);

		const updateResult = await supabaseAdmin
			.from("user_review_reminder_preferences")
			.update({ ...normalizedPatch, updated_at: new Date().toISOString() })
			.eq("user_id", userId)
			.select("user_id")
			.maybeSingle();
		if (updateResult.error) {
			console.error("user_review_reminder_preferences update failed", {
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
			"rotate_review_calendar_feed_token_v1",
			{
				p_user_id: userId,
			},
		);
		if (rotateResult.error) {
			console.error("rotate_review_calendar_feed_token_v1 failed", {
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
