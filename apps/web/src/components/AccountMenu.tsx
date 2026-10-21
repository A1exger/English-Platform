'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { Me, tokenStore } from '@/lib/auth';
import { LanguageSwitcher } from './LanguageSwitcher';

// Account block at the foot of the rail: avatar + name, opening a menu with the
// utility actions that used to clutter the navigation list.
export function AccountMenu({ me }: { me: Me | null }) {
  const tApp = useTranslations('app');
  const nav = useTranslations('nav');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const name = [me?.firstName, me?.lastName].filter(Boolean).join(' ').trim();
  const initials =
    ((me?.firstName?.[0] ?? '') + (me?.lastName?.[0] ?? '')).toUpperCase() || '·';

  return (
    <div className="account" ref={ref}>
      <button
        type="button"
        className="account-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="avatar">{initials}</span>
        <span className="account-name">{name || '—'}</span>
        <span className="account-caret">⌄</span>
      </button>

      {open && (
        <div className="account-menu" role="menu">
          <Link href="/billing" className="menu-item" role="menuitem" onClick={() => setOpen(false)}>
            {nav(me?.role === 'student' ? 'payment' : 'billing')}
          </Link>
          <Link href="/settings" className="menu-item" role="menuitem" onClick={() => setOpen(false)}>
            {nav('settings')}
          </Link>
          <div className="menu-sep" />
          <div className="menu-lang">
            <LanguageSwitcher />
          </div>
          <button
            type="button"
            className="menu-item danger"
            role="menuitem"
            onClick={() => {
              tokenStore.clear();
              setOpen(false);
              router.push('/');
            }}
          >
            {tApp('logout')}
          </button>
        </div>
      )}
    </div>
  );
}
