'use client';

import { useTranslations } from 'next-intl';
import { ExerciseState } from './ExerciseRenderer';
import { LiveLessonApi } from './useLiveLesson';

function summarize(s: ExerciseState | undefined): string {
  if (!s || Object.keys(s).length === 0) return '—';
  if (typeof s.answer === 'string') return s.answer;
  if (Array.isArray(s.answers)) return (s.answers as string[]).join(', ');
  if (Array.isArray(s.order)) return (s.order as string[]).join(' → ');
  if (typeof s.text === 'string') return s.text.slice(0, 120);
  return JSON.stringify(s).slice(0, 120);
}

// Teacher read-model: the student's live answers for the current page's tasks,
// streamed over exercise:progress. Read-only.
export function LiveAnswers({ live }: { live: LiveLessonApi }) {
  const tr = useTranslations('room');
  const tasks = live.page?.tasks ?? [];

  if (!live.lesson || live.pageIdx === 0 || tasks.length === 0) {
    return <p className="note">{tr('answersHint')}</p>;
  }

  return (
    <div className="live-answers">
      {tasks.map((task) => (
        <div key={task.id} className="live-answer-row">
          <span className={`chip aspect-${task.aspect.toLowerCase()}`}>
            <span className="dot" />
            {task.aspect}
          </span>
          <p className="live-answer">{summarize(live.answers[task.id])}</p>
        </div>
      ))}
    </div>
  );
}
