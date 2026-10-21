'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';
import { Icon } from './Icon';

interface NotificationRow {
  id: string;
  templateKey: string;
  payload?: string | null;
  status: string;
  createdAt: string;
}

// Templates the app knows how to render. Anything else falls back to a generic
// line, so a new backend template never renders as a raw key.
const KNOWN = [
  'homework_assigned',
  'homework_feedback',
  'homework_submitted',
  'transfer_pending',
  'payment_confirmed',
  'lesson_booked',
  'lesson_reminder'
];

// In-app inbox: the backend already queues a Notification per event (homework
// assigned, feedback left, lesson booked). This surfaces them in the rail with
// an unread count — the student's cue that a tutor left feedback.
export function NotificationsBell() {
  const t = useTranslations('notifications');
  const locale = useLocale();
  const format = useFormatter();

  const [items, setItems] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) return;
    const rows = await apiFetch<NotificationRow[]>('/notifications', { token, locale }).catch(
      () => []
    );
    setItems(rows);
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  // Close on outside click / Escape, like the account menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = items.filter((n) => n.status !== 'read');

  function textFor(n: NotificationRow): string {
    let title = '';
    let student = '';
    try {
      const p = n.payload
        ? (JSON.parse(n.payload) as { title?: string; student?: string })
        : null;
      title = p?.title ?? '';
      student = p?.student ?? '';
    } catch {
      /* malformed payload — fall back to an untitled message */
    }
    return KNOWN.includes(n.templateKey) ? t(n.templateKey, { title, student }) : t('generic');
  }

  async function markRead(id: string) {
    const token = tokenStore.get();
    if (!token) return;
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, status: 'read' } : n)));
    await apiFetch(`/notifications/${id}/read`, { method: 'PATCH', token, locale }).catch(
      () => undefined
    );
  }

  async function markAll() {
    const pending = unread.map((n) => n.id);
    setItems((prev) => prev.map((n) => ({ ...n, status: 'read' })));
    const token = tokenStore.get();
    if (!token) return;
    await Promise.all(
      pending.map((id) =>
        apiFetch(`/notifications/${id}/read`, { method: 'PATCH', token, locale }).catch(
          () => undefined
        )
      )
    );
  }

  return (
    <div className="notif" ref={boxRef}>
      <button
        type="button"
        className="notif-trigger"
        aria-label={t('title')}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void load();
        }}
      >
        <Icon name="bell" />
        {unread.length > 0 && <span className="notif-dot">{unread.length}</span>}
      </button>

      {open && (
        <div className="notif-pop" role="dialog" aria-label={t('title')}>
          <div className="row-between notif-head">
            <strong>{t('title')}</strong>
            {unread.length > 0 && (
              <button type="button" className="ghost" onClick={markAll}>
                {t('markAll')}
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="note">{t('empty')}</p>
          ) : (
            <ul className="notif-list">
              {items.slice(0, 20).map((n) => (
                <li key={n.id} className={n.status === 'read' ? 'notif-item read' : 'notif-item'}>
                  <button type="button" onClick={() => markRead(n.id)}>
                    <span>{textFor(n)}</span>
                    <span className="muted mono-num">
                      {format.dateTime(new Date(n.createdAt), { dateStyle: 'short' })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
