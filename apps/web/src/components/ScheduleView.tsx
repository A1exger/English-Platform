'use client';

import { CSSProperties, FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';
import { Skeleton } from './Skeleton';
import { useToast } from './Toast';
import { Icon } from './Icon';

interface Lesson {
  id: string;
  title?: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return x;
}
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function ScheduleView() {
  const t = useTranslations('schedule');
  const tApp = useTranslations('app');
  const tDash = useTranslations('dashboard');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const { showUndo } = useToast();

  const [canManage, setCanManage] = useState(false);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [view, setView] = useState<'week' | 'day'>('week');
  // Initialised on the client (see effect below) so "today" and the week start
  // use the viewer's own timezone — computing it during SSR pins it to the
  // server clock (UTC) and drifts a day near midnight for east-of-UTC users.
  const [anchor, setAnchor] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [slot, setSlot] = useState<{ date: Date; key: string } | null>(null);
  const [form, setForm] = useState({ title: '', duration: '60', price: '25', studentProfileId: '' });
  const [students, setStudents] = useState<{ studentProfileId: string; name: string }[]>([]);

  // Times are shown in the viewer's own zone; make that explicit.
  const tz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return '';
    }
  }, []);

  useEffect(() => {
    if (!anchor) setAnchor(startOfWeek(new Date()));
  }, [anchor]);

  const days = useMemo(() => {
    if (!anchor) return [] as Date[];
    return view === 'day'
      ? [new Date(anchor)]
      : Array.from({ length: 7 }, (_, i) => {
          const d = new Date(anchor);
          d.setDate(d.getDate() + i);
          return d;
        });
  }, [anchor, view]);

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

  const rangeStart = days[0];
  const rangeEnd = useMemo(() => {
    if (days.length === 0) return new Date();
    const d = new Date(days[days.length - 1]);
    d.setDate(d.getDate() + 1);
    return d;
  }, [days]);

  // The visible hour range follows the data. A fixed 08:00–21:00 grid silently
  // hid any lesson outside it — the lesson existed but had no row to render in.
  const hours = useMemo(() => {
    const inRange = lessons
      .map((l) => new Date(l.startsAt))
      .filter((s) => s >= rangeStart && s < rangeEnd)
      .map((s) => s.getHours());
    const from = Math.min(8, ...inRange);
    const to = Math.max(21, ...inRange);
    return Array.from({ length: to - from + 1 }, (_, i) => i + from);
  }, [lessons, rangeStart, rangeEnd]);

  const byCell = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    for (const l of lessons) {
      const s = new Date(l.startsAt);
      if (s < rangeStart || s >= rangeEnd) continue;
      const dayIndex = Math.floor((startOfDay(s).getTime() - startOfDay(rangeStart).getTime()) / 86400000);
      const key = `${dayIndex}-${s.getHours()}`;
      const arr = map.get(key) ?? [];
      arr.push(l);
      map.set(key, arr);
    }
    return map;
  }, [lessons, rangeStart, rangeEnd]);

  function shift(dir: number) {
    const d = new Date(anchor ?? new Date());
    d.setDate(d.getDate() + dir * (view === 'day' ? 1 : 7));
    setAnchor(view === 'day' ? startOfDay(d) : startOfWeek(d));
  }
  function goToday() {
    setAnchor(view === 'day' ? startOfDay(new Date()) : startOfWeek(new Date()));
  }
  function switchView(next: 'week' | 'day') {
    // Day view opens on the actual current day; week view on the current week.
    setAnchor(next === 'day' ? startOfDay(new Date()) : startOfWeek(anchor ?? new Date()));
    setView(next);
    setSlot(null);
  }

  function openSlot(dayIndex: number, hour: number) {
    if (!canManage) return;
    const date = new Date(days[dayIndex]);
    date.setHours(hour, 0, 0, 0);
    setSlot({ date, key: `${dayIndex}-${hour}` });
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
          studentProfileIds: form.studentProfileId ? [form.studentProfileId] : undefined
        }
      });
      setSlot(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  function deleteLesson(id: string) {
    setLessons((prev) => prev.filter((l) => l.id !== id));
    showUndo(t('deleted'), {
      onUndo: () => void load(),
      onCommit: async () => {
        const token = tokenStore.get();
        if (!token) return;
        await apiFetch(`/lessons/${id}`, { method: 'DELETE', token, locale }).catch(() => undefined);
        await load();
      }
    });
  }

  if (state === 'loading' || !anchor) return <div className="content"><Skeleton lines={6} /></div>;
  if (state === 'error') return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  const rangeLabel =
    view === 'day'
      ? format.dateTime(days[0], { weekday: 'long', day: 'numeric', month: 'short' })
      : `${format.dateTime(days[0], { day: 'numeric', month: 'short' })} – ${format.dateTime(days[6], { day: 'numeric', month: 'short' })}`;

  const slotForm = slot && (
    <div className="slot-popover" onClick={(e) => e.stopPropagation()}>
      <form className="form-grid" onSubmit={createLesson}>
        <div className="row-between slot-popover-head">
          <strong>{format.dateTime(slot.date, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</strong>
          <button type="button" className="ghost" aria-label={t('cancel')} onClick={() => setSlot(null)}>
            <Icon name="close" />
          </button>
        </div>
        <label>
          {t('titleField')}
          <input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <label>
          {t('student')}
          <select value={form.studentProfileId} onChange={(e) => setForm({ ...form, studentProfileId: e.target.value })}>
            <option value="">—</option>
            {students.map((s) => (
              <option key={s.studentProfileId} value={s.studentProfileId}>{s.name}</option>
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
      </form>
    </div>
  );

  return (
    <div className="content">
      <div className="row-between sched-head">
        <h2>{t('title')}</h2>
        <div className="sched-controls">
          {/* No "book a lesson" for students — the tutor schedules lessons. */}
          <div className="tabs tabs-inline" role="tablist" aria-label={t('view')}>
            <button type="button" role="tab" aria-selected={view === 'week'} className={view === 'week' ? 'active' : ''} onClick={() => switchView('week')}>
              {t('week')}
            </button>
            <button type="button" role="tab" aria-selected={view === 'day'} className={view === 'day' ? 'active' : ''} onClick={() => switchView('day')}>
              {t('day')}
            </button>
          </div>
          <div className="cal-nav">
            <button type="button" onClick={() => shift(-1)}>‹</button>
            <button type="button" onClick={goToday}>{t('today')}</button>
            <button type="button" onClick={() => shift(1)}>›</button>
            <span className="muted">{rangeLabel}</span>
          </div>
        </div>
      </div>
      {tz && <p className="note sched-tz">{t('timezone', { tz })}</p>}

      <div className={`cal${view === 'day' ? ' cal-day' : ''}`} style={{ '--cal-days': days.length } as CSSProperties} onClick={() => slot && setSlot(null)}>
        <div className="cal-head cal-corner" />
        {days.map((d, i) => (
          <div key={i} className="cal-head">
            {format.dateTime(d, { weekday: 'short' })}{' '}
            <span className="muted">{format.dateTime(d, { day: 'numeric' })}</span>
          </div>
        ))}

        {hours.map((hour) => (
          <FragmentRow
            key={hour}
            hour={hour}
            days={days}
            byCell={byCell}
            canManage={canManage}
            slotKey={slot?.key ?? null}
            slotForm={slotForm}
            onSlot={openSlot}
            onDelete={deleteLesson}
            joinLabel={tDash('joinLesson')}
            delLabel={t('delete')}
          />
        ))}
      </div>
    </div>
  );
}

function FragmentRow({
  hour,
  days,
  byCell,
  canManage,
  slotKey,
  slotForm,
  onSlot,
  onDelete,
  joinLabel,
  delLabel
}: {
  hour: number;
  days: Date[];
  byCell: Map<string, Lesson[]>;
  canManage: boolean;
  slotKey: string | null;
  slotForm: ReactNode;
  onSlot: (dayIndex: number, hour: number) => void;
  onDelete: (id: string) => void;
  joinLabel: string;
  delLabel: string;
}) {
  return (
    <>
      <div className="cal-hour">{String(hour).padStart(2, '0')}:00</div>
      {days.map((_, dayIndex) => {
        const key = `${dayIndex}-${hour}`;
        const items = byCell.get(key) ?? [];
        return (
          <div
            key={dayIndex}
            className={`cal-cell${canManage ? ' clickable' : ''}${slotKey === key ? ' picked' : ''}`}
            onClick={() => items.length === 0 && onSlot(dayIndex, hour)}
          >
            {items.map((l) => (
              <div key={l.id} className={`cal-event status-${l.status}`}>
                <div className="cal-event-title">{l.title ?? '—'}</div>
                <div className="cal-event-actions">
                  <Link className="link" href={`/lessons/${l.id}/room`} onClick={(e) => e.stopPropagation()}>
                    {joinLabel}
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
            {slotKey === key && slotForm}
          </div>
        );
      })}
    </>
  );
}
