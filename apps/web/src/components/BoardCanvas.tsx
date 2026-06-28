'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { io, Socket } from 'socket.io-client';
import { Link, useRouter } from '@/i18n/routing';
import { apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';

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

const BG = '#151c33';
const COLORS = ['#e2e8f0', '#2563eb', '#f87171', '#34d399', '#fbbf24'];

function apiOrigin(): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
  return base.replace(/\/api\/v1\/?$/, '');
}

export function BoardCanvas({ lessonId }: { lessonId: string }) {
  const t = useTranslations('board');
  const router = useRouter();

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

  // Connect socket + load the saved snapshot.
  useEffect(() => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
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

    const socket = io(`${apiOrigin()}/board`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => socket.emit('board:join', { lessonId }));
    socket.on('board:joined', () => setStatus('connected'));
    socket.on('board:update', (msg: { update: BoardOp }) => applyOp(msg.update));
    socket.on('board:note', (msg: { notes: string }) => setNotes(msg.notes));

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [lessonId, applyOp, redrawAll, router]);

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

  function clear() {
    applyOp({ type: 'clear' });
    socketRef.current?.emit('board:update', { lessonId, update: { type: 'clear' } });
    setSaved(false);
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
        {notesOpen && (
          <aside className="board-notes">
            <div className="board-notes-head">
              <strong>{t('notes')}</strong>
              <button type="button" onClick={() => setNotesOpen(false)}>
                ✕
              </button>
            </div>
            <textarea
              className="board-notes-area"
              value={notes}
              placeholder={t('notesPlaceholder')}
              onChange={(e) => onNotesChange(e.target.value)}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
