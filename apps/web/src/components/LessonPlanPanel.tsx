'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';
import { LiveLessonApi } from './useLiveLesson';

// «План урока / План домашки» (Э2.2): the lesson as an ordered list of stages
// (= pages). Each stage shows its type, duration (Σ task minutes) and a homework
// badge; clicking one drives the room stepper. The homework view filters to the
// stages marked includedInHomework and lets the teacher assign what wasn't
// covered as homework to the lesson's student(s) in one click.
export function LessonPlanPanel({ live }: { live: LiveLessonApi }) {
  const t = useTranslations('room');
  const tl = useTranslations('learn');
  const locale = useLocale();
  const [mode, setMode] = useState<'lesson' | 'homework'>('lesson');
  const [busy, setBusy] = useState(false);
  const [assigned, setAssigned] = useState(false);
  const { lesson, pageIdx, goTo, isTeacher, studentIds } = live;

  if (!lesson) return <p className="note">{t('pickMaterial')}</p>;

  // Stage 0 is Preparation; the rest are the content pages in order.
  const stages = [
    { idx: 0, name: tl('preparation'), type: 'preparation', minutes: 0, hw: false },
    ...lesson.pages.map((p, i) => ({
      idx: i + 1,
      name: p.title || p.type,
      type: p.type,
      minutes: p.tasks.reduce((s, tk) => s + (tk.estimatedMinutes || 0), 0),
      hw: !!p.includedInHomework
    }))
  ];
  const hwCount = stages.filter((s) => s.hw).length;
  const shown = mode === 'homework' ? stages.filter((s) => s.hw) : stages;

  // Homework = the stages not covered during the lesson (from the current stage
  // onward); if the class reached the end, fall back to the pages flagged
  // includedInHomework (taskIds omitted → the API selects them).
  async function assignHomework() {
    const token = tokenStore.get();
    if (!token || !lesson || studentIds.length === 0) return;
    const uncovered = lesson.pages.slice(pageIdx).flatMap((p) => p.tasks.map((tk) => tk.id));
    setBusy(true);
    try {
      for (const studentProfileId of studentIds) {
        await apiFetch('/assignments', {
          method: 'POST',
          token,
          locale,
          body: {
            studentProfileId,
            kind: 'homework',
            courseLessonId: lesson.id,
            taskIds: uncovered.length ? uncovered : undefined,
            topicTag: lesson.title
          }
        }).catch(() => undefined);
      }
      setAssigned(true);
      setTimeout(() => setAssigned(false), 3000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lesson-plan">
      <div className="tabs tabs-inline">
        <button type="button" className={mode === 'lesson' ? 'active' : ''} onClick={() => setMode('lesson')}>
          {t('planLesson')}
        </button>
        <button type="button" className={mode === 'homework' ? 'active' : ''} onClick={() => setMode('homework')}>
          {t('planHomework')} · {hwCount}
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="note">{t('planEmpty')}</p>
      ) : (
        <ul className="plan-stages">
          {shown.map((s) => (
            <li key={s.idx} className={`plan-stage${s.idx === pageIdx ? ' active' : ''}`}>
              <button type="button" onClick={() => goTo(s.idx)}>
                <span className="plan-stage-num mono-num">{s.idx}</span>
                <span className="plan-stage-main">
                  <span className="plan-stage-name">{s.name}</span>
                  <span className="plan-stage-meta muted">
                    {s.type}
                    {s.minutes ? ` · ${s.minutes} ${tl('min')}` : ''}
                  </span>
                </span>
                {s.hw && <span className="plan-stage-hw">{t('inHomework')}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {mode === 'homework' && isTeacher && studentIds.length > 0 && (
        <button type="button" className="cta-primary plan-assign" disabled={busy} onClick={assignHomework}>
          {assigned ? t('homeworkAssigned') : t('assignHomework')}
        </button>
      )}
    </div>
  );
}
