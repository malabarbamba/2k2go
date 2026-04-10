import "../types.d.ts";

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { jsonResponse, optionsResponse } from "../_shared/httpSecurity.ts";
import {
	resolveLocaleFromCountryCode,
	resolveLocaleFromLanguageTag,
} from "../../../src/lib/appLocale.ts";

const CORS_OPTIONS = { methods: "GET, OPTIONS" };

const COUNTRY_HEADERS = [
	"cf-ipcountry",
	"x-vercel-ip-country",
	"x-country-code",
	"cloudfront-viewer-country",
];

function readHeader(req: Request, key: string): string | null {
	const value = req.headers.get(key);
	if (!value) {
		return null;
	}

	const normalizedValue = value.trim();
	return normalizedValue.length > 0 ? normalizedValue : null;
}

function resolveFromCountryHeaders(req: Request): {
	locale: "fr" | "en";
	countryCode: string;
	source: string;
} | null {
	for (const headerName of COUNTRY_HEADERS) {
		const countryCode = readHeader(req, headerName);
		const locale = resolveLocaleFromCountryCode(countryCode);
		if (!countryCode || !locale) {
			continue;
		}

		return {
			locale,
			countryCode: countryCode.trim().toUpperCase(),
			source: `header:${headerName}`,
		};
	}

	return null;
}

serve((req) => {
	if (req.method === "OPTIONS") {
		return optionsResponse(req, CORS_OPTIONS);
	}

	if (req.method !== "GET") {
		return jsonResponse(
			req,
			{ error: "Method not allowed" },
			405,
			CORS_OPTIONS,
		);
	}

	const countryMatch = resolveFromCountryHeaders(req);
	if (countryMatch) {
		return jsonResponse(req, countryMatch, 200, CORS_OPTIONS);
	}

	const acceptLanguage = readHeader(req, "accept-language");
	const locale = resolveLocaleFromLanguageTag(acceptLanguage) ?? "en";

	return jsonResponse(
		req,
		{
			locale,
			countryCode: null,
			source: acceptLanguage ? "accept-language" : "default",
		},
		200,
		CORS_OPTIONS,
	);
});
