'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BoardCanvas } from './BoardCanvas';
import { VideoRoom } from './VideoRoom';
import { DraggablePanel } from './DraggablePanel';
import { LiveLessonPanel } from './LiveLessonPanel';

// Unified live-lesson screen with a layout automaton:
//   normal   -> big teacher video on the left, material panel on the right
//   board on -> whiteboard fills the left, both videos shrink to a PiP window,
//               material panel stays on the right
// The material panel is teacher-driven and synchronized over the /session
// envelope channel; drawing stays on the untouched /board channel.
export function LessonRoom({ lessonId }: { lessonId: string }) {
  const t = useTranslations('room');
  const [boardOn, setBoardOn] = useState(false);
  const [showVideo, setShowVideo] = useState(true);
  const [pip, setPip] = useState({ x: 16, y: 360, width: 260, height: 200 });

  useEffect(() => {
    setPip((p) => ({ ...p, y: Math.max(80, window.innerHeight - p.height - 24) }));
  }, []);

  return (
    <div className={`lesson-room split ${boardOn ? 'board-on' : 'normal'}`}>
      <div className="lesson-left">
        <div className="live-toolbar">
          <button
            type="button"
            className={boardOn ? 'active' : ''}
            onClick={() => setBoardOn((v) => !v)}
          >
            ✏️ {t('board')}
          </button>
          <button
            type="button"
            className={showVideo ? 'active' : ''}
            onClick={() => setShowVideo((v) => !v)}
          >
            🎥 {t('video')}
          </button>
        </div>

        {boardOn ? (
          <BoardCanvas lessonId={lessonId} />
        ) : (
          <div className="stage-video">
            {showVideo ? <VideoRoom lessonId={lessonId} /> : <div className="stage-empty" />}
          </div>
        )}
      </div>

      <div className="lesson-right">
        <LiveLessonPanel lessonId={lessonId} />
      </div>

      {/* PiP video only in board mode (in normal mode the video is the stage). */}
      {boardOn && showVideo && (
        <DraggablePanel title={t('video')} onClose={() => setShowVideo(false)} initial={pip}>
          <VideoRoom lessonId={lessonId} />
        </DraggablePanel>
      )}
    </div>
  );
}
