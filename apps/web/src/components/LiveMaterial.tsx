'use client';

import { useTranslations } from 'next-intl';
import { ContentTaskPlayer } from './ContentTaskPlayer';
import { CONTENT_LEVELS, LiveLessonApi } from './useLiveLesson';

// Center stage of the live room: the synced lesson material is the hero (white).
// Teacher gets the material picker; the student follows and streams answers.
export function LiveMaterial({ live }: { live: LiveLessonApi }) {
  const t = useTranslations('learn');
  const tr = useTranslations('room');
  const { isTeacher, isStudent, lesson, pageIdx, page } = live;

  return (
    <div className="live-material">
      {isTeacher && (
        <div className="live-picker">
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
                  className={`ghost${lesson?.id === l.id ? ' active' : ''}`}
                  onClick={() => live.loadMaterialLive(l.id)}
                >
                  {l.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!lesson ? (
        <p className="note">{isTeacher ? tr('pickMaterial') : tr('waiting')}</p>
      ) : pageIdx === 0 ? (
        <div className="learn-prep">
          <h3 className="hero-title">{lesson.title}</h3>
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
        </div>
      ) : (
        page && (
          <div className="learn-page">
            {page.text && (
              <div className="card">
                <p>{page.text}</p>
              </div>
            )}
            {page.tasks.map((task) =>
              isStudent ? (
                <ContentTaskPlayer
                  key={task.id}
                  task={task}
                  onStateChange={(taskId, s) => live.emitProgress(taskId, s)}
                />
              ) : (
                // Teacher sees the material read-only (answers live in the rail).
                <ContentTaskPlayer key={task.id} task={task} initialResult={{ completed: true }} />
              )
            )}
          </div>
        )
      )}
    </div>
  );
}
