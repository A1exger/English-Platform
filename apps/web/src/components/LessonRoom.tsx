'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';
import { Icon } from './Icon';
import { BoardCanvas } from './BoardCanvas';
import { VideoRoom } from './VideoRoom';
import { LessonExercisePanel } from './LessonExercisePanel';
import { useLiveLesson } from './useLiveLesson';
import { LessonTimeline } from './LessonTimeline';
import { LiveAnswers } from './LiveAnswers';
import { LessonPlanPanel } from './LessonPlanPanel';
import { PageMediaBlock } from './PageMediaBlock';
import { useBoardSocket } from '@/lib/board';

type Tab = 'plan' | 'lesson' | 'media' | 'grammar' | 'answers' | 'exercise';

// Named CEFR levels → the short code shown in the header tag (e.g. «A1 · Beginner»).
const CEFR: Record<string, string> = {
  Beginner: 'A1',
  Elementary: 'A2',
  PreIntermediate: 'B1',
  Intermediate: 'B1+',
  UpperIntermediate: 'B2',
  Advanced: 'C1'
};

// Quick add-to-dictionary (students) — posts a word to the personal dictionary
// without leaving the room.
function RoomDictionary({
  locale,
  tr
}: {
  locale: string;
  tr: ReturnType<typeof useTranslations>;
}) {
  const [word, setWord] = useState('');
  const [translation, setTranslation] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function add() {
    const token = tokenStore.get();
    if (!token || !word.trim()) return;
    setBusy(true);
    try {
      await apiFetch('/content/dictionary', {
        method: 'POST',
        token,
        locale,
        body: { word: word.trim(), translation: translation.trim() || undefined }
      });
      setWord('');
      setTranslation('');
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      /* ignore — best-effort */
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="room-tool">
      <summary aria-label={tr('dictionary')}>
        <Icon name="book" /> <span className="room-tool-label">{tr('dictionary')}</span>
      </summary>
      <div className="room-tool-pop">
        <label className="room-tool-field">
          {tr('word')}
          <input value={word} onChange={(e) => setWord(e.target.value)} />
        </label>
        <label className="room-tool-field">
          {tr('translation')}
          <input value={translation} onChange={(e) => setTranslation(e.target.value)} />
        </label>
        <button type="button" disabled={busy || !word.trim()} onClick={add}>
          {done ? tr('added') : tr('addWord')}
        </button>
      </div>
    </details>
  );
}

// Help — a short reminder of where the room's tools live (chat/mic/camera are in
// the video controls; drawing is the board; the teacher drives the stages).
function RoomHelp({ tr }: { tr: ReturnType<typeof useTranslations> }) {
  return (
    <details className="room-tool">
      <summary aria-label={tr('help')}>
        <Icon name="help" /> <span className="room-tool-label">{tr('help')}</span>
      </summary>
      <div className="room-tool-pop">
        <ul className="room-help">
          <li>{tr('helpBoard')}</li>
          <li>{tr('helpChat')}</li>
          <li>{tr('helpNav')}</li>
        </ul>
      </div>
    </details>
  );
}

// Skyeng-style room (Э1): a full-width toolbar on top, then a 50/50 split — the
// left stage shows the video full, and toggling the board swaps it in with the
// video shrunk to a corner PiP. The right panel carries a stage header, the
// lesson content in tabs, and the page stepper. Drawing still rides the /board
// socket and page sync the /session envelope — unchanged.
export function LessonRoom({ lessonId }: { lessonId: string }) {
  const tr = useTranslations('room');
  const t = useTranslations('learn');
  const locale = useLocale();
  const live = useLiveLesson(lessonId);
  const board = useBoardSocket(lessonId);
  const [showBoard, setShowBoard] = useState(false);
  const [tab, setTab] = useState<Tab>('lesson');

  const { lesson, pageIdx, totalSteps, isTeacher, isStudent } = live;
  const pageLabel = pageIdx === 0 ? t('preparation') : String(pageIdx);
  const grammar = lesson?.grammarReference;

  // The current stage's name + how far through the lesson we are (0–100),
  // shown in the content header (#45).
  const stageName =
    pageIdx === 0 ? t('preparation') : live.page?.title || live.page?.type || pageLabel;
  const stagePct = totalSteps > 1 ? Math.round((pageIdx / (totalSteps - 1)) * 100) : 0;

  // Global lesson progress for the header bar (Broadsheet «Step X of N · M min
  // left»): the step is 1-based (prep = 1), and «min left» sums the estimated
  // minutes of the current stage onward.
  const pageMinutes = (p: { tasks: { estimatedMinutes?: number }[] }) =>
    p.tasks.reduce((s, tk) => s + (tk.estimatedMinutes || 0), 0);
  const minLeft = (lesson?.pages ?? [])
    .slice(pageIdx === 0 ? 0 : pageIdx - 1)
    .reduce((s, p) => s + pageMinutes(p), 0);
  const levelLabel = lesson?.level
    ? `${CEFR[lesson.level] ? `${CEFR[lesson.level]} · ` : ''}${lesson.level}`
    : '';

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
    <div className="lesson-room room-5050 room-broadsheet">
      {/* TOP: header — leave · title · level · live/connected (Broadsheet) */}
      <header className="room-header">
        <Link href="/dashboard" className="room-back">
          <Icon name="arrow-left" /> {tr('exit')}
        </Link>
        {lesson && <h1 className="room-title">{lesson.title}</h1>}
        {levelLabel && <span className="room-tag room-tag-neutral">{levelLabel}</span>}
        <div className="room-header-status">
          <span className={`room-tag room-tag-accent${live.joined ? '' : ' off'}`}>● {tr('live')}</span>
          <span className="room-tag room-tag-neutral">
            {live.joined ? tr('connected') : tr('offline')}
          </span>
        </div>
      </header>

      {/* global lesson progress */}
      <div className="room-progress">
        <div className="room-progress-meta">
          <span>{tr('lessonProgress')}</span>
          <span>
            {tr('stepOf', { n: pageIdx + 1, total: totalSteps })}
            {minLeft > 0 ? ` · ${tr('minLeft', { min: minLeft })}` : ''}
          </span>
        </div>
        <div className="room-progressbar">
          <div className="room-progressbar-fill" style={{ inlineSize: `${stagePct}%` }} />
        </div>
      </div>

      {/* LEFT: video ⇄ board (video shrinks to a PiP when the board is on) */}
      <section className="room-stage">
        <div className="room-stage-bar">
          <div className="segmented room-seg">
            <button type="button" className={!showBoard ? 'active' : ''} onClick={() => setShowBoard(false)}>
              {tr('video')}
            </button>
            <button type="button" className={showBoard ? 'active' : ''} onClick={() => setShowBoard(true)}>
              {tr('board')}
            </button>
          </div>
          <div className="room-stage-tools">
            {isStudent && <RoomDictionary locale={locale} tr={tr} />}
            <RoomHelp tr={tr} />
          </div>
        </div>
        <div className="room-stage-body">
          {/* Both are always mounted: the board keeps its /board sync (strokes
              are never lost when the teacher is on video), and the video keeps
              its LiveKit connection. z-index / PiP decide what's on top. */}
          <div className={`room-board-layer${showBoard ? ' show' : ''}`}>
            <BoardCanvas lessonId={lessonId} socket={board} embedded />
          </div>
          <div className={showBoard ? 'room-video-pip' : 'room-video-full'}>
            <VideoRoom lessonId={lessonId} />
          </div>
        </div>
      </section>

      {/* RIGHT: stage header + lesson content in tabs + stepper */}
      <aside className="room-content">
        {lesson && (
          <div className="room-content-head">
            <div className="room-content-head-main">
              <span className="room-content-kicker mono-num">
                {tr('pageLabel')} {pageIdx + 1} / {totalSteps}
              </span>
              <strong className="room-content-stage">{stageName}</strong>
            </div>
            <span className="room-content-badge mono-num" aria-label={`${stagePct}%`}>
              {stagePct}%
            </span>
          </div>
        )}

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
          {tab === 'lesson' && <LessonTimeline live={live} />}
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
