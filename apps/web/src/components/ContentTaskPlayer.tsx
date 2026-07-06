'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch, fileUrl } from '@/lib/api';
import { tokenStore } from '@/lib/auth';
import { ExerciseRenderer, ExerciseState, Question } from './ExerciseRenderer';

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

interface CheckResponse {
  completed: boolean;
  score?: number;
  correct?: boolean;
  solution?: ExerciseState;
}

const DND_TYPES = ['sentence_ordering', 'word_matching', 'gap_fill', 'categorization'];

export function ContentTaskPlayer({
  task,
  onResult
}: {
  task: ContentTask;
  onResult?: (r: { taskId: string; score?: number; completed: boolean }) => void;
}) {
  const t = useTranslations('learn');
  const locale = useLocale();
  const [state, setState] = useState<ExerciseState>({});
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const done = result !== null;

  async function check(extraState?: ExerciseState) {
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    try {
      const r = await apiFetch<CheckResponse>(`/content/tasks/${task.id}/check`, {
        method: 'POST',
        token,
        locale,
        body: { state: extraState ?? state }
      });
      setResult(r);
      onResult?.({ taskId: task.id, score: r.score, completed: true });
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
          readOnly={done}
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
                  disabled={done}
                  onClick={() => setState({ answer: opt })}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {task.type === 'audio' && (
        <div className="ex">
          {typeof q.mediaUrl === 'string' && q.mediaUrl && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio controls src={fileUrl(q.mediaUrl)} style={{ width: '100%' }} />
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
            disabled={done}
            onChange={(e) => setState({ text: e.target.value })}
          />
        </div>
      )}

      {task.type === 'discussion' && typeof q.prompt === 'string' && <p>{q.prompt}</p>}

      {done ? (
        result?.score !== undefined ? (
          <p className={result.correct ? 'ex-ok' : 'ex-partial'}>
            {t('score')}: {result.score} / 10
          </p>
        ) : (
          <p className="ex-ok">{t('done')}</p>
        )
      ) : task.gradingMode === 'AUTO' ? (
        <button type="button" disabled={busy} onClick={() => check()}>
          {busy ? '…' : t('check')}
        </button>
      ) : (
        <button type="button" disabled={busy} onClick={() => check()}>
          {busy ? '…' : t('markDone')}
        </button>
      )}
    </div>
  );
}
