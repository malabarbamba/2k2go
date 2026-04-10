declare module "https://esm.sh/web-push@3.6.7?target=deno" {
	type WebPushSubscription = {
		endpoint: string;
		expirationTime?: number | null;
		keys: {
			p256dh: string;
			auth: string;
		};
	};

	type WebPushOptions = {
		TTL?: number;
		urgency?: "very-low" | "low" | "normal" | "high";
		topic?: string;
	};

	type WebPushResponse = {
		statusCode?: number;
		body?: string;
	};

	type WebPushModule = {
		setVapidDetails: (
			subject: string,
			publicKey: string,
			privateKey: string,
		) => void;
		sendNotification: (
			subscription: WebPushSubscription,
			payload?: string,
			options?: WebPushOptions,
		) => Promise<WebPushResponse>;
	};

	const webpush: WebPushModule;
	export default webpush;
}
