import { supabase } from "@/integrations/supabase/client";

export type ReviewReminderPreferences = {
	user_id: string;
	enabled: boolean;
	email_enabled: boolean;
	calendar_enabled: boolean;
	web_push_enabled: boolean;
	created_at: string;
	updated_at: string;
};

export type ReviewReminderConfigResponse = {
	preferences: ReviewReminderPreferences;
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

export type ReviewWebPushSubscription = {
	id: string;
	user_id: string;
	endpoint: string;
	p256dh: string;
	auth: string;
	expiration_time: string | null;
	user_agent: string | null;
	device_label: string | null;
	enabled: boolean;
	last_sent_at: string | null;
	last_error_at: string | null;
	last_error_status: number | null;
	last_error_message: string | null;
	failure_count: number;
	created_at: string;
	updated_at: string;
};

type ServiceError = { code: string; message: string };
type ServiceResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: ServiceError };

type InvokeMethod = "GET" | "POST" | "PATCH" | "DELETE";
type ReviewReminderRequestOptions = { userId?: string };

const REMINDER_CONFIG_FUNCTION = "review-reminders-config-v1";
const REMINDER_WEB_PUSH_FUNCTION = "review-reminder-web-push-v1";
const REVIEW_REMINDER_CONFIG_CACHE_STORAGE_KEY_PREFIX =
	"review-reminders:config:v1";

const reviewReminderConfigMemoryCache = new Map<
	string,
	ReviewReminderConfigResponse
>();
const reviewReminderConfigMutationEpoch = new Map<string, number>();

function safeLocalStorage(): Storage | null {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		if (window.localStorage) {
			return window.localStorage;
		}
	} catch {
		return null;
	}

	return null;
}

function getReviewReminderConfigCacheKey(userId: string): string {
	return `${REVIEW_REMINDER_CONFIG_CACHE_STORAGE_KEY_PREFIX}:${userId}`;
}

function getReviewReminderConfigMutationEpoch(userId: string): number {
	return reviewReminderConfigMutationEpoch.get(userId) ?? 0;
}

function bumpReviewReminderConfigMutationEpoch(userId: string): number {
	const nextEpoch = getReviewReminderConfigMutationEpoch(userId) + 1;
	reviewReminderConfigMutationEpoch.set(userId, nextEpoch);
	return nextEpoch;
}

function isReminderConfigOwnedByUser(
	userId: string,
	config: ReviewReminderConfigResponse,
): boolean {
	return config.preferences.user_id === userId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function cloneReviewReminderConfig(
	config: ReviewReminderConfigResponse,
): ReviewReminderConfigResponse {
	return JSON.parse(JSON.stringify(config)) as ReviewReminderConfigResponse;
}

function isReviewReminderPreferences(
	value: unknown,
): value is ReviewReminderPreferences {
	if (!isRecord(value)) {
		return false;
	}

	return (
		typeof value.user_id === "string" &&
		typeof value.enabled === "boolean" &&
		typeof value.email_enabled === "boolean" &&
		typeof value.calendar_enabled === "boolean" &&
		typeof value.web_push_enabled === "boolean" &&
		typeof value.created_at === "string" &&
		typeof value.updated_at === "string"
	);
}

function isReviewReminderConfigResponse(
	value: unknown,
): value is ReviewReminderConfigResponse {
	if (!isRecord(value)) {
		return false;
	}

	const { preferences, calendar, web_push, reminder_app_url } = value;

	if (!isReviewReminderPreferences(preferences)) {
		return false;
	}

	if (
		!isRecord(calendar) ||
		typeof calendar.token !== "string" ||
		(calendar.feed_url_https !== null &&
			typeof calendar.feed_url_https !== "string") ||
		(calendar.subscribe_url_webcal !== null &&
			typeof calendar.subscribe_url_webcal !== "string") ||
		(calendar.handoff_url !== null && typeof calendar.handoff_url !== "string")
	) {
		return false;
	}

	if (
		!isRecord(web_push) ||
		typeof web_push.enabled !== "boolean" ||
		typeof web_push.vapid_configured !== "boolean" ||
		(web_push.vapid_public_key !== null &&
			typeof web_push.vapid_public_key !== "string") ||
		typeof web_push.active_subscription_count !== "number"
	) {
		return false;
	}

	return typeof reminder_app_url === "string";
}

function cacheReviewReminderConfig(
	userId: string,
	config: ReviewReminderConfigResponse,
): boolean {
	const snapshot = cloneReviewReminderConfig(config);
	if (!isReminderConfigOwnedByUser(userId, snapshot)) {
		clearCachedReviewReminderConfig(userId);
		return false;
	}

	reviewReminderConfigMemoryCache.set(userId, snapshot);

	const storage = safeLocalStorage();
	if (!storage) {
		return true;
	}

	try {
		storage.setItem(
			getReviewReminderConfigCacheKey(userId),
			JSON.stringify(snapshot),
		);
	} catch {
		// Ignore cache write failures.
	}

	return true;
}

export function clearCachedReviewReminderConfig(userId?: string): void {
	const storage = safeLocalStorage();

	if (typeof userId === "string") {
		reviewReminderConfigMemoryCache.delete(userId);
		reviewReminderConfigMutationEpoch.delete(userId);
		if (!storage) {
			return;
		}

		try {
			storage.removeItem(getReviewReminderConfigCacheKey(userId));
		} catch {
			// Ignore cache delete failures.
		}
		return;
	}

	reviewReminderConfigMemoryCache.clear();
	reviewReminderConfigMutationEpoch.clear();
	if (!storage) {
		return;
	}

	try {
		for (let index = storage.length - 1; index >= 0; index -= 1) {
			const key = storage.key(index);
			if (
				typeof key === "string" &&
				key.startsWith(REVIEW_REMINDER_CONFIG_CACHE_STORAGE_KEY_PREFIX)
			) {
				storage.removeItem(key);
			}
		}
	} catch {
		// Ignore cache delete failures.
	}
}

export function getCachedReviewReminderConfig(
	userId: string,
): ReviewReminderConfigResponse | null {
	const memorySnapshot = reviewReminderConfigMemoryCache.get(userId);
	if (memorySnapshot) {
		if (!isReminderConfigOwnedByUser(userId, memorySnapshot)) {
			clearCachedReviewReminderConfig(userId);
			return null;
		}

		return cloneReviewReminderConfig(memorySnapshot);
	}

	const storage = safeLocalStorage();
	if (!storage) {
		return null;
	}

	try {
		const rawValue = storage.getItem(getReviewReminderConfigCacheKey(userId));
		if (!rawValue) {
			return null;
		}

		const parsedValue = JSON.parse(rawValue) as unknown;
		if (!isReviewReminderConfigResponse(parsedValue)) {
			storage.removeItem(getReviewReminderConfigCacheKey(userId));
			return null;
		}

		if (!isReminderConfigOwnedByUser(userId, parsedValue)) {
			storage.removeItem(getReviewReminderConfigCacheKey(userId));
			return null;
		}

		cacheReviewReminderConfig(userId, parsedValue);
		return cloneReviewReminderConfig(parsedValue);
	} catch {
		try {
			storage.removeItem(getReviewReminderConfigCacheKey(userId));
		} catch {
			// Ignore cache delete failures.
		}

		return null;
	}
}

function toServiceError(error: unknown, fallbackMessage: string): ServiceError {
	if (error instanceof Error) {
		return { code: "FUNCTION_ERROR", message: error.message };
	}

	if (
		typeof error === "object" &&
		error !== null &&
		"message" in error &&
		typeof (error as { message?: unknown }).message === "string"
	) {
		return {
			code: "FUNCTION_ERROR",
			message: (error as { message: string }).message,
		};
	}

	return { code: "FUNCTION_ERROR", message: fallbackMessage };
}

async function invokeJson<T>(
	functionName: string,
	method: InvokeMethod,
	body?: Record<string, unknown>,
): Promise<ServiceResult<T>> {
	const { data, error } = await supabase.functions.invoke(functionName, {
		method,
		body,
	});

	if (error) {
		return { ok: false, error: toServiceError(error, "Function call failed") };
	}

	return { ok: true, data: data as T };
}

function decodeBase64UrlToUint8Array(value: string): Uint8Array {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
	const base64 = `${normalized}${padding}`;
	const raw = window.atob(base64);
	const output = new Uint8Array(raw.length);

	for (let index = 0; index < raw.length; index += 1) {
		output[index] = raw.charCodeAt(index);
	}

	return output;
}

export async function fetchReviewReminderConfig(
	options: ReviewReminderRequestOptions = {},
): Promise<ServiceResult<ReviewReminderConfigResponse>> {
	const requestEpoch = options.userId
		? getReviewReminderConfigMutationEpoch(options.userId)
		: null;
	const result = await invokeJson<ReviewReminderConfigResponse>(
		REMINDER_CONFIG_FUNCTION,
		"GET",
	);

	if (
		result.ok &&
		options.userId &&
		requestEpoch === getReviewReminderConfigMutationEpoch(options.userId)
	) {
		cacheReviewReminderConfig(options.userId, result.data);
	}

	return result;
}

export async function updateReviewReminderPreferences(
	preferences: Partial<
		Pick<
			ReviewReminderPreferences,
			"enabled" | "email_enabled" | "calendar_enabled" | "web_push_enabled"
		>
	>,
	options: ReviewReminderRequestOptions = {},
): Promise<ServiceResult<ReviewReminderConfigResponse>> {
	const result = await invokeJson<ReviewReminderConfigResponse>(
		REMINDER_CONFIG_FUNCTION,
		"PATCH",
		{ preferences },
	);

	if (result.ok && options.userId) {
		bumpReviewReminderConfigMutationEpoch(options.userId);
		cacheReviewReminderConfig(options.userId, result.data);
	}

	return result;
}

export async function rotateReviewReminderCalendarToken(
	options: ReviewReminderRequestOptions = {},
): Promise<ServiceResult<ReviewReminderConfigResponse>> {
	const result = await invokeJson<ReviewReminderConfigResponse>(
		REMINDER_CONFIG_FUNCTION,
		"POST",
		{ action: "rotate_calendar_token" },
	);

	if (result.ok && options.userId) {
		bumpReviewReminderConfigMutationEpoch(options.userId);
		cacheReviewReminderConfig(options.userId, result.data);
	}

	return result;
}

export async function upsertReviewReminderWebPushSubscription(
	subscription: PushSubscription,
	deviceLabel: string,
): Promise<ServiceResult<{ subscription: ReviewWebPushSubscription }>> {
	const json = subscription.toJSON();

	return invokeJson(REMINDER_WEB_PUSH_FUNCTION, "POST", {
		subscription: {
			endpoint: json.endpoint,
			expirationTime: json.expirationTime,
			keys: {
				p256dh: json.keys?.p256dh,
				auth: json.keys?.auth,
			},
		},
		device_label: deviceLabel,
		user_agent: navigator.userAgent,
	});
}

export async function removeReviewReminderWebPushSubscription(
	endpoint: string,
): Promise<ServiceResult<{ removed: number }>> {
	return invokeJson(REMINDER_WEB_PUSH_FUNCTION, "DELETE", { endpoint });
}

export async function registerBrowserPushSubscription(
	vapidPublicKey: string,
	deviceLabel = "Navigateur",
): Promise<ServiceResult<{ endpoint: string }>> {
	if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
		return {
			ok: false,
			error: {
				code: "PUSH_UNSUPPORTED",
				message: "Web Push n'est pas disponible sur ce navigateur.",
			},
		};
	}

	if (typeof Notification === "undefined") {
		return {
			ok: false,
			error: {
				code: "PUSH_UNSUPPORTED",
				message: "Notifications non supportees sur ce navigateur.",
			},
		};
	}

	const permission = await Notification.requestPermission();
	if (permission !== "granted") {
		return {
			ok: false,
			error: {
				code: "PUSH_PERMISSION_DENIED",
				message: "Permission de notifications refusée.",
			},
		};
	}

	const registration = await navigator.serviceWorker.ready;
	const existingSubscription = await registration.pushManager.getSubscription();
	const appServerKeyRaw = decodeBase64UrlToUint8Array(vapidPublicKey);
	const appServerKey = new Uint8Array(appServerKeyRaw.length);
	appServerKey.set(appServerKeyRaw);
	const nextSubscription =
		existingSubscription ??
		(await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: appServerKey,
		}));

	const storeResult = await upsertReviewReminderWebPushSubscription(
		nextSubscription,
		deviceLabel,
	);
	if (!storeResult.ok) {
		return storeResult;
	}

	return {
		ok: true,
		data: { endpoint: nextSubscription.endpoint },
	};
}

export async function unregisterBrowserPushSubscription(): Promise<
	ServiceResult<{ removed: boolean }>
> {
	if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
		return {
			ok: false,
			error: {
				code: "PUSH_UNSUPPORTED",
				message: "Web Push n'est pas disponible sur ce navigateur.",
			},
		};
	}

	const registration = await navigator.serviceWorker.ready;
	const subscription = await registration.pushManager.getSubscription();
	if (!subscription) {
		return { ok: true, data: { removed: false } };
	}

	await subscription.unsubscribe();
	const removeResult = await removeReviewReminderWebPushSubscription(
		subscription.endpoint,
	);
	if (!removeResult.ok) {
		return removeResult;
	}

	return { ok: true, data: { removed: true } };
}
