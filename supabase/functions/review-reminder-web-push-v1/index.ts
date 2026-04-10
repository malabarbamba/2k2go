import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
	createServiceClient,
	resolveRequestAuth,
} from "../_shared/edgeAuth.ts";
import { jsonResponse, optionsResponse } from "../_shared/httpSecurity.ts";
import {
	getReviewReminderWebPushPublicConfig,
	type ReviewReminderWebPushSubscriptionRow,
} from "../_shared/reviewReminders.ts";

const CORS_OPTIONS = { methods: "GET, POST, DELETE, OPTIONS" };
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;

type ValidatedSubscriptionInput = {
	endpoint: string;
	p256dh: string;
	auth: string;
	expirationTime: string | null;
	deviceLabel: string | null;
	userAgent: string | null;
};

function isJsonRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function asIsoDateTimeOrNull(value: unknown): string | null {
	if (value === null || value === undefined || value === "") {
		return null;
	}

	if (typeof value === "number" && Number.isFinite(value)) {
		return new Date(value).toISOString();
	}

	if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
		return new Date(value).toISOString();
	}

	return null;
}

function validateSubscriptionInput(
	body: unknown,
):
	| { ok: true; value: ValidatedSubscriptionInput }
	| { ok: false; responseBody: JsonRecord } {
	if (!isJsonRecord(body)) {
		return {
			ok: false,
			responseBody: { error: "Invalid request body", code: "INVALID_BODY" },
		};
	}

	const subscription = isJsonRecord(body.subscription)
		? body.subscription
		: body;
	const keys = isJsonRecord(subscription.keys)
		? subscription.keys
		: subscription;
	const endpoint = asNonEmptyString(subscription.endpoint);
	const p256dh = asNonEmptyString(keys.p256dh);
	const auth = asNonEmptyString(keys.auth);
	if (!endpoint || !p256dh || !auth) {
		return {
			ok: false,
			responseBody: {
				error: "endpoint, keys.p256dh, and keys.auth are required",
				code: "INVALID_SUBSCRIPTION",
			},
		};
	}

	return {
		ok: true,
		value: {
			endpoint,
			p256dh,
			auth,
			expirationTime: asIsoDateTimeOrNull(subscription.expirationTime),
			deviceLabel:
				asNonEmptyString(body.device_label) ??
				asNonEmptyString(body.deviceLabel),
			userAgent:
				asNonEmptyString(body.user_agent) ??
				asNonEmptyString(body.userAgent) ??
				asNonEmptyString(subscription.user_agent),
		},
	};
}

function parseSubscriptions(
	rows: ReviewReminderWebPushSubscriptionRow[] | null | undefined,
): ReviewReminderWebPushSubscriptionRow[] {
	if (!Array.isArray(rows)) {
		return [];
	}

	return rows.filter((row): row is ReviewReminderWebPushSubscriptionRow => {
		return (
			typeof row?.id === "string" &&
			typeof row?.user_id === "string" &&
			typeof row?.endpoint === "string" &&
			typeof row?.p256dh === "string" &&
			typeof row?.auth === "string"
		);
	});
}

serve(async (req) => {
	if (req.method === "OPTIONS") {
		return optionsResponse(req, CORS_OPTIONS);
	}

	if (!["GET", "POST", "DELETE"].includes(req.method)) {
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
	const webPushConfig = getReviewReminderWebPushPublicConfig();
	const vapidConfigured = webPushConfig.enabled;
	const vapidPublicKey = webPushConfig.publicKey;

	if (req.method === "GET") {
		const listResult = await supabaseAdmin
			.from("user_review_web_push_subscriptions")
			.select(
				"id,user_id,endpoint,p256dh,auth,expiration_time,user_agent,device_label,enabled,last_sent_at,last_error_at,last_error_status,last_error_message,failure_count,created_at,updated_at",
			)
			.eq("user_id", userId)
			.order("created_at", { ascending: true });

		if (listResult.error) {
			console.error("Failed to list web push subscriptions", {
				userId,
				error: listResult.error.message,
			});
			return jsonResponse(
				req,
				{
					error: "Unable to load subscriptions",
					code: "SUBSCRIPTION_LOOKUP_FAILED",
				},
				500,
				CORS_OPTIONS,
			);
		}

		return jsonResponse(
			req,
			{
				vapid_enabled: vapidConfigured,
				vapid_public_key: vapidPublicKey,
				subscriptions: parseSubscriptions(
					listResult.data as ReviewReminderWebPushSubscriptionRow[] | null,
				),
			},
			200,
			CORS_OPTIONS,
		);
	}

	let parsedBody: unknown = {};
	try {
		const rawBody = await req.text();
		parsedBody = rawBody.trim().length > 0 ? JSON.parse(rawBody) : {};
	} catch {
		return jsonResponse(
			req,
			{ error: "Request body must be valid JSON", code: "INVALID_JSON" },
			400,
			CORS_OPTIONS,
		);
	}

	if (req.method === "DELETE") {
		if (!isJsonRecord(parsedBody)) {
			return jsonResponse(
				req,
				{ error: "Invalid request body", code: "INVALID_BODY" },
				400,
				CORS_OPTIONS,
			);
		}

		const id = asNonEmptyString(parsedBody.id);
		const endpoint = asNonEmptyString(parsedBody.endpoint);
		if (!id && !endpoint) {
			return jsonResponse(
				req,
				{
					error: "id or endpoint is required for delete",
					code: "INVALID_DELETE_TARGET",
				},
				400,
				CORS_OPTIONS,
			);
		}

		if (id && !UUID_PATTERN.test(id)) {
			return jsonResponse(
				req,
				{ error: "id must be a valid UUID", code: "INVALID_ID" },
				400,
				CORS_OPTIONS,
			);
		}

		let deleteQuery = supabaseAdmin
			.from("user_review_web_push_subscriptions")
			.delete()
			.eq("user_id", userId);
		deleteQuery = id
			? deleteQuery.eq("id", id)
			: deleteQuery.eq("endpoint", endpoint ?? "");
		const deleteResult = await deleteQuery.select("id");

		if (deleteResult.error) {
			console.error("Failed to delete web push subscription", {
				userId,
				error: deleteResult.error.message,
			});
			return jsonResponse(
				req,
				{
					error: "Unable to delete subscription",
					code: "SUBSCRIPTION_DELETE_FAILED",
				},
				500,
				CORS_OPTIONS,
			);
		}

		return jsonResponse(
			req,
			{
				removed: Array.isArray(deleteResult.data)
					? deleteResult.data.length
					: 0,
				vapid_enabled: vapidConfigured,
				vapid_public_key: vapidPublicKey,
			},
			200,
			CORS_OPTIONS,
		);
	}

	const validationResult = validateSubscriptionInput(parsedBody);
	if (!validationResult.ok) {
		return jsonResponse(req, validationResult.responseBody, 400, CORS_OPTIONS);
	}

	await supabaseAdmin.rpc("ensure_user_review_reminder_preferences_v1", {
		p_user_id: userId,
	});

	const subscription = validationResult.value;
	const upsertResult = await supabaseAdmin
		.from("user_review_web_push_subscriptions")
		.upsert(
			{
				user_id: userId,
				endpoint: subscription.endpoint,
				p256dh: subscription.p256dh,
				auth: subscription.auth,
				expiration_time: subscription.expirationTime,
				user_agent: subscription.userAgent,
				device_label: subscription.deviceLabel,
				enabled: true,
				failure_count: 0,
				last_error_at: null,
				last_error_status: null,
				last_error_message: null,
			},
			{ onConflict: "endpoint" },
		)
		.select(
			"id,user_id,endpoint,p256dh,auth,expiration_time,user_agent,device_label,enabled,last_sent_at,last_error_at,last_error_status,last_error_message,failure_count,created_at,updated_at",
		)
		.single();

	if (upsertResult.error) {
		console.error("Failed to upsert web push subscription", {
			userId,
			error: upsertResult.error.message,
		});
		return jsonResponse(
			req,
			{
				error: "Unable to save subscription",
				code: "SUBSCRIPTION_UPSERT_FAILED",
			},
			500,
			CORS_OPTIONS,
		);
	}

	return jsonResponse(
		req,
		{
			vapid_enabled: vapidConfigured,
			vapid_public_key: vapidPublicKey,
			subscription:
				parseSubscriptions([
					upsertResult.data as ReviewReminderWebPushSubscriptionRow,
				])[0] ?? upsertResult.data,
		},
		200,
		CORS_OPTIONS,
	);
});
