'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';

type Cmd = { key: string; href: string };
type Item = { id: string; label: string; href: string };

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
  const locale = useLocale();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [content, setContent] = useState<Item[]>([]);

  const pageItems = useMemo(
    () => commandsForRole(role).map((c) => ({ id: `p:${c.key}`, label: nav(c.key), href: c.href })),
    [role, nav]
  );

  // Sprint 5.3: the palette reaches past page names into content — lessons,
  // materials, students, dictionary words — so ⌘K finds a student by name.
  useEffect(() => {
    const token = tokenStore.get();
    if (!token) return;
    let cancelled = false;
    (async () => {
      const staff = role === 'tutor' || role === 'admin';
      const [lessons, materials, students, dict] = await Promise.all([
        apiFetch<{ id: string; title?: string | null }[]>('/lessons', { token, locale }).catch(() => []),
        apiFetch<{ id: string; title: string }[]>('/materials', { token, locale }).catch(() => []),
        staff
          ? apiFetch<{ studentProfileId: string; name: string }[]>('/crm/students', { token, locale }).catch(() => [])
          : Promise.resolve([]),
        role === 'student'
          ? apiFetch<{ id: string; word: string }[]>('/content/dictionary', { token, locale }).catch(() => [])
          : Promise.resolve([])
      ]);
      if (cancelled) return;
      const out: Item[] = [];
      for (const l of lessons) out.push({ id: `l:${l.id}`, label: l.title || l.id, href: `/lessons/${l.id}/room` });
      for (const m of materials) out.push({ id: `m:${m.id}`, label: m.title, href: '/materials' });
      for (const s of students) out.push({ id: `s:${s.studentProfileId}`, label: s.name, href: `/students/${s.studentProfileId}` });
      for (const d of dict) out.push({ id: `d:${d.id}`, label: d.word, href: '/dictionary' });
      setContent(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [role, locale]);

  const filteredPages = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pageItems.filter((c) => c.label.toLowerCase().includes(needle));
  }, [q, pageItems]);

  const filteredContent = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return content.filter((c) => c.label.toLowerCase().includes(needle)).slice(0, 8);
  }, [q, content]);

  const filtered = useMemo(() => [...filteredPages, ...filteredContent], [filteredPages, filteredContent]);

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

  const pageCount = filteredPages.length;

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
            <li key={c.id}>
              {idx === pageCount && filteredContent.length > 0 && (
                <span className="palette-group">{tCommon('content')}</span>
              )}
              <button
                type="button"
                className={`palette-item${idx === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(idx)}
                onClick={() => go(c.href)}
              >
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
