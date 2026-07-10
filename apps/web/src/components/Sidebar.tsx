'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';

type Item = { key: string; href: string; labelKey?: string };
type Group = { labelKey: string; items: Item[] };

// Grouped, role-scoped navigation. Account actions (payment/settings/logout)
// live in the top-bar avatar menu, not here. Students see one "homework" entry
// (assignments is a tutor concept).
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

  // student (and any other learner role)
  return [
    {
      labelKey: 'section_learn',
      items: [
        { key: 'overview', href: '/dashboard' },
        { key: 'schedule', href: '/schedule' },
        { key: 'homework', href: '/homework' },
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
          apiFetch<{ status: string }[]>('/homework', { token, locale })
            .then((hw) => setHwCount(hw.filter((h) => h.status !== 'graded').length))
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }, [locale, pathname]);

  return (
    <nav className="sidebar">
      {groupsForRole(role).map((group) => (
        <div className="nav-group" key={group.labelKey}>
          <span className="nav-group-label">{nav(group.labelKey)}</span>
          {group.items.map((it) => (
            <Link
              key={it.key}
              href={it.href}
              className={`nav-item${pathname === it.href ? ' active' : ''}`}
            >
              {nav(it.labelKey ?? it.key)}
              {it.key === 'homework' && hwCount > 0 && <span className="nav-badge">{hwCount}</span>}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
