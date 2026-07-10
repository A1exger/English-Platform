'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BoardCanvas } from './BoardCanvas';
import { VideoRoom } from './VideoRoom';
import { LessonExercisePanel } from './LessonExercisePanel';
import { useLiveLesson } from './useLiveLesson';
import { LiveMaterial } from './LiveMaterial';
import { LiveAnswers } from './LiveAnswers';

// Content-first live room. The synced material is the hero (white); a segmented
// [Material | Board] control swaps the drawing canvas onto the same stage. The
// right rail holds the video tiles (dark — the one place dark is functional) and
// a tabbed [Answers | Exercise] panel. Drawing stays on /board, sync on /session
// — this component only re-composes the UI around the untouched transports.
export function LessonRoom({ lessonId }: { lessonId: string }) {
  const tr = useTranslations('room');
  const t = useTranslations('learn');
  const live = useLiveLesson(lessonId);
  const [stage, setStage] = useState<'material' | 'board'>('material');
  const [tab, setTab] = useState<'answers' | 'exercise'>('answers');
  const [theatre, setTheatre] = useState(false);

  const { lesson, pageIdx, totalSteps, isTeacher } = live;
  const pageLabel = pageIdx === 0 ? t('preparation') : String(pageIdx);

  return (
    <div className={`lesson-room room-editorial${theatre ? ' theatre' : ''}`}>
      <section className="room-stage">
        <div className="room-stage-bar">
          {isTeacher ? (
            <div className="segmented">
              <button
                type="button"
                className={stage === 'material' ? 'active' : ''}
                onClick={() => setStage('material')}
              >
                {tr('material')}
              </button>
              <button
                type="button"
                className={stage === 'board' ? 'active' : ''}
                onClick={() => setStage('board')}
              >
                {tr('board')}
              </button>
            </div>
          ) : (
            <span className="muted">{stage === 'board' ? tr('board') : tr('material')}</span>
          )}

          {lesson && (
            <div className="page-stepper">
              {isTeacher && (
                <button
                  type="button"
                  className="ghost"
                  disabled={pageIdx === 0}
                  onClick={() => live.goTo(pageIdx - 1)}
                >
                  ‹
                </button>
              )}
              <span className="mono-num">
                {tr('pageLabel')} {pageLabel}
                {pageIdx > 0 ? ` / ${lesson.pages.length}` : ''}
              </span>
              {isTeacher && (
                <button
                  type="button"
                  className="ghost"
                  disabled={pageIdx >= totalSteps - 1}
                  onClick={() => live.goTo(pageIdx + 1)}
                >
                  ›
                </button>
              )}
              {!isTeacher && <span className="muted room-driver">{tr('teacherLeads')}</span>}
            </div>
          )}

          <span className="muted mono-num room-live">
            {live.joined ? `● ${tr('live')}` : '○ …'}
          </span>
        </div>

        <div className="room-stage-body">
          {stage === 'board' ? <BoardCanvas lessonId={lessonId} /> : <LiveMaterial live={live} />}
        </div>
      </section>

      <aside className="room-rail">
        <div className="room-video">
          <VideoRoom lessonId={lessonId} />
          <button
            type="button"
            className="room-theatre-btn"
            onClick={() => setTheatre((v) => !v)}
          >
            {theatre ? tr('exitFocus') : tr('focusVideo')}
          </button>
        </div>

        {isTeacher && (
          <div className="room-rail-panel">
            <div className="tabs">
              <button
                type="button"
                className={tab === 'answers' ? 'active' : ''}
                onClick={() => setTab('answers')}
              >
                {tr('answersTab')}
              </button>
              <button
                type="button"
                className={tab === 'exercise' ? 'active' : ''}
                onClick={() => setTab('exercise')}
              >
                {tr('exerciseTab')}
              </button>
            </div>
            <div className="room-rail-body">
              {tab === 'answers' ? (
                <LiveAnswers live={live} />
              ) : (
                <LessonExercisePanel lessonId={lessonId} />
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
