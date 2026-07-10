'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';

type Cmd = { key: string; href: string };

function commandsForRole(role: string | null): Cmd[] {
  const base: Cmd[] = [
    { key: 'overview', href: '/dashboard' },
    { key: 'schedule', href: '/schedule' },
    { key: 'materials', href: '/materials' },
    { key: 'settings', href: '/settings' },
    { key: 'billing', href: '/billing' }
  ];
  const extra: Cmd[] = [];
  if (role === 'tutor' || role === 'admin') {
    extra.push(
      { key: 'students', href: '/students' },
      { key: 'assignments', href: '/assignments' },
      { key: 'courses', href: '/courses' },
      { key: 'exercises', href: '/exercises' },
      { key: 'analytics', href: '/analytics' }
    );
  }
  if (role === 'admin') extra.push({ key: 'users', href: '/admin/users' });
  if (role === 'student') {
    extra.push(
      { key: 'homework', href: '/homework' },
      { key: 'progress', href: '/progress' },
      { key: 'dictionary', href: '/dictionary' },
      { key: 'courses', href: '/courses' }
    );
  }
  return [...base.slice(0, 3), ...extra, ...base.slice(3)];
}

export function CommandPalette({ role, onClose }: { role: string | null; onClose: () => void }) {
  const nav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);

  const commands = useMemo(() => commandsForRole(role), [role]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return commands.filter((c) => nav(c.key).toLowerCase().includes(needle));
  }, [q, commands, nav]);

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((v) => Math.min(v + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((v) => Math.max(v - 1, 0));
      } else if (e.key === 'Enter') {
        const c = filtered[active];
        if (c) {
          router.push(c.href);
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtered, active, onClose, router]);

  const go = (href: string) => {
    router.push(href);
    onClose();
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="palette-input"
          placeholder={tCommon('searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <ul className="palette-list">
          {filtered.length === 0 && <li className="palette-empty">{tCommon('noResults')}</li>}
          {filtered.map((c, idx) => (
            <li key={c.key}>
              <button
                type="button"
                className={`palette-item${idx === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(idx)}
                onClick={() => go(c.href)}
              >
                {nav(c.key)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
