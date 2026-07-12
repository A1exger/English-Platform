'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { io, Socket } from 'socket.io-client';
import { apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';
import { ExercisePlayer } from './ExercisePlayer';
import { Icon } from './Icon';

function apiOrigin(): string {
  const b = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
  return b.replace(/\/api\/v1\/?$/, '');
}

interface ExRow {
  id: string;
  title: string;
}

// Right half of the lesson: the teacher pushes interactive exercises live and
// the student solves them. New exercises arrive over the existing /board gateway
// via a `board:update` envelope ({type:'exercise'}).
export function LessonExercisePanel({
  lessonId,
  socket: sharedSocket
}: {
  lessonId: string;
  // Sprint 3 #5: the room passes its single /board connection; standalone use
  // opens its own. Same board:update payloads either way.
  socket?: Socket | null;
}) {
  const t = useTranslations('exercises');
  const locale = useLocale();
  const [canPush, setCanPush] = useState(false);
  const [instances, setInstances] = useState<string[]>([]);
  const [library, setLibrary] = useState<ExRow[]>([]);
  const [pick, setPick] = useState('');
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) return;
    (async () => {
      try {
        const me = await fetchMe(token, locale);
        const push = me.role === 'tutor' || me.role === 'admin';
        setCanPush(push);
        const active = await apiFetch<{ id: string }[]>(
          `/lessons/${lessonId}/board/exercises`,
          { token, locale }
        );
        setInstances(active.map((i) => i.id));
        if (push) {
          setLibrary(await apiFetch<ExRow[]>('/exercises', { token, locale }).catch(() => []));
        }
      } catch {
        /* ignore */
      }
    })();

    const socket =
      sharedSocket ??
      io(`${apiOrigin()}/board`, { auth: { token }, transports: ['websocket'], forceNew: true });
    socketRef.current = socket;
    const onUpdate = (msg: { update?: { type?: string; instanceId?: string } }) => {
      const u = msg?.update;
      if (u?.type === 'exercise' && u.instanceId) {
        const id = u.instanceId;
        setInstances((prev) => (prev.includes(id) ? prev : [...prev, id]));
      } else if (u?.type === 'exercise-remove' && u.instanceId) {
        const id = u.instanceId;
        setInstances((prev) => prev.filter((x) => x !== id));
      }
    };
    socket.on('board:update', onUpdate);
    if (!sharedSocket) socket.on('connect', () => socket.emit('board:join', { lessonId }));
    return () => {
      socket.off('board:update', onUpdate);
      if (!sharedSocket) socket.close();
      socketRef.current = null;
    };
  }, [lessonId, locale, sharedSocket]);

  async function push() {
    const token = tokenStore.get();
    if (!token || !pick) return;
    const inst = await apiFetch<{ id: string }>(
      `/lessons/${lessonId}/board/exercises`,
      { method: 'POST', token, locale, body: { exerciseId: pick } }
    );
    setInstances((prev) => [...prev, inst.id]);
    socketRef.current?.emit('board:update', {
      lessonId,
      update: { type: 'exercise', instanceId: inst.id }
    });
    setPick('');
  }

  async function removeInstance(id: string) {
    const token = tokenStore.get();
    if (!token) return;
    await apiFetch(`/lessons/${lessonId}/board/exercises/${id}`, {
      method: 'DELETE',
      token,
      locale
    }).catch(() => undefined);
    setInstances((prev) => prev.filter((x) => x !== id));
    socketRef.current?.emit('board:update', {
      lessonId,
      update: { type: 'exercise-remove', instanceId: id }
    });
  }

  return (
    <div className="lesson-right-inner">
      <strong>{t('live')}</strong>
      {canPush && (
        <div className="inline-form">
          <select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">{t('push')}…</option>
            {library.map((x) => (
              <option key={x.id} value={x.id}>
                {x.title}
              </option>
            ))}
          </select>
          <button type="button" onClick={push} disabled={!pick}>
            {t('push')}
          </button>
        </div>
      )}
      {instances.length === 0 ? (
        <p className="note">{t('none')}</p>
      ) : (
        instances.map((id) => (
          <div key={id} className="lesson-ex-item">
            {canPush && (
              <button type="button" className="ghost ex-remove" onClick={() => removeInstance(id)} aria-label={t('delete')}>
                <Icon name="close" />
              </button>
            )}
            <ExercisePlayer
              instanceId={id}
              onState={(s) =>
                socketRef.current?.emit('board:update', {
                  lessonId,
                  update: { type: 'exercise-state', instanceId: id, state: s }
                })
              }
            />
          </div>
        ))
      )}
    </div>
  );
}
