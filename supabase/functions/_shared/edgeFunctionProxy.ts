import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

function resolveTargetUrl(
	requestUrl: string,
	targetFunctionName: string,
): string {
	const url = new URL(requestUrl);
	const segments = url.pathname.split("/");
	segments[segments.length - 1] = targetFunctionName;
	url.pathname = segments.join("/");
	return url.toString();
}

export function serveFunctionProxy(targetFunctionName: string): void {
	serve((req) => {
		const targetUrl = resolveTargetUrl(req.url, targetFunctionName);
		return fetch(targetUrl, {
			method: req.method,
			headers: req.headers,
			body:
				req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
		});
	});
}
