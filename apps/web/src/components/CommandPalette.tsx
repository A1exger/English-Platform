'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';

type Item = { id: string; label: string; href: string; hint?: string };

export function CommandPalette({ role, onClose }: { role: string | null; onClose: () => void }) {
  const tCommon = useTranslations('common');
  const tDict = useTranslations('dictionary');
  const locale = useLocale();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [content, setContent] = useState<Item[]>([]);
  const [bank, setBank] = useState<Item[]>([]);

  // The palette is a keyword search over CONTENT — dictionary words, lessons,
  // courses, materials, students — not a page list (pages already live in the
  // rail). So ⌘K finds a word from the dictionary or a student by name.
  useEffect(() => {
    const token = tokenStore.get();
    if (!token) return;
    let cancelled = false;
    (async () => {
      const staff = role === 'tutor' || role === 'admin';
      const [lessons, materials, students, dict, catalog] = await Promise.all([
        apiFetch<{ id: string; title?: string | null }[]>('/lessons', { token, locale }).catch(() => []),
        apiFetch<{ id: string; title: string }[]>('/materials', { token, locale }).catch(() => []),
        staff
          ? apiFetch<{ studentProfileId: string; name: string }[]>('/crm/students', { token, locale }).catch(() => [])
          : Promise.resolve([]),
        apiFetch<{ id: string; word: string }[]>('/content/dictionary', { token, locale }).catch(() => []),
        apiFetch<{ courses: { id: string; title: string }[] }[]>('/content/catalog', { token, locale }).catch(() => [])
      ]);
      if (cancelled) return;
      const out: Item[] = [];
      for (const cat of catalog) for (const c of cat.courses) out.push({ id: `c:${c.id}`, label: c.title, href: `/courses/${c.id}`, hint: tCommon('course') });
      for (const l of lessons) out.push({ id: `l:${l.id}`, label: l.title || l.id, href: `/lessons/${l.id}/room`, hint: tCommon('lesson') });
      for (const m of materials) out.push({ id: `m:${m.id}`, label: m.title, href: '/materials', hint: tCommon('material') });
      for (const s of students) out.push({ id: `s:${s.studentProfileId}`, label: s.name, href: `/students/${s.studentProfileId}`, hint: tCommon('student') });
      for (const d of dict) out.push({ id: `d:${d.id}`, label: d.word, href: '/dictionary', hint: tCommon('word') });
      setContent(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [role, locale, tCommon]);

  // The shared word bank holds thousands of words, so it is asked as you type
  // rather than pulled into the palette up front like the lists above. Without
  // this a tutor searching for a word found nothing: their own dictionary is
  // empty, and the bank was never part of the search.
  useEffect(() => {
    const needle = q.trim();
    const token = tokenStore.get();
    if (needle.length < 2 || !token) {
      setBank([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void apiFetch<{ id: string; word: string }[]>(
        `/content/word-bank?q=${encodeURIComponent(needle)}`,
        { token, locale }
      )
        .catch(() => [])
        .then((rows) => {
          if (cancelled) return;
          setBank(
            rows.slice(0, 6).map((r) => ({
              id: `wb:${r.id}`,
              label: r.word,
              href: '/word-bank',
              hint: tDict('bankTitle')
            }))
          );
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, locale, tDict]);

  // Match content by word: a query hits every item whose label contains it, so a
  // dictionary word, a lesson title or a student name all surface the same way.
  // Bank hits are already filtered by the server, and come last so they never
  // push a lesson or a student the user was reaching for off the list.
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const local = content.filter((c) => c.label.toLowerCase().includes(needle));
    const seen = new Set(local.map((c) => c.label.toLowerCase()));
    return [...local, ...bank.filter((b) => !seen.has(b.label.toLowerCase()))].slice(0, 12);
  }, [q, content, bank]);

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
          {filtered.length === 0 && (
            <li className="palette-empty">{q.trim() ? tCommon('noResults') : tCommon('searchHint')}</li>
          )}
          {filtered.map((c, idx) => (
            <li key={c.id}>
              <button
                type="button"
                className={`palette-item${idx === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(idx)}
                onClick={() => go(c.href)}
              >
                <span className="palette-item-label">{c.label}</span>
                {c.hint && <span className="palette-item-hint">{c.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
