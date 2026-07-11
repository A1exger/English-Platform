'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { io, Socket } from 'socket.io-client';
import { Link, useRouter } from '@/i18n/routing';
import { apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';
import { DraggablePanel } from './DraggablePanel';
import { useToast } from './Toast';

// Normalized (0..1) segment so the drawing looks the same regardless of each
// client's canvas pixel size.
interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
}
type BoardOp = { type: 'seg'; seg: Seg } | { type: 'clear' };

// Light-grey board surface with dark-friendly pen colours.
const BG = '#eef1f6';
const COLORS = ['#1f2937', '#2563eb', '#dc2626', '#16a34a', '#d97706'];

function apiOrigin(): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
  return base.replace(/\/api\/v1\/?$/, '');
}

export function BoardCanvas({
  lessonId,
  socket: sharedSocket
}: {
  lessonId: string;
  // When the room lifts a single /board connection (Sprint 3 #5) it passes it
  // here; standalone (the /board route) opens its own.
  socket?: Socket | null;
}) {
  const t = useTranslations('board');
  const router = useRouter();
  const toast = useToast();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const opsRef = useRef<Seg[]>([]);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const [color, setColor] = useState(COLORS[1]);
  const [erasing, setErasing] = useState(false);
  const [status, setStatus] = useState<'connecting' | 'connected'>('connecting');
  const [saved, setSaved] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const drawSeg = useCallback((seg: Seg) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.strokeStyle = seg.color;
    ctx.lineWidth = seg.width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(seg.x1 * canvas.width, seg.y1 * canvas.height);
    ctx.lineTo(seg.x2 * canvas.width, seg.y2 * canvas.height);
    ctx.stroke();
  }, []);

  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const seg of opsRef.current) drawSeg(seg);
  }, [drawSeg]);

  const applyOp = useCallback(
    (op: BoardOp) => {
      if (op.type === 'clear') {
        opsRef.current = [];
        redrawAll();
      } else {
        opsRef.current.push(op.seg);
        drawSeg(op.seg);
      }
    },
    [drawSeg, redrawAll],
  );

  // Size the canvas to its container, then (re)draw stored ops.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      redrawAll();
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [redrawAll]);

  // Connect (or reuse the room's socket) + load the saved snapshot.
  useEffect(() => {
    const token = tokenStore.get();
    if (!token) {
      if (!sharedSocket) router.push('/');
      return;
    }

    apiFetch<{ latestSnapshot: string | null; notes: string | null }>(
      `/lessons/${lessonId}/board`,
      { token },
    )
      .then((board) => {
        if (board.notes) setNotes(board.notes);
        if (board.latestSnapshot) {
          try {
            opsRef.current = JSON.parse(board.latestSnapshot) as Seg[];
            redrawAll();
          } catch {
            /* ignore malformed snapshot */
          }
        }
      })
      .catch(() => undefined);

    // Sprint 3 #5: reuse the room's single /board connection when given one;
    // otherwise (the standalone board route) open our own. Same events either way.
    const socket =
      sharedSocket ??
      io(`${apiOrigin()}/board`, { auth: { token }, transports: ['websocket'], forceNew: true });
    socketRef.current = socket;

    const onJoined = () => setStatus('connected');
    const onUpdate = (msg: { update: BoardOp }) => applyOp(msg.update);
    const onNote = (msg: { notes: string }) => setNotes(msg.notes);
    socket.on('board:joined', onJoined);
    socket.on('board:update', onUpdate);
    socket.on('board:note', onNote);
    if (sharedSocket) {
      if (sharedSocket.connected) setStatus('connected');
    } else {
      socket.on('connect', () => socket.emit('board:join', { lessonId }));
    }

    return () => {
      socket.off('board:joined', onJoined);
      socket.off('board:update', onUpdate);
      socket.off('board:note', onNote);
      if (!sharedSocket) socket.close();
      socketRef.current = null;
    };
  }, [lessonId, applyOp, redrawAll, router, sharedSocket]);

  function norm(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    last.current = norm(e);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    const p = norm(e);
    const seg: Seg = {
      x1: last.current.x,
      y1: last.current.y,
      x2: p.x,
      y2: p.y,
      color: erasing ? BG : color,
      width: erasing ? 18 : 3,
    };
    last.current = p;
    applyOp({ type: 'seg', seg });
    socketRef.current?.emit('board:update', {
      lessonId,
      update: { type: 'seg', seg },
    });
    setSaved(false);
  }

  function onPointerUp() {
    drawing.current = false;
    last.current = null;
  }

  // Sprint 3 #6: clearing a shared canvas is destructive — route it through
  // showUndo. The board clears locally at once, but peers are only wiped (and the
  // clear becomes permanent) when the undo window closes.
  function clear() {
    const prevOps = opsRef.current.slice();
    applyOp({ type: 'clear' });
    setSaved(false);
    toast.showUndo(t('cleared'), {
      onUndo: () => {
        opsRef.current = prevOps;
        redrawAll();
      },
      onCommit: () => {
        socketRef.current?.emit('board:update', { lessonId, update: { type: 'clear' } });
      }
    });
  }

  async function save() {
    const token = tokenStore.get();
    if (!token) return;
    await apiFetch(`/lessons/${lessonId}/board/snapshot`, {
      method: 'POST',
      token,
      body: { snapshot: JSON.stringify(opsRef.current) },
    });
    setSaved(true);
  }

  // Shared notepad: broadcast live and debounce-persist to the server.
  function onNotesChange(value: string) {
    setNotes(value);
    socketRef.current?.emit('board:note', { lessonId, notes: value });
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => {
      const token = tokenStore.get();
      if (!token) return;
      void apiFetch(`/lessons/${lessonId}/board/notes`, {
        method: 'POST',
        token,
        body: { notes: value },
      }).catch(() => undefined);
    }, 700);
  }

  return (
    <div className="board-wrap">
      <div className="board-toolbar">
        <Link className="link" href="/schedule">
          ← {t('back')}
        </Link>
        <button
          type="button"
          className={!erasing ? 'active' : ''}
          onClick={() => setErasing(false)}
        >
          {t('pen')}
        </button>
        <button
          type="button"
          className={erasing ? 'active' : ''}
          onClick={() => setErasing(true)}
        >
          {t('eraser')}
        </button>
        <span className="palette">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`${t('color')} ${c}`}
              className={`swatch${color === c && !erasing ? ' active' : ''}`}
              style={{ background: c }}
              onClick={() => {
                setColor(c);
                setErasing(false);
              }}
            />
          ))}
        </span>
        <button type="button" onClick={clear}>
          {t('clear')}
        </button>
        <button type="button" onClick={save}>
          {saved ? t('saved') : t('save')}
        </button>
        <button
          type="button"
          className={notesOpen ? 'active' : ''}
          onClick={() => setNotesOpen((v) => !v)}
        >
          📝 {t('notes')}
        </button>
        <span className="muted">
          {status === 'connected' ? `● ${t('connected')}` : `○ ${t('connecting')}`}
        </span>
      </div>
      <div className="board-stage">
        <canvas
          ref={canvasRef}
          className="board-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      </div>
      {notesOpen && (
        <DraggablePanel
          title={t('notes')}
          onClose={() => setNotesOpen(false)}
          initial={{ x: 160, y: 140, width: 320, height: 260 }}
        >
          <textarea
            className="board-notes-area"
            value={notes}
            placeholder={t('notesPlaceholder')}
            onChange={(e) => onNotesChange(e.target.value)}
          />
        </DraggablePanel>
      )}
    </div>
  );
}
