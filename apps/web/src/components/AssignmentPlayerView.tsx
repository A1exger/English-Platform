'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';
import { CheckResponse, ContentTask, ContentTaskPlayer } from './ContentTaskPlayer';
import { ExerciseState } from './ExerciseRenderer';
import { AssignmentResult, AssignmentResultView } from './AssignmentResultView';
import { Skeleton } from './Skeleton';

interface Card extends ContentTask {
  order: number;
  status: string;
  score: number | null;
  feedback: string | null;
  state: ExerciseState | null;
  solution: ExerciseState | null;
}
interface AssignmentDetail {
  id: string;
  kind: string;
  topicTag: string | null;
  dueAt: string | null;
  status: string;
  studentName?: string;
  cards: Card[];
  result: AssignmentResult | null;
}

export function AssignmentPlayerView({ assignmentId }: { assignmentId: string }) {
  const t = useTranslations('assignments');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const router = useRouter();

  const [data, setData] = useState<AssignmentDetail | null>(null);
  const [isStudent, setIsStudent] = useState(false);
  const [phase, setPhase] = useState<'loading' | 'error' | 'ready'>('loading');
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    try {
      const me = await fetchMe(token, locale);
      setIsStudent(me.role === 'student');
      setData(await apiFetch<AssignmentDetail>(`/assignments/${assignmentId}`, { token, locale }));
      setPhase('ready');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push('/');
        return;
      }
      setPhase('error');
    }
  }, [assignmentId, locale, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitCard = (cardId: string) => async (state: ExerciseState): Promise<CheckResponse> => {
    const token = tokenStore.get();
    const r = await apiFetch<CheckResponse & { gradingMode?: string }>(
      `/assignments/cards/${cardId}/submit`,
      { method: 'POST', token, locale, body: { state } }
    );
    // Refresh the live result panel + statuses after each answer.
    void load();
    return { completed: r.completed, score: r.score, correct: r.score === 10, solution: r.solution };
  };

  async function saveGrade(cardId: string) {
    const token = tokenStore.get();
    await apiFetch(`/assignments/cards/${cardId}/grade`, {
      method: 'POST',
      token,
      locale,
      body: { feedback: drafts[cardId] ?? '' }
    }).catch(() => undefined);
    await load();
  }

  if (phase === 'loading') return <div className="content"><Skeleton lines={5} /></div>;
  if (phase === 'error' || !data) return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  return (
    <div className="content learn">
      <Link className="link" href="/assignments">← {t('back')}</Link>
      <div className="row-between">
        <h2>{data.topicTag || t(data.kind === 'homework' ? 'homework' : 'lesson')}</h2>
        <span className={`chip status-${data.status}`}>{t(`status_${data.status}`)}</span>
      </div>
      {!isStudent && data.studentName && <p className="muted">{data.studentName}</p>}
      {data.dueAt && (
        <p className="muted">
          {t('due')}: {new Date(data.dueAt).toLocaleDateString(locale)}
        </p>
      )}

      {data.result && <AssignmentResultView result={data.result} />}

      <div className="learn-page">
        {data.cards.map((card) => {
          const submitted = card.status === 'submitted';
          const initialResult: CheckResponse | null = submitted
            ? {
                completed: true,
                score: card.score ?? undefined,
                correct: (card.score ?? 0) >= 10,
                solution: card.solution ?? undefined
              }
            : null;
          return (
            <div key={card.id}>
              <ContentTaskPlayer
                task={card}
                submit={isStudent && !submitted ? submitCard(card.id) : undefined}
                initialState={card.state ?? undefined}
                initialResult={isStudent ? initialResult : initialResult ?? { completed: true }}
                feedback={card.feedback}
              />
              {/* Tutor grading box for MANUAL (essay) cards. */}
              {!isStudent && card.gradingMode === 'MANUAL' && (
                <div className="grade-box">
                  <textarea
                    placeholder={t('feedbackPlaceholder')}
                    defaultValue={card.feedback ?? ''}
                    onChange={(e) => setDrafts({ ...drafts, [card.id]: e.target.value })}
                  />
                  <button type="button" onClick={() => saveGrade(card.id)}>
                    {t('saveFeedback')}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
