'use client';

import { CSSProperties, FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useFormatter, useLocale, useTimeZone, useTranslations } from 'next-intl';
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

// CEFR levels a course's sections use (mirrors the API CONTENT_LEVELS) — the
// tree endpoint is per-level, so the material picker needs one.
const LEVELS = ['Beginner', 'Elementary', 'PreIntermediate', 'Intermediate', 'UpperIntermediate', 'Advanced'];

// ——— Time-zone-aware calendar math ———
// "Today", the week/day boundaries and where each lesson lands are all computed
// in the app's configured zone (useTimeZone → i18n/request.ts) rather than the
// browser's. That keeps the grid consistent with the formatted labels and with
// the server's local day — a viewer west of the server no longer sees the whole
// calendar shifted a day back near midnight.

// Civil wall-clock fields of an instant as observed in `tz`.
function zonedParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  }).formatToParts(date);
  const val = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: val('year'), month: val('month'), day: val('day'), hour: val('hour') % 24, minute: val('minute') };
}

// Day number since the epoch for the civil date `date` falls on in `tz`. Integer
// and monotonic, so day arithmetic and comparisons are exact and DST-proof.
function zonedDayNumber(date: Date, tz: string): number {
  const { year, month, day } = zonedParts(date, tz);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

// Inverse of zonedDayNumber: civil (Y, M, D) of a day number.
function ymdFromDayNumber(n: number) {
  const d = new Date(n * 86400000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// The instant at which the wall clock in `tz` reads the given civil fields. Two
// steps: assume the civil time is UTC, then correct by the zone offset there.
function zonedInstant(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const back = zonedParts(new Date(guess), tz);
  const backAsUtc = Date.UTC(back.year, back.month - 1, back.day, back.hour, back.minute, 0);
  return new Date(guess - (backAsUtc - guess));
}

// Monday-relative weekday (Mon=0 … Sun=6) of a day number. Epoch day 0 is a Thursday.
function mondayIndex(dayNumber: number): number {
  return ((dayNumber % 7) + 3) % 7;
}

export function ScheduleView() {
  const t = useTranslations('schedule');
  const tApp = useTranslations('app');
  const tDash = useTranslations('dashboard');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const { showUndo } = useToast();

  // Effective display zone, highest priority first:
  //   1. APP_TIMEZONE — a single zone forced for everyone (via next-intl)
  //   2. the zone the user picked in Settings (their profile timezone)
  //   3. the viewer's own browser zone (auto-detected)
  //   4. UTC
  // A profile timezone of '' or 'UTC' means "no explicit pick" → fall through to
  // auto. Calendar math and every label use this same tz so they never disagree.
  const fixedTz = useTimeZone();
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  // null until the profile loads, so "today" isn't anchored in the wrong zone.
  const [profileTz, setProfileTz] = useState<string | null>(null);
  const chosenTz = profileTz && profileTz !== 'UTC' ? profileTz : null;
  const tz = fixedTz || chosenTz || browserTz;

  const [canManage, setCanManage] = useState(false);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [view, setView] = useState<'week' | 'day'>('week');
  // Day number of the first visible day. Initialised on the client (see effect
  // below) so "today" is computed once the app zone is known, not during SSR.
  const [anchorDay, setAnchorDay] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [slot, setSlot] = useState<{ date: Date; key: string } | null>(null);
  const [form, setForm] = useState({
    title: '',
    duration: '60',
    price: '25',
    studentProfileId: '',
    courseId: '',
    materialLessonId: ''
  });
  const [students, setStudents] = useState<{ studentProfileId: string; name: string }[]>([]);
  // Material picker: courses to teach + the lessons of the chosen course/level.
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [matLevel, setMatLevel] = useState('Elementary');
  const [matLessons, setMatLessons] = useState<{ id: string; title: string }[]>([]);

  // The zone the user picked in Settings (empty/UTC ⇒ use their browser zone).
  useEffect(() => {
    const token = tokenStore.get();
    if (!token) {
      setProfileTz('');
      return;
    }
    let cancelled = false;
    apiFetch<{ timezone?: string }>('/users/me', { token, locale })
      .then((me) => !cancelled && setProfileTz(me.timezone || ''))
      .catch(() => !cancelled && setProfileTz(''));
    return () => {
      cancelled = true;
    };
  }, [locale]);

  useEffect(() => {
    // Wait for the profile (profileTz !== null) so "today" is anchored in the final zone.
    if (anchorDay === null && profileTz !== null) {
      const today = zonedDayNumber(new Date(), tz);
      setAnchorDay(today - mondayIndex(today)); // default view is 'week'
    }
  }, [anchorDay, tz, profileTz]);

  // Day numbers of the visible column(s), and a representative instant (civil
  // noon in tz) for each so next-intl formats it as the right civil day.
  const dayNumbers = useMemo(() => {
    if (anchorDay === null) return [] as number[];
    return view === 'day' ? [anchorDay] : Array.from({ length: 7 }, (_, i) => anchorDay + i);
  }, [anchorDay, view]);

  const days = useMemo(
    () =>
      dayNumbers.map((n) => {
        const { year, month, day } = ymdFromDayNumber(n);
        return zonedInstant(year, month, day, 12, 0, tz);
      }),
    [dayNumbers, tz]
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
        const catalog = await apiFetch<{ courses: { id: string; title: string }[] }[]>(
          '/content/catalog',
          { token, locale }
        ).catch(() => []);
        setCourses(catalog.flatMap((c) => c.courses ?? []));
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

  // Load the chosen course's lessons for the selected level (the tree endpoint
  // is per-level). Runs only while a course is picked in the slot form.
  useEffect(() => {
    const token = tokenStore.get();
    if (!token || !form.courseId) {
      setMatLessons([]);
      return;
    }
    let cancelled = false;
    void apiFetch<{ sections: { units: { lessons: { id: string; title: string }[] }[] }[] }>(
      `/content/courses/${form.courseId}/tree?level=${matLevel}`,
      { token, locale }
    )
      .then((tree) => {
        if (!cancelled) setMatLessons(tree.sections.flatMap((s) => s.units.flatMap((u) => u.lessons)));
      })
      .catch(() => {
        if (!cancelled) setMatLessons([]);
      });
    return () => {
      cancelled = true;
    };
  }, [form.courseId, matLevel, locale]);

  const firstDay = dayNumbers[0];
  const lastDay = dayNumbers[dayNumbers.length - 1];

  // Each lesson mapped to the civil day + hour it starts at in the app zone.
  const placed = useMemo(
    () =>
      lessons.map((l) => {
        const p = zonedParts(new Date(l.startsAt), tz);
        return { lesson: l, dayNumber: Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86400000), hour: p.hour };
      }),
    [lessons, tz]
  );

  // The visible hour range follows the data. A fixed 08:00–21:00 grid silently
  // hid any lesson outside it — the lesson existed but had no row to render in.
  const hours = useMemo(() => {
    const inRange = placed.filter((x) => x.dayNumber >= firstDay && x.dayNumber <= lastDay).map((x) => x.hour);
    const from = Math.min(8, ...inRange);
    const to = Math.max(21, ...inRange);
    return Array.from({ length: to - from + 1 }, (_, i) => i + from);
  }, [placed, firstDay, lastDay]);

  const byCell = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    for (const x of placed) {
      if (x.dayNumber < firstDay || x.dayNumber > lastDay) continue;
      const key = `${x.dayNumber - firstDay}-${x.hour}`;
      const arr = map.get(key) ?? [];
      arr.push(x.lesson);
      map.set(key, arr);
    }
    return map;
  }, [placed, firstDay, lastDay]);

  function shift(dir: number) {
    setAnchorDay((a) => (a ?? zonedDayNumber(new Date(), tz)) + dir * (view === 'day' ? 1 : 7));
  }
  function goToday() {
    const today = zonedDayNumber(new Date(), tz);
    setAnchorDay(view === 'day' ? today : today - mondayIndex(today));
  }
  function switchView(next: 'week' | 'day') {
    // Day view opens on the actual current day; week view on the current week.
    const today = zonedDayNumber(new Date(), tz);
    const base = anchorDay ?? today;
    setAnchorDay(next === 'day' ? today : base - mondayIndex(base));
    setView(next);
    setSlot(null);
  }

  function openSlot(dayIndex: number, hour: number) {
    if (!canManage) return;
    const dn = dayNumbers[dayIndex];
    if (dn === undefined) return;
    const { year, month, day } = ymdFromDayNumber(dn);
    const date = zonedInstant(year, month, day, hour, 0, tz);
    setSlot({ date, key: `${dayIndex}-${hour}` });
    setForm({ title: '', duration: '60', price: '25', studentProfileId: '', courseId: '', materialLessonId: '' });
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
          materialLessonId: form.materialLessonId || undefined
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

  if (state === 'loading' || anchorDay === null) return <div className="content"><Skeleton lines={6} /></div>;
  if (state === 'error') return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  const todayNum = zonedDayNumber(new Date(), tz);
  const rangeLabel =
    view === 'day'
      ? format.dateTime(days[0], { weekday: 'long', day: 'numeric', month: 'short', timeZone: tz })
      : `${format.dateTime(days[0], { day: 'numeric', month: 'short', timeZone: tz })} – ${format.dateTime(days[days.length - 1], { day: 'numeric', month: 'short', timeZone: tz })}`;

  const slotForm = slot && (
    <div className="slot-popover" onClick={(e) => e.stopPropagation()}>
      <form className="form-grid" onSubmit={createLesson}>
        <div className="row-between slot-popover-head">
          <strong>{format.dateTime(slot.date, { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: tz })}</strong>
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
          {t('material')}
          <select
            value={form.courseId}
            onChange={(e) => setForm({ ...form, courseId: e.target.value, materialLessonId: '' })}
          >
            <option value="">{t('noMaterial')}</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </label>
        {form.courseId && (
          <div className="slot-material">
            <label>
              {t('level')}
              <select value={matLevel} onChange={(e) => setMatLevel(e.target.value)}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </label>
            <label>
              {t('lesson')}
              <select
                value={form.materialLessonId}
                onChange={(e) => setForm({ ...form, materialLessonId: e.target.value })}
              >
                <option value="">—</option>
                {matLessons.map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </label>
          </div>
        )}
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
        {days.map((d, i) => {
          const isToday = dayNumbers[i] === todayNum;
          return (
            <div key={i} className={`cal-head${isToday ? ' today' : ''}`}>
              {format.dateTime(d, { weekday: 'short', timeZone: tz })}{' '}
              <span className="muted">{format.dateTime(d, { day: 'numeric', timeZone: tz })}</span>
            </div>
          );
        })}

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
