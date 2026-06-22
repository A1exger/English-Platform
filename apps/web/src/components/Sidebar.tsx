'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { fetchMe, tokenStore } from '@/lib/auth';

const items = [
  { key: 'overview', href: '/dashboard' },
  { key: 'students', href: '/students' },
  { key: 'schedule', href: '/schedule' },
  { key: 'materials', href: '/materials' },
  { key: 'homework', href: '/homework' },
  { key: 'billing', href: '/billing' },
  { key: 'analytics', href: '/analytics' },
  { key: 'settings', href: '/settings' }
] as const;

export function Sidebar() {
  const nav = useTranslations('nav');
  const pathname = usePathname();
  const locale = useLocale();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) return;
    fetchMe(token, locale)
      .then((m) => setIsAdmin(m.role === 'admin'))
      .catch(() => undefined);
  }, [locale]);

  const links = [
    ...items.slice(0, 2),
    ...(isAdmin ? [{ key: 'users', href: '/admin/users' } as const] : []),
    ...items.slice(2)
  ];

  return (
    <nav className="sidebar">
      {links.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          className={`nav-item${pathname === it.href ? ' active' : ''}`}
        >
          {nav(it.key)}
        </Link>
      ))}
    </nav>
  );
}
