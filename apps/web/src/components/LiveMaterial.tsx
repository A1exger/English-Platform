'use client';

import { useTranslations } from 'next-intl';
import { ContentTaskPlayer } from './ContentTaskPlayer';
import { PageMediaBlock } from './PageMediaBlock';
import { LiveLessonApi } from './useLiveLesson';

// The current stage's body — the Preparation summary, or the current page's text
// plus its interactive tasks (students stream answers over /session; teachers see
// them read-only). This is the whole right-hand panel: the student sees only
// this, and the teacher sees the same thing under the Lesson tab.
export function StageBody({ live }: { live: LiveLessonApi }) {
  const t = useTranslations('learn');
  const { isStudent, lesson, pageIdx, page } = live;
  if (!lesson) return null;

  if (pageIdx === 0) {
    const empty =
      lesson.objectives.length === 0 &&
      !(lesson.wordlist && lesson.wordlist.entries.length > 0) &&
      !lesson.grammarReference;
    return (
      <div className="learn-prep">
        {lesson.objectives.length > 0 && (
          <div className="card">
            <strong>{t('objectives')}</strong>
            <ul>
              {lesson.objectives.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </div>
        )}
        {lesson.wordlist && lesson.wordlist.entries.length > 0 && (
          <div className="card">
            <strong>{t('wordlist')}</strong>
            <ul className="lesson-list">
              {lesson.wordlist.entries.map((e) => (
                <li key={e.word}>
                  <b>{e.word}</b>
                  {e.translation ? <span className="muted"> — {e.translation}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        )}
        {lesson.grammarReference && (
          <div className="card">
            <strong>
              {t('grammar')}: {lesson.grammarReference.title}
            </strong>
            <div className="grammar-table">
              <div className="grammar-row">
                <span className="grammar-key">{t('meaning')}</span>
                <span>{lesson.grammarReference.meaning}</span>
              </div>
              <div className="grammar-row">
                <span className="grammar-key">{t('form')}</span>
                <span>{lesson.grammarReference.form}</span>
              </div>
            </div>
          </div>
        )}
        {empty && <p className="muted">{t('preparation')}</p>}
      </div>
    );
  }

  if (!page) return null;
  return (
    <div className="learn-page">
      {page.text && (
        <div className="card">
          <p>{page.text}</p>
        </div>
      )}
      {page.media && page.media.length > 0 && <PageMediaBlock media={page.media} />}
      {page.tasks.map((task) =>
        isStudent ? (
          <ContentTaskPlayer
            key={task.id}
            task={task}
            onStateChange={(taskId, s) => live.emitProgress(taskId, s)}
            // Push the checked answer + score so the teacher's copy stops
            // showing "answering" and reports the result.
            onResult={(r) =>
              live.emitResult(r.taskId, {
                state: r.state,
                score: r.score,
                correct: r.correct,
                completed: r.completed
              })
            }
          />
        ) : (
          // Teacher watches the student's live answer in place, in real time.
          <ContentTaskPlayer
            key={task.id}
            task={task}
            spectator
            initialState={live.answers[task.id]}
            initialResult={live.results[task.id] ?? null}
          />
        )
      )}
    </div>
  );
}
