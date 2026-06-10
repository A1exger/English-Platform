'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';

const items = [
  { key: 'overview', href: '/dashboard' },
  { key: 'students', href: '/dashboard' },
  { key: 'schedule', href: '/schedule' },
  { key: 'materials', href: '/dashboard' },
  { key: 'homework', href: '/dashboard' },
  { key: 'billing', href: '/billing' },
  { key: 'analytics', href: '/dashboard' },
  { key: 'settings', href: '/dashboard' }
] as const;

export function Sidebar() {
  const nav = useTranslations('nav');
  const pathname = usePathname();
  return (
    <nav className="sidebar">
      {items.map((it) => (
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
