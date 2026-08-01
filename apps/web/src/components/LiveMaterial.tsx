'use client';

import { useTranslations } from 'next-intl';
import { ContentTaskPlayer } from './ContentTaskPlayer';
import { PageMediaBlock } from './PageMediaBlock';
import { CONTENT_LEVELS, LiveLessonApi } from './useLiveLesson';

// Teacher's material picker (course → level → the level's lessons). The room
// remembers the last material per lesson so it usually opens ready (#7).
export function MaterialPicker({ live }: { live: LiveLessonApi }) {
  const tr = useTranslations('room');
  if (!live.isTeacher) return null;
  return (
    <details className="live-picker">
      <summary>{live.lesson ? live.lesson.title : tr('pickMaterial')}</summary>
      <div className="inline-form">
        <select value={live.courseId} onChange={(e) => live.setCourseId(e.target.value)}>
          {live.courses.length === 0 && <option value="">—</option>}
          {live.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <select value={live.level} onChange={(e) => live.setLevel(e.target.value)}>
          {CONTENT_LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <button type="button" onClick={live.loadTree} disabled={!live.courseId}>
          {tr('loadLessons')}
        </button>
      </div>
      {live.treeLessons.length > 0 && (
        <div className="live-lesson-list">
          {live.treeLessons.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`ghost${live.lesson?.id === l.id ? ' active' : ''}`}
              onClick={() => live.loadMaterialLive(l.id)}
            >
              {l.title}
            </button>
          ))}
        </div>
      )}
    </details>
  );
}

// The current stage's body — the Preparation summary, or the current page's text
// plus its interactive tasks (students stream answers over /session; teachers see
// them read-only). Rendered inline in the current timeline card.
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

// Back-compat center-stage view: the teacher picker over the current stage body.
// (The room's Lesson tab now uses LessonTimeline; this stays for any other use.)
export function LiveMaterial({ live }: { live: LiveLessonApi }) {
  const tr = useTranslations('room');
  return (
    <div className="live-material">
      <MaterialPicker live={live} />
      {!live.lesson ? (
        <p className="note">{live.isTeacher ? tr('pickMaterial') : tr('waiting')}</p>
      ) : (
        <StageBody live={live} />
      )}
    </div>
  );
}
