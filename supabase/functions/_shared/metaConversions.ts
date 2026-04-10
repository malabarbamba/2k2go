type MetaConversionUserData = {
  email?: string | null;
  phone?: string | null;
  externalId?: string | null;
  fbp?: string | null;
  fbc?: string | null;
};

type MetaConversionEventInput = {
  request?: Request;
  eventName: string;
  eventId?: string | null;
  eventTime?: number;
  eventSourceUrl?: string | null;
  userData?: MetaConversionUserData;
  customData?: Record<string, unknown>;
  testEventCode?: string | null;
};

type MetaConfig = {
  pixelId: string;
  accessToken: string;
  graphApiVersion: string;
  testEventCode: string | null;
};

const DEFAULT_GRAPH_API_VERSION = "v24.0";
const DEFAULT_SOURCE_URL = "https://www.arabeimmersion.fr";
const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

const readEnv = (...keys: string[]): string | null => {
  for (const key of keys) {
    const value = Deno.env.get(key)?.trim();
    if (value) {
      return value;
    }
  }
  return null;
};

const normalizeEmail = (value: string): string => value.trim().toLowerCase();
const normalizePhone = (value: string): string => value.replace(/[^0-9]/g, "");
const normalizeExternalId = (value: string): string => value.trim().toLowerCase();

const sha256Hex = async (value: string): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const getClientIpAddress = (request?: Request): string | null => {
  if (!request) return null;

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const ip = forwardedFor || cfIp || realIp;

  if (!ip || ip === "unknown") return null;
  return ip;
};

const toOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const getHostnameFromUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;

  try {
    return new URL(value).hostname.trim().toLowerCase();
  } catch {
    return null;
  }
};

const isLocalhostHostname = (hostname: string | null | undefined): boolean => {
  if (!hostname) return false;
  return LOCALHOST_HOSTNAMES.has(hostname.trim().toLowerCase());
};

const shouldSkipLocalhostEvent = (input: MetaConversionEventInput): boolean => {
  const sourceHost = getHostnameFromUrl(input.eventSourceUrl ?? null);
  if (isLocalhostHostname(sourceHost)) {
    return true;
  }

  const originHost = getHostnameFromUrl(input.request?.headers.get("origin"));
  if (isLocalhostHostname(originHost)) {
    return true;
  }

  const refererHost = getHostnameFromUrl(input.request?.headers.get("referer"));
  return isLocalhostHostname(refererHost);
};

const getValidOriginFromRequest = (request?: Request): string | null => {
  const origin = toOptionalString(request?.headers.get("origin"));
  if (!origin) return null;

  try {
    const url = new URL(origin);
    if (isLocalhostHostname(url.hostname)) {
      return null;
    }

    return stripTrailingSlash(url.toString());
  } catch {
    return null;
  }
};

const toEventSourceUrl = (
  value: string | null | undefined,
  request?: Request,
): string => {
  const source = toOptionalString(value);
  const requestOrigin = getValidOriginFromRequest(request) || DEFAULT_SOURCE_URL;

  if (!source) {
    const referer = toOptionalString(request?.headers.get("referer"));
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        if (!isLocalhostHostname(refererUrl.hostname)) {
          return refererUrl.toString();
        }
      } catch {
        // ignore malformed referer
      }
    }

    return requestOrigin;
  }

  try {
    const absoluteUrl = new URL(source);
    if (isLocalhostHostname(absoluteUrl.hostname)) {
      return DEFAULT_SOURCE_URL;
    }

    return absoluteUrl.toString();
  } catch {
    // source can be a relative path (e.g. "/deck-perso")
  }

  try {
    return new URL(source, `${requestOrigin}/`).toString();
  } catch {
    return requestOrigin;
  }
};

const getCookieMap = (request?: Request): Map<string, string> => {
  const cookieHeader = request?.headers.get("cookie");
  if (!cookieHeader) return new Map();

  return new Map(
    cookieHeader
      .split(";")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => {
        const separatorIndex = entry.indexOf("=");
        if (separatorIndex < 0) {
          return [entry, ""] as const;
        }

        const name = entry.slice(0, separatorIndex).trim();
        const value = entry.slice(separatorIndex + 1).trim();
        return [name, value] as const;
      }),
  );
};

const toRecord = (value: Record<string, unknown>): Record<string, unknown> => {
  const entries = Object.entries(value).filter(([, entryValue]) => {
    if (entryValue === undefined || entryValue === null) return false;
    if (typeof entryValue === "string") return entryValue.trim().length > 0;
    if (Array.isArray(entryValue)) return entryValue.length > 0;
    return true;
  });

  return Object.fromEntries(entries);
};

const getMetaConfig = (): MetaConfig | null => {
  const pixelId = readEnv("FACEBOOK_CAPI_PIXEL_ID", "META_PIXEL_ID", "FACEBOOK_PIXEL_ID", "VITE_FACEBOOK_PIXEL_ID");
  const accessToken = readEnv(
    "FACEBOOK_CAPI_ACCESS_TOKEN",
    "META_CONVERSIONS_API_ACCESS_TOKEN",
    "META_ACCESS_TOKEN",
    "FACEBOOK_ACCESS_TOKEN",
    "FACEBOOK_TOKEN",
  );

  if (!pixelId || !accessToken) {
    return null;
  }

  const graphApiVersion = readEnv("FACEBOOK_CAPI_GRAPH_VERSION", "META_GRAPH_API_VERSION") || DEFAULT_GRAPH_API_VERSION;
  const testEventCode = readEnv(
    "FACEBOOK_CAPI_TEST_EVENT_CODE",
    "META_TEST_EVENT_CODE",
    "FACEBOOK_TEST_EVENT_CODE",
    "VITE_FACEBOOK_TEST_EVENT_CODE",
  );

  return {
    pixelId,
    accessToken,
    graphApiVersion,
    testEventCode,
  };
};

const buildUserData = async (
  input: MetaConversionUserData | undefined,
  request?: Request,
): Promise<Record<string, unknown>> => {
  const email = toOptionalString(input?.email);
  const phone = toOptionalString(input?.phone);
  const externalId = toOptionalString(input?.externalId);
  const cookieMap = getCookieMap(request);
  const fbp = toOptionalString(input?.fbp) || toOptionalString(cookieMap.get("_fbp"));
  const fbc = toOptionalString(input?.fbc) || toOptionalString(cookieMap.get("_fbc"));

  const userData: Record<string, unknown> = {
    client_user_agent: toOptionalString(request?.headers.get("user-agent")),
    client_ip_address: getClientIpAddress(request),
    fbp,
    fbc,
  };

  if (email) {
    userData.em = [await sha256Hex(normalizeEmail(email))];
  }

  if (phone) {
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone) {
      userData.ph = [await sha256Hex(normalizePhone(phone))];
    }
  }

  if (externalId) {
    userData.external_id = [await sha256Hex(normalizeExternalId(externalId))];
  }

  return toRecord(userData);
};

const buildEventPayload = async (input: MetaConversionEventInput): Promise<Record<string, unknown>> => {
  const userData = await buildUserData(input.userData, input.request);

  const eventPayload: Record<string, unknown> = {
    event_name: input.eventName,
    event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
    event_id: toOptionalString(input.eventId),
    action_source: "website",
    event_source_url: toEventSourceUrl(input.eventSourceUrl, input.request),
    user_data: userData,
    custom_data: input.customData ? toRecord(input.customData) : undefined,
  };

  return toRecord(eventPayload);
};

export const sendMetaConversionEvent = async (input: MetaConversionEventInput): Promise<void> => {
  const config = getMetaConfig();
  if (!config) {
    return;
  }

  if (shouldSkipLocalhostEvent(input)) {
    console.log("[META-CAPI] Skipping localhost-originated event", { eventName: input.eventName });
    return;
  }

  try {
    const eventPayload = await buildEventPayload(input);
    if (!eventPayload.user_data || Object.keys(eventPayload.user_data as Record<string, unknown>).length === 0) {
      console.warn("[META-CAPI] Skipping event: missing user data", { eventName: input.eventName });
      return;
    }

    const requestBody: Record<string, unknown> = {
      data: [eventPayload],
    };

    const testEventCode = toOptionalString(input.testEventCode) || config.testEventCode;
    if (testEventCode) {
      requestBody.test_event_code = testEventCode;
    }

    const endpoint =
      `https://graph.facebook.com/${config.graphApiVersion}/${config.pixelId}/events` +
      `?access_token=${encodeURIComponent(config.accessToken)}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[META-CAPI] Request failed", {
        eventName: input.eventName,
        status: response.status,
        error: errorText.slice(0, 1000),
      });
      return;
    }

    const responsePayload = await response.json();
    if (responsePayload?.error) {
      console.error("[META-CAPI] API error", {
        eventName: input.eventName,
        error: responsePayload.error,
      });
      return;
    }

    console.log("[META-CAPI] Event sent", {
      eventName: input.eventName,
      eventId: input.eventId ?? null,
    });
  } catch (error) {
    console.error("[META-CAPI] Unexpected error", {
      eventName: input.eventName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
