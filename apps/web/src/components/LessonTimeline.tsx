'use client';

import { useTranslations } from 'next-intl';
import { Icon } from './Icon';
import { LiveLessonApi, LivePageRow } from './useLiveLesson';
import { MaterialPicker, StageBody } from './LiveMaterial';

// «Lesson» tab (Р2) — the lesson as a vertical connected timeline of stages
// (variant 1a). A numbered rail carries done ✓ / current / pending state; the
// current stage renders its interactive content inline (StageBody), done and
// pending stages show a compact preview. The teacher drives which stage is
// current over /session (untouched); tapping a stage navigates for teachers.
interface Stage {
  idx: number; // 0 = Preparation
  page: LivePageRow | null;
  kicker: string;
  minutes: number;
}

export function LessonTimeline({ live }: { live: LiveLessonApi }) {
  const t = useTranslations('learn');
  const tr = useTranslations('room');
  const tEnum = useTranslations('enum.pageType');
  const { lesson, pageIdx, isTeacher, goTo } = live;

  if (!lesson) {
    return (
      <div className="lesson-timeline">
        {isTeacher && <MaterialPicker live={live} />}
        <p className="note">{isTeacher ? tr('pickMaterial') : tr('waiting')}</p>
      </div>
    );
  }

  const pageMinutes = (p: LivePageRow) =>
    p.tasks.reduce((s, tk) => s + (tk.estimatedMinutes || 0), 0);

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

  return (
    <div className="lesson-timeline">
      {isTeacher && <MaterialPicker live={live} />}
      <ol className="tl-stages">
        {stages.map((s) => {
          const state = s.idx < pageIdx ? 'done' : s.idx === pageIdx ? 'current' : 'pending';
          const nav = isTeacher && state !== 'current';
          return (
            <li key={s.idx} className={`tl-stage tl-${state}`}>
              <div className="tl-rail">
                <span className="tl-node">
                  {state === 'done' ? <Icon name="check" /> : s.idx}
                </span>
                {s.idx !== lastIdx && <span className="tl-line" />}
              </div>
              <div
                className={`card tl-card${nav ? ' tl-nav' : ''}`}
                onClick={nav ? () => goTo(s.idx) : undefined}
                role={nav ? 'button' : undefined}
                tabIndex={nav ? 0 : undefined}
                onKeyDown={
                  nav
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          goTo(s.idx);
                        }
                      }
                    : undefined
                }
              >
                <div className="tl-head">
                  <span className="tl-kicker">{s.kicker}</span>
                  {s.minutes > 0 && (
                    <span className="room-tag room-tag-neutral">
                      {s.minutes} {t('min')}
                    </span>
                  )}
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
                {state === 'pending' && s.page?.text && (
                  <p className="tl-preview muted">{s.page.text}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
