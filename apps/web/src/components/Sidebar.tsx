'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { apiFetch } from '@/lib/api';
import { fetchMe, Me, tokenStore } from '@/lib/auth';
import { AccountMenu } from './AccountMenu';
import { CommandPalette } from './CommandPalette';

type Item = { key: string; href: string; badge?: 'homework' };
type Group = { labelKey: string; items: Item[] };

// Grouped, role-scoped navigation. Account actions live in the rail footer,
// not in the nav list. Students get a single "homework" entry (assignments is a
// tutor concept).
function groupsForRole(role: string | null): Group[] {
  if (role === 'tutor' || role === 'admin') {
    const groups: Group[] = [
      {
        labelKey: 'section_teach',
        items: [
          { key: 'overview', href: '/dashboard' },
          { key: 'schedule', href: '/schedule' },
          { key: 'students', href: '/students' },
          { key: 'assignments', href: '/assignments' }
        ]
      },
      {
        labelKey: 'section_build',
        items: [
          { key: 'courses', href: '/courses' },
          { key: 'exercises', href: '/exercises' },
          { key: 'materials', href: '/materials' }
        ]
      },
      { labelKey: 'section_insights', items: [{ key: 'analytics', href: '/analytics' }] }
    ];
    if (role === 'admin') {
      groups.push({ labelKey: 'section_admin', items: [{ key: 'users', href: '/admin/users' }] });
    }
    return groups;
  }

  return [
    {
      labelKey: 'section_learn',
      items: [
        { key: 'overview', href: '/dashboard' },
        { key: 'schedule', href: '/schedule' },
        { key: 'homework', href: '/homework', badge: 'homework' },
        { key: 'courses', href: '/courses' }
      ]
    },
    {
      labelKey: 'section_progress',
      items: [
        { key: 'progress', href: '/progress' },
        { key: 'dictionary', href: '/dictionary' },
        { key: 'materials', href: '/materials' }
      ]
    }
  ];
}

// The persistent left rail. Mounted once by (app)/layout.tsx, so the profile is
// fetched once per session rather than once per navigation.
export function Sidebar() {
  const nav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const locale = useLocale();

  const [me, setMe] = useState<Me | null>(null);
  const [hwCount, setHwCount] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) return;
    let alive = true;
    fetchMe(token, locale)
      .then((profile) => {
        if (!alive) return;
        setMe(profile);
        if (profile.role === 'student') {
          apiFetch<{ status: string }[]>('/homework', { token, locale })
            .then((hw) => alive && setHwCount(hw.filter((h) => h.status !== 'graded').length))
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [locale]);

  // Global ⌘K / Ctrl-K. Signed-out users never see this rail, so the palette
  // can never open on the sign-in screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close the mobile nav on navigation.
  useEffect(() => setNavOpen(false), [pathname]);

  const role = me?.role ?? null;
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  return (
    <>
      <nav className={`rail${navOpen ? ' open' : ''}`}>
        <div className="rail-head">
          <Link href="/dashboard" className="brand">
            {tCommon('appName')}
          </Link>
          <button
            type="button"
            className="rail-burger"
            aria-label={tCommon('menu')}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((o) => !o)}
          >
            ☰
          </button>
        </div>

        <button type="button" className="rail-search" onClick={() => setPaletteOpen(true)}>
          <span>{tCommon('search')}</span>
          <kbd>⌘K</kbd>
        </button>

        <div className="rail-nav">
          {groupsForRole(role).map((group) => (
            <div className="nav-group" key={group.labelKey}>
              <span className="nav-group-label">{nav(group.labelKey)}</span>
              {group.items.map((it) => (
                <Link
                  key={it.key}
                  href={it.href}
                  className={`nav-item${pathname === it.href ? ' active' : ''}`}
                >
                  {nav(it.key)}
                  {it.badge === 'homework' && hwCount > 0 && (
                    <span className="nav-badge">{hwCount}</span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </div>

        <div className="rail-foot">
          <AccountMenu me={me} />
        </div>
      </nav>

      {paletteOpen && <CommandPalette role={role} onClose={closePalette} />}
    </>
  );
}
