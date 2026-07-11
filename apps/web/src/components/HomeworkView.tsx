'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, Me, tokenStore } from '@/lib/auth';
import { ExercisePlayer } from './ExercisePlayer';
import { Skeleton } from './Skeleton';

interface Submission {
  id: string;
  content?: string | null;
  grade?: string | null;
  feedback?: string | null;
}
interface ExerciseRef {
  id: string;
  status: string;
  score: number | null;
}
interface Homework {
  id: string;
  title: string;
  status: string;
  submissions: Submission[];
  exercises?: ExerciseRef[];
}
interface StudentRow {
  studentProfileId: string;
  name: string;
}

// Grades are a 0–10 scale everywhere in the product. A free-text input let a
// tutor type anything, which made grades incomparable across students.
const GRADES = Array.from({ length: 11 }, (_, i) => String(i));

export function HomeworkView() {
  const t = useTranslations('homework');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<Homework[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ studentProfileId: '', title: '', due: '' });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [grades, setGrades] = useState<Record<string, { grade: string; feedback: string }>>({});
  const [openAnswers, setOpenAnswers] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    try {
      const profile = await fetchMe(token, locale);
      setMe(profile);
      const hw = await apiFetch<Homework[]>('/homework', { token, locale });
      setItems(hw);
      if (profile.role === 'tutor') {
        setStudents(await apiFetch<StudentRow[]>('/crm/students', { token, locale }));
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

  async function assign(e: FormEvent) {
    e.preventDefault();
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    try {
      await apiFetch('/homework', {
        method: 'POST',
        token,
        locale,
        body: {
          studentProfileId: form.studentProfileId,
          title: form.title,
          dueAt: form.due ? new Date(form.due).toISOString() : undefined
        }
      });
      setForm({ studentProfileId: '', title: '', due: '' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function submit(id: string) {
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    try {
      await apiFetch(`/homework/${id}/submit`, {
        method: 'POST',
        token,
        locale,
        body: { content: answers[id] || '' }
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function grade(id: string) {
    const token = tokenStore.get();
    const g = grades[id];
    if (!token || !g?.grade) return;
    setBusy(true);
    try {
      await apiFetch(`/homework/${id}/grade`, {
        method: 'POST',
        token,
        locale,
        body: { grade: g.grade, feedback: g.feedback || undefined }
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return <div className="content"><Skeleton lines={5} /></div>;
  if (state === 'error') return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  const isTutor = me?.role === 'tutor';
  const statusLabel = (s: string) =>
    s === 'assigned' ? t('statusAssigned') : s === 'submitted' ? t('statusSubmitted') : t('statusGraded');

  return (
    <div className="content">
      <h2>{t('title')}</h2>

      {isTutor && (
        <form className="card form-grid" onSubmit={assign}>
          <strong>{t('assign')}</strong>
          <label>
            {t('student')}
            <select
              required
              value={form.studentProfileId}
              onChange={(e) => setForm({ ...form, studentProfileId: e.target.value })}
            >
              <option value="" disabled />
              {students.map((s) => (
                <option key={s.studentProfileId} value={s.studentProfileId}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('titleField')}
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label>
            {t('due')}
            <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? t('creating') : t('create')}
          </button>
        </form>
      )}

      <div className="card">
        {items.length === 0 ? (
          <p className="note">{t('empty')}</p>
        ) : (
          <ul className="lesson-list">
            {items.map((h) => {
              const sub = h.submissions[0];
              return (
                <li key={h.id} className="stacked">
                  <div className="row-between">
                    <span>{h.title}</span>
                    <span className="muted">{statusLabel(h.status)}</span>
                  </div>
                  {sub?.grade && (
                    <p className="muted">
                      {t('grade')}: {sub.grade}
                      {sub.feedback ? ` — ${sub.feedback}` : ''}
                    </p>
                  )}
                  {h.exercises && h.exercises.length > 0 &&
                    (isTutor ? (
                      <>
                        <div className="row-between">
                          <span className="muted">
                            {h.exercises.length} ·{' '}
                            {h.exercises.map((e) => (e.score == null ? '–' : `${e.score}%`)).join(', ')}
                          </span>
                          <button type="button" onClick={() => setOpenAnswers({ ...openAnswers, [h.id]: !openAnswers[h.id] })}>
                            {t('viewAnswers')}
                          </button>
                        </div>
                        {openAnswers[h.id] && (
                          <div className="ex-list">
                            {h.exercises.map((e) => (
                              <ExercisePlayer key={e.id} instanceId={e.id} reviewOnly />
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="ex-list">
                        {h.exercises.map((e) => (
                          <ExercisePlayer key={e.id} instanceId={e.id} />
                        ))}
                      </div>
                    ))}
                  {!isTutor && h.status === 'assigned' && (!h.exercises || h.exercises.length === 0) && (
                    <div className="inline-form">
                      <textarea
                        placeholder={t('content')}
                        value={answers[h.id] || ''}
                        onChange={(e) => setAnswers({ ...answers, [h.id]: e.target.value })}
                      />
                      <button type="button" disabled={busy} onClick={() => submit(h.id)}>
                        {t('submit')}
                      </button>
                    </div>
                  )}
                  {isTutor && h.status === 'submitted' && (
                    <div className="inline-form">
                      {sub?.content && <p className="muted">{sub.content}</p>}
                      <select
                        aria-label={t('grade')}
                        value={grades[h.id]?.grade || ''}
                        onChange={(e) =>
                          setGrades({ ...grades, [h.id]: { grade: e.target.value, feedback: grades[h.id]?.feedback || '' } })
                        }
                      >
                        <option value="" disabled>
                          {t('grade')}
                        </option>
                        {GRADES.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                      <input
                        placeholder={t('feedback')}
                        value={grades[h.id]?.feedback || ''}
                        onChange={(e) =>
                          setGrades({ ...grades, [h.id]: { grade: grades[h.id]?.grade || '', feedback: e.target.value } })
                        }
                      />
                      <button type="button" disabled={busy} onClick={() => grade(h.id)}>
                        {t('gradeAction')}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
