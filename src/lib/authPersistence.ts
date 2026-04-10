const REMEMBER_ME_STORAGE_KEY = "auth.rememberMe";
const REMEMBERED_EMAIL_STORAGE_KEY = "auth.rememberedEmail";
const ACTIVE_USER_ID_STORAGE_KEY = "auth.activeUserId";
const LAST_SEEN_AT_KEY = "last_seen_at";
const SUPABASE_AUTH_TOKEN_KEY_PATTERN = /^sb-.+-auth-token$/;

const DEFAULT_IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000;
const REMEMBER_ME_IDLE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000;

type StorageType = "local" | "session";

const memoryStore = new Map<string, string>();
const trackedAuthKeys = new Set<string>();

const memoryStorage: Storage = {
	get length() {
		return memoryStore.size;
	},
	clear() {
		memoryStore.clear();
	},
	getItem(key: string) {
		return memoryStore.get(key) ?? null;
	},
	key(index: number) {
		const keys = Array.from(memoryStore.keys());
		return keys[index] ?? null;
	},
	removeItem(key: string) {
		memoryStore.delete(key);
	},
	setItem(key: string, value: string) {
		memoryStore.set(key, String(value));
	},
};

const getBrowserStorage = (storageType: StorageType): Storage | null => {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		return storageType === "local"
			? window.localStorage
			: window.sessionStorage;
	} catch {
		return null;
	}
};

const getStorage = (storageType: StorageType): Storage => {
	return getBrowserStorage(storageType) ?? memoryStorage;
};

const getPreferredStorageType = (): StorageType => {
	return readRememberMePreference() ? "local" : "session";
};

const getFallbackStorageType = (): StorageType => {
	return readRememberMePreference() ? "session" : "local";
};

const readTimestampFromStorage = (storage: Storage): number | null => {
	const rawValue = storage.getItem(LAST_SEEN_AT_KEY);
	if (!rawValue) {
		return null;
	}

	const parsed = Number(rawValue);
	return Number.isFinite(parsed) ? parsed : null;
};

export const readRememberMePreference = (): boolean => {
	const local = getStorage("local");
	return local.getItem(REMEMBER_ME_STORAGE_KEY) === "true";
};

export const writeRememberMePreference = (enabled: boolean): void => {
	const local = getStorage("local");
	if (enabled) {
		local.setItem(REMEMBER_ME_STORAGE_KEY, "true");
		return;
	}

	local.removeItem(REMEMBER_ME_STORAGE_KEY);
};

export const readRememberedEmail = (): string => {
	const local = getStorage("local");
	return local.getItem(REMEMBERED_EMAIL_STORAGE_KEY) ?? "";
};

export const writeRememberedEmail = (email: string): void => {
	const local = getStorage("local");
	local.setItem(REMEMBERED_EMAIL_STORAGE_KEY, email);
};

export const clearRememberedEmail = (): void => {
	getStorage("local").removeItem(REMEMBERED_EMAIL_STORAGE_KEY);
	getStorage("session").removeItem(REMEMBERED_EMAIL_STORAGE_KEY);
};

export const readActiveUserId = (): string => {
	const local = getStorage("local");
	return local.getItem(ACTIVE_USER_ID_STORAGE_KEY) ?? "";
};

export const writeActiveUserId = (userId: string): void => {
	const local = getStorage("local");
	const normalizedUserId = userId.trim();
	if (!normalizedUserId) {
		local.removeItem(ACTIVE_USER_ID_STORAGE_KEY);
		return;
	}

	local.setItem(ACTIVE_USER_ID_STORAGE_KEY, normalizedUserId);
};

export const clearActiveUserId = (): void => {
	getStorage("local").removeItem(ACTIVE_USER_ID_STORAGE_KEY);
	getStorage("session").removeItem(ACTIVE_USER_ID_STORAGE_KEY);
};

const removeAuthKeyFromAllStorages = (key: string): void => {
	getStorage("local").removeItem(key);
	getStorage("session").removeItem(key);
};

const removeSupabaseTokenKeysFromStorage = (storage: Storage): void => {
	const keys: string[] = [];
	for (let index = 0; index < storage.length; index += 1) {
		const key = storage.key(index);
		if (key) {
			keys.push(key);
		}
	}

	for (const key of keys) {
		if (SUPABASE_AUTH_TOKEN_KEY_PATTERN.test(key)) {
			storage.removeItem(key);
		}
	}
};

const clearSupabaseAuthTokenArtifacts = (): void => {
	removeSupabaseTokenKeysFromStorage(getStorage("local"));
	removeSupabaseTokenKeysFromStorage(getStorage("session"));
};

export const supabaseAuthStorage: Storage = {
	get length() {
		return trackedAuthKeys.size;
	},
	clear() {
		for (const key of trackedAuthKeys) {
			removeAuthKeyFromAllStorages(key);
		}

		trackedAuthKeys.clear();
	},
	getItem(key: string) {
		trackedAuthKeys.add(key);

		const preferredStorage = getStorage(getPreferredStorageType());
		const preferredValue = preferredStorage.getItem(key);
		if (preferredValue !== null) {
			return preferredValue;
		}

		if (!readRememberMePreference()) {
			return null;
		}

		const fallbackStorage = getStorage(getFallbackStorageType());
		const fallbackValue = fallbackStorage.getItem(key);
		if (fallbackValue === null) {
			return null;
		}

		preferredStorage.setItem(key, fallbackValue);
		fallbackStorage.removeItem(key);
		return fallbackValue;
	},
	key(index: number) {
		const keys = Array.from(trackedAuthKeys);
		return keys[index] ?? null;
	},
	removeItem(key: string) {
		trackedAuthKeys.delete(key);
		removeAuthKeyFromAllStorages(key);
	},
	setItem(key: string, value: string) {
		trackedAuthKeys.add(key);

		const preferredStorage = getStorage(getPreferredStorageType());
		const fallbackStorage = getStorage(getFallbackStorageType());
		preferredStorage.setItem(key, value);
		fallbackStorage.removeItem(key);
	},
};

export const getSessionIdleTimeoutMs = (): number => {
	return readRememberMePreference()
		? REMEMBER_ME_IDLE_TIMEOUT_MS
		: DEFAULT_IDLE_TIMEOUT_MS;
};

export const readLastSeenAt = (): number | null => {
	const preferredStorage = getStorage(getPreferredStorageType());
	const preferredTimestamp = readTimestampFromStorage(preferredStorage);
	if (preferredTimestamp !== null) {
		return preferredTimestamp;
	}

	if (!readRememberMePreference()) {
		return null;
	}

	const fallbackStorage = getStorage(getFallbackStorageType());
	const fallbackTimestamp = readTimestampFromStorage(fallbackStorage);
	if (fallbackTimestamp === null) {
		return null;
	}

	preferredStorage.setItem(LAST_SEEN_AT_KEY, String(fallbackTimestamp));
	fallbackStorage.removeItem(LAST_SEEN_AT_KEY);
	return fallbackTimestamp;
};

export const writeLastSeenAt = (timestamp: number): void => {
	const preferredStorage = getStorage(getPreferredStorageType());
	const fallbackStorage = getStorage(getFallbackStorageType());

	preferredStorage.setItem(LAST_SEEN_AT_KEY, String(timestamp));
	fallbackStorage.removeItem(LAST_SEEN_AT_KEY);
};

export const clearLastSeenAt = (): void => {
	getStorage("local").removeItem(LAST_SEEN_AT_KEY);
	getStorage("session").removeItem(LAST_SEEN_AT_KEY);
};

export const clearAccountSwitchArtifacts = (): void => {
	clearLastSeenAt();
	clearRememberedEmail();
};

export const clearPersistedAuthArtifacts = (): void => {
	clearAccountSwitchArtifacts();
	clearActiveUserId();
	supabaseAuthStorage.clear();
	clearSupabaseAuthTokenArtifacts();
};
