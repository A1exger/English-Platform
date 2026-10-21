'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { tokenStore } from '@/lib/auth';

function apiOrigin(): string {
  const b = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
  return b.replace(/\/api\/v1\/?$/, '');
}

// One shared /board connection per room (Sprint 3 #5). BoardCanvas and
// LessonExercisePanel used to open a socket each; the room lifts a single one
// here and passes it to both. The protocol and payloads are unchanged — only the
// connection is shared. Standalone BoardCanvas (the /board route) still opens its
// own socket when no shared one is passed.
export function useBoardSocket(lessonId: string): Socket | null {
  const [socket, setSocket] = useState<Socket | null>(null);
  useEffect(() => {
    const token = tokenStore.get();
    if (!token) return;
    const s = io(`${apiOrigin()}/board`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true
    });
    s.on('connect', () => s.emit('board:join', { lessonId }));
    setSocket(s);
    return () => {
      s.close();
      setSocket(null);
    };
  }, [lessonId]);
  return socket;
}
