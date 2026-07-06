'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';

interface Lesson {
  id: string;
  title?: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); // 08:00–21:00

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return x;
}

export function ScheduleView() {
  const t = useTranslations('schedule');
  const tApp = useTranslations('app');
  const tDash = useTranslations('dashboard');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();

  const [canManage, setCanManage] = useState(false);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [busy, setBusy] = useState(false);
  const [slot, setSlot] = useState<{ date: Date } | null>(null);
  const [form, setForm] = useState({ title: '', duration: '60', price: '25', studentProfileId: '' });
  const [students, setStudents] = useState<{ studentProfileId: string; name: string }[]>([]);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [weekStart],
  );

  const load = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    try {
      const me = await fetchMe(token, locale);
      const manage = me.role === 'tutor' || me.role === 'admin';
      setCanManage(manage);
      setLessons(await apiFetch<Lesson[]>('/lessons', { token, locale }));
      if (manage) {
        setStudents(
          await apiFetch<{ studentProfileId: string; name: string }[]>('/crm/students/all', {
            token,
            locale
          }).catch(() => [])
        );
      }
      setState('ready');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push('/');
        return;
      }
      setState('error');
    }
  }, [locale, router]);

  useEffect(() => {
    void load();
  }, [load]);

  // Index lessons by "dayIndex-hour" within the visible week.
  const byCell = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    for (const l of lessons) {
      const s = new Date(l.startsAt);
      if (s < weekStart || s >= weekEnd) continue;
      const dayIndex = Math.floor((s.getTime() - weekStart.getTime()) / 86400000);
      const key = `${dayIndex}-${s.getHours()}`;
      const arr = map.get(key) ?? [];
      arr.push(l);
      map.set(key, arr);
    }
    return map;
  }, [lessons, weekStart]);

  function shiftWeek(deltaDays: number) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + deltaDays);
    setWeekStart(startOfWeek(d));
  }

  function openSlot(dayIndex: number, hour: number) {
    if (!canManage) return;
    const date = new Date(weekStart);
    date.setDate(date.getDate() + dayIndex);
    date.setHours(hour, 0, 0, 0);
    setSlot({ date });
    setForm({ title: '', duration: '60', price: '25', studentProfileId: '' });
  }

  async function createLesson(e: FormEvent) {
    e.preventDefault();
    const token = tokenStore.get();
    if (!token || !slot) return;
    setBusy(true);
    try {
      const start = slot.date;
      const end = new Date(start.getTime() + (Number(form.duration) || 60) * 60000);
      await apiFetch('/lessons', {
        method: 'POST',
        token,
        locale,
        body: {
          title: form.title || undefined,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          priceCents: Math.round((Number(form.price) || 0) * 100),
          studentProfileIds: form.studentProfileId ? [form.studentProfileId] : undefined,
        },
      });
      setSlot(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteLesson(id: string) {
    const token = tokenStore.get();
    if (!token) return;
    await apiFetch(`/lessons/${id}`, { method: 'DELETE', token, locale }).catch(() => undefined);
    await load();
  }

  if (state === 'loading') return <div className="content"><p className="note">…</p></div>;
  if (state === 'error') return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  const weekLabel = `${format.dateTime(days[0], { day: 'numeric', month: 'short' })} – ${format.dateTime(days[6], { day: 'numeric', month: 'short' })}`;

  return (
    <div className="content">
      <div className="row-between">
        <h2>{t('title')}</h2>
        <div className="cal-nav">
          <button type="button" onClick={() => shiftWeek(-7)}>‹ {t('prevWeek')}</button>
          <button type="button" onClick={() => setWeekStart(startOfWeek(new Date()))}>{t('today')}</button>
          <button type="button" onClick={() => shiftWeek(7)}>{t('nextWeek')} ›</button>
          <span className="muted">{weekLabel}</span>
        </div>
      </div>

      <div className="cal">
        <div className="cal-head cal-corner" />
        {days.map((d, i) => (
          <div key={i} className="cal-head">
            {format.dateTime(d, { weekday: 'short' })}{' '}
            <span className="muted">{format.dateTime(d, { day: 'numeric' })}</span>
          </div>
        ))}

        {HOURS.map((hour) => (
          <FragmentRow
            key={hour}
            hour={hour}
            days={days}
            byCell={byCell}
            canManage={canManage}
            onSlot={openSlot}
            onDelete={deleteLesson}
            joinLabel={tDash('joinLesson')}
            boardLabel={t('openBoard')}
            delLabel={t('delete')}
          />
        ))}
      </div>

      {slot && (
        <form className="card form-grid" onSubmit={createLesson}>
          <strong>
            {t('newLesson')} ·{' '}
            {format.dateTime(slot.date, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
          </strong>
          <label>
            {t('titleField')}
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label>
            {t('student')}
            <select value={form.studentProfileId} onChange={(e) => setForm({ ...form, studentProfileId: e.target.value })}>
              <option value="">—</option>
              {students.map((s) => (
                <option key={s.studentProfileId} value={s.studentProfileId}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('duration')}
            <input type="number" min={15} step={15} value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
          </label>
          <label>
            {t('price')}
            <input type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </label>
          <button type="submit" disabled={busy}>{busy ? t('creating') : t('create')}</button>
          <button type="button" className="ghost" onClick={() => setSlot(null)}>✕</button>
        </form>
      )}
    </div>
  );
}

function FragmentRow({
  hour,
  days,
  byCell,
  canManage,
  onSlot,
  onDelete,
  joinLabel,
  boardLabel,
  delLabel,
}: {
  hour: number;
  days: Date[];
  byCell: Map<string, Lesson[]>;
  canManage: boolean;
  onSlot: (dayIndex: number, hour: number) => void;
  onDelete: (id: string) => void;
  joinLabel: string;
  boardLabel: string;
  delLabel: string;
}) {
  return (
    <>
      <div className="cal-hour">{String(hour).padStart(2, '0')}:00</div>
      {days.map((_, dayIndex) => {
        const items = byCell.get(`${dayIndex}-${hour}`) ?? [];
        return (
          <div
            key={dayIndex}
            className={`cal-cell${canManage ? ' clickable' : ''}`}
            onClick={() => items.length === 0 && onSlot(dayIndex, hour)}
          >
            {items.map((l) => (
              <div key={l.id} className={`cal-event status-${l.status}`}>
                <div className="cal-event-title">{l.title ?? '—'}</div>
                <div className="cal-event-actions">
                  <Link className="link" href={`/lessons/${l.id}/room`} onClick={(e) => e.stopPropagation()}>
                    {joinLabel}
                  </Link>
                  <Link className="link" href={`/lessons/${l.id}/board`} onClick={(e) => e.stopPropagation()}>
                    {boardLabel}
                  </Link>
                  {canManage && (
                    <button
                      type="button"
                      className="cal-del"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(l.id);
                      }}
                    >
                      {delLabel}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}
