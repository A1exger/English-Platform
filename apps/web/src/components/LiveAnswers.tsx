'use client';

import { useTranslations } from 'next-intl';
import { ExerciseState } from './ExerciseRenderer';
import { LiveLessonApi } from './useLiveLesson';
import { Score } from './Score';

// Render whatever shape the task's state uses. Covers every canonical type:
// order (order[]), gap fill (answers[]), matching (map{}), categorization
// (placement{}), multiple choice (answer) and essay (text).
function summarize(s: ExerciseState | undefined): string {
  if (!s || Object.keys(s).length === 0) return '—';
  if (typeof s.answer === 'string') return s.answer;
  if (Array.isArray(s.answers)) return (s.answers as string[]).filter(Boolean).join(', ');
  if (Array.isArray(s.order)) return (s.order as string[]).join(' → ');
  if (typeof s.text === 'string') return s.text.slice(0, 120);
  const pairMap = (s.map ?? s.placement) as Record<string, string> | undefined;
  if (pairMap && typeof pairMap === 'object') {
    const parts = Object.entries(pairMap)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k} → ${v}`);
    return parts.length ? parts.join(' · ') : '—';
  }
  return JSON.stringify(s).slice(0, 120);
}

// Teacher read-model: the student's live answers for the current page's tasks,
// streamed over exercise:progress, plus the score once they check
// (exercise:result). Read-only.
export function LiveAnswers({ live }: { live: LiveLessonApi }) {
  const tr = useTranslations('room');
  const t = useTranslations('learn');
  const tasks = live.page?.tasks ?? [];

  if (!live.lesson || live.pageIdx === 0 || tasks.length === 0) {
    return <p className="note">{tr('answersHint')}</p>;
  }

  return (
    <div className="live-answers">
      {tasks.map((task) => {
        const res = live.results[task.id];
        const answered = !!live.answers[task.id] && Object.keys(live.answers[task.id]).length > 0;
        return (
          <div key={task.id} className="live-answer-row">
            <span className={`chip aspect-${task.aspect.toLowerCase()}`}>
              <span className="dot" />
              {task.aspect}
            </span>
            <p className="live-answer">{summarize(live.answers[task.id])}</p>
            <span className="live-answer-state">
              {res ? (
                res.score !== undefined ? (
                  <span className={res.correct ? 'ex-ok' : 'ex-partial'}>
                    {t('score')}: <Score value={res.score} />
                  </span>
                ) : (
                  <span className="ex-ok">{t('done')}</span>
                )
              ) : (
                <span className="muted">{answered ? `● ${t('liveAnswer')}` : '—'}</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
