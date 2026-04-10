import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AuthenticatedUser = {
	id: string;
	email?: string | null;
};

export type RequestAuthContext = {
	hasAuthorizationHeader: boolean;
	token: string | null;
	user: AuthenticatedUser | null;
	isAuthenticated: boolean;
};

export type DeterministicEdgeError = {
	error: string;
	code: string;
};

export type AuthGuardFailureCode =
	| "AUTH_REQUIRED"
	| "ADMIN_REQUIRED"
	| "ADMIN_ROLE_LOOKUP_FAILED"
	| "WEBHOOK_SECRET_NOT_CONFIGURED"
	| "WEBHOOK_SECRET_INVALID";

export type AuthGuardFailure = {
	status: 401 | 403 | 500;
	error: string;
	code: AuthGuardFailureCode;
};

export type UserAuthContext = Pick<
	RequestAuthContext,
	"hasAuthorizationHeader" | "isAuthenticated"
>;

export type AdminAuthContext = UserAuthContext & {
	isAdmin: boolean;
};

export type AdminRoleLookupResult = {
	isAdmin: boolean;
	lookupFailed: boolean;
};

export type AdminAccessResult =
	| {
			ok: true;
			auth: RequestAuthContext;
			user: AuthenticatedUser;
	  }
	| {
			ok: false;
			auth: RequestAuthContext;
			failure: AuthGuardFailure;
	  };

export type WebhookSecretGuardOptions = {
	secret: string | null | undefined;
	headerNames?: string[];
};

const EMPTY_AUTH_CONTEXT: RequestAuthContext = {
	hasAuthorizationHeader: false,
	token: null,
	user: null,
	isAuthenticated: false,
};

const AUTH_REQUIRED_FAILURE: AuthGuardFailure = {
	status: 401,
	error: "Authentification requise.",
	code: "AUTH_REQUIRED",
};

const ADMIN_REQUIRED_FAILURE: AuthGuardFailure = {
	status: 403,
	error: "Acces administrateur requis.",
	code: "ADMIN_REQUIRED",
};

const ADMIN_ROLE_LOOKUP_FAILED_FAILURE: AuthGuardFailure = {
	status: 500,
	error: "Erreur lors de la verification des droits.",
	code: "ADMIN_ROLE_LOOKUP_FAILED",
};

const WEBHOOK_SECRET_NOT_CONFIGURED_FAILURE: AuthGuardFailure = {
	status: 500,
	error: "Secret webhook non configure.",
	code: "WEBHOOK_SECRET_NOT_CONFIGURED",
};

const WEBHOOK_SECRET_INVALID_FAILURE: AuthGuardFailure = {
	status: 401,
	error: "Secret webhook invalide.",
	code: "WEBHOOK_SECRET_INVALID",
};

export function createServiceClient() {
	const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
	const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
	return createClient(supabaseUrl, serviceRoleKey);
}

export function getBearerToken(req: Request): string | null {
	const authHeader = req.headers.get("Authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		return null;
	}

	const token = authHeader.replace("Bearer ", "").trim();
	return token.length > 0 ? token : null;
}

export async function resolveRequestAuth(
	req: Request,
	supabaseAdmin: ReturnType<typeof createServiceClient>,
): Promise<RequestAuthContext> {
	const token = getBearerToken(req);
	if (!token) {
		return EMPTY_AUTH_CONTEXT;
	}

	const {
		data: { user },
		error,
	} = await supabaseAdmin.auth.getUser(token);

	if (error || !user) {
		return {
			hasAuthorizationHeader: true,
			token,
			user: null,
			isAuthenticated: false,
		};
	}

	return {
		hasAuthorizationHeader: true,
		token,
		user: {
			id: user.id,
			email: user.email,
		},
		isAuthenticated: true,
	};
}

export function toDeterministicError(
	failure: AuthGuardFailure,
): DeterministicEdgeError {
	return {
		error: failure.error,
		code: failure.code,
	};
}

export function resolveUserAuthFailure(
	context: UserAuthContext,
): AuthGuardFailure | null {
	if (!context.hasAuthorizationHeader || !context.isAuthenticated) {
		return AUTH_REQUIRED_FAILURE;
	}

	return null;
}

export function resolveAdminAuthFailure(
	context: AdminAuthContext,
): AuthGuardFailure | null {
	const userFailure = resolveUserAuthFailure(context);
	if (userFailure) {
		return userFailure;
	}

	if (!context.isAdmin) {
		return ADMIN_REQUIRED_FAILURE;
	}

	return null;
}

export async function resolveAdminRoleLookup(
	supabaseAdmin: ReturnType<typeof createServiceClient>,
	userId: string,
): Promise<AdminRoleLookupResult> {
	const { data, error } = await supabaseAdmin
		.from("user_roles")
		.select("role")
		.eq("user_id", userId)
		.eq("role", "admin")
		.maybeSingle();

	if (error) {
		console.error("Failed to check admin role", {
			userId,
			error: error.message,
		});
		return {
			isAdmin: false,
			lookupFailed: true,
		};
	}

	return {
		isAdmin: !!data,
		lookupFailed: false,
	};
}

export async function requireAdminAccess(
	req: Request,
	supabaseAdmin: ReturnType<typeof createServiceClient>,
): Promise<AdminAccessResult> {
	const auth = await resolveRequestAuth(req, supabaseAdmin);
	return requireAdminAccessForAuth(auth, supabaseAdmin);
}

export async function requireAdminAccessForAuth(
	auth: RequestAuthContext,
	supabaseAdmin: ReturnType<typeof createServiceClient>,
): Promise<AdminAccessResult> {
	const userFailure = resolveUserAuthFailure(auth);

	if (userFailure || !auth.user) {
		return {
			ok: false,
			auth,
			failure: userFailure ?? AUTH_REQUIRED_FAILURE,
		};
	}

	const adminRoleLookup = await resolveAdminRoleLookup(
		supabaseAdmin,
		auth.user.id,
	);
	if (adminRoleLookup.lookupFailed) {
		return {
			ok: false,
			auth,
			failure: ADMIN_ROLE_LOOKUP_FAILED_FAILURE,
		};
	}

	const adminFailure = resolveAdminAuthFailure({
		hasAuthorizationHeader: auth.hasAuthorizationHeader,
		isAuthenticated: auth.isAuthenticated,
		isAdmin: adminRoleLookup.isAdmin,
	});

	if (adminFailure) {
		return {
			ok: false,
			auth,
			failure: adminFailure,
		};
	}

	return {
		ok: true,
		auth,
		user: auth.user,
	};
}

export function resolveWebhookSecretFailure(
	req: Request,
	options: WebhookSecretGuardOptions,
): AuthGuardFailure | null {
	const configuredSecret = options.secret?.trim();
	if (!configuredSecret) {
		return WEBHOOK_SECRET_NOT_CONFIGURED_FAILURE;
	}

	const headerNames =
		options.headerNames && options.headerNames.length > 0
			? options.headerNames
			: ["x-webhook-secret"];

	const incomingSecret = headerNames
		.map((headerName) => req.headers.get(headerName)?.trim())
		.find(
			(value): value is string => typeof value === "string" && value.length > 0,
		);

	if (!incomingSecret || incomingSecret !== configuredSecret) {
		return WEBHOOK_SECRET_INVALID_FAILURE;
	}

	return null;
}

export async function isAdminUser(
	supabaseAdmin: ReturnType<typeof createServiceClient>,
	userId: string,
): Promise<boolean> {
	const adminLookup = await resolveAdminRoleLookup(supabaseAdmin, userId);
	return adminLookup.isAdmin;
}
