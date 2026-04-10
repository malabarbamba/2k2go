declare const Deno: {
	env: {
		get: (key: string) => string | undefined;
	};
};

const TOKEN_VERSION = "sv1";
const DEFAULT_TOKEN_TTL_SECONDS = 15 * 60;
const MIN_TOKEN_TTL_SECONDS = 60;
const MAX_TOKEN_TTL_SECONDS = 60 * 60;

type VerificationTokenPayload = {
	v: string;
	email: string;
	verified: true;
	iat: number;
	exp: number;
};

const textEncoder = new TextEncoder();

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const toBase64Url = (value: Uint8Array): string => {
	let binary = "";
	for (const byte of value) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
};

const toBase64UrlText = (value: string): string =>
	toBase64Url(textEncoder.encode(value));

const fromBase64UrlText = (value: string): string | null => {
	if (!value || typeof value !== "string") {
		return null;
	}

	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padLength = (4 - (normalized.length % 4)) % 4;
	const padded = `${normalized}${"=".repeat(padLength)}`;

	try {
		return atob(padded);
	} catch {
		return null;
	}
};

const timingSafeEqual = (left: string, right: string): boolean => {
	if (left.length !== right.length) {
		return false;
	}

	let mismatch = 0;
	for (let index = 0; index < left.length; index += 1) {
		mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}

	return mismatch === 0;
};

const getVerificationTokenSecret = (): string => {
	const explicitSecret = Deno.env
		.get("SIGNUP_VERIFICATION_TOKEN_SECRET")
		?.trim();
	if (explicitSecret) {
		return explicitSecret;
	}

	const fallbackSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
	if (fallbackSecret) {
		return fallbackSecret;
	}

	return "signup-verification-token-secret-missing";
};

const parseIntStrict = (value: string | undefined): number | null => {
	if (!value) {
		return null;
	}

	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) {
		return null;
	}

	return parsed;
};

export const getSignupVerificationTokenTtlSeconds = (): number => {
	const envTtl = parseIntStrict(
		Deno.env.get("SIGNUP_VERIFICATION_TOKEN_TTL_SECONDS")?.trim(),
	);

	if (envTtl === null) {
		return DEFAULT_TOKEN_TTL_SECONDS;
	}

	return Math.min(
		MAX_TOKEN_TTL_SECONDS,
		Math.max(MIN_TOKEN_TTL_SECONDS, envTtl),
	);
};

const signPayload = async (payloadSegment: string): Promise<string> => {
	const secretKey = await crypto.subtle.importKey(
		"raw",
		textEncoder.encode(getVerificationTokenSecret()),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const signature = await crypto.subtle.sign(
		"HMAC",
		secretKey,
		textEncoder.encode(payloadSegment),
	);

	return toBase64Url(new Uint8Array(signature));
};

export const createSignupVerificationToken = async (
	email: string,
	nowMs = Date.now(),
): Promise<string> => {
	const nowSeconds = Math.floor(nowMs / 1000);
	const payload: VerificationTokenPayload = {
		v: TOKEN_VERSION,
		email: normalizeEmail(email),
		verified: true,
		iat: nowSeconds,
		exp: nowSeconds + getSignupVerificationTokenTtlSeconds(),
	};

	const payloadSegment = toBase64UrlText(JSON.stringify(payload));
	const signatureSegment = await signPayload(payloadSegment);

	return `${TOKEN_VERSION}.${payloadSegment}.${signatureSegment}`;
};

const parsePayload = (
	payloadSegment: string,
): VerificationTokenPayload | null => {
	const payloadText = fromBase64UrlText(payloadSegment);
	if (!payloadText) {
		return null;
	}

	try {
		const parsed = JSON.parse(payloadText) as Partial<VerificationTokenPayload>;
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			parsed.v !== TOKEN_VERSION ||
			parsed.verified !== true ||
			typeof parsed.email !== "string" ||
			typeof parsed.iat !== "number" ||
			typeof parsed.exp !== "number"
		) {
			return null;
		}

		if (
			!Number.isFinite(parsed.iat) ||
			!Number.isFinite(parsed.exp) ||
			parsed.exp < parsed.iat
		) {
			return null;
		}

		return {
			v: parsed.v,
			email: parsed.email,
			verified: true,
			iat: parsed.iat,
			exp: parsed.exp,
		};
	} catch {
		return null;
	}
};

type VerifyTokenResult =
	| { valid: true; payload: VerificationTokenPayload }
	| {
			valid: false;
			reason: "FORMAT" | "SIGNATURE" | "PAYLOAD" | "EMAIL" | "EXPIRED";
	  };

export const verifySignupVerificationToken = async (
	token: string,
	expectedEmail: string,
	nowMs = Date.now(),
): Promise<VerifyTokenResult> => {
	if (!token || typeof token !== "string") {
		return { valid: false, reason: "FORMAT" };
	}

	const segments = token.split(".");
	if (segments.length !== 3 || segments[0] !== TOKEN_VERSION) {
		return { valid: false, reason: "FORMAT" };
	}

	const payloadSegment = segments[1];
	const signatureSegment = segments[2];
	if (!payloadSegment || !signatureSegment) {
		return { valid: false, reason: "FORMAT" };
	}

	const expectedSignature = await signPayload(payloadSegment);
	if (!timingSafeEqual(expectedSignature, signatureSegment)) {
		return { valid: false, reason: "SIGNATURE" };
	}

	const payload = parsePayload(payloadSegment);
	if (!payload) {
		return { valid: false, reason: "PAYLOAD" };
	}

	if (payload.email !== normalizeEmail(expectedEmail)) {
		return { valid: false, reason: "EMAIL" };
	}

	const nowSeconds = Math.floor(nowMs / 1000);
	if (payload.exp < nowSeconds) {
		return { valid: false, reason: "EXPIRED" };
	}

	return { valid: true, payload };
};
