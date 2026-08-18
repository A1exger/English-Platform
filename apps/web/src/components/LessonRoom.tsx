'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';
import { usePopoverDismiss } from '@/lib/use-popover-dismiss';
import { Icon } from './Icon';
import { BoardCanvas } from './BoardCanvas';
import { VideoRoom } from './VideoRoom';
import { useLiveLesson } from './useLiveLesson';
import { StageBody } from './LiveMaterial';
import { LessonPlanPanel } from './LessonPlanPanel';
import { AnswerGauge } from './AnswerGauge';
import { useBoardSocket } from '@/lib/board';

type Tab = 'plan' | 'lesson';

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
  // Dismiss the dictionary/help pop-outs on an outside click / Escape.
  usePopoverDismiss();

  const { lesson, pageIdx, totalSteps, isTeacher, isStudent } = live;
  const pageLabel = pageIdx === 0 ? t('preparation') : String(pageIdx);

  // The current stage's name, shown in the content header.
  const stageName =
    pageIdx === 0 ? t('preparation') : live.page?.title || live.page?.type || pageLabel;

  // How the current page is going, for the corner gauge: how much is finished,
  // and the average score over what was answered. Task scores are 0–10; an
  // ungraded task that was completed counts as full marks (nothing to lose).
  const pageTasks = live.page?.tasks ?? [];
  const answered = pageTasks.filter((tk) => live.results[tk.id]);
  const scored = answered.map((tk) => {
    const r = live.results[tk.id];
    return r?.score === undefined ? 100 : Math.round(r.score * 10);
  });
  const pageProgress = {
    done: answered.length,
    total: pageTasks.length,
    pct: scored.length ? scored.reduce((s, v) => s + v, 0) / scored.length : null
  };

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
            <VideoRoom lessonId={lessonId} compact={showBoard} />
          </div>
        </div>
      </section>

      {/* RIGHT: the course page. Teachers get Plan (pick material / homework)
          and Lesson (exactly what the student sees); students get only the page
          itself, full height, with the answer gauge in its corner. */}
      <aside className="room-content">
        {lesson && (
          <div className="room-content-head">
            <div className="room-content-head-main">
              <span className="room-content-kicker mono-num">
                {tr('pageLabel')} {pageIdx + 1} / {totalSteps}
              </span>
              <strong className="room-content-stage">{stageName}</strong>
            </div>
            {/* Page progress: teal fills as answers land correct, bordeaux when
                they don't. */}
            <AnswerGauge
              done={pageProgress.done}
              total={pageProgress.total}
              pct={pageProgress.pct}
              label={tr('lessonProgress')}
            />
          </div>
        )}

        {isTeacher && (
          <div className="tabs room-content-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'plan'} className={tab === 'plan' ? 'active' : ''} onClick={() => setTab('plan')}>
              {tr('planTab')}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'lesson'} className={tab === 'lesson' ? 'active' : ''} onClick={() => setTab('lesson')}>
              {tr('lessonTab')}
            </button>
          </div>
        )}

        <div className="room-content-body">
          {isTeacher && tab === 'plan' ? (
            <LessonPlanPanel live={live} />
          ) : !lesson ? (
            <p className="note">{isTeacher ? tr('pickMaterial') : tr('waiting')}</p>
          ) : (
            <StageBody live={live} />
          )}
        </div>

        {lesson && (isTeacher ? tab === 'lesson' : true) && (
          <div className="room-stepper">
            {isTeacher && (
              <button type="button" className="ghost" disabled={pageIdx === 0} onClick={() => live.goTo(pageIdx - 1)}>
                ‹
              </button>
            )}
            <span className="mono-num">
              {pageIdx + 1} / {totalSteps}
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
