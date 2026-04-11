import { supabase } from "@/integrations/supabase/client";
import {
	detectNavigatorLocale,
	resolveLocaleFromLanguageTag,
	type AppLocale,
} from "@/lib/appLocale";

type ResolveAppLocaleResponse = {
	locale?: string;
	countryCode?: string | null;
	source?: string;
};

export async function resolveDefaultAppLocale(): Promise<AppLocale> {
	try {
		const { data, error } = await supabase.functions.invoke(
			"resolve-app-locale",
			{
				method: "GET",
			},
		);

		if (error) {
			throw error;
		}

		const payload = data as ResolveAppLocaleResponse | null;
		const resolvedLocale = resolveLocaleFromLanguageTag(payload?.locale ?? null);
		return resolvedLocale ?? detectNavigatorLocale();
	} catch {
		return detectNavigatorLocale();
	}
}
