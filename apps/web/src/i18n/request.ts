import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

/**
 * The single time zone every date is rendered in — server- and client-side.
 *
 * Without this, next-intl formats dates in the *runtime* zone: the server's zone
 * during SSR, but the *browser's* zone on the client. A viewer west of the server
 * then sees the previous calendar day around midnight ("yesterday, all day"),
 * because the client re-renders "today" in its own, earlier zone. Pinning one zone
 * makes `format.dateTime`, "today" and the schedule grid agree with the server's
 * local day for everyone.
 *
 * Resolution order (first non-empty wins):
 *   1. APP_TIMEZONE — explicit override (recommended in prod, e.g. Europe/Moscow)
 *   2. TZ           — the container's system zone
 *   3. the zone resolved from /etc/localtime (what the OS/Docker mount reports)
 *   4. UTC          — last-resort fallback
 */
function resolveTimeZone(): string {
  const explicit = process.env.APP_TIMEZONE || process.env.TZ;
  if (explicit) return explicit;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export default getRequestConfig(async ({ requestLocale }) => {
  // requestLocale приходит из middleware (сегмент URL / cookie / Accept-Language).
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as never)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    timeZone: resolveTimeZone(),
    messages: (await import(`../../messages/${locale}.json`)).default
  };
});
