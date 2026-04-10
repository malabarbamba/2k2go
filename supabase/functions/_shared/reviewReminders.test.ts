import { expect } from "https://deno.land/std@0.208.0/expect/mod.ts";
import { describe, it } from "https://deno.land/std@0.208.0/testing/bdd.ts";

import {
	resolveReviewReminderAppUrl,
	resolveReviewReminderSettingsUrl,
} from "./reviewReminders.ts";

const REVIEW_REMINDER_ENV_KEYS = [
	"REVIEW_REMINDERS_APP_URL",
	"REVIEW_REMINDER_APP_URL",
] as const;

const withReminderEnv = async (
	values: Partial<
		Record<(typeof REVIEW_REMINDER_ENV_KEYS)[number], string | null>
	>,
	run: () => void | Promise<void>,
) => {
	const previousValues = new Map<string, string | undefined>();

	for (const key of REVIEW_REMINDER_ENV_KEYS) {
		previousValues.set(key, Deno.env.get(key));
		const nextValue = values[key];
		if (typeof nextValue === "string") {
			Deno.env.set(key, nextValue);
		} else {
			Deno.env.delete(key);
		}
	}

	try {
		await run();
	} finally {
		for (const key of REVIEW_REMINDER_ENV_KEYS) {
			const previousValue = previousValues.get(key);
			if (typeof previousValue === "string") {
				Deno.env.set(key, previousValue);
			} else {
				Deno.env.delete(key);
			}
		}
	}
};

describe("reviewReminders", () => {
	it("canonicalizes explicit legacy /app urls to the new app base", async () => {
		await withReminderEnv(
			{
				REVIEW_REMINDERS_APP_URL: "https://www.arabeimmersion.fr/app/revue",
			},
			() => {
				expect(resolveReviewReminderAppUrl()).toBe(
					"https://www.arabeimmersion.fr/app",
				);
				expect(resolveReviewReminderSettingsUrl()).toBe(
					"https://www.arabeimmersion.fr/app/settings",
				);
			},
		);
	});

	it("supports the singular legacy env alias while canonicalizing /app paths", async () => {
		await withReminderEnv(
			{
				REVIEW_REMINDER_APP_URL: "https://www.arabeimmersion.fr/app",
			},
			() => {
				expect(resolveReviewReminderAppUrl()).toBe(
					"https://www.arabeimmersion.fr/app",
				);
			},
		);
	});
});
