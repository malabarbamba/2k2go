declare module "https://deno.land/std@0.190.0/http/server.ts" {
	export type Handler = (request: Request) => Response | Promise<Response>;
	export function serve(
		handler: Handler,
		options?: {
			onListen?: (params: {
				hostname: string;
				port: number;
				transport?: "tcp";
			}) => void;
		},
	): void;
}

declare module "https://esm.sh/@supabase/supabase-js@2.89.0" {
	export type SupabaseClient = {
		auth: {
			getUser: () => Promise<{
				data: { user: { id: string } | null };
				error: { message?: string } | null;
			}>;
		};
		rpc: (
			fn: string,
			args?: Record<string, unknown>,
		) => Promise<{
			data: unknown;
			error: {
				message?: string;
				details?: string;
				hint?: string;
				code?: string;
			} | null;
		}>;
		from: (...args: any[]) => any;
	};
	export function createClient(
		url: string,
		anonKey: string,
		options?: Record<string, unknown>,
	): SupabaseClient;
}

declare namespace Deno {
	namespace env {
		function get(key: string): string | undefined;
	}
}
