export type ActivitySources = {
  lastSignInAt?: string | null;
  profileUpdatedAt?: string | null;
  analyticsLastActivityAt?: string | null;
  createdAt?: string | null;
};

export function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function maxDate(dates: Array<Date | null>): Date | null {
  const validDates = dates.filter((date): date is Date => Boolean(date));
  if (validDates.length === 0) return null;
  return new Date(Math.max(...validDates.map((date) => date.getTime())));
}

export function calculateLastActivityAt(sources: ActivitySources): Date | null {
  return maxDate([
    parseDate(sources.lastSignInAt),
    parseDate(sources.profileUpdatedAt),
    parseDate(sources.analyticsLastActivityAt),
    parseDate(sources.createdAt),
  ]);
}
