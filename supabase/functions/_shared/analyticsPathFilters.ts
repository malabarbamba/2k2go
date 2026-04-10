function normalizeTrackedPath(path: string | null | undefined): string {
  if (!path || !path.trim()) {
    return "/";
  }
  return path.trim().toLowerCase();
}

function normalizeAnalyticsPath(path: string | null | undefined): string {
  if (!path || !path.trim()) {
    return "/";
  }

  const trimmed = path.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return parsed.pathname || "/";
    } catch {
      return "/";
    }
  }

  return trimmed;
}

function isAdminPath(path: string | null | undefined): boolean {
  const normalized = normalizeTrackedPath(path);
  return normalized === "/admin" || normalized.startsWith("/admin/");
}

function isInternalTestPath(path: string | null | undefined): boolean {
  const normalized = normalizeTrackedPath(path);
  return normalized.startsWith("/test-") || normalized.startsWith("/_test") || normalized.startsWith("/dev-");
}

function isRoutableAnalyticsPath(path: string | null | undefined): boolean {
  return normalizeAnalyticsPath(path).startsWith("/");
}

function isTrackableAnalyticsPath(path: string | null | undefined): boolean {
  return isRoutableAnalyticsPath(path) && !isAdminPath(path) && !isInternalTestPath(path);
}

export {
  isAdminPath,
  isInternalTestPath,
  isRoutableAnalyticsPath,
  isTrackableAnalyticsPath,
  normalizeAnalyticsPath,
  normalizeTrackedPath,
};
