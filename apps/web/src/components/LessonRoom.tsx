'use client';

import { BoardCanvas } from './BoardCanvas';
import { VideoRoom } from './VideoRoom';

// Unified lesson screen: interactive whiteboard + video side panel — each
// participant sees the UI in their own language while sharing the same board
// and call.
export function LessonRoom({ lessonId }: { lessonId: string }) {
  return (
    <div className="room">
      <div className="room-board">
        <BoardCanvas lessonId={lessonId} />
      </div>
      <div className="room-video">
        <VideoRoom lessonId={lessonId} />
      </div>
    </div>
  );
}
