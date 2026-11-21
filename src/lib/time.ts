/** Request-time clock helpers (server components render once per request). */
export function nowMs(): number {
  return Date.now();
}

export function daysAgo(days: number): Date {
  return new Date(nowMs() - days * 86_400_000);
}

export function startOfTodayUtc(): Date {
  const d = new Date(nowMs());
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
