import { layout, prepare } from "@chenglou/pretext";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
	recordPretextFallbackReflow,
	recordPretextLayout,
	recordPretextPrepare,
	type PretextProfileMeta,
} from "./pretextRuntimeProfiler";

type PretextPrepareOptions = {
	whiteSpace?: "normal" | "pre-wrap";
	wordBreak?: "normal" | "keep-all";
};

const PRETEXT_PREPARE_CACHE_MAX_ENTRIES = 500;
const PRETEXT_PREPARE_CACHE = new Map<string, ReturnType<typeof prepare>>();

function getPrepareCacheKey(
	text: string,
	font: string,
	options?: PretextPrepareOptions,
): string {
	const whiteSpace = options?.whiteSpace ?? "normal";
	const wordBreak = options?.wordBreak ?? "normal";
	return `${font}__${whiteSpace}__${wordBreak}__${text}`;
}

function getPreparedTextCached(
	text: string,
	font: string,
	options?: PretextPrepareOptions,
	profileMeta?: PretextProfileMeta,
): ReturnType<typeof prepare> {
	const cacheKey = getPrepareCacheKey(text, font, options);
	const cached = PRETEXT_PREPARE_CACHE.get(cacheKey);
	if (cached) {
		recordPretextPrepare(profileMeta ?? {}, { durationMs: 0, cacheHit: true });
		return cached;
	}

	const prepareStart =
		typeof performance !== "undefined" && typeof performance.now === "function"
			? performance.now()
			: Date.now();
	const prepared = prepare(text, font, options);
	const prepareEnd =
		typeof performance !== "undefined" && typeof performance.now === "function"
			? performance.now()
			: Date.now();
	recordPretextPrepare(profileMeta ?? {}, {
		durationMs: Math.max(0, prepareEnd - prepareStart),
		cacheHit: false,
	});
	PRETEXT_PREPARE_CACHE.set(cacheKey, prepared);

	if (PRETEXT_PREPARE_CACHE.size > PRETEXT_PREPARE_CACHE_MAX_ENTRIES) {
		const oldestKey = PRETEXT_PREPARE_CACHE.keys().next().value;
		if (typeof oldestKey === "string") {
			PRETEXT_PREPARE_CACHE.delete(oldestKey);
		}
	}

	return prepared;
}

/**
 * CSS font shorthand for the app's primary sans-serif at common sizes.
 * Keep in sync with the `font` property of the elements being measured.
 */
export const PRETEXT_FONT_SANS_14 =
	"14px 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif";
export const PRETEXT_FONT_SANS_13 =
	"13px 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif";

/**
 * Measure text height and line count without DOM reflow.
 * Returns null when inputs are invalid or pretext throws.
 */
export function measureTextLayout(
	text: string,
	font: string,
	maxWidth: number,
	lineHeight: number,
	profileMeta?: PretextProfileMeta,
): { height: number; lineCount: number } | null {
	if (!text || maxWidth <= 0 || lineHeight <= 0) return null;
	try {
		const prepared = getPreparedTextCached(text, font, undefined, profileMeta);
		const layoutStart =
			typeof performance !== "undefined" &&
			typeof performance.now === "function"
				? performance.now()
				: Date.now();
		const result = layout(prepared, maxWidth, lineHeight);
		const layoutEnd =
			typeof performance !== "undefined" &&
			typeof performance.now === "function"
				? performance.now()
				: Date.now();
		recordPretextLayout(
			profileMeta ?? {},
			Math.max(0, layoutEnd - layoutStart),
		);
		return result;
	} catch {
		return null;
	}
}

export function prepareTextForLayout(
	text: string,
	font: string,
	options?: PretextPrepareOptions,
	profileMeta?: PretextProfileMeta,
): ReturnType<typeof prepare> | null {
	if (!text || !font) {
		return null;
	}
	try {
		return getPreparedTextCached(text, font, options, profileMeta);
	} catch {
		return null;
	}
}

export function layoutPreparedText(
	prepared: ReturnType<typeof prepare>,
	maxWidth: number,
	lineHeight: number,
	profileMeta?: PretextProfileMeta,
): { height: number; lineCount: number } | null {
	if (!prepared || maxWidth <= 0 || lineHeight <= 0) {
		return null;
	}
	try {
		const layoutStart =
			typeof performance !== "undefined" &&
			typeof performance.now === "function"
				? performance.now()
				: Date.now();
		const result = layout(prepared, maxWidth, lineHeight);
		const layoutEnd =
			typeof performance !== "undefined" &&
			typeof performance.now === "function"
				? performance.now()
				: Date.now();
		recordPretextLayout(
			profileMeta ?? {},
			Math.max(0, layoutEnd - layoutStart),
		);
		return result;
	} catch {
		return null;
	}
}

/**
 * Return true if the text, when laid out at the given font/width/lineHeight,
 * would exceed `maxLines` — without any DOM measurement.
 */
export function textExceedsLines(
	text: string,
	font: string,
	maxWidth: number,
	lineHeight: number,
	maxLines: number,
): boolean {
	const result = measureTextLayout(text, font, maxWidth, lineHeight);
	return result !== null && result.lineCount > maxLines;
}

/**
 * Track a container's content width via ResizeObserver — no forced layout.
 * Returns [ref, contentWidth]. Attach `ref` to any HTMLElement.
 */
export function usePretextContainerWidth<
	T extends HTMLElement = HTMLElement,
>(): [React.RefObject<T>, number] {
	const ref = useRef<T>(null);
	const [width, setWidth] = useState(0);

	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;

		// One initial read (acceptable single reflow at mount time)
		setWidth(el.getBoundingClientRect().width);

		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) setWidth(entry.contentRect.width);
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	return [ref, width];
}

/**
 * Auto-resize a textarea using pretext instead of the DOM's `scrollHeight`,
 * eliminating the layout-reflow triggered on every keystroke.
 *
 * ResizeObserver provides a reflow-free content-width stream; pretext then
 * computes the required height purely arithmetically.
 *
 * @param value      Current textarea value.
 * @param font       CSS font shorthand matching the textarea's computed font.
 * @param lineHeight Rendered line height in px (e.g. 20 for Tailwind `leading-5`).
 * @param paddingV   Total vertical padding in px (top + bottom).
 * @param minHeight  Minimum element height in px.
 * @param maxHeight  Maximum element height in px; content scrolls above this.
 */
export function usePretextAutoResize(
	value: string,
	font: string,
	lineHeight: number,
	paddingV: number,
	minHeight: number,
	maxHeight: number,
	profileMeta?: PretextProfileMeta,
): React.RefObject<HTMLTextAreaElement | null> {
	const ref = useRef<HTMLTextAreaElement | null>(null);
	// Cache content-box width; updated by ResizeObserver (no reflow)
	const textWidthRef = useRef(0);
	// Keep latest value accessible inside the ResizeObserver callback
	const valueRef = useRef(value);
	valueRef.current = value;

	const applyHeight = useCallback(
		(el: HTMLTextAreaElement, textWidth: number, currentValue: string) => {
			if (textWidth <= 0) {
				// Width not yet known — fall back to the reflow-based method once
				recordPretextFallbackReflow(profileMeta ?? {});
				el.style.height = "0px";
				el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
				return;
			}
			try {
				const prepared = getPreparedTextCached(
					currentValue || " ",
					font,
					{
						whiteSpace: "pre-wrap",
					},
					profileMeta,
				);
				const layoutStart =
					typeof performance !== "undefined" &&
					typeof performance.now === "function"
						? performance.now()
						: Date.now();
				const { height: textHeight } = layout(prepared, textWidth, lineHeight);
				const layoutEnd =
					typeof performance !== "undefined" &&
					typeof performance.now === "function"
						? performance.now()
						: Date.now();
				recordPretextLayout(
					profileMeta ?? {},
					Math.max(0, layoutEnd - layoutStart),
				);
				const next = Math.max(
					minHeight,
					Math.min(maxHeight, paddingV + textHeight),
				);
				el.style.height = `${next}px`;
			} catch {
				// If pretext fails, fall back gracefully
				recordPretextFallbackReflow(profileMeta ?? {});
				el.style.height = "0px";
				el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
			}
		},
		[font, lineHeight, maxHeight, minHeight, paddingV, profileMeta],
	);

	// Wire up ResizeObserver once at mount
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;

		// ResizeObserver.contentRect.width = content-box width (excludes padding+border),
		// which is exactly the text-available width pretext needs.
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			textWidthRef.current = entry.contentRect.width;
			applyHeight(el, textWidthRef.current, valueRef.current);
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, [applyHeight]);

	// Recompute height on every value change using the cached width
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		applyHeight(el, textWidthRef.current, value);
	}, [applyHeight, value]);

	return ref;
}
