declare const Deno: {
	env: {
		get: (key: string) => string | undefined;
	};
};

export type EmailBranding = {
	brandName: string;
	fromName: string;
	fromEmail: string;
	from: string;
	replyTo: string;
	supportEmail: string;
	siteUrl: string;
	logoUrl: string;
};

export type BrandedEmailCta = {
	label: string;
	href: string;
	variant?: "primary" | "secondary";
};

export type BrandedEmailLayout = "default" | "compact-reminder";

export type BrandedEmailCode = {
	label?: string;
	value: string;
	hint?: string;
};

export type BrandedEmailContent = {
	title?: string;
	preheader?: string;
	greeting?: string;
	intro: string[];
	cta?: BrandedEmailCta;
	ctas?: BrandedEmailCta[];
	ctaFallbackLabel?: string;
	code?: BrandedEmailCode;
	bullets?: string[];
	outro?: string[];
	layout?: BrandedEmailLayout;
	hideCtaFallback?: boolean;
	hideFooter?: boolean;
	logoAlignment?: "center" | "left";
	logoWidth?: number;
};

export type BrandedEmailResult = {
	html: string;
	text: string;
};

const DEFAULT_SITE_URL = "https://example.com";
const DEFAULT_BRAND_NAME = "2k2go";
const DEFAULT_SUPPORT_EMAIL = "arabeurgence@gmail.com";
const DEFAULT_FROM_EMAIL = "arabeurgence@gmail.com";
const DEFAULT_EMAIL_LOGO_PATH = "/images/v2_full2.png";
const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeUrl(rawUrl: string): string {
	const trimmed = rawUrl.trim();
	if (!trimmed) return DEFAULT_SITE_URL;
	try {
		const url = new URL(trimmed);
		const normalizedPath =
			url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
		return `${url.origin}${normalizedPath}`;
	} catch {
		return trimmed.replace(/\/$/, "");
	}
}

function coerceNonEmptyString(value: unknown, fallback: string): string {
	if (typeof value !== "string") return fallback;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeBrandLabel(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return DEFAULT_BRAND_NAME;
	return trimmed;
}

function normalizeFromEmailAddress(value: string): string {
	const trimmed = value.trim().toLowerCase();
	if (!trimmed) return DEFAULT_FROM_EMAIL;
	if (!SIMPLE_EMAIL_PATTERN.test(trimmed)) return DEFAULT_FROM_EMAIL;
	return trimmed;
}

export function escapeHtml(unsafe: string): string {
	return unsafe
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function escapeAttributeValue(unsafe: string): string {
	return escapeHtml(unsafe);
}

export function getEmailBrandingFromEnv(
	overrides: Partial<EmailBranding> = {},
): EmailBranding {
	const siteUrl = normalizeUrl(
		coerceNonEmptyString(
			overrides.siteUrl ??
				Deno.env.get("AUTH_EMAIL_SITE_URL") ??
				Deno.env.get("SITE_URL"),
			DEFAULT_SITE_URL,
		),
	);

	const fromName = coerceNonEmptyString(
		overrides.fromName ??
			Deno.env.get("AUTH_EMAIL_FROM_NAME") ??
			Deno.env.get("APP_EMAIL_FROM_NAME"),
		DEFAULT_BRAND_NAME,
	);
	const normalizedFromName = normalizeBrandLabel(fromName);

	const brandName = coerceNonEmptyString(
		overrides.brandName ?? normalizedFromName,
		normalizedFromName,
	);
	const normalizedBrandName = normalizeBrandLabel(brandName);

	const fromEmail = normalizeFromEmailAddress(
		coerceNonEmptyString(
			overrides.fromEmail ??
				Deno.env.get("AUTH_EMAIL_FROM_EMAIL") ??
				Deno.env.get("RESEND_FROM_EMAIL") ??
				Deno.env.get("APP_NON_REPLY_EMAIL"),
			DEFAULT_FROM_EMAIL,
		),
	);

	const supportEmail = coerceNonEmptyString(
		overrides.supportEmail ??
			Deno.env.get("AUTH_EMAIL_SUPPORT") ??
			Deno.env.get("APP_SUPPORT_EMAIL"),
		DEFAULT_SUPPORT_EMAIL,
	);

	const replyTo = coerceNonEmptyString(
		overrides.replyTo ?? supportEmail,
		supportEmail,
	);

	const logoUrl = coerceNonEmptyString(
		overrides.logoUrl,
		`${siteUrl.replace(/\/$/, "")}${DEFAULT_EMAIL_LOGO_PATH}`,
	);

	return {
		brandName: normalizedBrandName,
		fromName: normalizedFromName,
		fromEmail,
		from: `${normalizedFromName} <${fromEmail}>`,
		replyTo,
		supportEmail,
		siteUrl,
		logoUrl,
	};
}

function renderParagraphHtml(
	content: string,
	options: {
		paddingBottom?: number;
		lineHeight?: number;
		fontSize?: number;
		color?: string;
	} = {},
): string {
	const {
		paddingBottom = 12,
		lineHeight = 1.7,
		fontSize = 15,
		color = "#304740",
	} = options;

	return `<p style="margin:0;padding:0 0 ${paddingBottom}px 0;font-size:${fontSize}px;line-height:${lineHeight};color:${color};">${escapeHtml(content)}</p>`;
}

function renderBulletsHtml(items: string[]): string {
	const safeItems = items
		.map((item) => item.trim())
		.filter((item) => item.length > 0)
		.map((item) => `<li style="margin:0 0 8px 0;">${escapeHtml(item)}</li>`)
		.join("");

	if (!safeItems) return "";

	return `<ul style="margin:0;padding:0 0 12px 18px;color:#304740;font-size:15px;line-height:1.7;">${safeItems}</ul>`;
}

function renderCodeHtml(code: BrandedEmailCode): string {
	const label = code.label ? escapeHtml(code.label) : "Voici votre code";
	const hint = code.hint ? escapeHtml(code.hint) : "";
	const safeValue = escapeHtml(code.value);

	return `
		<p style="margin:0;padding:0 0 12px 0;font-size:16px;line-height:1.6;color:#101010;">${label}: <strong style="font-family:'Courier New',monospace;letter-spacing:2px;">${safeValue}</strong></p>
		${hint ? `<p style="margin:0;padding:0 0 12px 0;font-size:13px;line-height:1.5;color:#4a4a4a;">${hint}</p>` : ""}
	`;
}

function normalizeCtas(
	cta: BrandedEmailCta | undefined,
	ctas: BrandedEmailCta[] | undefined,
): BrandedEmailCta[] {
	return (ctas && ctas.length > 0 ? ctas : cta ? [cta] : [])
		.map((item) => ({
			label: item.label.trim(),
			href: item.href.trim(),
			variant: item.variant ?? "primary",
		}))
		.filter((item) => item.label.length > 0 && item.href.length > 0);
}

function renderDefaultCtasHtml(
	ctas: BrandedEmailCta[],
	ctaFallbackLabel: string,
	hideCtaFallback: boolean,
): string {
	if (ctas.length === 0) return "";

	const primaryCta = ctas[0];
	const fallbackHtml = hideCtaFallback
		? ""
		: `
			<p style="margin:0;padding:0 0 12px 0;font-size:12px;line-height:1.5;color:#6a7f78;">
				${escapeHtml(ctaFallbackLabel)}<br />
				<a href="${escapeAttributeValue(primaryCta.href)}" style="color:#101010;word-break:break-all;">${escapeHtml(primaryCta.href)}</a>
			</p>
		`;

	return `
		<div style="text-align:center;padding:8px 0 18px 0;">
			<a href="${escapeAttributeValue(primaryCta.href)}" style="display:inline-block;background:#000000;color:#ffffff;text-decoration:none;font-weight:700;font-size:18px;line-height:1;padding:18px 42px;border-radius:12px;">${escapeHtml(primaryCta.label)}</a>
		</div>
		${fallbackHtml}
	`;
}

function renderCompactReminderCtasHtml(ctas: BrandedEmailCta[]): string {
	if (ctas.length === 0) return "";

	const items = ctas
		.map((cta, index) => {
			const isSecondary = cta.variant === "secondary";
			const background = isSecondary ? "#f4f4f5" : "#3f3f46";
			const color = isSecondary ? "#27272a" : "#ffffff";
			const border = isSecondary ? "#d4d4d8" : "#3f3f46";
			const marginTop = index === 0 ? 0 : 8;

			return `<a href="${escapeAttributeValue(cta.href)}" style="display:inline-block;margin:${marginTop}px 0 0 0;background:${background};color:${color};text-decoration:none;font-weight:600;font-size:13px;line-height:1.15;padding:11px 16px;border-radius:9px;border:1px solid ${border};">${escapeHtml(cta.label)}</a>`;
		})
		.join("<br />");

	return `<div style="padding:6px 0 0 0;text-align:left;">${items}</div>`;
}

function clampLogoWidth(value: number | undefined, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}

	return Math.max(40, Math.min(220, Math.round(value)));
}

function normalizeLines(lines: string[] | undefined): string[] {
	if (!lines) return [];
	return lines.map((line) => line.trim()).filter((line) => line.length > 0);
}

function renderHiddenPreheader(preheader: string): string {
	const safePreheader = escapeHtml(preheader);
	return `
		<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">
			${safePreheader}
		</div>
		<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">
			&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
		</div>
	`;
}

export function renderBrandedEmail(
	content: BrandedEmailContent,
	options: { branding?: Partial<EmailBranding> } = {},
): BrandedEmailResult {
	const branding = getEmailBrandingFromEnv(options.branding ?? {});
	const layout = content.layout ?? "default";
	const isCompactReminder = layout === "compact-reminder";
	const greeting =
		content.greeting === undefined ? "Bonjour," : content.greeting.trim();
	const introLines = normalizeLines(content.intro);
	const bullets = normalizeLines(content.bullets);
	const outroLines = normalizeLines(content.outro);
	const ctas = normalizeCtas(content.cta, content.ctas);
	const preheader = coerceNonEmptyString(
		content.preheader ?? introLines[0],
		branding.brandName,
	);

	const ctaFallbackLabel = coerceNonEmptyString(
		content.ctaFallbackLabel,
		"Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :",
	);
	const footerEnabled = !content.hideFooter && !isCompactReminder;
	const hideCtaFallback = content.hideCtaFallback ?? isCompactReminder;
	const visibleTitle = content.title?.trim() ?? "";
	const documentTitle = visibleTitle || preheader || branding.brandName;
	const logoWidth = clampLogoWidth(
		content.logoWidth,
		isCompactReminder ? 56 : 168,
	);
	const logoAlignment =
		content.logoAlignment ?? (isCompactReminder ? "left" : "center");

	const titleHtml = escapeHtml(documentTitle);
	const visibleTitleHtml = visibleTitle ? escapeHtml(visibleTitle) : "";
	const logoAlt = escapeHtml(branding.brandName);
	const logoSrc = escapeAttributeValue(branding.logoUrl);

	const ctaHtml = isCompactReminder
		? renderCompactReminderCtasHtml(ctas)
		: renderDefaultCtasHtml(ctas, ctaFallbackLabel, hideCtaFallback);

	const introHtml = [
		...(greeting
			? [
					renderParagraphHtml(greeting, {
						paddingBottom: isCompactReminder ? 2 : 12,
						lineHeight: isCompactReminder ? 1.2 : 1.7,
						fontSize: isCompactReminder ? 14 : 15,
						color: isCompactReminder ? "#1f2937" : "#304740",
					}),
				]
			: []),
		...introLines.map((line) =>
			renderParagraphHtml(line, {
				paddingBottom: isCompactReminder ? 2 : 12,
				lineHeight: isCompactReminder ? 1.25 : 1.7,
				fontSize: isCompactReminder ? 14 : 15,
				color: isCompactReminder ? "#111827" : "#304740",
			}),
		),
	].join("");

	const bulletsHtml = bullets.length > 0 ? renderBulletsHtml(bullets) : "";
	const codeHtml = content.code ? renderCodeHtml(content.code) : "";
	const outroHtml = outroLines
		.map((line) =>
			renderParagraphHtml(line, {
				paddingBottom: isCompactReminder ? 2 : 12,
				lineHeight: isCompactReminder ? 1.25 : 1.7,
				fontSize: isCompactReminder ? 14 : 15,
				color: isCompactReminder ? "#111827" : "#304740",
			}),
		)
		.join("");

	const year = new Date().getFullYear();
	const supportLink = escapeAttributeValue(`mailto:${branding.supportEmail}`);
	const supportEmail = escapeHtml(branding.supportEmail);
	const siteLink = escapeAttributeValue(branding.siteUrl);
	const siteUrl = escapeHtml(branding.siteUrl);
	const footerHtml = footerEnabled
		? `<p style="margin:0;padding:10px 0 0 0;font-size:12px;line-height:1.5;color:#6a7f78;text-align:center;">Besoin d'aide : <a href="${supportLink}" style="color:#101010;text-decoration:none;">${supportEmail}</a></p>
			<p style="margin:0;padding:6px 0 0 0;font-size:12px;line-height:1.5;color:#6a7f78;text-align:center;">${escapeHtml(String(year))} ${escapeHtml(branding.brandName)} - <a href="${siteLink}" style="color:#101010;text-decoration:none;">${siteUrl}</a></p>`
		: "";
	const titleBlockHtml = visibleTitle
		? `<tr><td style="font-size:24px;line-height:1.3;font-weight:700;padding-bottom:10px;text-align:${logoAlignment};">${visibleTitleHtml}</td></tr>`
		: "";

	const html = `<!doctype html>
<html lang="fr">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width,initial-scale=1" />
		<title>${titleHtml}</title>
	</head>
	<body style="margin:0;padding:0;background:#f6f8f7;font-family:'Segoe UI',Arial,sans-serif;color:#0f1f1a;">
		${renderHiddenPreheader(preheader)}
		<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding:${isCompactReminder ? 14 : 24}px 0;">
			<tr>
				<td align="center">
					<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:${isCompactReminder ? 480 : 560}px;background:#ffffff;border:1px solid #dde5df;border-radius:14px;padding:${isCompactReminder ? 18 : 28}px;">
						<tr>
							<td align="${logoAlignment}" style="padding-bottom:${isCompactReminder ? 8 : 18}px;">
								<img src="${logoSrc}" alt="${logoAlt}" width="${logoWidth}" style="display:block;max-width:${logoWidth}px;width:100%;height:auto;" />
							</td>
						</tr>
						${titleBlockHtml}
						<tr>
							<td style="padding:0;">
								${introHtml}
								${ctaHtml}
								${codeHtml}
								${bulletsHtml}
								${outroHtml}
								${footerHtml}
							</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>
	</body>
</html>`;

	const textLines: string[] = [];
	if (visibleTitle) {
		textLines.push(visibleTitle);
		textLines.push("");
	}
	if (greeting) {
		textLines.push(greeting);
		textLines.push("");
	}
	for (const line of introLines) {
		textLines.push(line);
		textLines.push("");
	}
	if (ctas.length > 0) {
		for (const cta of ctas) {
			textLines.push(`${cta.label}: ${cta.href}`);
		}
		textLines.push("");
	}
	if (content.code) {
		textLines.push(`Voici votre code: ${content.code.value}`);
		if (content.code.hint) {
			textLines.push(content.code.hint);
		}
		textLines.push("");
	}
	if (bullets.length > 0) {
		for (const bullet of bullets) {
			textLines.push(`- ${bullet}`);
		}
		textLines.push("");
	}
	for (const line of outroLines) {
		textLines.push(line);
		textLines.push("");
	}
	if (footerEnabled) {
		textLines.push(`Besoin d'aide: ${branding.supportEmail}`);
		textLines.push(`Site: ${branding.siteUrl}`);
	}

	const text = textLines
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();

	return { html, text };
}
