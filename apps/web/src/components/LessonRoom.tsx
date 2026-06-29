'use client';

import { useState } from 'react';
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
          initial={{ x: 880, y: 90, width: 300, height: 280 }}
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
