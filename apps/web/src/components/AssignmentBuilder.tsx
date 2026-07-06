'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';

interface StudentRow {
  studentProfileId: string;
  name: string;
}
export interface BuilderTask {
  id: string;
  type: string;
  aspect: string;
}

// Tutor tool: assemble homework from a lesson's tasks (or a subset) and assign
// it to a student. The backend snapshots the chosen tasks (INV-7).
export function AssignmentBuilder({
  lessonId,
  tasks,
  onClose
}: {
  lessonId: string;
  tasks: BuilderTask[];
  onClose: () => void;
}) {
  const t = useTranslations('assignments');
  const locale = useLocale();
  const router = useRouter();

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentId, setStudentId] = useState('');
  const [picked, setPicked] = useState<Record<string, boolean>>(
    Object.fromEntries(tasks.map((t) => [t.id, true]))
  );
  const [topicTag, setTopicTag] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) return;
    apiFetch<StudentRow[]>('/crm/students', { token, locale })
      .then((rows) => {
        setStudents(rows);
        if (rows[0]) setStudentId(rows[0].studentProfileId);
      })
      .catch(() => undefined);
  }, [locale]);

  const chosen = tasks.filter((t) => picked[t.id]);

  async function assign() {
    if (!studentId || chosen.length === 0) return;
    setBusy(true);
    setErr('');
    try {
      const token = tokenStore.get();
      const allPicked = chosen.length === tasks.length;
      const created = await apiFetch<{ id: string }>('/assignments', {
        method: 'POST',
        token,
        locale,
        body: {
          studentProfileId: studentId,
          kind: 'homework',
          // Whole lesson when everything is picked; otherwise a task pool.
          ...(allPicked ? { courseLessonId: lessonId } : { taskIds: chosen.map((t) => t.id) }),
          topicTag: topicTag || undefined,
          dueAt: dueAt || undefined
        }
      });
      router.push(`/assignments/${created.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'error');
      setBusy(false);
    }
  }

  return (
    <div className="card assign-builder">
      <div className="row-between">
        <strong>{t('assignHomework')}</strong>
        <button type="button" className="ghost" onClick={onClose}>
          ✕
        </button>
      </div>

      <label className="field">
        <span>{t('student')}</span>
        <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          {students.length === 0 && <option value="">—</option>}
          {students.map((s) => (
            <option key={s.studentProfileId} value={s.studentProfileId}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>{t('topicTag')}</span>
        <input value={topicTag} onChange={(e) => setTopicTag(e.target.value)} placeholder={t('topicPlaceholder')} />
      </label>

      <label className="field">
        <span>{t('due')}</span>
        <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
      </label>

      <div className="assign-tasks">
        <span className="muted">{t('pickTasks')}</span>
        {tasks.map((task) => (
          <label key={task.id} className="assign-task-row">
            <input
              type="checkbox"
              checked={!!picked[task.id]}
              onChange={(e) => setPicked({ ...picked, [task.id]: e.target.checked })}
            />
            <span className={`chip aspect-${task.aspect.toLowerCase()}`}>
              <span className="dot" />
              {task.aspect}
            </span>
            <span className="muted">{task.type}</span>
          </label>
        ))}
      </div>

      {err && <p className="error">{err}</p>}
      <button type="button" disabled={busy || !studentId || chosen.length === 0} onClick={assign}>
        {busy ? '…' : `${t('assign')} · ${chosen.length}`}
      </button>
    </div>
  );
}
