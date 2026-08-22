import { beforeEach, describe, expect, it } from "vitest";
import {
	supabaseAuthStorage,
	writeRememberMePreference,
} from "@/lib/authPersistence";

const AUTH_TOKEN_KEY = "sb-project-ref-auth-token";
const SESSION_JSON = JSON.stringify({
	access_token: "access-token",
	refresh_token: "refresh-token",
});

describe("supabaseAuthStorage", () => {
	beforeEach(() => {
		window.localStorage.clear();
		window.sessionStorage.clear();
		supabaseAuthStorage.clear();
	});

	it("persists the Supabase session in localStorage by default", () => {
		writeRememberMePreference(false);

		supabaseAuthStorage.setItem(AUTH_TOKEN_KEY, SESSION_JSON);

		expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBe(SESSION_JSON);
		expect(window.sessionStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
	});

	it("survives a Home Screen app restart that clears sessionStorage", () => {
		supabaseAuthStorage.setItem(AUTH_TOKEN_KEY, SESSION_JSON);

		window.sessionStorage.clear();

		expect(supabaseAuthStorage.getItem(AUTH_TOKEN_KEY)).toBe(SESSION_JSON);
	});

	it("migrates a surviving legacy sessionStorage token to localStorage", () => {
		writeRememberMePreference(false);
		window.sessionStorage.setItem(AUTH_TOKEN_KEY, SESSION_JSON);

		expect(supabaseAuthStorage.getItem(AUTH_TOKEN_KEY)).toBe(SESSION_JSON);
		expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBe(SESSION_JSON);
		expect(window.sessionStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
	});

	it("removes the session from both storage locations on sign-out", () => {
		window.localStorage.setItem(AUTH_TOKEN_KEY, SESSION_JSON);
		window.sessionStorage.setItem(AUTH_TOKEN_KEY, SESSION_JSON);

		supabaseAuthStorage.removeItem(AUTH_TOKEN_KEY);

		expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
		expect(window.sessionStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
	});
});
