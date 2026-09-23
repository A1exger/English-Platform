'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
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
import type { Socket } from 'socket.io-client';

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

/**
 * Add a word without leaving the room. It used to be shown to students only,
 * because the personal dictionary is a student's — but a teacher hears the word
 * that needs writing down just as often, and had nowhere to put it. So each
 * role writes where the word belongs for them: a student to their own
 * dictionary, a teacher to the shared word bank they curate and students copy
 * from. Same panel, same two fields.
 */
function RoomDictionary({
  locale,
  tr,
  toWordBank
}: {
  locale: string;
  tr: ReturnType<typeof useTranslations>;
  /** Teacher: the word goes to the shared bank instead of a personal list. */
  toWordBank?: boolean;
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
      await (toWordBank
        ? apiFetch('/content/word-bank/import', {
            method: 'POST',
            token,
            locale,
            // The bank's import format is one "word = translation" per line.
            body: { text: `${word.trim()}${translation.trim() ? ` = ${translation.trim()}` : ''}` }
          })
        : apiFetch('/content/dictionary', {
            method: 'POST',
            token,
            locale,
            body: { word: word.trim(), translation: translation.trim() || undefined }
          }));
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

/**
 * The shared notepad, as a room tool rather than a board tool. It speaks the
 * same protocol it always did — broadcast over the /board socket, debounce-
 * persisted — and it is the only writer in the room: BoardCanvas drops its own
 * copy when embedded, so the two can never race each other.
 */
function RoomNotes({ lessonId, socket }: { lessonId: string; socket: Socket | null }) {
  // The board's own strings, because this IS the board's notepad: its
  // placeholder is the one that says the notes are shared. The room namespace
  // has a notesHint describing private, device-local notes — a different thing
  // that this is not, and telling a teacher their notes are private while the
  // student watches them type would be the worst kind of wrong label.
  const tb = useTranslations('board');
  const [notes, setNotes] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) return;
    apiFetch<{ notes: string | null }>(`/lessons/${lessonId}/board`, { token })
      .then((b) => b.notes && setNotes(b.notes))
      .catch(() => undefined);
  }, [lessonId]);

  useEffect(() => {
    if (!socket) return;
    const onNote = (msg: { notes: string }) => setNotes(msg.notes);
    socket.on('board:note', onNote);
    return () => {
      socket.off('board:note', onNote);
    };
  }, [socket]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function change(value: string) {
    setNotes(value);
    socket?.emit('board:note', { lessonId, notes: value });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const token = tokenStore.get();
      if (!token) return;
      void apiFetch(`/lessons/${lessonId}/board/notes`, {
        method: 'POST',
        token,
        body: { notes: value }
      }).catch(() => undefined);
    }, 700);
  }

  return (
    <details className="room-tool">
      <summary aria-label={tb('notes')}>
        <Icon name="edit" /> <span className="room-tool-label">{tb('notes')}</span>
      </summary>
      <div className="room-tool-pop room-tool-pop-wide">
        <textarea
          className="room-notes-area"
          value={notes}
          placeholder={tb('notesPlaceholder')}
          onChange={(e) => change(e.target.value)}
        />
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
  const router = useRouter();
  const live = useLiveLesson(lessonId);
  const board = useBoardSocket(lessonId);
  const [showBoard, setShowBoard] = useState(false);
  const [tab, setTab] = useState<Tab>('lesson');
  // Dismiss the dictionary/help pop-outs on an outside click / Escape.
  usePopoverDismiss();

  const { lesson, pageIdx, totalSteps, isTeacher, isStudent } = live;
  const [ending, setEnding] = useState(false);

  async function endLesson() {
    const token = tokenStore.get();
    if (!token) return;
    setEnding(true);
    try {
      // Best-effort: a lesson the server will not close should still let the
      // teacher out rather than trapping them in the room.
      await apiFetch(`/lessons/${lessonId}`, {
        method: 'PATCH',
        token,
        locale,
        body: { status: 'completed' }
      }).catch(() => undefined);
      router.push('/dashboard');
    } finally {
      setEnding(false);
    }
  }

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
      {/* TOP: header — end/leave · title · level · live/connected (Broadsheet) */}
      <header className="room-header">
        {/* The teacher ENDS the lesson: it is marked completed and they leave,
            which is what walking out of a lesson means for the person running
            it. A student only leaves — finishing someone else's lesson is not
            theirs to do, and the API agrees (PATCH is tutor-only). */}
        {isTeacher ? (
          <button type="button" className="room-back room-end" disabled={ending} onClick={endLesson}>
            <Icon name="arrow-left" /> {ending ? tr('ending') : tr('endLesson')}
          </button>
        ) : (
          <Link href="/dashboard" className="room-back room-end">
            <Icon name="arrow-left" /> {tr('exit')}
          </Link>
        )}
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
            <RoomDictionary locale={locale} tr={tr} toWordBank={isTeacher} />
            {/* Notes used to live in the board's own toolbar, which put them
                out of reach whenever the video was showing — and the video is
                where most of a lesson is spent. They belong with the other
                room tools, reachable from either stage. */}
            <RoomNotes lessonId={lessonId} socket={board} />
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
