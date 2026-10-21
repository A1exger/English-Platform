import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import { isValidTimeZone } from '../lib/timezone';

/**
 * Optional *fixed* display time zone for the whole UI.
 *
 * - When set (APP_TIMEZONE, or the container's TZ), every viewer sees dates and
 *   times in this one zone — predictable "all times are Moscow time".
 * - When unset (returns undefined), no zone is pinned, so next-intl and the
 *   schedule fall back to each viewer's own browser zone — a student in Berlin
 *   sees lesson times in Berlin time and their "today" is their local day, like
 *   Google Calendar. This is the default.
 *
 * Either way the day math and the formatting use the *same* zone, so "today"
 * never drifts to "yesterday" (the bug this originally fixed).
 */
export function fixedTimeZone(): string | undefined {
  // TZ in particular is a container setting, and POSIX allows forms there
  // ("MSK-3") that Intl does not. Anything Intl rejects is treated as unset —
  // per-viewer local time — rather than pinned, where it would break every
  // date the server renders.
  return [process.env.APP_TIMEZONE, process.env.TZ].find(isValidTimeZone);
}

export default getRequestConfig(async ({ requestLocale }) => {
  // requestLocale приходит из middleware (сегмент URL / cookie / Accept-Language).
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as never)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    // undefined ⇒ next-intl uses the viewer's browser zone (per-viewer local time).
    timeZone: fixedTimeZone(),
    messages: (await import(`../../messages/${locale}.json`)).default
  };
});
