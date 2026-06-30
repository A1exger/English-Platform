'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BoardCanvas } from './BoardCanvas';
import { VideoRoom } from './VideoRoom';
import { DraggablePanel } from './DraggablePanel';
import { LessonExercisePanel } from './LessonExercisePanel';

// Unified lesson screen: the interactive whiteboard fills the area, and the
// video call is a draggable, resizable floating window you can move anywhere.
export function LessonRoom({ lessonId }: { lessonId: string }) {
  const t = useTranslations('room');
  const [showVideo, setShowVideo] = useState(true);
  // Default the call window to the bottom-left corner.
  const [videoPos, setVideoPos] = useState({ x: 16, y: 360, width: 280, height: 230 });

  useEffect(() => {
    setVideoPos((p) => ({ ...p, y: Math.max(80, window.innerHeight - p.height - 24) }));
  }, []);

  return (
    <div className="lesson-room split">
      <div className="lesson-left">
        <BoardCanvas lessonId={lessonId} />
      </div>
      <div className="lesson-right">
        <LessonExercisePanel lessonId={lessonId} />
      </div>
      {showVideo ? (
        <DraggablePanel
          title={t('video')}
          onClose={() => setShowVideo(false)}
          initial={videoPos}
        >
          <VideoRoom lessonId={lessonId} />
        </DraggablePanel>
      ) : (
        <button type="button" className="reopen-video" onClick={() => setShowVideo(true)}>
          🎥 {t('video')}
        </button>
      )}
    </div>
  );
}
