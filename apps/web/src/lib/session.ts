'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { tokenStore } from '@/lib/auth';

// Client for the live-session envelope channel (/session namespace). Drawing
// stays on the separate /board socket; this carries nav / material / progress.

export interface SessionEnvelope<T = unknown> {
  v: number;
  type: string;
  sessionId: string;
  senderRole: 'teacher' | 'student';
  ts: number;
  payload: T;
}

export interface SessionState {
  lessonId?: string;
  pageId?: string;
}

function apiOrigin(): string {
  const b = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
  return b.replace(/\/api\/v1\/?$/, '');
}

/**
 * Join a live session and relay envelopes. Callbacks are kept in refs so the
 * socket connects once per sessionId (not on every parent re-render).
 */
export function useSession(
  sessionId: string,
  handlers: {
    onEvent?: (e: SessionEnvelope) => void;
    onJoin?: (state: SessionState) => void;
  },
) {
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) return;
    const socket = io(`${apiOrigin()}/session`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => socket.emit('session:join', { sessionId }));
    socket.on('session:joined', (msg: { state?: SessionState }) => {
      setJoined(true);
      handlersRef.current.onJoin?.(msg.state ?? {});
    });
    socket.on('session:event', (e: SessionEnvelope) => handlersRef.current.onEvent?.(e));

    return () => {
      socket.close();
      socketRef.current = null;
      setJoined(false);
    };
  }, [sessionId]);

  const emit = useCallback(<T,>(type: string, payload: T) => {
    socketRef.current?.emit('session:emit', { type, payload });
  }, []);

  return { emit, joined };
}
