declare const Deno: {
	env: {
		get: (key: string) => string | undefined;
	};
};

import "../types.d.ts";
import "./remote-web-push.d.ts";

import webpush from "https://esm.sh/web-push@3.6.7?target=deno";
import { getEmailBrandingFromEnv, renderBrandedEmail } from "./brandedEmail.ts";
import { isEmailServiceConfigured, sendEmail } from "./emailService.ts";

export const REVIEW_REMINDER_SLOTS = ["morning", "midday", "evening"] as const;
export type ReviewReminderSlot = (typeof REVIEW_REMINDER_SLOTS)[number];
export const REVIEW_REMINDER_BRANCHES = ["streak", "start"] as const;
export type ReviewReminderBranch = (typeof REVIEW_REMINDER_BRANCHES)[number];
export type ReviewReminderChannel = "email" | "web_push";
export type ReviewReminderAttemptStatus = "sent" | "failed" | "skipped";

export type ReviewReminderDispatchCandidate = {
	user_id: string;
	email: string | null;
	username: string;
	notifications_email: boolean;
	scheduler_timezone: string;
	scheduler_day_cutoff_hour: number;
	current_streak: number;
	last_review_date: string | null;
	local_date: string;
	branch: ReviewReminderBranch;
	due_count: number;
	email_enabled: boolean;
	web_push_enabled: boolean;
	calendar_enabled: boolean;
};

export type ReviewReminderCalendarFeedRow = {
	user_id: string;
	scheduler_timezone: string;
	enabled: boolean;
	calendar_enabled: boolean;
	cadence_slots: string[];
	morning_hour: number;
	midday_hour: number;
	evening_hour: number;
	updated_at: string;
};

export type ReviewReminderPreferencesRow = {
	user_id: string;
	enabled: boolean;
	email_enabled: boolean;
	calendar_enabled: boolean;
	web_push_enabled: boolean;
	cadence_slots: string[];
	min_due_count: number;
	daily_cap: number;
	morning_hour: number;
	midday_hour: number;
	evening_hour: number;
	created_at: string;
	updated_at: string;
};

export type ReviewReminderCalendarFeedTokenRow = {
	user_id: string;
	token: string;
	created_at: string;
	updated_at: string;
};

export type ReviewReminderWebPushSubscriptionRow = {
	id: string;
	user_id: string;
	endpoint: string;
	p256dh: string;
	auth: string;
	expiration_time: string | null;
	user_agent: string | null;
	device_label: string | null;
	enabled: boolean;
	failure_count: number;
	last_sent_at: string | null;
	last_error_at: string | null;
	last_error_status: number | null;
	last_error_message: string | null;
	created_at: string;
	updated_at: string;
};

export type ReviewReminderDeliveryAttempt = {
	channel: ReviewReminderChannel;
	status: ReviewReminderAttemptStatus;
	subscriptionId: string | null;
	responseStatus: number | null;
	providerMessageId: string | null;
	errorMessage: string | null;
	payload: Record<string, unknown>;
};

type WebPushConfig = {
	enabled: boolean;
	publicKey: string | null;
	privateKey: string | null;
	subject: string | null;
};

const DEFAULT_REMINDER_APP_PATH = "/app";
const DEFAULT_REMINDER_SETTINGS_PATH = "/app/settings";
const LEGACY_REMINDER_APP_PATH = "/app-legacy";
const DEFAULT_REVIEW_REMINDER_HANDOFF_PATH = "/calendar/review-reminders";
const DEFAULT_CALENDAR_NAME = "Arabe Immersion Review Reminders";
const DEFAULT_EVENT_DURATION_MINUTES = 15;
const PUSH_DISABLE_STATUSES = new Set([404, 410]);
const SLOT_LABELS: Record<ReviewReminderSlot, string> = {
	morning: "Morning",
	midday: "Midday",
	evening: "Evening",
};

function coerceNonEmptyString(value: string | null | undefined): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeHttpUrl(rawUrl: string | null | undefined): string | null {
	const candidate = coerceNonEmptyString(rawUrl);
	if (!candidate) {
		return null;
	}

	try {
		const parsedUrl = new URL(candidate);
		if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
			return null;
		}

		const normalizedPath = parsedUrl.pathname.replace(/\/+$/, "");
		return normalizedPath.length > 0
			? `${parsedUrl.origin}${normalizedPath}`
			: parsedUrl.origin;
	} catch {
		return null;
	}
}

function canonicalizeReviewReminderAppUrl(normalizedUrl: string): string {
	try {
		const parsedUrl = new URL(normalizedUrl);
		const normalizedPath = parsedUrl.pathname.replace(/\/+$/, "");
		const shouldUseCanonicalAppPath =
			normalizedPath === "/app" ||
			normalizedPath.startsWith("/app/") ||
			normalizedPath === LEGACY_REMINDER_APP_PATH ||
			normalizedPath.startsWith(`${LEGACY_REMINDER_APP_PATH}/`);

		if (shouldUseCanonicalAppPath) {
			return `${parsedUrl.origin}${DEFAULT_REMINDER_APP_PATH}`;
		}

		return normalizedPath.length > 0
			? `${parsedUrl.origin}${normalizedPath}`
			: parsedUrl.origin;
	} catch {
		return normalizedUrl;
	}
}

function toIsoStringOrNull(value: string | null | undefined): string | null {
	const candidate = coerceNonEmptyString(value);
	if (!candidate) {
		return null;
	}

	const parsed = Date.parse(candidate);
	if (!Number.isFinite(parsed)) {
		return null;
	}

	return new Date(parsed).toISOString();
}

function getSlotLabel(slot: ReviewReminderSlot): string {
	return SLOT_LABELS[slot];
}

function normalizeCadenceSlots(slots: string[]): ReviewReminderSlot[] {
	const normalizedSlots = slots.filter(
		(slot): slot is ReviewReminderSlot =>
			(slot as ReviewReminderSlot) in SLOT_LABELS,
	);

	return REVIEW_REMINDER_SLOTS.filter((slot) => normalizedSlots.includes(slot));
}

function resolveLocalDateParts(
	now: Date,
	timeZone: string,
): {
	year: number;
	month: number;
	day: number;
} {
	try {
		const formatter = new Intl.DateTimeFormat("en-CA", {
			timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		});
		const parts = formatter.formatToParts(now);
		const year = Number(parts.find((part) => part.type === "year")?.value);
		const month = Number(parts.find((part) => part.type === "month")?.value);
		const day = Number(parts.find((part) => part.type === "day")?.value);

		if ([year, month, day].every((value) => Number.isInteger(value))) {
			return { year, month, day };
		}
	} catch {
		// fall through
	}

	return {
		year: now.getUTCFullYear(),
		month: now.getUTCMonth() + 1,
		day: now.getUTCDate(),
	};
}

function pad2(value: number): string {
	return String(value).padStart(2, "0");
}

function pad4(value: number): string {
	return String(value).padStart(4, "0");
}

function formatIcsLocalDateTime(
	parts: { year: number; month: number; day: number },
	hour: number,
	minute = 0,
): string {
	return `${pad4(parts.year)}${pad2(parts.month)}${pad2(parts.day)}T${pad2(hour)}${pad2(minute)}00`;
}

function formatUtcTimestampForIcs(value: string): string {
	const date = new Date(value);
	return `${pad4(date.getUTCFullYear())}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;
}

function escapeIcsText(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,")
		.replace(/\r?\n/g, "\\n");
}

function foldIcsLine(line: string): string {
	if (line.length <= 73) {
		return line;
	}

	const chunks: string[] = [];
	let remaining = line;
	while (remaining.length > 73) {
		chunks.push(remaining.slice(0, 73));
		remaining = ` ${remaining.slice(73)}`;
	}
	chunks.push(remaining);
	return chunks.join("\r\n");
}

function buildReminderSummary(
	candidate: ReviewReminderDispatchCandidate,
): string {
	if (isReviewReminderStreakBranch(candidate)) {
		return "Tu vas perdre ta série";
	}

	return "Commence ta série aujourd'hui";
}

function buildReminderDescription(
	candidate: ReviewReminderDispatchCandidate,
): string {
	if (isReviewReminderStreakBranch(candidate)) {
		return "Tu vas perdre ta série si tu ne reviens pas aujourd'hui.";
	}

	return "Une petite revue suffit pour commencer ta série aujourd'hui.";
}

function buildReminderGreeting(
	candidate: Pick<ReviewReminderDispatchCandidate, "username">,
): string {
	return `${candidate.username},`;
}

function buildReminderPrimaryCtaLabel(
	candidate: Pick<ReviewReminderDispatchCandidate, "branch">,
): string {
	return isReviewReminderStreakBranch(candidate)
		? "Garder ma série"
		: "Commencer ma série";
}

function buildReminderTag(candidate: ReviewReminderDispatchCandidate): string {
	return `review-reminder-${candidate.local_date}-${candidate.branch}`;
}

function buildReminderEmailContent(
	candidate: ReviewReminderDispatchCandidate,
): {
	subject: string;
	html: string;
	text: string;
} {
	const branding = getEmailBrandingFromEnv();
	const appUrl = resolveReviewReminderAppUrl();
	const settingsUrl = resolveReviewReminderSettingsUrl();
	const intro = [buildReminderDescription(candidate)];
	const rendered = renderBrandedEmail(
		{
			greeting: buildReminderGreeting(candidate),
			preheader: buildReminderDescription(candidate),
			intro,
			ctas: [
				{
					label: buildReminderPrimaryCtaLabel(candidate),
					href: appUrl,
					variant: "primary",
				},
				{
					label: "Désactiver les rappels",
					href: settingsUrl,
					variant: "secondary",
				},
			],
			layout: "compact-reminder",
			hideFooter: true,
			hideCtaFallback: true,
			logoAlignment: "left",
			logoWidth: 52,
		},
		{ branding },
	);

	return {
		subject: buildReminderSummary(candidate),
		html: rendered.html,
		text: rendered.text,
	};
}

function buildReminderPushPayload(candidate: ReviewReminderDispatchCandidate): {
	title: string;
	body: string;
	app_url: string;
	url: string;
	settings_url: string;
	tag: string;
	branch: ReviewReminderBranch;
	dueCount: number;
	streakDays: number;
	localDate: string;
} {
	return {
		title: buildReminderSummary(candidate),
		body: buildReminderDescription(candidate),
		app_url: resolveReviewReminderAppUrl(),
		url: resolveReviewReminderAppUrl(),
		settings_url: resolveReviewReminderSettingsUrl(),
		tag: buildReminderTag(candidate),
		branch: candidate.branch,
		dueCount: candidate.due_count,
		streakDays: candidate.current_streak,
		localDate: candidate.local_date,
	};
}

export function resolveReviewReminderAppUrl(): string {
	const explicitUrl = normalizeHttpUrl(
		Deno.env.get("REVIEW_REMINDERS_APP_URL") ??
			Deno.env.get("REVIEW_REMINDER_APP_URL"),
	);
	if (explicitUrl) {
		return canonicalizeReviewReminderAppUrl(explicitUrl);
	}

	const brandingSiteUrl = normalizeHttpUrl(getEmailBrandingFromEnv().siteUrl);
	if (brandingSiteUrl) {
		return `${brandingSiteUrl}${DEFAULT_REMINDER_APP_PATH}`;
	}

	return `https://www.arabeimmersion.fr${DEFAULT_REMINDER_APP_PATH}`;
}

export function resolveReviewReminderSettingsUrl(): string {
	const publicBaseUrl = new URL(resolveReviewReminderPublicBaseUrl());
	const basePathname = publicBaseUrl.pathname.replace(/\/+$/, "");
	publicBaseUrl.pathname = `${basePathname}${DEFAULT_REMINDER_SETTINGS_PATH}`;
	publicBaseUrl.search = "";
	publicBaseUrl.hash = "";
	return publicBaseUrl.toString();
}

function resolveReviewReminderPublicBaseUrl(): string {
	const appUrl = new URL(resolveReviewReminderAppUrl());
	const normalizedAppPath = DEFAULT_REMINDER_APP_PATH.replace(/\/+$/, "");
	const normalizedPathname = appUrl.pathname.replace(/\/+$/, "");
	const publicPathname =
		normalizedAppPath.length > 0 &&
		(normalizedPathname === normalizedAppPath ||
			normalizedPathname.endsWith(normalizedAppPath))
			? normalizedPathname.slice(0, -normalizedAppPath.length)
			: normalizedPathname;

	return publicPathname.length > 0
		? `${appUrl.origin}${publicPathname}`
		: appUrl.origin;
}

export function resolveReviewReminderFunctionsBaseUrl(): string | null {
	const explicitBaseUrl = normalizeHttpUrl(
		Deno.env.get("REVIEW_REMINDERS_PUBLIC_BASE_URL"),
	);
	if (explicitBaseUrl) {
		return explicitBaseUrl;
	}

	const supabaseUrl = normalizeHttpUrl(Deno.env.get("SUPABASE_URL"));
	if (!supabaseUrl) {
		return null;
	}

	return `${supabaseUrl}/functions/v1`;
}

export function buildReviewReminderCalendarFeedUrl(
	token: string,
): string | null {
	const normalizedToken = coerceNonEmptyString(token);
	if (!normalizedToken) {
		return null;
	}

	const explicitCalendarUrl = normalizeHttpUrl(
		Deno.env.get("REVIEW_REMINDERS_CALENDAR_URL_BASE") ??
			Deno.env.get("REVIEW_REMINDER_CALENDAR_URL_BASE"),
	);
	const baseUrl = explicitCalendarUrl
		? explicitCalendarUrl
		: (() => {
				const functionsBaseUrl = resolveReviewReminderFunctionsBaseUrl();
				return functionsBaseUrl
					? `${functionsBaseUrl}/review-reminders-calendar-v1`
					: null;
			})();
	if (!baseUrl) {
		return null;
	}

	try {
		if (new URL(baseUrl).hostname === "kong") {
			return null;
		}
	} catch {
		return null;
	}

	return `${baseUrl}?token=${encodeURIComponent(normalizedToken)}`;
}

export function buildReviewReminderCalendarSubscribeUrl(
	token: string,
): string | null {
	const feedUrl = buildReviewReminderCalendarFeedUrl(token);
	if (!feedUrl) {
		return null;
	}

	return feedUrl.replace(/^https?:\/\//i, "webcal://");
}

export function buildReviewReminderCalendarHandoffUrl(
	token: string,
): string | null {
	const normalizedToken = coerceNonEmptyString(token);
	if (!normalizedToken) {
		return null;
	}

	const publicBaseUrl = new URL(resolveReviewReminderPublicBaseUrl());
	const basePathname = publicBaseUrl.pathname.replace(/\/+$/, "");
	publicBaseUrl.pathname = `${basePathname}${DEFAULT_REVIEW_REMINDER_HANDOFF_PATH}/${encodeURIComponent(normalizedToken)}`;
	publicBaseUrl.search = "";
	publicBaseUrl.hash = "";
	return publicBaseUrl.toString();
}

export function resolveWebPushVapidConfig(): WebPushConfig {
	const publicKey = coerceNonEmptyString(
		Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY") ??
			Deno.env.get("VAPID_PUBLIC_KEY"),
	);
	const privateKey = coerceNonEmptyString(
		Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY") ??
			Deno.env.get("VAPID_PRIVATE_KEY"),
	);
	const subject = coerceNonEmptyString(
		Deno.env.get("WEB_PUSH_VAPID_SUBJECT") ?? Deno.env.get("VAPID_SUBJECT"),
	);

	return {
		enabled: !!publicKey && !!privateKey && !!subject,
		publicKey: publicKey ?? null,
		privateKey: privateKey ?? null,
		subject: subject ?? null,
	};
}

export function getReviewReminderWebPushPublicConfig(): {
	enabled: boolean;
	publicKey: string | null;
} {
	const config = resolveWebPushVapidConfig();
	return {
		enabled: config.enabled,
		publicKey: config.enabled ? config.publicKey : null,
	};
}

export function isReviewReminderStreakBranch(
	candidate: Pick<ReviewReminderDispatchCandidate, "branch">,
): boolean {
	return candidate.branch === "streak";
}

export function truncateReminderErrorMessage(
	value: string | null | undefined,
): string | null {
	const normalized = coerceNonEmptyString(value);
	if (!normalized) {
		return null;
	}

	return normalized.slice(0, 1000);
}

export function shouldDisableWebPushSubscription(
	status: number | null,
): boolean {
	return status !== null && PUSH_DISABLE_STATUSES.has(status);
}

export async function dispatchReviewReminderEmail(
	candidate: ReviewReminderDispatchCandidate,
): Promise<ReviewReminderDeliveryAttempt> {
	if (!candidate.email_enabled) {
		return {
			channel: "email",
			status: "skipped",
			subscriptionId: null,
			responseStatus: null,
			providerMessageId: null,
			errorMessage: null,
			payload: { reason: "EMAIL_CHANNEL_DISABLED" },
		};
	}

	if (!candidate.notifications_email) {
		return {
			channel: "email",
			status: "skipped",
			subscriptionId: null,
			responseStatus: null,
			providerMessageId: null,
			errorMessage: null,
			payload: { reason: "PROFILE_EMAIL_NOTIFICATIONS_DISABLED" },
		};
	}

	if (!coerceNonEmptyString(candidate.email)) {
		return {
			channel: "email",
			status: "skipped",
			subscriptionId: null,
			responseStatus: null,
			providerMessageId: null,
			errorMessage: null,
			payload: { reason: "MISSING_EMAIL_ADDRESS" },
		};
	}

	if (!isEmailServiceConfigured()) {
		return {
			channel: "email",
			status: "skipped",
			subscriptionId: null,
			responseStatus: null,
			providerMessageId: null,
			errorMessage: null,
			payload: { reason: "EMAIL_SERVICE_NOT_CONFIGURED" },
		};
	}

	const branding = getEmailBrandingFromEnv();
	const emailContent = buildReminderEmailContent(candidate);
	const emailResult = await sendEmail({
		from: branding.from,
		to: [candidate.email ?? ""],
		replyTo: branding.replyTo,
		subject: emailContent.subject,
		html: emailContent.html,
		text: emailContent.text,
		tags: [
			{ name: "feature", value: "review-reminders" },
			{ name: "branch", value: candidate.branch },
		],
	});

	if (emailResult.ok) {
		return {
			channel: "email",
			status: "sent",
			subscriptionId: null,
			responseStatus: 200,
			providerMessageId: emailResult.id,
			errorMessage: null,
			payload: {
				subject: emailContent.subject,
				branch: candidate.branch,
				due_count: candidate.due_count,
				settings_url: resolveReviewReminderSettingsUrl(),
			},
		};
	}

	return {
		channel: "email",
		status: "failed",
		subscriptionId: null,
		responseStatus: emailResult.status || null,
		providerMessageId: null,
		errorMessage: truncateReminderErrorMessage(emailResult.error),
		payload: {
			subject: emailContent.subject,
			retryable: emailResult.retryable,
			branch: candidate.branch,
		},
	};
}

export async function dispatchReviewReminderWebPush(
	candidate: ReviewReminderDispatchCandidate,
	subscriptions: ReviewReminderWebPushSubscriptionRow[],
): Promise<ReviewReminderDeliveryAttempt[]> {
	if (!candidate.web_push_enabled) {
		return [
			{
				channel: "web_push",
				status: "skipped",
				subscriptionId: null,
				responseStatus: null,
				providerMessageId: null,
				errorMessage: null,
				payload: { reason: "WEB_PUSH_CHANNEL_DISABLED" },
			},
		];
	}

	const vapidConfig = resolveWebPushVapidConfig();
	if (
		!vapidConfig.enabled ||
		!vapidConfig.publicKey ||
		!vapidConfig.privateKey ||
		!vapidConfig.subject
	) {
		return [
			{
				channel: "web_push",
				status: "skipped",
				subscriptionId: null,
				responseStatus: null,
				providerMessageId: null,
				errorMessage: null,
				payload: { reason: "WEB_PUSH_VAPID_NOT_CONFIGURED" },
			},
		];
	}

	const activeSubscriptions = subscriptions.filter((subscription) => {
		if (!subscription.enabled) {
			return false;
		}

		const expirationTime = toIsoStringOrNull(subscription.expiration_time);
		return !expirationTime || Date.parse(expirationTime) > Date.now();
	});

	if (activeSubscriptions.length === 0) {
		return [
			{
				channel: "web_push",
				status: "skipped",
				subscriptionId: null,
				responseStatus: null,
				providerMessageId: null,
				errorMessage: null,
				payload: { reason: "NO_ACTIVE_WEB_PUSH_SUBSCRIPTIONS" },
			},
		];
	}

	webpush.setVapidDetails(
		vapidConfig.subject,
		vapidConfig.publicKey,
		vapidConfig.privateKey,
	);

	const payload = buildReminderPushPayload(candidate);
	const attempts: ReviewReminderDeliveryAttempt[] = [];

	for (const subscription of activeSubscriptions) {
		const pushSubscription = {
			endpoint: subscription.endpoint,
			expirationTime: subscription.expiration_time
				? Date.parse(subscription.expiration_time)
				: null,
			keys: {
				p256dh: subscription.p256dh,
				auth: subscription.auth,
			},
		};

		try {
			const response = await webpush.sendNotification(
				pushSubscription,
				JSON.stringify(payload),
				{ TTL: 3600 },
			);
			attempts.push({
				channel: "web_push",
				status: "sent",
				subscriptionId: subscription.id,
				responseStatus:
					typeof response?.statusCode === "number" ? response.statusCode : 201,
				providerMessageId: null,
				errorMessage: null,
				payload,
			});
		} catch (error: unknown) {
			const errorRecord =
				typeof error === "object" && error !== null
					? (error as Record<string, unknown>)
					: null;
			const statusCode =
				typeof errorRecord?.statusCode === "number"
					? Math.floor(errorRecord.statusCode)
					: null;
			const errorMessage = truncateReminderErrorMessage(
				error instanceof Error
					? error.message
					: typeof errorRecord?.body === "string"
						? errorRecord.body
						: String(error),
			);
			attempts.push({
				channel: "web_push",
				status: "failed",
				subscriptionId: subscription.id,
				responseStatus: statusCode,
				providerMessageId: null,
				errorMessage,
				payload,
			});
		}
	}

	return attempts;
}

export function renderReviewReminderCalendarFeed(
	feed: ReviewReminderCalendarFeedRow,
): string {
	const branding = getEmailBrandingFromEnv();
	const now = new Date();
	const localDate = resolveLocalDateParts(now, feed.scheduler_timezone);
	const appUrl = resolveReviewReminderAppUrl();
	const slots = normalizeCadenceSlots(feed.cadence_slots);
	const baseLines: string[] = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		`PRODID:${escapeIcsText(`-//${branding.brandName}//Review Reminders//EN`)}`,
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		`X-WR-CALNAME:${escapeIcsText(DEFAULT_CALENDAR_NAME)}`,
		`X-WR-TIMEZONE:${escapeIcsText(feed.scheduler_timezone)}`,
		"REFRESH-INTERVAL;VALUE=DURATION:PT6H",
		"X-PUBLISHED-TTL:PT6H",
	];

	if (feed.enabled && feed.calendar_enabled && slots.length > 0) {
		for (const slot of slots) {
			const hour =
				slot === "morning"
					? feed.morning_hour
					: slot === "midday"
						? feed.midday_hour
						: feed.evening_hour;
			const endMinute = DEFAULT_EVENT_DURATION_MINUTES;
			const slotLabel = getSlotLabel(slot);
			const description = `${slotLabel} reminder for your daily review queue. Open ${appUrl}`;
			baseLines.push(
				"BEGIN:VEVENT",
				foldIcsLine(
					`UID:${escapeIcsText(`${feed.user_id}-${slot}@review-reminders.arabeimmersion`)}`,
				),
				foldIcsLine(
					`DTSTAMP:${formatUtcTimestampForIcs(feed.updated_at || now.toISOString())}`,
				),
				foldIcsLine(
					`LAST-MODIFIED:${formatUtcTimestampForIcs(feed.updated_at || now.toISOString())}`,
				),
				foldIcsLine(
					`DTSTART;TZID=${escapeIcsText(feed.scheduler_timezone)}:${formatIcsLocalDateTime(localDate, hour, 0)}`,
				),
				foldIcsLine(
					`DTEND;TZID=${escapeIcsText(feed.scheduler_timezone)}:${formatIcsLocalDateTime(localDate, hour, endMinute)}`,
				),
				"RRULE:FREQ=DAILY",
				foldIcsLine(
					`SUMMARY:${escapeIcsText(`${branding.brandName} ${slotLabel} review reminder`)}`,
				),
				foldIcsLine(`DESCRIPTION:${escapeIcsText(description)}`),
				foldIcsLine(`URL:${escapeIcsText(appUrl)}`),
				"STATUS:CONFIRMED",
				"TRANSP:OPAQUE",
				"BEGIN:VALARM",
				"ACTION:DISPLAY",
				foldIcsLine(
					`DESCRIPTION:${escapeIcsText(`${branding.brandName} ${slotLabel} reminder`)}`,
				),
				"TRIGGER:-PT0M",
				"END:VALARM",
				"END:VEVENT",
			);
		}
	}

	baseLines.push("END:VCALENDAR");
	return `${baseLines.join("\r\n")}\r\n`;
}
