'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';
import { ExerciseRenderer, ExerciseState, Question } from './ExerciseRenderer';

interface InstanceView {
  id: string;
  status: string;
  score: number | null;
  state: ExerciseState | null;
  question: Question;
}

// Loads one exercise instance, autosaves the learner's arrangement, and checks
// it on the server. `onState` lets a lesson broadcast live progress.
export function ExercisePlayer({
  instanceId,
  onState
}: {
  instanceId: string;
  onState?: (state: ExerciseState) => void;
}) {
  const t = useTranslations('exercises');
  const locale = useLocale();
  const [view, setView] = useState<InstanceView | null>(null);
  const [state, setLocalState] = useState<ExerciseState>({});
  const [result, setResult] = useState<{ score: number; correct: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) return;
    apiFetch<InstanceView>(`/exercise-instances/${instanceId}`, { token, locale })
      .then((v) => {
        setView(v);
        setLocalState(v.state ?? {});
        if (v.status === 'submitted' && v.score !== null) {
          setResult({ score: v.score, correct: v.score === 100 });
        }
      })
      .catch(() => undefined);
  }, [instanceId, locale]);

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
      const r = await apiFetch<{ score: number; correct: boolean }>(
        `/exercise-instances/${instanceId}/check`,
        { method: 'POST', token, locale }
      );
      setResult(r);
    } finally {
      setBusy(false);
    }
  }

  if (!view) return <p className="note">…</p>;
  const done = result !== null || view.status === 'submitted';

  return (
    <div className="card ex-card">
      <strong>{view.question.title}</strong>
      <ExerciseRenderer
        question={view.question}
        state={state}
        onChange={onChange}
        readOnly={done}
      />
      {result ? (
        <p className={result.correct ? 'ex-ok' : 'ex-partial'}>
          {t('score')}: {result.score}%
        </p>
      ) : (
        <button type="button" disabled={busy} onClick={check}>
          {busy ? '…' : t('check')}
        </button>
      )}
    </div>
  );
}
