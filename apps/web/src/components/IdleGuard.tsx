'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from '@/i18n/routing';
import { tokenStore } from '@/lib/auth';

// Sign a signed-in user out after 10 minutes of *inactivity*. Any interaction
// (pointer, key, scroll, touch, tab focus) resets the timer, so an active user
// who keeps moving around the app is never interrupted; a walked-away session
// is closed. Token refresh (lib/api) keeps active sessions alive across the
// 15-minute access-token expiry, so this idle window is the only logout.
const IDLE_MS = 10 * 60 * 1000;

export function IdleGuard() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!tokenStore.get()) return;

    const logout = () => {
      tokenStore.clear();
      router.push('/');
    };
    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(logout, IDLE_MS);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'visibilitychange'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [router]);

  return null;
}
