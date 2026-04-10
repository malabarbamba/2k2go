import { Fragment, type ReactNode, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAppLocale } from "@/contexts/AppLocaleContext";
import {
	layoutPreparedText,
	measureTextLayout,
	prepareTextForLayout,
	usePretextContainerWidth,
} from "@/features/preview-new-concept/usePretext";
import {
	getWebappDocsNavCategories,
	type WebappDocsCategory,
} from "@/lib/webappDocsNav";
import { getWebappDocsArticleBySlug } from "@/lib/webappDocsArticles";

type MarkdownBlock =
	| { type: "heading"; level: 1 | 2 | 3; text: string; id: string }
	| { type: "paragraph"; text: string }
	| { type: "list"; ordered: boolean; items: string[] }
	| { type: "table"; headers: string[]; rows: string[][] }
	| { type: "quote"; lines: string[] }
	| { type: "image"; src: string; alt: string; caption: string | null }
	| { type: "rule"; id: string };

const APP_DOCS_BASE_PATH = "/app/why-it-works";
const LEGACY_APP_DOCS_BASE_PATH = "/app-v2/pourquoi-ca-marche";

const BASE_TEXT_STYLE = {
	fontSize: "13.3333px",
	fontFamily: "Arial, sans-serif",
	lineHeight: 1.35,
} as const;

const LINK_STYLE = {
	...BASE_TEXT_STYLE,
	color: "#000000",
	textDecoration: "underline",
} as const;

const APP_TOC_MIN_WIDTH_PX = 220;
const APP_TOC_MAX_WIDTH_PX = 300;
const APP_TOC_STEP_PX = 4;
const APP_TOC_ITEM_LINE_HEIGHT_PX = 18;
const APP_TOC_FONT = "400 13.3333px Arial, sans-serif";

const HEADING_LINE = /^(#{1,3})\s+(.*)$/;
const ORDERED_LIST_LINE = /^\d+\.\s+(.*)$/;
const UNORDERED_LIST_LINE = /^[-*]\s+(.*)$/;
const TABLE_SEPARATOR_LINE = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/;
const FIGURE_OPEN_LINE = /<figure\b/i;
const FIGURE_CLOSE_LINE = /<\/figure>/i;
const FIGURE_IMAGE_PATTERN =
	/<img\b[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*\/?\s*>/i;
const FIGCAPTION_PATTERN = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i;

function slugify(value: string): string {
	return value
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9\s-]/g, "")
		.trim()
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-");
}

function normalizeText(value: string): string {
	return value
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;|&apos;/gi, "'")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/<br\s*\/?\s*>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizeDocsSlug(slug: string): string {
	if (slug === "/") {
		return "/";
	}

	const trimmed = slug.trim();
	if (!trimmed) {
		return "/";
	}

	const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
	return withLeadingSlash.replace(/\/+$/g, "") || "/";
}

function toAppDocsPath(slug: string): string {
	const normalizedSlug = normalizeDocsSlug(slug);
	if (normalizedSlug === "/") {
		return APP_DOCS_BASE_PATH;
	}

	return `${APP_DOCS_BASE_PATH}${normalizedSlug}`;
}

function resolveDocsSlugFromPath(pathname: string): string {
	const normalizedPath = pathname.replace(/\/+$/g, "") || APP_DOCS_BASE_PATH;
	const canonicalPath = normalizedPath.startsWith(LEGACY_APP_DOCS_BASE_PATH)
		? `${APP_DOCS_BASE_PATH}${normalizedPath.slice(LEGACY_APP_DOCS_BASE_PATH.length)}`
		: normalizedPath;
	if (
		canonicalPath === APP_DOCS_BASE_PATH ||
		canonicalPath === `${APP_DOCS_BASE_PATH}/`
	) {
		return "/";
	}

	if (!canonicalPath.startsWith(`${APP_DOCS_BASE_PATH}/`)) {
		return "/";
	}

	const nestedPath = canonicalPath.slice(APP_DOCS_BASE_PATH.length);
	return normalizeDocsSlug(nestedPath);
}

function splitTableCells(line: string): string[] {
	const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
	return trimmed.split("|").map((cell) => normalizeText(cell));
}

function createStableEntries(
	items: readonly string[],
): Array<{ key: string; text: string }> {
	const seen = new Map<string, number>();
	return items.map((text) => {
		const base = slugify(text) || "entry";
		const count = (seen.get(base) ?? 0) + 1;
		seen.set(base, count);
		return {
			key: count === 1 ? base : `${base}-${count}`,
			text,
		};
	});
}

function parseImageBlock(figureHtml: string): MarkdownBlock | null {
	const imageMatch = figureHtml.match(FIGURE_IMAGE_PATTERN);
	if (!imageMatch) {
		return null;
	}

	const src = imageMatch[1]?.trim() ?? "";
	const alt = imageMatch[2]?.trim() ?? "";
	const captionMatch = figureHtml.match(FIGCAPTION_PATTERN);
	const caption = captionMatch ? normalizeText(captionMatch[1] ?? "") : "";

	if (!src) {
		return null;
	}

	return {
		type: "image",
		src,
		alt,
		caption: caption || null,
	};
}

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
	const text = content.replace(/<!--([\s\S]*?)-->/g, "").replace(/\r\n/g, "\n");
	const lines = text.split("\n");
	const blocks: MarkdownBlock[] = [];
	const headingCounts = new Map<string, number>();
	let ruleCount = 0;
	let index = 0;

	const assignHeadingId = (headingText: string): string => {
		const base = slugify(headingText) || "section";
		const count = (headingCounts.get(base) ?? 0) + 1;
		headingCounts.set(base, count);
		return count === 1 ? base : `${base}-${count}`;
	};

	while (index < lines.length) {
		const line = lines[index] ?? "";
		const trimmed = line.trim();

		if (!trimmed) {
			index += 1;
			continue;
		}

		if (HEADING_LINE.test(trimmed)) {
			const match = trimmed.match(HEADING_LINE);
			if (match) {
				const level = Math.min(3, match[1].length) as 1 | 2 | 3;
				const title = normalizeText(match[2]);
				if (title) {
					blocks.push({
						type: "heading",
						level,
						text: title,
						id: assignHeadingId(title),
					});
				}
			}
			index += 1;
			continue;
		}

		if (/^-{3,}$/.test(trimmed)) {
			ruleCount += 1;
			blocks.push({ type: "rule", id: `rule-${ruleCount}` });
			index += 1;
			continue;
		}

		if (FIGURE_OPEN_LINE.test(trimmed)) {
			const figureLines: string[] = [line];
			index += 1;
			while (index < lines.length) {
				const currentLine = lines[index] ?? "";
				figureLines.push(currentLine);
				index += 1;
				if (FIGURE_CLOSE_LINE.test(currentLine)) {
					break;
				}
			}

			const imageBlock = parseImageBlock(figureLines.join("\n"));
			if (imageBlock) {
				blocks.push(imageBlock);
			}
			continue;
		}

		if (trimmed.startsWith("|")) {
			const tableLines: string[] = [];
			while (
				index < lines.length &&
				(lines[index] ?? "").trim().startsWith("|")
			) {
				tableLines.push(lines[index] ?? "");
				index += 1;
			}

			if (
				tableLines.length >= 2 &&
				TABLE_SEPARATOR_LINE.test(tableLines[1] ?? "")
			) {
				const headers = splitTableCells(tableLines[0] ?? "");
				const rows = tableLines
					.slice(2)
					.map((tableLine) => splitTableCells(tableLine))
					.filter((row) => row.length > 0);
				blocks.push({ type: "table", headers, rows });
			}
			continue;
		}

		if (ORDERED_LIST_LINE.test(trimmed) || UNORDERED_LIST_LINE.test(trimmed)) {
			const ordered = ORDERED_LIST_LINE.test(trimmed);
			const items: string[] = [];
			while (index < lines.length) {
				const candidate = (lines[index] ?? "").trim();
				const match = ordered
					? candidate.match(ORDERED_LIST_LINE)
					: candidate.match(UNORDERED_LIST_LINE);
				if (!match) {
					break;
				}
				items.push(normalizeText(match[1]));
				index += 1;
			}
			blocks.push({ type: "list", ordered, items: items.filter(Boolean) });
			continue;
		}

		if (trimmed.startsWith(">")) {
			const quoteLines: string[] = [];
			while (index < lines.length) {
				const candidate = (lines[index] ?? "").trim();
				if (!candidate.startsWith(">")) {
					break;
				}
				quoteLines.push(normalizeText(candidate.replace(/^>\s?/, "")));
				index += 1;
			}
			blocks.push({ type: "quote", lines: quoteLines.filter(Boolean) });
			continue;
		}

		const paragraphLines: string[] = [];
		while (index < lines.length) {
			const candidate = lines[index] ?? "";
			const candidateTrimmed = candidate.trim();
			if (
				!candidateTrimmed ||
				HEADING_LINE.test(candidateTrimmed) ||
				/^-{3,}$/.test(candidateTrimmed) ||
				candidateTrimmed.startsWith("|") ||
				candidateTrimmed.startsWith(">") ||
				FIGURE_OPEN_LINE.test(candidateTrimmed) ||
				ORDERED_LIST_LINE.test(candidateTrimmed) ||
				UNORDERED_LIST_LINE.test(candidateTrimmed)
			) {
				break;
			}
			paragraphLines.push(candidate);
			index += 1;
		}

		const paragraph = normalizeText(paragraphLines.join(" "));
		if (paragraph) {
			blocks.push({ type: "paragraph", text: paragraph });
		}
	}

	return blocks;
}

function renderInline(text: string): ReactNode[] {
	const parts: ReactNode[] = [];
	const pattern =
		/\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g;
	let lastIndex = 0;
	let tokenIndex = 0;

	for (const match of text.matchAll(pattern)) {
		const full = match[0];
		const start = match.index ?? 0;

		if (start > lastIndex) {
			parts.push(text.slice(lastIndex, start));
		}

		if (match[1] && match[2]) {
			const label = match[1].trim();
			const href = match[2].trim();
			const linkKey = `${slugify(label) || "link"}-${tokenIndex}`;
			const isExternal = /^https?:\/\//i.test(href);
			const resolvedHref = href.startsWith("/") ? toAppDocsPath(href) : href;
			if (isExternal) {
				parts.push(
					<a
						key={linkKey}
						href={resolvedHref}
						style={LINK_STYLE}
						target="_blank"
						rel="noreferrer noopener"
					>
						{label}
					</a>,
				);
			} else {
				parts.push(
					<Link key={linkKey} to={resolvedHref} style={LINK_STYLE}>
						{label}
					</Link>,
				);
			}
		} else if (match[3]) {
			parts.push(
				<strong key={`${slugify(match[3]) || "strong"}-${tokenIndex}`}>
					{match[3]}
				</strong>,
			);
		} else if (match[4]) {
			parts.push(
				<code key={`${slugify(match[4]) || "code"}-${tokenIndex}`}>
					{match[4]}
				</code>,
			);
		} else if (match[5]) {
			parts.push(
				<em key={`${slugify(match[5]) || "em"}-${tokenIndex}`}>{match[5]}</em>,
			);
		}

		lastIndex = start + full.length;
		tokenIndex += 1;
	}

	if (lastIndex < text.length) {
		parts.push(text.slice(lastIndex));
	}

	return parts;
}

function DocsToc({ activeSlug }: { activeSlug: string }) {
	const { locale } = useAppLocale();
	const isEnglish = locale === "en";
	const navCategories = useMemo(() => getWebappDocsNavCategories(locale), [locale]);
	return (
		<nav aria-label={isEnglish ? "App documentation table of contents" : "Sommaire documentation app"}>
			{navCategories.map((category) => (
				<div key={category.id} style={{ marginBottom: "10px" }}>
					<p
						style={{ ...BASE_TEXT_STYLE, margin: "0 0 3px 0", fontWeight: 700 }}
					>
						{category.label}
					</p>
					<ul style={{ ...BASE_TEXT_STYLE, margin: 0, paddingLeft: "16px" }}>
						{category.articles.map((article) => {
							const isActive = normalizeDocsSlug(article.slug) === activeSlug;
							return (
								<li key={article.slug} style={{ marginBottom: "2px" }}>
									<Link
									to={toAppDocsPath(article.slug)}
										style={{
											...LINK_STYLE,
											fontWeight: isActive ? 700 : 400,
										}}
									>
										{article.label}
									</Link>
								</li>
							);
						})}
					</ul>
				</div>
			))}
		</nav>
	);
}

function renderArticleBlocks(blocks: MarkdownBlock[]): ReactNode {
	return blocks.map((block) => {
		if (block.type === "heading") {
			if (block.level === 1) {
				return (
					<h1
						key={block.id}
						id={block.id}
						style={{
							...BASE_TEXT_STYLE,
							fontSize: "20px",
							margin: "14px 0 8px",
						}}
					>
						{renderInline(block.text)}
					</h1>
				);
			}

			if (block.level === 2) {
				return (
					<h2
						key={block.id}
						id={block.id}
						style={{
							...BASE_TEXT_STYLE,
							fontSize: "17px",
							margin: "12px 0 7px",
						}}
					>
						{renderInline(block.text)}
					</h2>
				);
			}

			return (
				<h3
					key={block.id}
					id={block.id}
					style={{ ...BASE_TEXT_STYLE, fontSize: "15px", margin: "10px 0 6px" }}
				>
					{renderInline(block.text)}
				</h3>
			);
		}

		if (block.type === "paragraph") {
			return (
				<p
					key={`paragraph-${slugify(block.text).slice(0, 48) || "text"}`}
					style={{ ...BASE_TEXT_STYLE, margin: "0 0 8px 0" }}
				>
					{renderInline(block.text)}
				</p>
			);
		}

		if (block.type === "quote") {
			const stableLines = createStableEntries(block.lines);
			return (
				<blockquote
					key={`quote-${stableLines.map((entry) => entry.key).join("-")}`}
					style={{
						...BASE_TEXT_STYLE,
						margin: "0 0 8px 0",
						padding: "6px 10px",
						borderLeft: "3px solid #000000",
						backgroundColor: "#f5f5f5",
					}}
				>
					{stableLines.map((lineEntry) => (
						<Fragment key={lineEntry.key}>
							{renderInline(lineEntry.text)}
							<br />
						</Fragment>
					))}
				</blockquote>
			);
		}

		if (block.type === "list") {
			const ListTag = block.ordered ? "ol" : "ul";
			const stableItems = createStableEntries(block.items);
			return (
				<ListTag
					key={`list-${stableItems.map((entry) => entry.key).join("-")}`}
					style={{
						...BASE_TEXT_STYLE,
						margin: "0 0 8px 0",
						paddingLeft: "20px",
					}}
				>
					{stableItems.map((item) => (
						<li key={item.key} style={{ marginBottom: "4px" }}>
							{renderInline(item.text)}
						</li>
					))}
				</ListTag>
			);
		}

		if (block.type === "table") {
			const stableHeaders = createStableEntries(block.headers);
			const stableRows = block.rows.map((row) => createStableEntries(row));
			return (
				<table
					key={`table-${stableHeaders.map((entry) => entry.key).join("-")}`}
					style={{
						...BASE_TEXT_STYLE,
						width: "100%",
						borderCollapse: "collapse",
						marginBottom: "10px",
					}}
				>
					<thead>
						<tr>
							{stableHeaders.map((header) => (
								<th
									key={header.key}
									style={{
										border: "1px solid #000000",
										padding: "4px",
										textAlign: "left",
									}}
								>
									{renderInline(header.text)}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{stableRows.map((rowEntries) => (
							<tr key={rowEntries.map((entry) => entry.key).join("-")}>
								{rowEntries.map((cell) => (
									<td
										key={cell.key}
										style={{
											border: "1px solid #000000",
											padding: "4px",
											verticalAlign: "top",
										}}
									>
										{renderInline(cell.text)}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			);
		}

		if (block.type === "image") {
			const imageKey = `image-${slugify(block.src) || "figure"}`;
			return (
				<figure key={imageKey} style={{ margin: "0 0 10px 0" }}>
					<img
						src={block.src}
						alt={block.alt}
						loading="lazy"
						decoding="async"
						style={{ maxWidth: "100%", border: "1px solid #000000" }}
					/>
					{block.caption ? (
						<figcaption style={{ ...BASE_TEXT_STYLE, marginTop: "4px" }}>
							{renderInline(block.caption)}
						</figcaption>
					) : null}
				</figure>
			);
		}

		return (
			<hr
				key={block.id}
				style={{
					border: "none",
					borderTop: "1px solid #000000",
					margin: "10px 0",
				}}
			/>
		);
	});
}

function resolveCategoryForSlug(
	slug: string,
	locale: "fr" | "en",
): WebappDocsCategory | null {
	for (const category of getWebappDocsNavCategories(locale)) {
		if (
			category.articles.some(
				(article) => normalizeDocsSlug(article.slug) === slug,
			)
		) {
			return category;
		}
	}

	return null;
}

export default function WhyItWorksPage() {
	const { locale } = useAppLocale();
	const isEnglish = locale === "en";
	const navCategories = useMemo(() => getWebappDocsNavCategories(locale), [locale]);
	const location = useLocation();
	const navigate = useNavigate();
	const [layoutRef, layoutWidth] = usePretextContainerWidth<HTMLDivElement>();
	const activeSlug = useMemo(
		() => resolveDocsSlugFromPath(location.pathname),
		[location.pathname],
	);
	const article = useMemo(
		() => getWebappDocsArticleBySlug(activeSlug, locale),
		[activeSlug, locale],
	);
	const category = useMemo(
		() => resolveCategoryForSlug(activeSlug, locale),
		[activeSlug, locale],
	);
	const blocks = useMemo(
		() => (article ? parseMarkdownBlocks(article.content) : []),
		[article],
	);
	const tocLabels = useMemo(
		() =>
			navCategories.flatMap((navCategory) => [
				navCategory.label,
				...navCategory.articles.map((articleItem) => articleItem.label),
			]),
		[navCategories],
	);
	const preparedTocEntries = useMemo(
		() =>
			tocLabels.map((label) => ({
				label,
				prepared: prepareTextForLayout(label, APP_TOC_FONT, undefined, {
					pagePath: location.pathname,
					blockId: "app-v2-why:toc:prepare",
				}),
			})),
		[location.pathname, tocLabels],
	);
	const tocColumnWidthPx = useMemo(() => {
		if (layoutWidth <= 0 || layoutWidth <= 900) {
			return APP_TOC_MIN_WIDTH_PX;
		}

		for (
			let width = APP_TOC_MIN_WIDTH_PX;
			width <= APP_TOC_MAX_WIDTH_PX;
			width += APP_TOC_STEP_PX
		) {
			const textWidth = Math.max(120, width - 34);
			const fits = preparedTocEntries.every((entry) => {
				const measured = entry.prepared
					? layoutPreparedText(
							entry.prepared,
							textWidth,
							APP_TOC_ITEM_LINE_HEIGHT_PX,
							{
								pagePath: location.pathname,
								blockId: "app-v2-why:toc:layout",
							},
						)
					: measureTextLayout(
							entry.label,
							APP_TOC_FONT,
							textWidth,
							APP_TOC_ITEM_LINE_HEIGHT_PX,
							{
								pagePath: location.pathname,
								blockId: "app-v2-why:toc:layout-fallback",
							},
						);
				return measured ? measured.lineCount <= 2 : true;
			});

			if (fits) {
				return width;
			}
		}

		return APP_TOC_MAX_WIDTH_PX;
	}, [layoutWidth, location.pathname, preparedTocEntries]);

	return (
		<div style={{ textAlign: "left", marginTop: "14px" }}>
			<button
				type="button"
				onClick={() => {
					navigate(-1);
				}}
				aria-label={isEnglish ? "Go back" : "Revenir en arriere"}
				style={{
					...LINK_STYLE,
					position: "fixed",
					top: 0,
					left: 0,
					padding: "8px 10px",
					zIndex: 40,
					background: "none",
					border: 0,
					cursor: "pointer",
				}}
			>
				{isEnglish ? "\u2190 back" : "\u2190 retour"}
			</button>
			<style>{`
				@media (max-width: 900px) {
					.appv2-why-layout {
						display: block !important;
					}

					.appv2-why-toc {
						position: static !important;
						height: auto !important;
						max-height: none !important;
						border-right: 0 !important;
						border-bottom: 1px solid #000000;
					}
				}
			`}</style>
			<p style={BASE_TEXT_STYLE}>
				{isEnglish ? "why does this work?" : "pourquoi ça marche ?"}
			</p>
			<div
				ref={layoutRef}
				className="appv2-why-layout"
				style={{
					display: "grid",
					gridTemplateColumns: `minmax(${APP_TOC_MIN_WIDTH_PX}px, ${tocColumnWidthPx}px) minmax(0, 1fr)`,
					border: "1px solid #000000",
					backgroundColor: "#ffffff",
					minHeight: "calc(100vh - 88px)",
				}}
			>
				<aside
					className="appv2-why-toc"
					style={{
						borderRight: "1px solid #000000",
						padding: "10px 12px",
						overflowY: "auto",
						position: "sticky",
						top: 0,
						height: "calc(100vh - 88px)",
						maxHeight: "calc(100vh - 88px)",
						backgroundColor: "#f3f3f3",
					}}
				>
					<p
						style={{ ...BASE_TEXT_STYLE, margin: "0 0 8px 0", fontWeight: 700 }}
					>
						{isEnglish ? "contents" : "sommaire"}
					</p>
					<DocsToc activeSlug={activeSlug} />
				</aside>
				<section style={{ padding: "12px 16px", overflowWrap: "anywhere" }}>
					{article ? (
						<>
							<p style={{ ...BASE_TEXT_STYLE, margin: "0 0 8px 0" }}>
								{category
									? `${isEnglish ? "section" : "section"}: ${category.label}`
									: isEnglish
										? "section: documentation"
										: "section: Documentation"}
							</p>
							{renderArticleBlocks(blocks)}
						</>
					) : (
						<>
							<h1
								style={{
									...BASE_TEXT_STYLE,
									fontSize: "20px",
									margin: "0 0 8px 0",
								}}
							>
								{isEnglish ? "page not found" : "page introuvable"}
							</h1>
							<p style={{ ...BASE_TEXT_STYLE, margin: "0 0 8px 0" }}>
								{isEnglish
									? "this article does not exist in the imported documentation."
									: "cet article n'existe pas dans la documentation importee."}
							</p>
							<p style={{ ...BASE_TEXT_STYLE, margin: 0 }}>
							<Link to={APP_DOCS_BASE_PATH} style={LINK_STYLE}>
									{isEnglish
										? "back to the start of the documentation"
										: "retour au début de la documentation"}
								</Link>
							</p>
						</>
					)}
				</section>
			</div>
		</div>
	);
}
