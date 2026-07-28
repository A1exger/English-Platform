'use client';

import { KeyboardEvent, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from './Icon';
import { LiveLessonApi, LivePageRow } from './useLiveLesson';
import { MaterialPicker, StageBody } from './LiveMaterial';

// «Lesson» tab (Р2/Р3) — the lesson as its stages, in two views the viewer can
// switch between:
//   • timeline (1a): a numbered connected rail, every stage a card;
//   • focus (1b): done/pending collapse to one-line rows, the current stage
//     expands large.
// A numbered rail carries done ✓ / current / pending state; the current stage
// renders its interactive content inline (StageBody). The teacher drives which
// stage is current over /session (untouched); tapping a stage navigates for
// teachers.
interface Stage {
  idx: number; // 0 = Preparation
  page: LivePageRow | null;
  kicker: string;
  minutes: number;
}

type StageState = 'done' | 'current' | 'pending';

export function LessonTimeline({ live }: { live: LiveLessonApi }) {
  const t = useTranslations('learn');
  const tr = useTranslations('room');
  const tEnum = useTranslations('enum.pageType');
  const { lesson, pageIdx, isTeacher, goTo } = live;
  const [view, setView] = useState<'timeline' | 'focus'>('timeline');

  const pageMinutes = (p: LivePageRow) =>
    p.tasks.reduce((s, tk) => s + (tk.estimatedMinutes || 0), 0);

  const stateOf = (idx: number): StageState =>
    idx < pageIdx ? 'done' : idx === pageIdx ? 'current' : 'pending';

  const navProps = (idx: number, state: StageState) => {
    if (!isTeacher || state === 'current') return {};
    return {
      role: 'button' as const,
      tabIndex: 0,
      onClick: () => goTo(idx),
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          goTo(idx);
        }
      }
    };
  };

  const picker = isTeacher ? <MaterialPicker live={live} /> : null;

  if (!lesson) {
    return (
      <div className="lesson-timeline">
        {picker}
        <p className="note">{isTeacher ? tr('pickMaterial') : tr('waiting')}</p>
      </div>
    );
  }

  const stages: Stage[] = [
    { idx: 0, page: null, kicker: t('preparation'), minutes: 0 },
    ...lesson.pages.map((p, i) => ({
      idx: i + 1,
      page: p,
      kicker: p.title || tEnum(p.type),
      minutes: pageMinutes(p)
    }))
  ];
  const lastIdx = stages.length - 1;

  const durationTag = (m: number) =>
    m > 0 ? (
      <span className="room-tag room-tag-neutral">
        {m} {t('min')}
      </span>
    ) : null;

  return (
    <div className="lesson-timeline">
      {picker}
      <div className="tabs tabs-inline tl-viewtabs" role="tablist">
        <button type="button" className={view === 'timeline' ? 'active' : ''} onClick={() => setView('timeline')}>
          {tr('viewTimeline')}
        </button>
        <button type="button" className={view === 'focus' ? 'active' : ''} onClick={() => setView('focus')}>
          {tr('viewFocus')}
        </button>
      </div>

      {view === 'timeline' ? (
        <ol className="tl-stages">
          {stages.map((s) => {
            const state = stateOf(s.idx);
            const nav = isTeacher && state !== 'current';
            return (
              <li key={s.idx} className={`tl-stage tl-${state}`}>
                <div className="tl-rail">
                  <span className="tl-node">{state === 'done' ? <Icon name="check" /> : s.idx}</span>
                  {s.idx !== lastIdx && <span className="tl-line" />}
                </div>
                <div className={`card tl-card${nav ? ' tl-nav' : ''}`} {...navProps(s.idx, state)}>
                  <div className="tl-head">
                    <span className="tl-kicker">{s.kicker}</span>
                    {durationTag(s.minutes)}
                  </div>
                  {state === 'current' && (
                    <div className="tl-body">
                      <StageBody live={live} />
                    </div>
                  )}
                  {state === 'done' && (
                    <>
                      {s.page?.text && <p className="tl-preview">{s.page.text}</p>}
                      <div className="tl-done">
                        <Icon name="check" /> {tr('stageDone')}
                      </div>
                    </>
                  )}
                  {state === 'pending' && s.page?.text && <p className="tl-preview muted">{s.page.text}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="tl-focus">
          {stages.map((s) => {
            const state = stateOf(s.idx);
            if (state === 'current') {
              return (
                <div key={s.idx} className="card tl-focus-current">
                  <div className="tl-head">
                    <span className="tl-kicker">
                      {s.kicker} · {tr('currentTask')}
                    </span>
                    {durationTag(s.minutes)}
                  </div>
                  <div className="tl-body">
                    <StageBody live={live} />
                  </div>
                </div>
              );
            }
            const nav = isTeacher;
            return (
              <div key={s.idx} className={`tl-row tl-${state}${nav ? ' tl-nav' : ''}`} {...navProps(s.idx, state)}>
                <span className="tl-row-node">{state === 'done' ? <Icon name="check" /> : null}</span>
                <span className="tl-row-kicker">{s.kicker}</span>
                <span className="tl-row-preview">{s.page?.text || ''}</span>
                {s.minutes > 0 && (
                  <span className="tl-row-min mono-num">
                    {s.minutes} {t('min')}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
