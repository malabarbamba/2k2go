declare const Deno: {
	env: {
		get: (key: string) => string | undefined;
	};
};

const DEFAULT_ALLOWED_ORIGINS = [
	"https://www.arabeimmersion.fr",
	"https://arabeimmersion.fr",
	"https://arabeimmersion.pages.dev",
	"https://arabeurgence.com",
	"https://www.arabeurgence.com",
	"https://arabeurgence.lovable.app",
	"https://www.arabeurgence.lovable.app",
	"http://localhost:3000",
	"http://localhost:3001",
	"http://localhost:8080",
	"http://localhost:8082",
	"http://127.0.0.1:3000",
	"http://127.0.0.1:3001",
	"http://127.0.0.1:8080",
	"http://127.0.0.1:8082",
	"http://[::1]:3000",
	"http://[::1]:3001",
	"http://[::1]:8080",
	"http://[::1]:8082",
];

type CorsOptions = {
	methods: string;
	allowHeaders?: string;
	allowCredentials?: boolean;
};

const DEFAULT_ALLOW_HEADERS =
	"authorization, x-client-info, apikey, content-type";

function normalizeOrigin(value: string): string {
	return value.trim().toLowerCase();
}

function isStrictAllowlistMode(): boolean {
	const rawValue = Deno.env.get("CORS_ALLOWED_ORIGINS_STRICT");
	if (!rawValue) {
		return false;
	}

	const normalizedValue = rawValue.trim().toLowerCase();
	return (
		normalizedValue === "true" ||
		normalizedValue === "1" ||
		normalizedValue === "yes"
	);
}

function parseOriginUrl(value: string): URL | null {
	try {
		return new URL(value);
	} catch {
		return null;
	}
}

function isCloudflarePagesPreviewOrigin(
	reqOrigin: string,
	allowedOrigins: string[],
): boolean {
	const requestUrl = parseOriginUrl(reqOrigin);
	if (!requestUrl) {
		return false;
	}

	const requestHostname = requestUrl.hostname.trim().toLowerCase();
	if (!requestHostname.endsWith(".pages.dev")) {
		return false;
	}

	for (const allowedOrigin of allowedOrigins) {
		const allowedOriginUrl = parseOriginUrl(allowedOrigin);
		if (!allowedOriginUrl) {
			continue;
		}

		const allowedHostname = allowedOriginUrl.hostname.trim().toLowerCase();
		if (!allowedHostname.endsWith(".pages.dev")) {
			continue;
		}

		if (
			requestHostname === allowedHostname ||
			requestHostname.endsWith(`.${allowedHostname}`)
		) {
			return true;
		}
	}

	return false;
}

function getAllowedOrigins(): string[] {
	const rawEnv = Deno.env.get("CORS_ALLOWED_ORIGINS");
	const fromEnv = rawEnv
		? rawEnv
				.split(",")
				.map((entry) => entry.trim())
				.filter((entry) => entry.length > 0)
		: [];

	const configuredOrigins =
		fromEnv.length === 0
			? DEFAULT_ALLOWED_ORIGINS
			: isStrictAllowlistMode()
				? fromEnv
				: [...DEFAULT_ALLOWED_ORIGINS, ...fromEnv];

	const origins = configuredOrigins.map(normalizeOrigin);

	return [...new Set(origins)];
}

function isLovableSubdomain(origin: string): boolean {
	return origin.endsWith(".lovable.app") || origin === "https://lovable.app";
}

function isLocalhostOrigin(origin: string): boolean {
	const parsedOrigin = parseOriginUrl(origin);
	if (!parsedOrigin) {
		return false;
	}

	if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") {
		return false;
	}

	const hostname = parsedOrigin.hostname.trim().toLowerCase();
	return (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "::1" ||
		hostname === "[::1]"
	);
}

function resolveAllowedOrigin(reqOrigin: string | null): string | null {
	const allowedOrigins = getAllowedOrigins();

	if (!reqOrigin) {
		return null;
	}

	const normalizedRequestOrigin = normalizeOrigin(reqOrigin);
	if (allowedOrigins.includes("*")) {
		return "*";
	}

	if (allowedOrigins.includes(normalizedRequestOrigin)) {
		return reqOrigin;
	}

	if (
		isLovableSubdomain(normalizedRequestOrigin) &&
		allowedOrigins.some((origin) => origin.endsWith(".lovable.app"))
	) {
		return reqOrigin;
	}

	if (isCloudflarePagesPreviewOrigin(normalizedRequestOrigin, allowedOrigins)) {
		return reqOrigin;
	}

	if (
		isLocalhostOrigin(normalizedRequestOrigin) &&
		allowedOrigins.some((origin) => isLocalhostOrigin(origin))
	) {
		return reqOrigin;
	}

	return null;
}

export function isAllowedOrigin(reqOrigin: string | null): boolean {
	if (!reqOrigin) {
		return false;
	}

	const allowedOrigins = getAllowedOrigins();
	const normalizedRequestOrigin = normalizeOrigin(reqOrigin);

	if (allowedOrigins.includes("*")) {
		return true;
	}

	if (allowedOrigins.includes(normalizedRequestOrigin)) {
		return true;
	}

	if (
		isLovableSubdomain(normalizedRequestOrigin) &&
		allowedOrigins.some((origin) => origin.endsWith(".lovable.app"))
	) {
		return true;
	}

	if (isCloudflarePagesPreviewOrigin(normalizedRequestOrigin, allowedOrigins)) {
		return true;
	}

	if (
		isLocalhostOrigin(normalizedRequestOrigin) &&
		allowedOrigins.some((origin) => isLocalhostOrigin(origin))
	) {
		return true;
	}

	return false;
}

export function buildCorsHeaders(
	req: Request,
	options: CorsOptions,
): Record<string, string> {
	const allowOrigin = resolveAllowedOrigin(req.headers.get("origin"));
	const headers: Record<string, string> = {
		"Access-Control-Allow-Headers":
			options.allowHeaders ?? DEFAULT_ALLOW_HEADERS,
		"Access-Control-Allow-Methods": options.methods,
		Vary: "Origin, Access-Control-Request-Headers",
	};

	if (allowOrigin) {
		headers["Access-Control-Allow-Origin"] = allowOrigin;
	}

	if (
		allowOrigin &&
		allowOrigin !== "*" &&
		options.allowCredentials !== false
	) {
		headers["Access-Control-Allow-Credentials"] = "true";
	}

	return headers;
}

export function optionsResponse(req: Request, options: CorsOptions): Response {
	return new Response(null, {
		status: 204,
		headers: buildCorsHeaders(req, options),
	});
}

export function jsonResponse(
	req: Request,
	body: unknown,
	status: number,
	options: CorsOptions,
): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			...buildCorsHeaders(req, options),
			"Content-Type": "application/json",
		},
	});
}
