'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';
import { ExerciseRenderer, ExerciseState, Question } from './ExerciseRenderer';
import { TaskRenderer } from './tasks/TaskRenderer';
import type { ExerciseResult, TaskType } from './tasks/types';
import { Score } from './Score';
import { Skeleton } from './Skeleton';

// The server discriminates the student-facing view: legacy tasks carry a
// `question` (old renderer), canonical tasks carry a sanitized `def` + taskType
// (dnd-kit renderer). The answerKey never appears in either.
type InstanceView =
  | {
      id: string;
      status: string;
      score: number | null;
      state: ExerciseState | null;
      kind: 'legacy';
      question: Question;
    }
  | {
      id: string;
      status: string;
      score: number | null;
      state: ExerciseState | null;
      kind: 'canonical';
      taskType: TaskType;
      title: string;
      prompt: string | null;
      def: unknown;
      result: ExerciseResult | null;
    };

interface CheckResponse {
  score: number;
  correct: boolean;
  perToken?: Record<string, boolean> | null;
  solution?: ExerciseState;
}

// Loads one exercise instance, autosaves the learner's arrangement, and checks
// it on the server. On the live board `onState`/`onResult` broadcast progress and
// `incomingState`/`incomingResult` apply the peer's (§Прил. Б, LWW).
export function ExercisePlayer({
  instanceId,
  onState,
  onResult,
  incomingState,
  incomingResult,
  reviewOnly
}: {
  instanceId: string;
  onState?: (state: ExerciseState) => void;
  onResult?: (result: ExerciseResult) => void;
  incomingState?: ExerciseState | null;
  incomingResult?: ExerciseResult | null;
  // reviewOnly: read-only view of the learner's arrangement (for the teacher).
  reviewOnly?: boolean;
}) {
  const t = useTranslations('exercises');
  const locale = useLocale();
  const [view, setView] = useState<InstanceView | null>(null);
  const [state, setLocalState] = useState<ExerciseState>({});
  const [result, setResult] = useState<{ score: number; correct: boolean; perToken?: Record<string, boolean> | null } | null>(null);
  const [solution, setSolution] = useState<ExerciseState | null>(null);
  const [busy, setBusy] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) return;
    apiFetch<InstanceView>(`/exercise-instances/${instanceId}`, { token, locale })
      .then((v) => {
        setView(v);
        setLocalState(v.state ?? {});
        if (v.kind === 'canonical' && v.result) {
          setResult(v.result); // restore the marking after reload (ФТ-У203)
          return;
        }
        if (reviewOnly) {
          // Teacher review: fetch the score (+ solution for legacy) to reveal.
          apiFetch<CheckResponse>(`/exercise-instances/${instanceId}/check`, {
            method: 'POST',
            token,
            locale
          })
            .then((r) => {
              setResult({ score: r.score, correct: r.correct, perToken: r.perToken });
              if (r.solution) setSolution(r.solution);
            })
            .catch(() => undefined);
          return;
        }
        if (v.status === 'submitted' && v.score !== null) {
          setResult({ score: v.score, correct: v.score === 100 });
          apiFetch<CheckResponse>(`/exercise-instances/${instanceId}/check`, {
            method: 'POST',
            token,
            locale
          })
            .then((r) => r.solution && setSolution(r.solution))
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }, [instanceId, locale]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply a peer's live arrangement / reveal (no re-broadcast — the gateway
  // never echoes our own messages back).
  useEffect(() => {
    if (incomingState) setLocalState(incomingState);
  }, [incomingState]);
  useEffect(() => {
    if (incomingResult) setResult(incomingResult);
  }, [incomingResult]);

  const onChange = useCallback(
    (next: ExerciseState) => {
      setLocalState(next);
      onState?.(next);
      const token = tokenStore.get();
      if (!token) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void apiFetch(`/exercise-instances/${instanceId}/state`, {
          method: 'PATCH',
          token,
          locale,
          body: { state: next }
        }).catch(() => undefined);
      }, 500);
    },
    [instanceId, locale, onState]
  );

  async function check() {
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    try {
      const r = await apiFetch<CheckResponse>(`/exercise-instances/${instanceId}/check`, {
        method: 'POST',
        token,
        locale
      });
      const res = { score: r.score, correct: r.correct, perToken: r.perToken };
      setResult(res);
      if (r.solution) setSolution(r.solution);
      onResult?.({ correct: r.correct, score: r.score, perToken: r.perToken ?? undefined });
    } finally {
      setBusy(false);
    }
  }

  if (!view) return <Skeleton lines={3} />;
  const done = result !== null || view.status === 'submitted' || !!reviewOnly;
  const title = view.kind === 'canonical' ? view.title : view.question.title;

  return (
    <div className="card ex-card">
      <strong>{title}</strong>
      {view.kind === 'canonical' && view.prompt && <p className="muted">{view.prompt}</p>}
      {view.kind === 'canonical' ? (
        <TaskRenderer
          type={view.taskType}
          def={view.def}
          state={state}
          readOnly={done}
          result={result ? { correct: result.correct, score: result.score, perToken: result.perToken ?? undefined } : null}
          onChange={(s) => onChange(s as ExerciseState)}
        />
      ) : (
        <ExerciseRenderer
          question={view.question}
          state={state}
          onChange={onChange}
          readOnly={done}
          review={solution}
        />
      )}
      {result ? (
        <p className={result.correct ? 'ex-ok' : 'ex-partial'}>
          {/* One 0–10 scale everywhere (2.4); instance scores are 0–100 internally. */}
          {t('score')}: <Score value={result.score / 10} />
        </p>
      ) : (
        <button type="button" disabled={busy} onClick={check}>
          {busy ? '…' : t('check')}
        </button>
      )}
    </div>
  );
}
