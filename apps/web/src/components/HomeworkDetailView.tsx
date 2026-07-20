'use client';

import { useCallback, useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, Me, tokenStore } from '@/lib/auth';
import { ExercisePlayer } from './ExercisePlayer';
import { Skeleton } from './Skeleton';
import { ScoreRing } from './ScoreRing';

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
interface HomeworkDetail {
  id: string;
  title: string;
  status: string;
  dueAt?: string | null;
  submissions: Submission[];
  exercises?: ExerciseRef[];
}

const GRADES = Array.from({ length: 11 }, (_, i) => String(i));

// The homework "work screen" (Sprint 2.1). Everything that used to be crammed
// into a list row lives here: the student does the work (exercises or a text
// submission), the tutor reviews and grades.
export function HomeworkDetailView({ homeworkId }: { homeworkId: string }) {
  const t = useTranslations('homework');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [hw, setHw] = useState<HomeworkDetail | null>(null);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [gradeForm, setGradeForm] = useState({ grade: '', feedback: '' });

  const load = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    try {
      setMe(await fetchMe(token, locale));
      setHw(await apiFetch<HomeworkDetail>(`/homework/${homeworkId}`, { token, locale }));
      setState('ready');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push('/');
        return;
      }
      setState('error');
    }
  }, [homeworkId, locale, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    try {
      await apiFetch(`/homework/${homeworkId}/submit`, {
        method: 'POST',
        token,
        locale,
        body: { content: answer }
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function grade() {
    const token = tokenStore.get();
    if (!token || !gradeForm.grade) return;
    setBusy(true);
    try {
      await apiFetch(`/homework/${homeworkId}/grade`, {
        method: 'POST',
        token,
        locale,
        body: { grade: gradeForm.grade, feedback: gradeForm.feedback || undefined }
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return <div className="content"><Skeleton lines={6} /></div>;
  if (state === 'error' || !hw) return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  const isStaff = me?.role === 'tutor' || me?.role === 'admin';
  const isStudent = me?.role === 'student';
  const sub = hw.submissions[0];
  const graded = hw.status === 'graded' && sub?.grade != null && sub.grade !== '';
  const hasExercises = !!hw.exercises && hw.exercises.length > 0;
  const statusLabel =
    hw.status === 'assigned' ? t('statusAssigned') : hw.status === 'submitted' ? t('statusSubmitted') : t('statusGraded');

  return (
    <div className="content learn">
      <Link className="link" href="/homework">← {t('back')}</Link>
      <div className="row-between">
        <h2>{hw.title}</h2>
        <span className={`chip status-${hw.status}`}>{statusLabel}</span>
      </div>
      {hw.dueAt && (
        <p className="muted mono-num">
          {t('due')} {format.dateTime(new Date(hw.dueAt), { dateStyle: 'medium' })}
        </p>
      )}

      {graded && (
        <div className="card result-card">
          <div className="result-tier">
            <ScoreRing value={Number(sub!.grade) * 10} display={String(sub!.grade)} size={64} />
            <div>
              <strong>{t('statusGraded')}</strong>
              {sub?.feedback && <p className="muted">{sub.feedback}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Interactive exercises, if this homework carries any. */}
      {hasExercises && (
        <div className="ex-list">
          {hw.exercises!.map((e) => (
            <ExercisePlayer
              key={e.id}
              instanceId={e.id}
              reviewOnly={isStaff || hw.status !== 'assigned'}
            />
          ))}
        </div>
      )}

      {/* Student text submission (only when there are no exercises). */}
      {isStudent && hw.status === 'assigned' && !hasExercises && (
        <div className="card inline-form">
          <textarea placeholder={t('content')} value={answer} onChange={(e) => setAnswer(e.target.value)} />
          <button type="button" disabled={busy} onClick={submit}>
            {t('submit')}
          </button>
        </div>
      )}

      {!isStudent && sub?.content && (
        <div className="card">
          <strong>{t('content')}</strong>
          <p className="muted">{sub.content}</p>
        </div>
      )}

      {/* Tutor grading (only once submitted). */}
      {isStaff && hw.status === 'submitted' && (
        <div className="card inline-form">
          <strong>{t('gradeAction')}</strong>
          <select
            aria-label={t('grade')}
            value={gradeForm.grade}
            onChange={(e) => setGradeForm({ ...gradeForm, grade: e.target.value })}
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
            value={gradeForm.feedback}
            onChange={(e) => setGradeForm({ ...gradeForm, feedback: e.target.value })}
          />
          <button type="button" disabled={busy} onClick={grade}>
            {t('gradeAction')}
          </button>
        </div>
      )}
    </div>
  );
}
