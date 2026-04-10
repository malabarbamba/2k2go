type PretextOpKind = "prepare" | "layout" | "fallback_reflow";

type PretextProfileMeta = {
	pagePath?: string;
	blockId?: string;
};

type BlockStats = {
	prepareCalls: number;
	prepareCacheHits: number;
	prepareCacheMisses: number;
	prepareMs: number;
	layoutCalls: number;
	layoutMs: number;
	fallbackReflowReads: number;
	lastUpdatedAt: number;
};

type PageStats = {
	prepareCalls: number;
	prepareCacheHits: number;
	prepareCacheMisses: number;
	prepareMs: number;
	layoutCalls: number;
	layoutMs: number;
	fallbackReflowReads: number;
	blocks: Map<string, BlockStats>;
};

type FpsStats = {
	current: number;
	average: number;
	min: number;
	max: number;
	samples: number;
};

type SnapshotTotals = {
	prepareCalls: number;
	prepareCacheHits: number;
	prepareCacheMisses: number;
	prepareMs: number;
	layoutCalls: number;
	layoutMs: number;
	fallbackReflowReads: number;
	scriptMs: number;
	longTaskCount: number;
	longTaskMs: number;
	fpsAverage: number;
	fpsCurrent: number;
};

type RuntimeSnapshot = {
	name: string;
	capturedAt: number;
	totals: SnapshotTotals;
};

type RuntimeProfilerState = {
	startedAt: number;
	activePagePath: string;
	pages: Map<string, PageStats>;
	baselineSnapshots: Map<string, RuntimeSnapshot>;
	longTaskCount: number;
	longTaskMs: number;
	fpsSamples: number[];
	fpsCurrent: number;
	rafRunning: boolean;
	rafId: number | null;
	rafPrevTs: number;
	frameCount: number;
	longTaskObserver: PerformanceObserver | null;
};

type RuntimeProfilerApi = {
	markBaseline: (name?: string) => RuntimeSnapshot;
	report: () => {
		sinceStartMs: number;
		totals: SnapshotTotals;
		worstBlocks: Array<{ key: string; totalMs: number; stats: BlockStats }>;
		pages: Array<{ path: string; totals: Omit<PageStats, "blocks"> }>;
	};
	compareWithBaseline: (name?: string) => {
		baseline: RuntimeSnapshot;
		current: RuntimeSnapshot;
		delta: SnapshotTotals;
	} | null;
	reset: () => void;
};

declare global {
	interface Window {
		__appV2PretextProfiler?: RuntimeProfilerApi;
	}
}

const DEFAULT_PAGE_PATH = "/app-v2";
const BASELINE_DEFAULT_NAME = "before";
const FPS_SAMPLE_WINDOW = 120;

const state: RuntimeProfilerState = {
	startedAt: Date.now(),
	activePagePath: DEFAULT_PAGE_PATH,
	pages: new Map(),
	baselineSnapshots: new Map(),
	longTaskCount: 0,
	longTaskMs: 0,
	fpsSamples: [],
	fpsCurrent: 0,
	rafRunning: false,
	rafId: null,
	rafPrevTs: 0,
	frameCount: 0,
	longTaskObserver: null,
};

function nowMs(): number {
	if (
		typeof performance !== "undefined" &&
		typeof performance.now === "function"
	) {
		return performance.now();
	}
	return Date.now();
}

function resolvePagePath(pagePath?: string): string {
	if (pagePath && pagePath.trim().length > 0) {
		return pagePath;
	}
	if (
		typeof window !== "undefined" &&
		window.location.pathname.startsWith("/app-v2")
	) {
		return window.location.pathname;
	}
	return state.activePagePath;
}

function resolveBlockId(blockId?: string): string {
	if (blockId && blockId.trim().length > 0) {
		return blockId;
	}
	return "unknown-block";
}

function ensurePageStats(path: string): PageStats {
	const existing = state.pages.get(path);
	if (existing) {
		return existing;
	}
	const created: PageStats = {
		prepareCalls: 0,
		prepareCacheHits: 0,
		prepareCacheMisses: 0,
		prepareMs: 0,
		layoutCalls: 0,
		layoutMs: 0,
		fallbackReflowReads: 0,
		blocks: new Map(),
	};
	state.pages.set(path, created);
	return created;
}

function ensureBlockStats(pageStats: PageStats, blockKey: string): BlockStats {
	const existing = pageStats.blocks.get(blockKey);
	if (existing) {
		return existing;
	}
	const created: BlockStats = {
		prepareCalls: 0,
		prepareCacheHits: 0,
		prepareCacheMisses: 0,
		prepareMs: 0,
		layoutCalls: 0,
		layoutMs: 0,
		fallbackReflowReads: 0,
		lastUpdatedAt: Date.now(),
	};
	pageStats.blocks.set(blockKey, created);
	return created;
}

function updateOpCounters(
	op: PretextOpKind,
	pageStats: PageStats,
	blockStats: BlockStats,
	durationMs: number,
	cacheHit: boolean,
): void {
	if (op === "prepare") {
		pageStats.prepareCalls += 1;
		blockStats.prepareCalls += 1;
		if (cacheHit) {
			pageStats.prepareCacheHits += 1;
			blockStats.prepareCacheHits += 1;
		} else {
			pageStats.prepareCacheMisses += 1;
			blockStats.prepareCacheMisses += 1;
			pageStats.prepareMs += durationMs;
			blockStats.prepareMs += durationMs;
		}
	}

	if (op === "layout") {
		pageStats.layoutCalls += 1;
		blockStats.layoutCalls += 1;
		pageStats.layoutMs += durationMs;
		blockStats.layoutMs += durationMs;
	}

	if (op === "fallback_reflow") {
		pageStats.fallbackReflowReads += 1;
		blockStats.fallbackReflowReads += 1;
	}

	blockStats.lastUpdatedAt = Date.now();
}

function recordOp(
	op: PretextOpKind,
	meta: PretextProfileMeta,
	durationMs = 0,
	cacheHit = false,
): void {
	const pagePath = resolvePagePath(meta.pagePath);
	const blockId = resolveBlockId(meta.blockId);
	const pageStats = ensurePageStats(pagePath);
	const blockStats = ensureBlockStats(pageStats, blockId);
	updateOpCounters(
		op,
		pageStats,
		blockStats,
		Math.max(0, durationMs),
		cacheHit,
	);
}

function computeFpsStats(): FpsStats {
	if (state.fpsSamples.length === 0) {
		return {
			current: state.fpsCurrent,
			average: 0,
			min: 0,
			max: 0,
			samples: 0,
		};
	}
	let total = 0;
	let min = Number.POSITIVE_INFINITY;
	let max = 0;
	for (const sample of state.fpsSamples) {
		total += sample;
		if (sample < min) min = sample;
		if (sample > max) max = sample;
	}
	return {
		current: state.fpsCurrent,
		average: total / state.fpsSamples.length,
		min,
		max,
		samples: state.fpsSamples.length,
	};
}

function getSnapshotTotals(): SnapshotTotals {
	let prepareCalls = 0;
	let prepareCacheHits = 0;
	let prepareCacheMisses = 0;
	let prepareMs = 0;
	let layoutCalls = 0;
	let layoutMs = 0;
	let fallbackReflowReads = 0;
	for (const page of state.pages.values()) {
		prepareCalls += page.prepareCalls;
		prepareCacheHits += page.prepareCacheHits;
		prepareCacheMisses += page.prepareCacheMisses;
		prepareMs += page.prepareMs;
		layoutCalls += page.layoutCalls;
		layoutMs += page.layoutMs;
		fallbackReflowReads += page.fallbackReflowReads;
	}
	const fps = computeFpsStats();
	return {
		prepareCalls,
		prepareCacheHits,
		prepareCacheMisses,
		prepareMs,
		layoutCalls,
		layoutMs,
		fallbackReflowReads,
		scriptMs: prepareMs + layoutMs,
		longTaskCount: state.longTaskCount,
		longTaskMs: state.longTaskMs,
		fpsAverage: fps.average,
		fpsCurrent: fps.current,
	};
}

function buildSnapshot(name: string): RuntimeSnapshot {
	return {
		name,
		capturedAt: Date.now(),
		totals: getSnapshotTotals(),
	};
}

function ensureRafLoop(): void {
	if (state.rafRunning || typeof window === "undefined") {
		return;
	}
	state.rafRunning = true;
	state.rafPrevTs = 0;
	state.frameCount = 0;

	const tick = (ts: number) => {
		if (!state.rafRunning) {
			return;
		}
		if (state.rafPrevTs <= 0) {
			state.rafPrevTs = ts;
		}
		state.frameCount += 1;
		const elapsed = ts - state.rafPrevTs;
		if (elapsed >= 1000) {
			const fps = (state.frameCount * 1000) / elapsed;
			state.fpsCurrent = fps;
			state.fpsSamples.push(fps);
			if (state.fpsSamples.length > FPS_SAMPLE_WINDOW) {
				state.fpsSamples.shift();
			}
			state.frameCount = 0;
			state.rafPrevTs = ts;
		}
		state.rafId = window.requestAnimationFrame(tick);
	};

	state.rafId = window.requestAnimationFrame(tick);
}

function ensureLongTaskObserver(): void {
	if (state.longTaskObserver || typeof window === "undefined") {
		return;
	}
	if (typeof PerformanceObserver === "undefined") {
		return;
	}
	try {
		const observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				state.longTaskCount += 1;
				state.longTaskMs += Math.max(0, entry.duration);
			}
		});
		observer.observe({ entryTypes: ["longtask"] });
		state.longTaskObserver = observer;
	} catch {
		state.longTaskObserver = null;
	}
}

function markBaseline(name = BASELINE_DEFAULT_NAME): RuntimeSnapshot {
	const snapshot = buildSnapshot(name);
	state.baselineSnapshots.set(name, snapshot);
	return snapshot;
}

function report() {
	const totals = getSnapshotTotals();
	const pageRows = Array.from(state.pages.entries()).map(([path, stats]) => ({
		path,
		totals: {
			prepareCalls: stats.prepareCalls,
			prepareCacheHits: stats.prepareCacheHits,
			prepareCacheMisses: stats.prepareCacheMisses,
			prepareMs: stats.prepareMs,
			layoutCalls: stats.layoutCalls,
			layoutMs: stats.layoutMs,
			fallbackReflowReads: stats.fallbackReflowReads,
		},
	}));

	const worstBlocks = Array.from(state.pages.entries())
		.flatMap(([path, stats]) =>
			Array.from(stats.blocks.entries()).map(([block, blockStats]) => ({
				key: `${path} :: ${block}`,
				totalMs: blockStats.prepareMs + blockStats.layoutMs,
				stats: blockStats,
			})),
		)
		.sort((a, b) => b.totalMs - a.totalMs)
		.slice(0, 10);

	return {
		sinceStartMs: Date.now() - state.startedAt,
		totals,
		worstBlocks,
		pages: pageRows,
	};
}

function compareWithBaseline(name = BASELINE_DEFAULT_NAME) {
	const baseline = state.baselineSnapshots.get(name);
	if (!baseline) {
		return null;
	}
	const current = buildSnapshot("current");
	const delta: SnapshotTotals = {
		prepareCalls: current.totals.prepareCalls - baseline.totals.prepareCalls,
		prepareCacheHits:
			current.totals.prepareCacheHits - baseline.totals.prepareCacheHits,
		prepareCacheMisses:
			current.totals.prepareCacheMisses - baseline.totals.prepareCacheMisses,
		prepareMs: current.totals.prepareMs - baseline.totals.prepareMs,
		layoutCalls: current.totals.layoutCalls - baseline.totals.layoutCalls,
		layoutMs: current.totals.layoutMs - baseline.totals.layoutMs,
		fallbackReflowReads:
			current.totals.fallbackReflowReads - baseline.totals.fallbackReflowReads,
		scriptMs: current.totals.scriptMs - baseline.totals.scriptMs,
		longTaskCount: current.totals.longTaskCount - baseline.totals.longTaskCount,
		longTaskMs: current.totals.longTaskMs - baseline.totals.longTaskMs,
		fpsAverage: current.totals.fpsAverage - baseline.totals.fpsAverage,
		fpsCurrent: current.totals.fpsCurrent - baseline.totals.fpsCurrent,
	};
	return { baseline, current, delta };
}

function reset(): void {
	state.startedAt = Date.now();
	state.pages.clear();
	state.baselineSnapshots.clear();
	state.longTaskCount = 0;
	state.longTaskMs = 0;
	state.fpsSamples = [];
	state.fpsCurrent = 0;
	state.rafPrevTs = 0;
	state.frameCount = 0;
}

export function ensureAppV2RuntimeProfiler(pagePath?: string): void {
	state.activePagePath = resolvePagePath(pagePath);
	ensurePageStats(state.activePagePath);
	if (typeof window === "undefined") {
		return;
	}
	ensureRafLoop();
	ensureLongTaskObserver();
	if (!window.__appV2PretextProfiler) {
		window.__appV2PretextProfiler = {
			markBaseline,
			report,
			compareWithBaseline,
			reset,
		};
	}
}

export function recordPretextPrepare(
	meta: PretextProfileMeta,
	params: { durationMs: number; cacheHit: boolean },
): void {
	recordOp("prepare", meta, params.durationMs, params.cacheHit);
}

export function recordPretextLayout(
	meta: PretextProfileMeta,
	durationMs: number,
): void {
	recordOp("layout", meta, durationMs, false);
}

export function recordPretextFallbackReflow(meta: PretextProfileMeta): void {
	recordOp("fallback_reflow", meta, 0, false);
}

export type { PretextProfileMeta };
