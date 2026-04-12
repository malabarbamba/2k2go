import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const REQUEST_CONTEXT_SECRET = Deno.env.get("REQUEST_CONTEXT_SECRET") ?? "";
const CORS_ALLOWED_ORIGINS = Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "";
const CORS_ALLOWED_ORIGINS_STRICT =
	(Deno.env.get("CORS_ALLOWED_ORIGINS_STRICT") ?? "true").toLowerCase() !== "false";

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const encoder = new TextEncoder();

type DeckDownloadPayload = {
	clickId: string;
	deckKey: string;
	sourceName: string;
	pagePath: string;
	referrer: string | null;
	locale: string | null;
	userId: string | null;
	visitorId: string | null;
};

const serviceClient =
	SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
		? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
				auth: { persistSession: false, autoRefreshToken: false },
			})
		: null;

const escapeRegExp = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeString = (value: unknown, maxLength: number): string => {
	if (typeof value !== "string") {
		return "";
	}

	const trimmedValue = value.trim();
	if (trimmedValue.length === 0) {
		return "";
	}

	return trimmedValue.slice(0, maxLength);
};

const normalizeNullableString = (
	value: unknown,
	maxLength: number,
): string | null => {
	const normalizedValue = normalizeString(value, maxLength);
	return normalizedValue.length > 0 ? normalizedValue : null;
};

const isUuid = (value: string): boolean => UUID_PATTERN.test(value);

const parseAllowedOriginPatterns = (value: string): RegExp[] =>
	value
		.split(",")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)
		.map(
			(entry) =>
				new RegExp(`^${escapeRegExp(entry).replaceAll("\\*", "[^/]+")}$`, "i"),
		);

const allowedOriginPatterns = parseAllowedOriginPatterns(CORS_ALLOWED_ORIGINS);

const isLoopbackOrigin = (origin: string): boolean => {
	try {
		const parsedOrigin = new URL(origin);
		if (
			parsedOrigin.protocol !== "http:" &&
			parsedOrigin.protocol !== "https:"
		) {
			return false;
		}

		const hostname = parsedOrigin.hostname.toLowerCase();
		return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
	} catch {
		return false;
	}
};

const isOriginAllowed = (origin: string | null): boolean => {
	if (!origin || origin.trim().length === 0) {
		return !CORS_ALLOWED_ORIGINS_STRICT;
	}

	if (isLoopbackOrigin(origin)) {
		return true;
	}

	if (allowedOriginPatterns.length === 0) {
		return true;
	}

	return allowedOriginPatterns.some((pattern) => pattern.test(origin));
};

const resolveResponseOrigin = (origin: string | null): string => {
	if (origin && isOriginAllowed(origin)) {
		return origin;
	}

	return CORS_ALLOWED_ORIGINS_STRICT ? "null" : origin ?? "*";
};

const jsonResponse = (body: unknown, status = 200, origin: string | null = null) =>
	new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json",
			"Access-Control-Allow-Origin": resolveResponseOrigin(origin),
			"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
			"Access-Control-Allow-Methods": "POST, OPTIONS",
			"Vary": "Origin",
		},
	});

const parseRequestBody = async (req: Request): Promise<DeckDownloadPayload | null> => {
	let payload: unknown;
	try {
		payload = await req.json();
	} catch {
		return null;
	}

	if (!payload || typeof payload !== "object") {
		return null;
	}

	const record = payload as Record<string, unknown>;
	return {
		clickId: normalizeString(record.clickId, 128),
		deckKey: normalizeString(record.deckKey, 64),
		sourceName: normalizeString(record.sourceName, 64),
		pagePath: normalizeString(record.pagePath, 512),
		referrer: normalizeNullableString(record.referrer, 2048),
		locale: normalizeNullableString(record.locale, 16),
		userId: normalizeNullableString(record.userId, 64),
		visitorId: normalizeNullableString(record.visitorId, 128),
	};
};

const validatePayload = (payload: DeckDownloadPayload): string | null => {
	if (payload.clickId.length < 16) {
		return "Invalid click id.";
	}

	if (payload.deckKey.length === 0) {
		return "Invalid deck key.";
	}

	if (payload.sourceName.length === 0) {
		return "Invalid source name.";
	}

	if (payload.pagePath.length === 0 || !payload.pagePath.startsWith("/")) {
		return "Invalid page path.";
	}

	if (payload.userId && !isUuid(payload.userId)) {
		return "Invalid user id.";
	}

	return null;
};

const decodeBase64Url = (value: string): string | null => {
	const normalizedValue = value.replaceAll("-", "+").replaceAll("_", "/");
	const paddingLength = (4 - (normalizedValue.length % 4)) % 4;
	const paddedValue = `${normalizedValue}${"=".repeat(paddingLength)}`;

	try {
		return atob(paddedValue);
	} catch {
		return null;
	}
};

const resolveAuthenticatedUserId = (authorizationHeader: string | null): string | null => {
	if (!authorizationHeader) {
		return null;
	}

	const token = authorizationHeader.replace(/^Bearer\s+/i, "").trim();
	const segments = token.split(".");
	if (segments.length !== 3) {
		return null;
	}

	const payload = decodeBase64Url(segments[1]);
	if (!payload) {
		return null;
	}

	try {
		const parsedPayload = JSON.parse(payload) as {
			role?: unknown;
			sub?: unknown;
		};
		if (
			typeof parsedPayload.sub === "string" &&
			isUuid(parsedPayload.sub) &&
			parsedPayload.role !== "anon"
		) {
			return parsedPayload.sub;
		}
	} catch {
		return null;
	}

	return null;
};

const resolveClientIp = (headers: Headers): string | null => {
	const directIpHeaders = [
		"cf-connecting-ip",
		"x-real-ip",
		"fly-client-ip",
		"x-client-ip",
	];

	for (const headerName of directIpHeaders) {
		const headerValue = headers.get(headerName);
		const normalizedValue = normalizeNullableString(headerValue, 256);
		if (normalizedValue) {
			return normalizedValue;
		}
	}

	const forwardedFor = headers.get("x-forwarded-for");
	if (!forwardedFor) {
		return null;
	}

	const firstForwardedIp = forwardedFor
		.split(",")
		.map((entry) => entry.trim())
		.find((entry) => entry.length > 0);

	return firstForwardedIp ? firstForwardedIp.slice(0, 256) : null;
};

const resolveCountry = (headers: Headers): string | null => {
	const candidateHeaders = [
		"cf-ipcountry",
		"x-vercel-ip-country",
		"x-country-code",
		"x-country",
	];

	for (const headerName of candidateHeaders) {
		const headerValue = normalizeString(headers.get(headerName), 8).toUpperCase();
		if (
			headerValue.length > 0 &&
			COUNTRY_PATTERN.test(headerValue) &&
			headerValue !== "XX" &&
			headerValue !== "T1"
		) {
			return headerValue;
		}
	}

	return null;
};

const resolveBrowser = (userAgent: string | null): string | null => {
	const normalizedUserAgent = normalizeString(userAgent, 1024).toLowerCase();
	if (normalizedUserAgent.length === 0) {
		return null;
	}

	if (normalizedUserAgent.includes("edg/")) {
		return "edge";
	}
	if (
		normalizedUserAgent.includes("chrome/") &&
		!normalizedUserAgent.includes("edg/") &&
		!normalizedUserAgent.includes("opr/")
	) {
		return "chrome";
	}
	if (normalizedUserAgent.includes("firefox/")) {
		return "firefox";
	}
	if (
		normalizedUserAgent.includes("safari/") &&
		!normalizedUserAgent.includes("chrome/")
	) {
		return "safari";
	}
	if (normalizedUserAgent.includes("opr/")) {
		return "opera";
	}

	return "other";
};

const hashIpAddress = async (ipAddress: string | null): Promise<string | null> => {
	if (!ipAddress) {
		return null;
	}

	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(REQUEST_CONTEXT_SECRET),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		encoder.encode(ipAddress),
	);

	return Array.from(new Uint8Array(signature))
		.map((value) => value.toString(16).padStart(2, "0"))
		.join("");
};

serve(async (req) => {
	const origin = req.headers.get("origin");

	if (req.method === "OPTIONS") {
		if (!isOriginAllowed(origin)) {
			return jsonResponse({ error: "Origin not allowed." }, 403, origin);
		}
		return jsonResponse({ ok: true }, 200, origin);
	}

	if (req.method !== "POST") {
		return jsonResponse({ error: "Method not allowed." }, 405, origin);
	}

	if (!isOriginAllowed(origin)) {
		return jsonResponse({ error: "Origin not allowed." }, 403, origin);
	}

	if (!serviceClient || !REQUEST_CONTEXT_SECRET) {
		console.error("deck-download-init misconfigured");
		return jsonResponse({ error: "Service unavailable." }, 503, origin);
	}

	const payload = await parseRequestBody(req);
	if (!payload) {
		return jsonResponse({ error: "Invalid payload." }, 400, origin);
	}

	const validationError = validatePayload(payload);
	if (validationError) {
		return jsonResponse({ error: validationError }, 400, origin);
	}

	const authorizationHeader = req.headers.get("authorization");
	const authenticatedUserId = resolveAuthenticatedUserId(authorizationHeader);
	const userId = authenticatedUserId ?? payload.userId;
	const userAgent = normalizeNullableString(req.headers.get("user-agent"), 1024);
	const browser = resolveBrowser(userAgent);
	const ipAddress = resolveClientIp(req.headers);
	const ipHash = await hashIpAddress(ipAddress);
	const country = resolveCountry(req.headers);

	const { error } = await serviceClient.from("deck_download_events").upsert(
		{
			click_id: payload.clickId,
			deck_key: payload.deckKey,
			source_name: payload.sourceName,
			page_path: payload.pagePath,
			referrer: payload.referrer,
			locale: payload.locale,
			user_id: userId,
			visitor_id: payload.visitorId,
			country,
			browser,
			user_agent: userAgent,
			ip_hash: ipHash,
		},
		{
			onConflict: "click_id",
			ignoreDuplicates: true,
		},
	);

	if (error) {
		console.error("Failed to record deck download event", error);
		return jsonResponse({ error: "Unable to record download event." }, 500, origin);
	}

	return jsonResponse({ ok: true }, 200, origin);
});
