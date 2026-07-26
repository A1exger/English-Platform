'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BoardCanvas } from './BoardCanvas';
import { VideoRoom } from './VideoRoom';
import { LessonExercisePanel } from './LessonExercisePanel';
import { useLiveLesson } from './useLiveLesson';
import { LiveMaterial } from './LiveMaterial';
import { LiveAnswers } from './LiveAnswers';
import { LessonPlanPanel } from './LessonPlanPanel';
import { PageMediaBlock } from './PageMediaBlock';
import { useBoardSocket } from '@/lib/board';

type Tab = 'plan' | 'lesson' | 'media' | 'grammar' | 'answers' | 'exercise';

// Skyeng-style room (Э1): a 50/50 split — the left stage shows the video full,
// and toggling the board swaps the board in with the video shrunk to a corner
// PiP. The right panel holds the lesson content in tabs (Урок / Вложения /
// Грамматика, plus teacher tools) with the page stepper at the bottom. Drawing
// still rides the /board socket and page sync the /session envelope — unchanged.
export function LessonRoom({ lessonId }: { lessonId: string }) {
  const tr = useTranslations('room');
  const t = useTranslations('learn');
  const live = useLiveLesson(lessonId);
  const board = useBoardSocket(lessonId);
  const [showBoard, setShowBoard] = useState(false);
  const [tab, setTab] = useState<Tab>('lesson');

  const { lesson, pageIdx, totalSteps, isTeacher } = live;
  const pageLabel = pageIdx === 0 ? t('preparation') : String(pageIdx);
  const grammar = lesson?.grammarReference;

  // Follow the teacher onto the board: when a stroke arrives and the student is
  // watching the video, switch their stage to the board so they see the drawing.
  useEffect(() => {
    if (!board || isTeacher) return;
    const onUpdate = (msg: { update?: { type?: string; kind?: string } }) => {
      if (msg?.update?.type === 'seg' && msg.update.kind !== 'exercise') setShowBoard(true);
    };
    board.on('board:update', onUpdate);
    return () => {
      board.off('board:update', onUpdate);
    };
  }, [board, isTeacher]);

  return (
    <div className="lesson-room room-5050">
      {/* LEFT: video ⇄ board (video shrinks to a PiP when the board is on) */}
      <section className="room-stage">
        <div className="room-stage-bar">
          <div className="segmented">
            <button type="button" className={!showBoard ? 'active' : ''} onClick={() => setShowBoard(false)}>
              {tr('video')}
            </button>
            <button type="button" className={showBoard ? 'active' : ''} onClick={() => setShowBoard(true)}>
              {tr('board')}
            </button>
          </div>
          <span className="muted mono-num room-live">{live.joined ? `● ${tr('live')}` : '○ …'}</span>
        </div>
        <div className="room-stage-body">
          {/* Both are always mounted: the board keeps its /board sync (strokes
              are never lost when the teacher is on video), and the video keeps
              its LiveKit connection. z-index / PiP decide what's on top. */}
          <div className={`room-board-layer${showBoard ? ' show' : ''}`}>
            <BoardCanvas lessonId={lessonId} socket={board} />
          </div>
          <div className={showBoard ? 'room-video-pip' : 'room-video-full'}>
            <VideoRoom lessonId={lessonId} />
          </div>
        </div>
      </section>

      {/* RIGHT: lesson content in tabs + stepper */}
      <aside className="room-content">
        <div className="tabs room-content-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'plan'} className={tab === 'plan' ? 'active' : ''} onClick={() => setTab('plan')}>
            {tr('planTab')}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'lesson'} className={tab === 'lesson' ? 'active' : ''} onClick={() => setTab('lesson')}>
            {tr('lessonTab')}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'media'} className={tab === 'media' ? 'active' : ''} onClick={() => setTab('media')}>
            {tr('mediaTab')}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'grammar'} className={tab === 'grammar' ? 'active' : ''} onClick={() => setTab('grammar')}>
            {tr('grammarTab')}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'exercise'} className={tab === 'exercise' ? 'active' : ''} onClick={() => setTab('exercise')}>
            {tr('exerciseTab')}
          </button>
          {isTeacher && (
            <button type="button" role="tab" aria-selected={tab === 'answers'} className={tab === 'answers' ? 'active' : ''} onClick={() => setTab('answers')}>
              {tr('answersTab')}
            </button>
          )}
        </div>

        <div className="room-content-body">
          {tab === 'plan' && <LessonPlanPanel live={live} />}
          {tab === 'lesson' && <LiveMaterial live={live} />}
          {tab === 'media' && <PageMediaBlock media={live.page?.media} />}
          {tab === 'grammar' &&
            (grammar ? (
              <div className="card">
                <strong>{t('grammar')}: {grammar.title}</strong>
                <div className="grammar-table">
                  <div className="grammar-row">
                    <span className="grammar-key">{t('meaning')}</span>
                    <span>{grammar.meaning}</span>
                  </div>
                  <div className="grammar-row">
                    <span className="grammar-key">{t('form')}</span>
                    <span>{grammar.form}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="note">{tr('waiting')}</p>
            ))}
          {tab === 'exercise' && <LessonExercisePanel lessonId={lessonId} socket={board} />}
          {tab === 'answers' && isTeacher && <LiveAnswers live={live} />}
        </div>

        {lesson && (
          <div className="room-stepper">
            {isTeacher && (
              <button type="button" className="ghost" disabled={pageIdx === 0} onClick={() => live.goTo(pageIdx - 1)}>
                ‹
              </button>
            )}
            <span className="mono-num">
              {tr('pageLabel')} {pageLabel}
              {pageIdx > 0 ? ` / ${lesson.pages.length}` : ''}
            </span>
            {isTeacher && (
              <button type="button" className="ghost" disabled={pageIdx >= totalSteps - 1} onClick={() => live.goTo(pageIdx + 1)}>
                ›
              </button>
            )}
            {!isTeacher && <span className="muted room-driver">{tr('teacherLeads')}</span>}
          </div>
        )}
      </aside>
    </div>
  );
}
