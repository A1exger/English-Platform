/**
 * Whether this runtime's Intl knows the zone.
 *
 * A zone Intl rejects ("MSK", "GMT+3", a stray space) does not fail loudly: it
 * makes every next-intl date formatter throw, and next-intl answers each throw
 * by printing the raw Date — "Sat Aug 15 2026 21:41:57 GMT+0300 (Moscow
 * Standard Time)" — wherever a date should be. One bad value in a profile or
 * in APP_TIMEZONE turned every date on every screen into that.
 */
export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The first candidate Intl accepts, else UTC. Order is priority. */
export function firstValidTimeZone(...candidates: (string | null | undefined)[]): string {
  return candidates.find(isValidTimeZone) ?? 'UTC';
}
