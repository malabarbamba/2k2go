declare const Deno: {
	env: {
		get: (key: string) => string | undefined;
	};
};

const OTP_CODE_PATTERN = /^\d{6}$/;
const OTP_HASH_PREFIX = "v1:";

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function normalizeCode(code: string): string {
	return code.trim();
}

function toHex(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let hex = "";
	for (let i = 0; i < bytes.length; i += 1) {
		hex += bytes[i].toString(16).padStart(2, "0");
	}
	return hex;
}

function getOtpHashSecret(): string {
	const explicitSecret = Deno.env.get("SIGNUP_OTP_HASH_SECRET")?.trim();
	if (explicitSecret) {
		return explicitSecret;
	}

	const fallbackSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
	if (fallbackSecret) {
		return fallbackSecret;
	}

	return "signup-otp-secret-missing";
}

function timingSafeEqual(left: string, right: string): boolean {
	if (left.length !== right.length) {
		return false;
	}

	let mismatch = 0;
	for (let index = 0; index < left.length; index += 1) {
		mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}

	return mismatch === 0;
}

export function isValidOtpCode(code: string): boolean {
	return OTP_CODE_PATTERN.test(normalizeCode(code));
}

export async function hashSignupOtp(
	email: string,
	code: string,
): Promise<string> {
	const payload = `${normalizeEmail(email)}:${normalizeCode(code)}:${getOtpHashSecret()}`;
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(payload),
	);
	return `${OTP_HASH_PREFIX}${toHex(digest)}`;
}

export async function verifySignupOtp(
	email: string,
	code: string,
	storedCodeOrHash: string,
): Promise<boolean> {
	const normalizedStored = storedCodeOrHash.trim();
	if (!normalizedStored) {
		return false;
	}

	const normalizedCode = normalizeCode(code);
	if (OTP_CODE_PATTERN.test(normalizedStored)) {
		return timingSafeEqual(normalizedStored, normalizedCode);
	}

	const expectedHash = await hashSignupOtp(email, normalizedCode);
	return timingSafeEqual(expectedHash, normalizedStored);
}
