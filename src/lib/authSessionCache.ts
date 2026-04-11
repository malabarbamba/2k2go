import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppSupabaseClient = SupabaseClient<Database>;

let cachedSession: Session | null | undefined;
let hydrateSessionPromise: Promise<Session | null> | null = null;
let authStateSubscriptionAttached = false;

const resolveSessionUserId = (session: Session | null | undefined): string | null => {
	const userId = session?.user?.id;
	return typeof userId === "string" && userId.length > 0 ? userId : null;
};

const attachAuthStateSubscription = (client: AppSupabaseClient): void => {
	if (authStateSubscriptionAttached) {
		return;
	}

	client.auth.onAuthStateChange((_event, session) => {
		cachedSession = session;
	});
	authStateSubscriptionAttached = true;
};

export const readCachedAuthUserId = (): string | null => {
	attachAuthStateSubscription(supabase);
	return resolveSessionUserId(cachedSession);
};

export const getCurrentAuthUserId = async (): Promise<string | null> => {
	attachAuthStateSubscription(supabase);

	if (cachedSession !== undefined) {
		return resolveSessionUserId(cachedSession);
	}

	if (!hydrateSessionPromise) {
		hydrateSessionPromise = supabase.auth
			.getSession()
			.then(({ data, error }) => {
				if (error) {
					return null;
				}

				cachedSession = data.session ?? null;
				return cachedSession;
			})
			.catch(() => {
				cachedSession = null;
				return null;
			})
			.finally(() => {
				hydrateSessionPromise = null;
			});
	}

	const session = await hydrateSessionPromise;
	return resolveSessionUserId(session);
};
