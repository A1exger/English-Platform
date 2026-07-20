'use client';

import { useCallback, useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';
import { CheckResponse, ContentTask, ContentTaskPlayer } from './ContentTaskPlayer';
import { ExerciseState } from './ExerciseRenderer';
import { AssignmentResult, AssignmentResultView } from './AssignmentResultView';
import { Skeleton } from './Skeleton';
import { Stepper } from './Stepper';

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
  const format = useFormatter();
  const router = useRouter();

  const [data, setData] = useState<AssignmentDetail | null>(null);
  const [isStudent, setIsStudent] = useState(false);
  const [phase, setPhase] = useState<'loading' | 'error' | 'ready'>('loading');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0); // one task per step; last step = result

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

  // One task per step, then a final result step — so the score is never shown
  // before the work is done (Sprint 2.2).
  const cards = data.cards;
  const steps = [
    ...cards.map((c, i) => ({ key: c.id, label: String(i + 1) })),
    { key: 'result', label: t('resultStep') }
  ];
  const current = Math.min(step, steps.length - 1);
  const onResultStep = current === cards.length;
  const card = onResultStep ? null : cards[current];

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
          {t('due')}: {format.dateTime(new Date(data.dueAt), { dateStyle: 'medium' })}
        </p>
      )}

      <Stepper steps={steps} current={current} onChange={setStep} />

      {onResultStep ? (
        data.result ? (
          <AssignmentResultView result={data.result} />
        ) : (
          <p className="note">{t('resultPending')}</p>
        )
      ) : (
        card && (
          <div className="learn-page">
            {(() => {
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
                <>
                  <ContentTaskPlayer
                    key={card.id}
                    task={card}
                    submit={isStudent && !submitted ? submitCard(card.id) : undefined}
                    initialState={card.state ?? undefined}
                    initialResult={isStudent ? initialResult : initialResult ?? { completed: true }}
                    feedback={card.feedback}
                  />
                  {/* Tutor grading box for the viewed MANUAL (essay) card only. */}
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
                </>
              );
            })()}
          </div>
        )
      )}
    </div>
  );
}
