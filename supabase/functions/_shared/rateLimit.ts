declare const Deno: {
	env: {
		get: (key: string) => string | undefined;
	};
};

const ONE_HOUR_MS = 60 * 60 * 1000;
const UPSTASH_REDIS_REST_URL_ENV = "UPSTASH_REDIS_REST_URL";
const UPSTASH_REDIS_REST_TOKEN_ENV = "UPSTASH_REDIS_REST_TOKEN";
const UPSTASH_RATE_LIMIT_KEY_PREFIX = "edge-rate-limit";
const UPSTASH_REQUEST_TIMEOUT_MS = 1500;
const RATE_LIMIT_EXCEEDED_REASON =
	"Trop de demandes. Veuillez reessayer plus tard.";
const UPSTASH_INCREMENT_SCRIPT = [
	'local current = redis.call("GET", KEYS[1])',
	"local window_ms = tonumber(ARGV[1])",
	"local max_requests = tonumber(ARGV[2])",
	"if not current then",
	'  redis.call("SET", KEYS[1], 1, "PX", window_ms)',
	"  return {1, 1}",
	"end",
	"current = tonumber(current)",
	"if not current then",
	'  return redis.error_reply("ERR invalid rate limit counter")',
	"end",
	"if current >= max_requests then",
	"  return {current, 0}",
	"end",
	'current = redis.call("INCR", KEYS[1])',
	"return {current, 1}",
].join("\n");

type RateLimitRecord = {
	window_start: string;
	count: number;
};

type SupabaseError = {
	message: string;
	code?: string;
};

type SupabaseRateLimitClient = {
	from: (table: "edge_rate_limits") => {
		select: (columns: string) => {
			eq: (
				column: string,
				value: string,
			) => {
				eq: (
					column: string,
					value: string,
				) => {
					maybeSingle: () => Promise<{
						data: RateLimitRecord | null;
						error: SupabaseError | null;
					}>;
				};
			};
		};
		insert: (payload: {
			bucket: string;
			key_hash: string;
			window_start: string;
			count: number;
			updated_at: string;
		}) => Promise<{
			error: SupabaseError | null;
		}>;
		update: (payload: {
			window_start?: string;
			count?: number;
			updated_at: string;
		}) => {
			eq: (
				column: string,
				value: string,
			) => {
				eq: (
					column: string,
					value: string,
				) => Promise<{
					error: SupabaseError | null;
				}>;
			};
		};
	};
};

export type RateLimitPolicy = {
	bucket: string;
	maxRequests: number;
	windowMs?: number;
	identity?: string | null;
	identityMaxRequests?: number;
};

export type RateLimitResult = {
	allowed: boolean;
	reason?: string;
};

type ConsumeRateLimitParams = {
	supabaseAdmin: SupabaseRateLimitClient;
	bucket: string;
	keyHash: string;
	maxRequests: number;
	windowMs: number;
	now: Date;
};

type UpstashRateLimitConfig = {
	url: string;
	token: string;
};

type UpstashEvalResponse = {
	result?: unknown;
	error?: string;
};

function toBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.byteLength; i += 1) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

async function createKeyHash(
	identifier: string,
	userAgent: string,
): Promise<string> {
	const payload = `${identifier}:${userAgent}`;
	const hashBuffer = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(payload),
	);
	return toBase64(hashBuffer).slice(0, 44);
}

function getUpstashRateLimitConfig(): UpstashRateLimitConfig | null {
	const url = Deno.env.get(UPSTASH_REDIS_REST_URL_ENV)?.trim();
	const token = Deno.env.get(UPSTASH_REDIS_REST_TOKEN_ENV)?.trim();

	if (!url || !token) {
		return null;
	}

	return {
		url: url.replace(/\/+$/, ""),
		token,
	};
}

const upstashRateLimitConfig = getUpstashRateLimitConfig();

function buildUpstashRateLimitKey(
	bucket: string,
	keyHash: string,
	windowMs: number,
): string {
	return `${UPSTASH_RATE_LIMIT_KEY_PREFIX}:${bucket}:${windowMs}:${keyHash}`;
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

function getUpstashResult(payload: unknown): unknown {
	if (typeof payload !== "object" || payload === null) {
		return payload;
	}

	if (!("result" in payload)) {
		return payload;
	}

	return (payload as UpstashEvalResponse).result;
}

async function consumeUpstashRateLimit({
	bucket,
	keyHash,
	maxRequests,
	windowMs,
}: Omit<
	ConsumeRateLimitParams,
	"supabaseAdmin" | "now"
>): Promise<RateLimitResult | null> {
	const config = upstashRateLimitConfig;
	if (!config) {
		return null;
	}

	try {
		const response = await fetch(`${config.url}/eval`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${config.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				script: UPSTASH_INCREMENT_SCRIPT,
				keys: [buildUpstashRateLimitKey(bucket, keyHash, windowMs)],
				args: [windowMs, maxRequests],
			}),
			signal: AbortSignal.timeout(UPSTASH_REQUEST_TIMEOUT_MS),
		});

		if (!response.ok) {
			const body = await response.text().catch(() => "");
			console.error("Upstash rate limit request failed", {
				bucket,
				status: response.status,
				body: body.slice(0, 200),
			});
			return null;
		}

		const payload = (await response.json()) as UpstashEvalResponse | unknown;
		if (
			typeof payload === "object" &&
			payload !== null &&
			"error" in payload &&
			typeof (payload as UpstashEvalResponse).error === "string"
		) {
			console.error("Upstash rate limit response failed", {
				bucket,
				error: (payload as UpstashEvalResponse).error,
			});
			return null;
		}

		const result = getUpstashResult(payload);
		if (!Array.isArray(result) || result.length < 2) {
			console.error("Upstash rate limit response was invalid", {
				bucket,
				result,
			});
			return null;
		}

		const count = Number(result[0]);
		const allowed = Number(result[1]) === 1;
		if (!Number.isFinite(count)) {
			console.error("Upstash rate limit response was invalid", {
				bucket,
				result,
			});
			return null;
		}

		if (!allowed) {
			return {
				allowed: false,
				reason: RATE_LIMIT_EXCEEDED_REASON,
			};
		}

		return { allowed: true };
	} catch (error) {
		console.error("Upstash rate limit request failed", {
			bucket,
			error: getErrorMessage(error),
		});
		return null;
	}
}

async function consumePostgresRateLimit({
	supabaseAdmin,
	bucket,
	keyHash,
	maxRequests,
	windowMs,
	now,
}: ConsumeRateLimitParams): Promise<RateLimitResult> {
	const windowStart = new Date(now.getTime() - windowMs);

	const { data: existing, error: selectError } = await supabaseAdmin
		.from("edge_rate_limits")
		.select("window_start,count")
		.eq("bucket", bucket)
		.eq("key_hash", keyHash)
		.maybeSingle();

	if (selectError && selectError.code !== "PGRST116") {
		console.error("Rate limit lookup failed", {
			bucket,
			error: selectError.message,
		});
		return { allowed: true };
	}

	if (!existing) {
		const { error: insertError } = await supabaseAdmin
			.from("edge_rate_limits")
			.insert({
				bucket,
				key_hash: keyHash,
				window_start: now.toISOString(),
				count: 1,
				updated_at: now.toISOString(),
			});
		if (insertError) {
			console.error("Rate limit insert failed", {
				bucket,
				error: insertError.message,
			});
		}
		return { allowed: true };
	}

	const existingWindowStart = new Date(existing.window_start);
	if (existingWindowStart > windowStart) {
		if (existing.count >= maxRequests) {
			return {
				allowed: false,
				reason: RATE_LIMIT_EXCEEDED_REASON,
			};
		}

		const { error: updateError } = await supabaseAdmin
			.from("edge_rate_limits")
			.update({ count: existing.count + 1, updated_at: now.toISOString() })
			.eq("bucket", bucket)
			.eq("key_hash", keyHash);
		if (updateError) {
			console.error("Rate limit increment failed", {
				bucket,
				error: updateError.message,
			});
		}
		return { allowed: true };
	}

	const { error: resetError } = await supabaseAdmin
		.from("edge_rate_limits")
		.update({
			window_start: now.toISOString(),
			count: 1,
			updated_at: now.toISOString(),
		})
		.eq("bucket", bucket)
		.eq("key_hash", keyHash);
	if (resetError) {
		console.error("Rate limit reset failed", {
			bucket,
			error: resetError.message,
		});
	}

	return { allowed: true };
}

async function consumeRateLimit(
	params: ConsumeRateLimitParams,
): Promise<RateLimitResult> {
	const upstashResult = await consumeUpstashRateLimit(params);
	if (upstashResult) {
		return upstashResult;
	}

	return consumePostgresRateLimit(params);
}

export function getRequestIdentifier(req: Request): string {
	const forwardedFor = req.headers
		.get("x-forwarded-for")
		?.split(",")[0]
		?.trim();
	const cfIp = req.headers.get("cf-connecting-ip")?.trim();
	const directIp = req.headers.get("x-real-ip")?.trim();
	return forwardedFor || cfIp || directIp || "unknown";
}

export async function enforceRateLimit(
	supabaseAdmin: SupabaseRateLimitClient,
	req: Request,
	policy: RateLimitPolicy,
): Promise<RateLimitResult> {
	const identifier = getRequestIdentifier(req);
	const userAgent = req.headers.get("user-agent") ?? "";
	const windowMs = policy.windowMs ?? ONE_HOUR_MS;
	const now = new Date();
	const keyHash = await createKeyHash(identifier, userAgent);

	const rateLimitKeys: Array<{ keyHash: string; maxRequests: number }> = [
		{ keyHash, maxRequests: policy.maxRequests },
	];

	const normalizedIdentity = policy.identity?.trim().toLowerCase();
	if (normalizedIdentity) {
		const identityKeyHash = await createKeyHash(
			`identity:${normalizedIdentity}`,
			policy.bucket,
		);
		rateLimitKeys.push({
			keyHash: identityKeyHash,
			maxRequests: policy.identityMaxRequests ?? policy.maxRequests,
		});
	}

	for (const currentKey of rateLimitKeys) {
		const result = await consumeRateLimit({
			supabaseAdmin,
			bucket: policy.bucket,
			keyHash: currentKey.keyHash,
			maxRequests: currentKey.maxRequests,
			windowMs,
			now,
		});

		if (!result.allowed) {
			return result;
		}
	}

	return { allowed: true };
}
