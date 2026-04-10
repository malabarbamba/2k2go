export interface AdminAuthContext {
  hasAuthorizationHeader: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

export interface AdminAuthFailure {
  status: 401 | 403;
  error: string;
}

export interface ContractFailure {
  status: number;
  error: string;
}

export const ANALYTICS_PERIODS = ["24h", "7d", "30d", "all"] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export const ANALYTICS_EVENT_TYPES = [
  "session_start",
  "session_update",
  "page_view",
  "click",
  "page_exit",
  "route_transition",
  "scroll_depth",
  "friction",
] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export const ANALYTICS_SCROLL_DEPTH_BANDS = ["0-25", "25-50", "50-75", "75-100", "100"] as const;
export type ScrollDepthBand = (typeof ANALYTICS_SCROLL_DEPTH_BANDS)[number];

export const ANALYTICS_INTERACTION_TYPES = ["navigation", "cta", "form", "media", "other"] as const;
export type InteractionType = (typeof ANALYTICS_INTERACTION_TYPES)[number];

export const ANALYTICS_FRICTION_MARKERS = [
  "rage_click",
  "blocked_action",
  "validation_error",
  "slow_navigation",
  "dead_end",
] as const;
export type FrictionMarker = (typeof ANALYTICS_FRICTION_MARKERS)[number];

export const ANALYTICS_KPI_DICTIONARY_VERSION = "2026-02-14";

export const ANALYTICS_RETENTION_POLICY = {
  raw_event_retention_months: 18,
  aggregated_kpi_retention_months: 36,
} as const;

export const ANALYTICS_KPI_DICTIONARY = {
  bounce_rate: {
    label: "Taux de rebond",
    formula: "(sessions_avec_1_page_vue / sessions_totales) * 100",
    unit: "percentage",
    window: "period",
  },
  top_clicked_elements: {
    label: "Elements les plus cliques",
    formula: "Classement descendant par nombre de clics sur element_selector",
    unit: "count",
    window: "period",
  },
  low_clicked_elements: {
    label: "Elements les moins cliques",
    formula: "Classement ascendant par nombre de clics sur element_selector",
    unit: "count",
    window: "period",
  },
  drop_off_pages: {
    label: "Pages de sortie",
    formula: "Derniere page vue par session, agregee par page_path",
    unit: "count",
    window: "period",
  },
  friction_hotspots: {
    label: "Hotspots de friction",
    formula:
      "score = friction_events*2 + rage_clicks*3 + blocked_actions*2 + low_scroll_high_dwell*2",
    unit: "score",
    window: "period",
  },
  engagement_score: {
    label: "Score d'engagement",
    formula:
      "clamp(0,100,(pages_per_session_index*40)+(click_through_index*30)+(deep_scroll_rate*30)-(friction_penalty_index*20))",
    unit: "score",
    window: "period",
  },
} as const;

export interface AnalyticsSessionRow {
  id: string;
  started_at: string;
  last_activity_at?: string | null;
}

export interface AnalyticsPageViewRow {
  session_id: string;
  page_path: string;
  created_at: string;
}

export interface AnalyticsClickRow {
  session_id: string;
  page_path: string;
  element_selector: string | null;
  created_at: string;
}

export interface AnalyticsBehaviorEventRow {
  session_id: string;
  event_type: string;
  page_path: string | null;
  element_selector: string | null;
  interaction_type: string | null;
  friction_marker: string | null;
  scroll_depth_band: string | null;
  dwell_ms: number | null;
  occurred_at: string;
}

export interface NormalizedAnalyticsEvent {
  eventId: string;
  type: AnalyticsEventType;
  sessionId: string;
  visitorId: string | null;
  userId: string | null;
  pagePath: string | null;
  pageTitle: string | null;
  referrer: string | null;
  routeFrom: string | null;
  routeTo: string | null;
  interactionType: InteractionType | null;
  frictionMarker: FrictionMarker | null;
  elementSelector: string | null;
  elementLabel: string | null;
  xPosition: number | null;
  yPosition: number | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  scrollDepthBand: ScrollDepthBand | null;
  dwellMs: number | null;
  deviceType: string | null;
  browser: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface AnalyticsKpiResponse {
  schema_version: "analytics_kpi_v1";
  dictionary_version: string;
  period: AnalyticsPeriod;
  generated_at: string;
  retention_policy: typeof ANALYTICS_RETENTION_POLICY;
  dictionary: typeof ANALYTICS_KPI_DICTIONARY;
  totals: {
    sessions: number;
    page_views: number;
    clicks: number;
    behavior_events: number;
  };
  kpis: {
    bounce_rate: {
      value: number;
      bounced_sessions: number;
      total_sessions: number;
    };
    engagement_score: {
      value: number;
      avg_pages_per_session: number;
      click_through_rate: number;
      deep_scroll_rate: number;
      friction_penalty_rate: number;
    };
  };
  top_clicked_elements: Array<{
    element_selector: string;
    clicks: number;
    share: number;
  }>;
  low_clicked_elements: Array<{
    element_selector: string;
    clicks: number;
    share: number;
  }>;
  drop_off_pages: Array<{
    page_path: string;
    sessions: number;
    share: number;
  }>;
  friction_hotspots: Array<{
    page_path: string;
    score: number;
    friction_events: number;
    rage_clicks: number;
    blocked_actions: number;
    low_scroll_high_dwell: number;
  }>;
}

interface BuildAnalyticsKpiResponseInput {
  period: AnalyticsPeriod;
  generatedAt: string;
  sessions: AnalyticsSessionRow[];
  pageViews: AnalyticsPageViewRow[];
  clicks: AnalyticsClickRow[];
  behaviorEvents: AnalyticsBehaviorEventRow[];
}

const LOW_SCROLL_BANDS: ReadonlySet<ScrollDepthBand> = new Set(["0-25", "25-50"]);
const HIGH_SCROLL_BANDS: ReadonlySet<ScrollDepthBand> = new Set(["75-100", "100"]);
const SENSITIVE_TEXT_PATTERNS = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\b\d{10,}\b/,
  /\b(password|mot\s*de\s*passe|token|secret|iban|carte|card|cvv)\b/i,
  /api[_-]?key/i,
  /sk_(live|test)/i,
  /sb_secret/i,
];

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function containsSensitiveText(value: string): boolean {
  return SENSITIVE_TEXT_PATTERNS.some((pattern) => pattern.test(value));
}

function sanitizeElementLabel(value: unknown): string | null {
  const label = sanitizeText(value, 100);
  if (!label) {
    return null;
  }

  if (containsSensitiveText(label)) {
    return null;
  }

  return label;
}

function sanitizePath(value: unknown): string | null {
  const rawPath = sanitizeText(value, 180);
  if (!rawPath) {
    return null;
  }

  return rawPath.startsWith("/") ? rawPath : null;
}

function sanitizeMetadata(value: unknown): Record<string, unknown> {
  if (!isObject(value)) {
    return {};
  }

  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (Object.keys(out).length >= 12) {
      break;
    }

    const safeKey = sanitizeText(key, 40);
    if (!safeKey) {
      continue;
    }

    if (raw === null || typeof raw === "boolean" || typeof raw === "number") {
      out[safeKey] = raw;
      continue;
    }

    if (typeof raw === "string") {
      const safeValue = sanitizeText(raw, 100);
      if (!safeValue || containsSensitiveText(safeValue)) {
        continue;
      }
      out[safeKey] = safeValue;
    }
  }

  return out;
}

function normalizeInteger(value: unknown, maxValue: number): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    if (value < 0 || value > maxValue) {
      return null;
    }
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value, 10);
    if (parsed < 0 || parsed > maxValue) {
      return null;
    }
    return parsed;
  }

  return null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function normalizeEventType(value: unknown): AnalyticsEventType | null {
  if (typeof value !== "string") {
    return null;
  }
  return (ANALYTICS_EVENT_TYPES as readonly string[]).includes(value) ? (value as AnalyticsEventType) : null;
}

function normalizeScrollDepthBand(value: unknown): ScrollDepthBand | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if ((ANALYTICS_SCROLL_DEPTH_BANDS as readonly string[]).includes(trimmed)) {
      return trimmed as ScrollDepthBand;
    }
  }

  const numericDepth = normalizeNumber(value);
  if (numericDepth === null) {
    return null;
  }

  const depth = Math.max(0, Math.min(100, numericDepth));
  if (depth >= 100) return "100";
  if (depth >= 75) return "75-100";
  if (depth >= 50) return "50-75";
  if (depth >= 25) return "25-50";
  return "0-25";
}

function normalizeInteractionType(value: unknown): InteractionType | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if ((ANALYTICS_INTERACTION_TYPES as readonly string[]).includes(trimmed)) {
    return trimmed as InteractionType;
  }

  return null;
}

function normalizeFrictionMarker(value: unknown): FrictionMarker | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if ((ANALYTICS_FRICTION_MARKERS as readonly string[]).includes(trimmed)) {
    return trimmed as FrictionMarker;
  }

  return null;
}

function normalizeOccurredAt(value: unknown): string {
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return round((part / total) * 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveElementKey(selector: string | null): string {
  const safe = sanitizeText(selector, 140);
  return safe || "(inconnu)";
}

export function isAnalyticsPeriod(value: unknown): value is AnalyticsPeriod {
  return typeof value === "string" && (ANALYTICS_PERIODS as readonly string[]).includes(value);
}

export function resolveAnalyticsPeriodStart(period: AnalyticsPeriod, now: Date = new Date()): string | null {
  if (period === "all") {
    return null;
  }

  const deltaByPeriod: Record<Exclude<AnalyticsPeriod, "all">, number> = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };

  return new Date(now.getTime() - deltaByPeriod[period]).toISOString();
}

export function resolveAdminAuthFailure(context: AdminAuthContext): AdminAuthFailure | null {
  if (!context.hasAuthorizationHeader || !context.isAuthenticated) {
    return {
      status: 401,
      error: "Authentification requise.",
    };
  }

  if (!context.isAdmin) {
    return {
      status: 403,
      error: "Acces administrateur requis.",
    };
  }

  return null;
}

export function parseAnalyticsPeriod(value: unknown): AnalyticsPeriod | ContractFailure {
  if (value === undefined || value === null) {
    return "7d";
  }

  if (!isAnalyticsPeriod(value)) {
    return {
      status: 400,
      error: "Le champ 'period' est invalide. Valeurs autorisees: 24h, 7d, 30d, all.",
    };
  }

  return value;
}

export function normalizeAnalyticsEvent(payload: unknown): NormalizedAnalyticsEvent | null {
  if (!isObject(payload)) {
    return null;
  }

  const type = normalizeEventType(payload.type);
  const eventId = sanitizeText(payload.eventId ?? payload.event_id ?? payload.id, 80);
  const sessionId = sanitizeText(payload.sessionId, 64);

  if (!type || !eventId || !sessionId) {
    return null;
  }

  const visitorId = sanitizeText(payload.visitorId, 120);
  const userId = sanitizeText(payload.userId, 64);
  const pagePath = sanitizePath(payload.pagePath);
  const routeFrom = sanitizePath(payload.routeFrom ?? payload.previousPagePath);
  const routeTo = sanitizePath(payload.routeTo ?? payload.nextPagePath);
  const pageTitle = sanitizeText(payload.pageTitle, 180);
  const referrer = sanitizeText(payload.referrer, 240);
  const elementSelector = sanitizeText(payload.elementSelector, 180);
  const elementLabel = sanitizeElementLabel(payload.elementLabel ?? payload.elementText);
  const interactionType = normalizeInteractionType(payload.interactionType);
  const frictionMarker = normalizeFrictionMarker(payload.frictionMarker);
  const scrollDepthBand = normalizeScrollDepthBand(payload.scrollDepthBand ?? payload.scrollDepth);
  const dwellMs = normalizeInteger(payload.dwellMs, 60 * 60 * 1000);
  const xPosition = normalizeInteger(payload.xPosition, 20000);
  const yPosition = normalizeInteger(payload.yPosition, 20000);
  const viewportWidth = normalizeInteger(payload.viewportWidth, 20000);
  const viewportHeight = normalizeInteger(payload.viewportHeight, 20000);
  const deviceType = sanitizeText(payload.deviceType, 32);
  const browser = sanitizeText(payload.browser, 64);
  const userAgent = sanitizeText(payload.userAgent, 320);
  const metadata = sanitizeMetadata(payload.metadata);
  const occurredAt = normalizeOccurredAt(payload.occurredAt);

  return {
    eventId,
    type,
    sessionId,
    visitorId,
    userId,
    pagePath,
    pageTitle,
    referrer,
    routeFrom,
    routeTo,
    interactionType,
    frictionMarker,
    elementSelector,
    elementLabel,
    xPosition,
    yPosition,
    viewportWidth,
    viewportHeight,
    scrollDepthBand,
    dwellMs,
    deviceType,
    browser,
    userAgent,
    metadata,
    occurredAt,
  };
}

export function buildAnalyticsKpiResponse(input: BuildAnalyticsKpiResponseInput): AnalyticsKpiResponse {
  const sessionIds = new Set<string>();

  for (const session of input.sessions) {
    if (session.id) sessionIds.add(session.id);
  }

  if (sessionIds.size === 0) {
    for (const row of input.pageViews) {
      if (row.session_id) sessionIds.add(row.session_id);
    }
  }

  const pageViewsBySession = new Map<string, AnalyticsPageViewRow[]>();
  for (const row of input.pageViews) {
    const rows = pageViewsBySession.get(row.session_id) ?? [];
    rows.push(row);
    pageViewsBySession.set(row.session_id, rows);
  }

  for (const [sessionId, rows] of pageViewsBySession.entries()) {
    rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    pageViewsBySession.set(sessionId, rows);
  }

  const totalSessions = sessionIds.size;
  const totalPageViews = input.pageViews.length;
  const totalClicks = input.clicks.length;
  const totalBehaviorEvents = input.behaviorEvents.length;

  let bouncedSessions = 0;
  for (const sessionId of sessionIds) {
    const count = pageViewsBySession.get(sessionId)?.length ?? 0;
    if (count <= 1) {
      bouncedSessions += 1;
    }
  }

  const bounceRate = percent(bouncedSessions, totalSessions);

  const clickCounts = new Map<string, number>();
  for (const click of input.clicks) {
    const key = resolveElementKey(click.element_selector);
    clickCounts.set(key, (clickCounts.get(key) ?? 0) + 1);
  }

  const clickRows = [...clickCounts.entries()]
    .map(([element_selector, clicks]) => ({
      element_selector,
      clicks,
      share: percent(clicks, totalClicks),
    }))
    .sort((a, b) => (b.clicks - a.clicks) || a.element_selector.localeCompare(b.element_selector));

  const topClickedElements = clickRows.slice(0, 5);
  const lowClickedElements = [...clickRows]
    .sort((a, b) => (a.clicks - b.clicks) || a.element_selector.localeCompare(b.element_selector))
    .slice(0, 5);

  const dropOffCounts = new Map<string, number>();
  for (const sessionId of sessionIds) {
    const rows = pageViewsBySession.get(sessionId);
    if (!rows || rows.length === 0) {
      continue;
    }

    const dropOffPath = rows[rows.length - 1].page_path || "/";
    dropOffCounts.set(dropOffPath, (dropOffCounts.get(dropOffPath) ?? 0) + 1);
  }

  const dropOffPages = [...dropOffCounts.entries()]
    .map(([page_path, sessions]) => ({
      page_path,
      sessions,
      share: percent(sessions, totalSessions),
    }))
    .sort((a, b) => (b.sessions - a.sessions) || a.page_path.localeCompare(b.page_path))
    .slice(0, 8);

  type FrictionBucket = {
    friction_events: number;
    rage_clicks: number;
    blocked_actions: number;
    low_scroll_high_dwell: number;
    score: number;
  };

  const frictionByPage = new Map<string, FrictionBucket>();

  const ensureFrictionBucket = (pagePath: string): FrictionBucket => {
    const existing = frictionByPage.get(pagePath);
    if (existing) return existing;

    const created: FrictionBucket = {
      friction_events: 0,
      rage_clicks: 0,
      blocked_actions: 0,
      low_scroll_high_dwell: 0,
      score: 0,
    };
    frictionByPage.set(pagePath, created);
    return created;
  };

  let frictionEventsCount = 0;
  let deepScrollEvents = 0;
  let pageExitEvents = 0;

  for (const event of input.behaviorEvents) {
    const pagePath = sanitizePath(event.page_path) ?? "/";
    const bucket = ensureFrictionBucket(pagePath);

    const marker = normalizeFrictionMarker(event.friction_marker);
    if (marker) {
      frictionEventsCount += 1;
      bucket.friction_events += 1;

      if (marker === "rage_click") {
        bucket.rage_clicks += 1;
      }
      if (marker === "blocked_action") {
        bucket.blocked_actions += 1;
      }
    }

    if (event.event_type === "page_exit") {
      pageExitEvents += 1;
      const band = normalizeScrollDepthBand(event.scroll_depth_band);
      const dwellMs = normalizeInteger(event.dwell_ms, 60 * 60 * 1000) ?? 0;

      if (band && HIGH_SCROLL_BANDS.has(band)) {
        deepScrollEvents += 1;
      }

      if (band && LOW_SCROLL_BANDS.has(band) && dwellMs >= 45_000) {
        bucket.low_scroll_high_dwell += 1;
      }
    }
  }

  for (const bucket of frictionByPage.values()) {
    bucket.score =
      (bucket.friction_events * 2)
      + (bucket.rage_clicks * 3)
      + (bucket.blocked_actions * 2)
      + (bucket.low_scroll_high_dwell * 2);
  }

  const frictionHotspots = [...frictionByPage.entries()]
    .map(([page_path, bucket]) => ({
      page_path,
      score: bucket.score,
      friction_events: bucket.friction_events,
      rage_clicks: bucket.rage_clicks,
      blocked_actions: bucket.blocked_actions,
      low_scroll_high_dwell: bucket.low_scroll_high_dwell,
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => (b.score - a.score) || a.page_path.localeCompare(b.page_path))
    .slice(0, 8);

  const avgPagesPerSession = totalSessions > 0 ? totalPageViews / totalSessions : 0;
  const clickThroughRate = totalPageViews > 0 ? totalClicks / totalPageViews : 0;
  const deepScrollRate = pageExitEvents > 0 ? deepScrollEvents / pageExitEvents : 0;
  const frictionPenaltyRate = totalSessions > 0 ? frictionEventsCount / totalSessions : 0;

  const pagesPerSessionIndex = clamp(avgPagesPerSession / 4, 0, 1);
  const clickThroughIndex = clamp(clickThroughRate / 1.5, 0, 1);
  const frictionPenaltyIndex = clamp(frictionPenaltyRate / 1.5, 0, 1);

  const engagementScore = round(
    clamp(
      (pagesPerSessionIndex * 40)
      + (clickThroughIndex * 30)
      + (deepScrollRate * 30)
      - (frictionPenaltyIndex * 20),
      0,
      100,
    ),
  );

  return {
    schema_version: "analytics_kpi_v1",
    dictionary_version: ANALYTICS_KPI_DICTIONARY_VERSION,
    period: input.period,
    generated_at: input.generatedAt,
    retention_policy: ANALYTICS_RETENTION_POLICY,
    dictionary: ANALYTICS_KPI_DICTIONARY,
    totals: {
      sessions: totalSessions,
      page_views: totalPageViews,
      clicks: totalClicks,
      behavior_events: totalBehaviorEvents,
    },
    kpis: {
      bounce_rate: {
        value: bounceRate,
        bounced_sessions: bouncedSessions,
        total_sessions: totalSessions,
      },
      engagement_score: {
        value: engagementScore,
        avg_pages_per_session: round(avgPagesPerSession),
        click_through_rate: round(clickThroughRate),
        deep_scroll_rate: round(deepScrollRate),
        friction_penalty_rate: round(frictionPenaltyRate),
      },
    },
    top_clicked_elements: topClickedElements,
    low_clicked_elements: lowClickedElements,
    drop_off_pages: dropOffPages,
    friction_hotspots: frictionHotspots,
  };
}
