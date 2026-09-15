'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch, fileUrl } from '@/lib/api';
import { tokenStore } from '@/lib/auth';
import { ExerciseRenderer, ExerciseState, Question } from './ExerciseRenderer';
import { Icon } from './Icon';
import { Score } from './Score';

// One content task, rendered identically in every runtime context (live /
// async homework / self-study). Drag-drop types reuse ExerciseRenderer;
// multiple_choice, audio, essay and discussion are handled here.
// gradingMode: AUTO -> server check with score; MANUAL/COMPLETION -> done.

export interface ContentTask {
  id: string;
  type: string;
  gradingMode: string;
  aspect: string;
  estimatedMinutes: number;
  question: Record<string, unknown>;
}

export interface CheckResponse {
  completed: boolean;
  score?: number;
  correct?: boolean;
  solution?: ExerciseState;
}

const DND_TYPES = ['sentence_ordering', 'word_matching', 'gap_fill', 'categorization'];

export function ContentTaskPlayer({
  task,
  onResult,
  submit,
  initialState,
  initialResult,
  feedback,
  onStateChange,
  spectator = false
}: {
  task: ContentTask;
  onResult?: (r: {
    taskId: string;
    score?: number;
    correct?: boolean;
    state?: ExerciseState;
    completed: boolean;
  }) => void;
  // Override where the answer goes. Default: self-study / live check endpoint.
  // Homework passes a submit that persists the card (see AssignmentPlayerView).
  submit?: (state: ExerciseState) => Promise<CheckResponse>;
  initialState?: ExerciseState;
  initialResult?: CheckResponse | null;
  // Tutor's manual feedback shown under a graded card.
  feedback?: string | null;
  // Live-session progress stream (exercise:progress): fires on every edit.
  onStateChange?: (taskId: string, state: ExerciseState) => void;
  // Teacher watching the student's live answer: read-only, no actions, and the
  // rendered answer tracks incoming updates (no draft, no streaming).
  spectator?: boolean;
}) {
  const t = useTranslations('learn');
  const locale = useLocale();
  const [state, setState] = useState<ExerciseState>(initialState ?? {});
  const [result, setResult] = useState<CheckResponse | null>(initialResult ?? null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftKey = `answer:${task.id}`;

  const done = result !== null;
  const readOnly = done || spectator;

  // Spectator (teacher): mirror the student's streamed answer as it arrives,
  // and switch to the checked result once they submit.
  useEffect(() => {
    if (spectator) setState(initialState ?? {});
  }, [spectator, initialState]);
  useEffect(() => {
    if (spectator) setResult(initialResult ?? null);
  }, [spectator, initialResult]);

  // Autosave (Sprint 2.3): restore any local draft so a reload never loses work.
  // ContentTaskPlayer has no server draft endpoint (backend is out of scope), so
  // in-progress answers persist to localStorage; the draft is cleared on submit.
  useEffect(() => {
    if (done || spectator) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) setState(JSON.parse(raw) as ExerciseState);
    } catch {
      /* ignore malformed draft */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stream in-progress answers to the teacher + debounce-save the draft.
  useEffect(() => {
    if (done || spectator) return;
    if (onStateChange) onStateChange(task.id, state);
    if (!Object.keys(state).length) return;
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(state));
        setSaved(true);
      } catch {
        /* storage unavailable */
      }
    }, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  async function check(extraState?: ExerciseState) {
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    try {
      const payload = extraState ?? state;
      const r = submit
        ? await submit(payload)
        : await apiFetch<CheckResponse>(`/content/tasks/${task.id}/check`, {
            method: 'POST',
            token,
            locale,
            body: { state: payload }
          });
      setResult(r);
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      // Carry the final answer along so a live teacher sees WHAT was answered,
      // not just the score.
      onResult?.({
        taskId: task.id,
        score: r.score,
        correct: r.correct,
        state: payload,
        completed: true
      });
    } finally {
      setBusy(false);
    }
  }

  const q = task.question;

  return (
    <div className="card ex-card">
      <div className="row-between">
        <span className={`chip aspect-${task.aspect.toLowerCase()}`}>
          <span className="dot" />
          {task.aspect}
        </span>
        <span className="muted mono-num">
          {task.estimatedMinutes} {t('min')}
        </span>
      </div>

      {DND_TYPES.includes(task.type) && (
        <ExerciseRenderer
          question={q as unknown as Question}
          state={state}
          onChange={setState}
          readOnly={readOnly}
          review={(result?.solution as ExerciseState) ?? null}
        />
      )}

      {task.type === 'multiple_choice' && (
        <div className="ex">
          <p>{String(q.question ?? '')}</p>
          <div className="ex-row">
            {((q.options as string[]) ?? []).map((opt) => {
              const chosen = state.answer === opt;
              const sol = result?.solution as { correct?: string } | undefined;
              const cls = sol
                ? opt === sol.correct
                  ? ' ok'
                  : chosen
                    ? ' err'
                    : ''
                : chosen
                  ? ' active-choice'
                  : '';
              return (
                <button
                  key={opt}
                  type="button"
                  className={`chip${cls}`}
                  disabled={readOnly}
                  onClick={() => setState({ answer: opt })}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {task.type === 'true_false' && (
        <div className="ex">
          <ul className="tf-list">
            {((q.statements as string[]) ?? []).map((statement, i) => {
              const values = (state.values as (boolean | null)[]) ?? [];
              const sol = result?.solution as { values?: boolean[] } | undefined;
              const pick = (v: boolean) => {
                const next = [...values];
                next[i] = v;
                setState({ values: next });
              };
              return (
                <li key={i} className="tf-row">
                  <span className="tf-text">{statement}</span>
                  <span className="tf-choice">
                    {[true, false].map((v) => {
                      const chosen = values[i] === v;
                      // After checking, mark the right answer and, when it was
                      // missed, the one that was picked instead.
                      const cls = sol?.values
                        ? sol.values[i] === v
                          ? ' ok'
                          : chosen
                            ? ' err'
                            : ''
                        : chosen
                          ? ' active-choice'
                          : '';
                      return (
                        <button
                          key={String(v)}
                          type="button"
                          className={`chip${cls}`}
                          disabled={readOnly}
                          onClick={() => pick(v)}
                        >
                          {v ? t('true') : t('false')}
                        </button>
                      );
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {task.type === 'audio' && (
        <div className="ex">
          {typeof q.mediaUrl === 'string' && q.mediaUrl && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio controls src={fileUrl(q.mediaUrl)} className="audio-full" />
          )}
          {typeof q.prompt === 'string' && <p>{q.prompt}</p>}
        </div>
      )}

      {task.type === 'essay' && (
        <div className="ex">
          {typeof q.prompt === 'string' && <p>{q.prompt}</p>}
          <textarea
            placeholder={t('essayPlaceholder')}
            value={(state.text as string) ?? ''}
            disabled={readOnly}
            onChange={(e) => setState({ text: e.target.value })}
          />
        </div>
      )}

      {task.type === 'discussion' && typeof q.prompt === 'string' && <p>{q.prompt}</p>}

      {done ? (
        <>
          {result?.score !== undefined ? (
            <p className={result.correct ? 'ex-ok' : 'ex-partial'}>
              {t('score')}: <Score value={result.score} />
            </p>
          ) : (
            <p className="ex-ok">{t('done')}</p>
          )}
          {feedback ? <p className="ex-feedback"><Icon name="edit" size={14} /> {feedback}</p> : null}
        </>
      ) : spectator ? (
        <p className="muted saved-tag">● {t('liveAnswer')}</p>
      ) : (
        <div className="row-between task-actions">
          <button type="button" disabled={busy} onClick={() => check()}>
            {busy ? '…' : task.gradingMode === 'AUTO' ? t('check') : t('markDone')}
          </button>
          {saved && <span className="muted saved-tag">{t('saved')}</span>}
        </div>
      )}
    </div>
  );
}
