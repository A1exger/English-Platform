'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { io, Socket } from 'socket.io-client';
import { apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';
import { ExercisePlayer } from './ExercisePlayer';
import type { ExerciseState } from './ExerciseRenderer';
import type { ExerciseResult } from './tasks/types';
import { Icon } from './Icon';

function apiOrigin(): string {
  const b = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
  return b.replace(/\/api\/v1\/?$/, '');
}

interface ExRow {
  id: string;
  type: string;
  title: string;
}

type Role = 'tutor' | 'student' | 'admin' | 'parent';

// The exercise envelope carried inside the existing `board:update` relay
// (§Прил. Б). Drawing ops have no `kind`, so the two coexist on one channel.
interface ExerciseEnvelope {
  kind: 'exercise';
  op: 'add' | 'remove' | 'state' | 'check';
  instanceId: string;
  state?: ExerciseState;
  result?: ExerciseResult;
  byRole?: Role;
}

// Right half of the lesson: the teacher pushes interactive exercises live and
// the student solves them. New exercises + live drags ride the existing /board
// gateway via the `board:update` exercise envelope (§Прил. Б); the gateway is
// untouched.
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
  const [role, setRole] = useState<Role | null>(null);
  const [instances, setInstances] = useState<string[]>([]);
  const [library, setLibrary] = useState<ExRow[]>([]);
  const [pick, setPick] = useState('');
  const [liveState, setLiveState] = useState<Record<string, ExerciseState>>({});
  const [liveResult, setLiveResult] = useState<Record<string, ExerciseResult>>({});
  const socketRef = useRef<Socket | null>(null);
  const canPush = role === 'tutor' || role === 'admin';

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) return;
    (async () => {
      try {
        const me = await fetchMe(token, locale);
        setRole(me.role as Role);
        const push = me.role === 'tutor' || me.role === 'admin';
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
    const onUpdate = (msg: { update?: ExerciseEnvelope }) => {
      const u = msg?.update;
      if (u?.kind !== 'exercise' || !u.instanceId) return;
      const id = u.instanceId;
      if (u.op === 'add') {
        setInstances((prev) => (prev.includes(id) ? prev : [...prev, id]));
      } else if (u.op === 'remove') {
        setInstances((prev) => prev.filter((x) => x !== id));
      } else if (u.op === 'state' && u.state) {
        setLiveState((prev) => ({ ...prev, [id]: u.state as ExerciseState }));
      } else if (u.op === 'check' && u.result) {
        setLiveResult((prev) => ({ ...prev, [id]: u.result as ExerciseResult }));
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

  function emit(update: ExerciseEnvelope) {
    socketRef.current?.emit('board:update', { lessonId, update });
  }

  async function push() {
    const token = tokenStore.get();
    if (!token || !pick) return;
    const inst = await apiFetch<{ id: string }>(
      `/lessons/${lessonId}/board/exercises`,
      { method: 'POST', token, locale, body: { exerciseId: pick } }
    );
    setInstances((prev) => [...prev, inst.id]);
    emit({ kind: 'exercise', op: 'add', instanceId: inst.id, byRole: role ?? undefined });
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
    emit({ kind: 'exercise', op: 'remove', instanceId: id, byRole: role ?? undefined });
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
              incomingState={liveState[id] ?? null}
              incomingResult={liveResult[id] ?? null}
              onState={(s) => emit({ kind: 'exercise', op: 'state', instanceId: id, state: s, byRole: role ?? undefined })}
              onResult={(r) => emit({ kind: 'exercise', op: 'check', instanceId: id, result: r, byRole: role ?? undefined })}
            />
          </div>
        ))
      )}
    </div>
  );
}
