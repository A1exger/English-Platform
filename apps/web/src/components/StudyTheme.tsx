'use client';

import { useEffect } from 'react';
import { useLocale } from 'next-intl';
import { fetchMe, tokenStore } from '@/lib/auth';

/** Remembers the last known role so a returning student does not see a flash. */
const ROLE_KEY = 'esp.role';

/**
 * Puts the student's own skin on the app.
 *
 * A tutor and a ten-year-old do not need the same interface. The tutor's
 * screens — schedule, students, money, the course builder — are better dense
 * and quiet; the same quiet reads to a child as a form to fill in. So a student
 * gets `data-theme="study"` on <html> and, with it, the rounder, warmer token
 * set in globals.css. Nothing else changes: no component knows about the theme.
 *
 * The role is cached in localStorage because the real answer takes a round trip,
 * and a theme that arrives late is a visible flash on every navigation. The
 * cache is only ever a hint — the fetch that follows decides, and signing out
 * clears it (see tokenStore.clear).
 */
export function StudyTheme() {
  const locale = useLocale();

  useEffect(() => {
    const apply = (role: string | null) => {
      const root = document.documentElement;
      if (role === 'student') root.dataset.theme = 'study';
      else delete root.dataset.theme;
    };

    let cached: string | null = null;
    try {
      cached = localStorage.getItem(ROLE_KEY);
    } catch {
      /* private window: no cache, just a slower first paint */
    }
    apply(cached);

    const token = tokenStore.get();
    if (!token) {
      apply(null);
      return;
    }
    let alive = true;
    fetchMe(token, locale)
      .then((me) => {
        if (!alive) return;
        try {
          localStorage.setItem(ROLE_KEY, me.role);
        } catch {
          /* ignore */
        }
        apply(me.role);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [locale]);

  return null;
}
