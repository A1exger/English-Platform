'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';

type Item = { key: string; href: string; labelKey?: string };

function itemsForRole(role: string | null): Item[] {
  // Students see "Payment" instead of "Billing".
  const billing: Item =
    role === 'student'
      ? { key: 'billing', href: '/billing', labelKey: 'payment' }
      : { key: 'billing', href: '/billing' };
  const common: Item[] = [
    { key: 'overview', href: '/dashboard' },
    { key: 'schedule', href: '/schedule' },
    { key: 'materials', href: '/materials' },
    { key: 'homework', href: '/homework' },
    { key: 'assignments', href: '/assignments' },
    billing,
    { key: 'settings', href: '/settings' }
  ];

  const extra: Item[] = [];
  if (role === 'admin') {
    extra.push({ key: 'users', href: '/admin/users' });
  }
  if (role === 'tutor' || role === 'admin') {
    extra.push({ key: 'students', href: '/students' });
    extra.push({ key: 'courses', href: '/courses' });
    extra.push({ key: 'exercises', href: '/exercises' });
    extra.push({ key: 'analytics', href: '/analytics' });
  }
  if (role === 'student') {
    extra.push({ key: 'courses', href: '/courses' });
    extra.push({ key: 'progress', href: '/progress' });
  }
  return [common[0], ...extra, ...common.slice(1)];
}

export function Sidebar() {
  const nav = useTranslations('nav');
  const pathname = usePathname();
  const locale = useLocale();
  const [role, setRole] = useState<string | null>(null);
  const [hwCount, setHwCount] = useState(0);

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) return;
    fetchMe(token, locale)
      .then((m) => {
        setRole(m.role);
        if (m.role === 'student') {
          // Pending homework count (anything not yet graded) for the badge.
          apiFetch<{ status: string }[]>('/homework', { token, locale })
            .then((hw) => setHwCount(hw.filter((h) => h.status !== 'graded').length))
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }, [locale, pathname]);

  return (
    <nav className="sidebar">
      {itemsForRole(role).map((it) => (
        <Link
          key={it.key}
          href={it.href}
          className={`nav-item${pathname === it.href ? ' active' : ''}`}
        >
          {nav(it.labelKey ?? it.key)}
          {it.key === 'homework' && hwCount > 0 && <span className="nav-badge">{hwCount}</span>}
        </Link>
      ))}
    </nav>
  );
}
