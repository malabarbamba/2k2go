import { getGuestId, initGuestSession } from "@/lib/guestSession";

export const ARABIC_KEYBOARD_MEMBER_DAILY_CONVERT_CAP = 20;
export const ARABIC_KEYBOARD_GUEST_DAILY_CONVERT_CAP = 2;

const ARABIC_KEYBOARD_CONVERT_QUOTA_STORAGE_KEY =
	"arabic_keyboard_convert_quota_v1";

type ArabicKeyboardConvertQuotaRecord = {
	day: string;
	count: number;
	cap: number;
};

type ArabicKeyboardConvertQuotaStore = Record<
	string,
	ArabicKeyboardConvertQuotaRecord
>;

export type ArabicKeyboardConvertQuotaStatus = {
	day: string;
	count: number;
	cap: number;
	remaining: number;
	reached: boolean;
	isAuthenticated: boolean;
};

const safeLocalStorage = (): Storage | null => {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		return window.localStorage;
	} catch {
		return null;
	}
};

const toLocalDateKey = (date = new Date()): string => {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	const day = `${date.getDate()}`.padStart(2, "0");
	return `${year}-${month}-${day}`;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeQuotaRecord = (
	value: unknown,
): ArabicKeyboardConvertQuotaRecord | null => {
	if (!isPlainObject(value) || typeof value.day !== "string") {
		return null;
	}

	if (typeof value.count !== "number" || !Number.isFinite(value.count)) {
		return null;
	}

	if (typeof value.cap !== "number" || !Number.isFinite(value.cap)) {
		return null;
	}

	return {
		day: value.day,
		count: Math.max(0, Math.floor(value.count)),
		cap: Math.max(1, Math.floor(value.cap)),
	};
};

const readQuotaStore = (): ArabicKeyboardConvertQuotaStore => {
	const storage = safeLocalStorage();
	if (!storage) {
		return {};
	}

	try {
		const rawValue = storage.getItem(ARABIC_KEYBOARD_CONVERT_QUOTA_STORAGE_KEY);
		if (!rawValue) {
			return {};
		}

		const parsedValue = JSON.parse(rawValue) as unknown;
		if (!isPlainObject(parsedValue)) {
			return {};
		}

		const normalizedEntries = Object.entries(parsedValue)
			.map(([scope, record]) => {
				const normalizedRecord = normalizeQuotaRecord(record);
				return normalizedRecord ? ([scope, normalizedRecord] as const) : null;
			})
			.filter(
				(entry): entry is readonly [string, ArabicKeyboardConvertQuotaRecord] =>
					entry !== null,
			);

		return Object.fromEntries(normalizedEntries);
	} catch {
		return {};
	}
};

const writeQuotaStore = (store: ArabicKeyboardConvertQuotaStore): void => {
	const storage = safeLocalStorage();
	if (!storage) {
		return;
	}

	try {
		storage.setItem(
			ARABIC_KEYBOARD_CONVERT_QUOTA_STORAGE_KEY,
			JSON.stringify(store),
		);
	} catch {
		// Ignore localStorage write failures.
	}
};

const resolveQuotaScope = (
	userId: string | null,
): {
	scope: string;
	isAuthenticated: boolean;
	cap: number;
} => {
	if (userId && userId.trim().length > 0) {
		return {
			scope: `user:${userId.trim()}`,
			isAuthenticated: true,
			cap: ARABIC_KEYBOARD_MEMBER_DAILY_CONVERT_CAP,
		};
	}

	const guestId = getGuestId() ?? initGuestSession();
	return {
		scope: `guest:${guestId}`,
		isAuthenticated: false,
		cap: ARABIC_KEYBOARD_GUEST_DAILY_CONVERT_CAP,
	};
};

const buildQuotaStatus = (params: {
	day: string;
	count: number;
	cap: number;
	isAuthenticated: boolean;
}): ArabicKeyboardConvertQuotaStatus => {
	const safeCount = Math.max(0, Math.min(params.count, params.cap));
	return {
		day: params.day,
		count: safeCount,
		cap: params.cap,
		remaining: Math.max(params.cap - safeCount, 0),
		reached: safeCount >= params.cap,
		isAuthenticated: params.isAuthenticated,
	};
};

export const getArabicKeyboardConvertQuotaStatus = (
	userId: string | null,
): ArabicKeyboardConvertQuotaStatus => {
	const today = toLocalDateKey();
	const { scope, cap, isAuthenticated } = resolveQuotaScope(userId);
	const store = readQuotaStore();
	const currentRecord = store[scope];

	if (!currentRecord || currentRecord.day !== today) {
		return buildQuotaStatus({
			day: today,
			count: 0,
			cap,
			isAuthenticated,
		});
	}

	return buildQuotaStatus({
		day: today,
		count: currentRecord.count,
		cap,
		isAuthenticated,
	});
};

export const recordArabicKeyboardConvertUsage = (
	userId: string | null,
): ArabicKeyboardConvertQuotaStatus => {
	const today = toLocalDateKey();
	const { scope, cap, isAuthenticated } = resolveQuotaScope(userId);
	const store = readQuotaStore();
	const currentRecord = store[scope];
	const nextCount =
		currentRecord && currentRecord.day === today
			? Math.min(currentRecord.count + 1, cap)
			: 1;

	store[scope] = {
		day: today,
		count: nextCount,
		cap,
	};
	writeQuotaStore(store);

	return buildQuotaStatus({
		day: today,
		count: nextCount,
		cap,
		isAuthenticated,
	});
};

export const markArabicKeyboardConvertQuotaReached = (
	userId: string | null,
): ArabicKeyboardConvertQuotaStatus => {
	const today = toLocalDateKey();
	const { scope, cap, isAuthenticated } = resolveQuotaScope(userId);
	const store = readQuotaStore();

	store[scope] = {
		day: today,
		count: cap,
		cap,
	};
	writeQuotaStore(store);

	return buildQuotaStatus({
		day: today,
		count: cap,
		cap,
		isAuthenticated,
	});
};
