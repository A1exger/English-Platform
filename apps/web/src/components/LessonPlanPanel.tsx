'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { LiveLessonApi } from './useLiveLesson';

// «План урока / План домашки» (Э2.2): the lesson as an ordered list of stages
// (= pages). Each stage shows its type, duration (Σ task minutes) and a homework
// badge; clicking one drives the room stepper. The homework view filters to the
// stages marked includedInHomework. Stage names use the page title once set,
// falling back to the type. Scores land here in Э2.3 from the existing
// LessonResult.perAspect.
export function LessonPlanPanel({ live }: { live: LiveLessonApi }) {
  const t = useTranslations('room');
  const tl = useTranslations('learn');
  const [mode, setMode] = useState<'lesson' | 'homework'>('lesson');
  const { lesson, pageIdx, goTo } = live;

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
    </div>
  );
}
