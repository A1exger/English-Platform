'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from 'react';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';

// App-wide effective time zone, highest priority first:
//   1. APP_TIMEZONE — a single zone forced for everyone (server env)
//   2. the zone the user picked in Settings (their profile timezone)
//   3. the viewer's own browser zone (auto-detected)
//   4. UTC
// A profile value of '' or 'UTC' means "no explicit pick" → fall through to auto.
// This drives every next-intl `format.dateTime` in the app, so all dates — the
// schedule, homework deadlines, timestamps — share one zone.

type Ctx = {
  // False until the profile has been checked, so timezone-sensitive views can wait
  // before anchoring "today" in what might be the wrong (interim browser) zone.
  ready: boolean;
  // Lets Settings apply a freshly-saved zone immediately, without a reload.
  setProfileTimeZone: (tz: string) => void;
};

const AppTimeZoneContext = createContext<Ctx>({ ready: true, setProfileTimeZone: () => {} });

export const useAppTimeZone = () => useContext(AppTimeZoneContext);

export function AppIntlProvider({
  locale,
  messages,
  fixedTimeZone,
  children
}: {
  locale: string;
  messages: AbstractIntlMessages;
  fixedTimeZone?: string;
  children: ReactNode;
}) {
  const browserTz =
    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';
  // null until checked. A forced zone needs no profile lookup, so start "ready".
  const [profileTz, setProfileTz] = useState<string | null>(fixedTimeZone ? '' : null);

  useEffect(() => {
    if (fixedTimeZone) return; // forced zone wins — don't look at the profile
    const token = tokenStore.get();
    if (!token) {
      setProfileTz('');
      return;
    }
    let cancelled = false;
    apiFetch<{ timezone?: string }>('/users/me', { token, locale })
      .then((me) => !cancelled && setProfileTz(me.timezone || ''))
      .catch(() => !cancelled && setProfileTz(''));
    return () => {
      cancelled = true;
    };
  }, [fixedTimeZone, locale]);

  const setProfileTimeZone = useCallback((tz: string) => setProfileTz(tz || ''), []);

  const chosen = profileTz && profileTz !== 'UTC' ? profileTz : '';
  const timeZone = fixedTimeZone || chosen || browserTz || 'UTC';
  const ready = fixedTimeZone ? true : profileTz !== null;

  return (
    <AppTimeZoneContext.Provider value={{ ready, setProfileTimeZone }}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
        {children}
      </NextIntlClientProvider>
    </AppTimeZoneContext.Provider>
  );
}
