const DEFAULT_TITLE = "Rappel de revue";
const DEFAULT_BODY = "Tu as des cartes en attente de revision.";
const DEFAULT_ICON = "/favicon.ico";

self.addEventListener("push", (event) => {
	let payload = {};

	if (event.data) {
		try {
			payload = event.data.json();
		} catch {
			payload = { body: event.data.text() };
		}
	}

	const data = typeof payload === "object" && payload !== null ? payload : {};
	const title = typeof data.title === "string" ? data.title : DEFAULT_TITLE;
	const body = typeof data.body === "string" ? data.body : DEFAULT_BODY;
	const icon = typeof data.icon === "string" ? data.icon : DEFAULT_ICON;
	const appUrl =
		typeof data.app_url === "string"
			? data.app_url
			: typeof data.url === "string"
				? data.url
				: "/app";
	const tag = typeof data.tag === "string" ? data.tag : "review-reminder";

	event.waitUntil(
		self.registration.showNotification(title, {
			body,
			icon,
			badge: icon,
			data: { appUrl },
			tag,
			renotify: false,
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const targetUrl =
		typeof event.notification?.data?.appUrl === "string"
			? event.notification.data.appUrl
			: "/app";

	event.waitUntil(
		self.clients
			.matchAll({ type: "window", includeUncontrolled: true })
			.then((clients) => {
				for (const client of clients) {
					if ("focus" in client) {
						client.navigate(targetUrl);
						return client.focus();
					}
				}

				if (self.clients.openWindow) {
					return self.clients.openWindow(targetUrl);
				}

				return undefined;
			}),
	);
});
