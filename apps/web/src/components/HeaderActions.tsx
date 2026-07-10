'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { fetchMe, tokenStore } from '@/lib/auth';
import { LanguageSwitcher } from './LanguageSwitcher';
import { CommandPalette } from './CommandPalette';

// Top-bar controls. Signed out: just the language switcher. Signed in: a
// command-palette trigger (⌘K) + an avatar menu holding payment, settings,
// language and log out.
export function HeaderActions() {
  const tApp = useTranslations('app');
  const tCommon = useTranslations('common');
  const nav = useTranslations('nav');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [authed, setAuthed] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = tokenStore.get();
    setAuthed(Boolean(token));
    if (token) {
      fetchMe(token, locale)
        .then((m) => {
          setRole(m.role);
          setName(m.firstName ?? '');
        })
        .catch(() => undefined);
    }
  }, [pathname, locale]);

  useEffect(() => {
    if (!authed) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [authed]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  if (!authed) {
    return (
      <div className="header-actions">
        <LanguageSwitcher />
      </div>
    );
  }

  const initials = (name.trim() || '·').slice(0, 2).toUpperCase();

  return (
    <div className="header-actions">
      <button type="button" className="kbd-btn" onClick={() => setPaletteOpen(true)}>
        <span>{tCommon('search')}</span>
        <kbd>⌘K</kbd>
      </button>

      <div className="avatar-menu" ref={menuRef}>
        <button
          type="button"
          className="avatar-btn"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {initials}
        </button>
        {menuOpen && (
          <div className="avatar-dropdown" role="menu">
            <Link href="/billing" className="menu-item" role="menuitem" onClick={() => setMenuOpen(false)}>
              {nav(role === 'student' ? 'payment' : 'billing')}
            </Link>
            <Link href="/settings" className="menu-item" role="menuitem" onClick={() => setMenuOpen(false)}>
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
                setAuthed(false);
                setMenuOpen(false);
                router.push('/');
              }}
            >
              {tApp('logout')}
            </button>
          </div>
        )}
      </div>

      {paletteOpen && <CommandPalette role={role} onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
