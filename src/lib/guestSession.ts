const GUEST_ID_KEY = "guest:id";
const GUEST_SESSION_KEY = "guest:session";
const GUEST_PROGRESS_KEY = "guest:progress";
const AUTH_ACTIVE_USER_ID_KEY = "auth.activeUserId";

type GuestSessionRecord = {
	guestId: string;
	createdAt: string;
};

const isBrowser = (): boolean => {
	return typeof window !== "undefined";
};

const readStorage = (key: string): string | null => {
	if (!isBrowser()) {
		return null;
	}

	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
};

const writeStorage = (key: string, value: string): void => {
	if (!isBrowser()) {
		return;
	}

	try {
		window.localStorage.setItem(key, value);
	} catch {
		// Ignore localStorage write failures.
	}
};

const removeStorage = (key: string): void => {
	if (!isBrowser()) {
		return;
	}

	try {
		window.localStorage.removeItem(key);
	} catch {
		// Ignore localStorage delete failures.
	}
};

const readGuestSessionRecord = (): GuestSessionRecord | null => {
	const rawSession = readStorage(GUEST_SESSION_KEY);
	if (!rawSession) {
		return null;
	}

	try {
		const parsed = JSON.parse(rawSession) as Partial<GuestSessionRecord>;
		if (
			typeof parsed.guestId !== "string" ||
			parsed.guestId.trim().length === 0 ||
			typeof parsed.createdAt !== "string"
		) {
			return null;
		}

		return {
			guestId: parsed.guestId,
			createdAt: parsed.createdAt,
		};
	} catch {
		return null;
	}
};

const createGuestId = (): string => {
	const randomUuid = globalThis.crypto?.randomUUID?.();
	if (randomUuid) {
		return randomUuid;
	}

	return `guest-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

const persistGuestSessionRecord = (session: GuestSessionRecord): void => {
	writeStorage(GUEST_ID_KEY, session.guestId);
	writeStorage(GUEST_SESSION_KEY, JSON.stringify(session));
};

const initGuestSession = (): string => {
	const existingGuestId = getGuestId();
	if (existingGuestId) {
		return existingGuestId;
	}

	const guestSession: GuestSessionRecord = {
		guestId: createGuestId(),
		createdAt: new Date().toISOString(),
	};

	persistGuestSessionRecord(guestSession);

	return guestSession.guestId;
};

const getGuestId = (): string | null => {
	const guestId = readStorage(GUEST_ID_KEY);
	if (guestId && guestId.trim().length > 0) {
		return guestId;
	}

	const guestSession = readGuestSessionRecord();
	if (!guestSession) {
		return null;
	}

	writeStorage(GUEST_ID_KEY, guestSession.guestId);

	return guestSession.guestId;
};

const isGuestUser = (): boolean => {
	const guestId = getGuestId();
	if (!guestId) {
		return false;
	}

	const activeUserId = readStorage(AUTH_ACTIVE_USER_ID_KEY);
	return !activeUserId;
};

const clearGuestSession = (): void => {
	removeStorage(GUEST_ID_KEY);
	removeStorage(GUEST_SESSION_KEY);
};

const getGuestProgress = <T = Record<string, unknown>>(): T | null => {
	const rawProgress = readStorage(GUEST_PROGRESS_KEY);
	if (!rawProgress) {
		return null;
	}

	try {
		return JSON.parse(rawProgress) as T;
	} catch {
		return null;
	}
};

const saveGuestProgress = (data: unknown): void => {
	try {
		writeStorage(GUEST_PROGRESS_KEY, JSON.stringify(data));
	} catch {
		// Ignore JSON serialization failures.
	}
};

export {
	GUEST_ID_KEY,
	GUEST_SESSION_KEY,
	clearGuestSession,
	getGuestId,
	getGuestProgress,
	initGuestSession,
	isGuestUser,
	saveGuestProgress,
};
