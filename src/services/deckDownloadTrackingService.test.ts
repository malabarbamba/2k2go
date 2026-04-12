import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, invokeMock } = vi.hoisted(() => ({
	getSessionMock: vi.fn(),
	invokeMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
	supabase: {
		auth: {
			getSession: getSessionMock,
		},
		functions: {
			invoke: invokeMock,
		},
	},
}));

describe("recordDeckDownloadClick", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.unstubAllEnvs();
		getSessionMock.mockReset();
		invokeMock.mockReset();
	});

	it("uses the current session token when one exists", async () => {
		vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-token");
		getSessionMock.mockResolvedValue({
			data: { session: { access_token: "user-token" } },
		});
		invokeMock.mockResolvedValue({ data: { ok: true }, error: null });

		const { recordDeckDownloadClick } = await import(
			"@/services/deckDownloadTrackingService"
		);

		await recordDeckDownloadClick({
			clickId: "click-1234567890abcd",
			deckKey: "enki_deck",
			sourceName: "landing_main_cta",
			pagePath: "/",
			referrer: null,
			locale: "en",
			userId: null,
			visitorId: "visitor-1",
		});

		expect(invokeMock).toHaveBeenCalledWith(
			"deck-download-init",
			expect.objectContaining({
				headers: { Authorization: "Bearer user-token" },
			}),
		);
	});

	it("falls back to the anon key when session lookup fails", async () => {
		vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-token");
		getSessionMock.mockRejectedValue(new Error("session unavailable"));
		invokeMock.mockResolvedValue({ data: { ok: true }, error: null });

		const { recordDeckDownloadClick } = await import(
			"@/services/deckDownloadTrackingService"
		);

		await recordDeckDownloadClick({
			clickId: "click-abcdef1234567890",
			deckKey: "enki_deck",
			sourceName: "landing_main_cta",
			pagePath: "/",
			referrer: null,
			locale: "en",
			userId: null,
			visitorId: "visitor-2",
		});

		expect(invokeMock).toHaveBeenCalledWith(
			"deck-download-init",
			expect.objectContaining({
				headers: expect.objectContaining({
					Authorization: expect.stringMatching(/^Bearer\s+.+$/),
				}),
			}),
		);
	});
});
