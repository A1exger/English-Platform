'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';
import { CONTENT_LEVELS, LiveLessonApi } from './useLiveLesson';

interface TreeLessonRow {
  id: string;
  title: string;
}
interface Tree {
  sections: { id: string; title: string; units: { id: string; title: string; lessons: TreeLessonRow[] }[] }[];
}
interface PreviewTask {
  id: string;
  type: string;
  aspect: string;
  estimatedMinutes: number;
}
interface PreviewPage {
  id: string;
  type: string;
  title?: string | null;
  text?: string | null;
  tasks: PreviewTask[];
}
interface Preview {
  id: string;
  title: string;
  objectives: string[];
  pages: PreviewPage[];
}

// «Plan» — the teacher's material picker. Pick a course from the list, look
// inside it (levels → lessons → the lesson's pages and tasks) so you can see
// what the material actually is before choosing, then either teach it now or
// tick individual pages / tasks and hand exactly those out as homework.
export function LessonPlanPanel({ live }: { live: LiveLessonApi }) {
  const t = useTranslations('room');
  const tl = useTranslations('learn');
  const tEnum = useTranslations('enum.pageType');
  const locale = useLocale();

  const [openCourse, setOpenCourse] = useState<string>('');
  const [level, setLevel] = useState<string>(live.level);
  const [tree, setTree] = useState<Tree | null>(null);
  const [loadingTree, setLoadingTree] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pickedPages, setPickedPages] = useState<Record<string, boolean>>({});
  const [pickedTasks, setPickedTasks] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [assigned, setAssigned] = useState(false);

  const { courses, studentIds } = live;

  const loadTree = useCallback(
    async (courseId: string, lvl: string) => {
      const token = tokenStore.get();
      if (!token || !courseId) return;
      setLoadingTree(true);
      try {
        setTree(
          await apiFetch<Tree>(`/content/courses/${courseId}/tree?level=${lvl}`, {
            token,
            locale
          }).catch(() => null)
        );
      } finally {
        setLoadingTree(false);
      }
    },
    [locale]
  );

  useEffect(() => {
    if (openCourse) void loadTree(openCourse, level);
  }, [openCourse, level, loadTree]);

  async function openLesson(id: string) {
    const token = tokenStore.get();
    if (!token) return;
    setPreview(await apiFetch<Preview>(`/content/lessons/${id}`, { token, locale }).catch(() => null));
    setPickedPages({});
    setPickedTasks({});
  }

  // Everything ticked, resolved to task ids (a ticked page means all its tasks).
  function selectedTaskIds(): string[] {
    if (!preview) return [];
    const out = new Set<string>();
    for (const p of preview.pages) {
      if (pickedPages[p.id]) p.tasks.forEach((tk) => out.add(tk.id));
    }
    for (const p of preview.pages) {
      for (const tk of p.tasks) if (pickedTasks[tk.id]) out.add(tk.id);
    }
    return [...out];
  }

  async function assignHomework() {
    const token = tokenStore.get();
    const taskIds = selectedTaskIds();
    if (!token || !preview || studentIds.length === 0 || taskIds.length === 0) return;
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
            taskIds,
            topicTag: preview.title
          }
        }).catch(() => undefined);
      }
      setAssigned(true);
      setPickedPages({});
      setPickedTasks({});
      setTimeout(() => setAssigned(false), 3000);
    } finally {
      setBusy(false);
    }
  }

  const levelsOf = (courseId: string) => {
    const c = courses.find((x) => x.id === courseId);
    const own = Array.from(new Set((c?.sections ?? []).map((s) => s.level)));
    return own.length > 0 ? own : CONTENT_LEVELS;
  };
  const lessonsOf = (tr: Tree | null) =>
    (tr?.sections ?? []).flatMap((s) => s.units.flatMap((u) => u.lessons));
  const pickedCount = selectedTaskIds().length;

  return (
    <div className="plan">
      {/* 1. the courses, as a plain list */}
      <div className="plan-block">
        <span className="plan-label">{t('planCourses')}</span>
        {courses.length === 0 ? (
          <p className="note">{t('pickMaterial')}</p>
        ) : (
          <ul className="plan-courses">
            {courses.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`plan-course${openCourse === c.id ? ' open' : ''}`}
                  onClick={() => {
                    setOpenCourse(openCourse === c.id ? '' : c.id);
                    setPreview(null);
                  }}
                >
                  <span className="plan-course-name">{c.title}</span>
                  <span className="plan-caret" aria-hidden>
                    {openCourse === c.id ? '▾' : '▸'}
                  </span>
                </button>

                {/* 2. what's inside the course */}
                {openCourse === c.id && (
                  <div className="plan-inner">
                    <div className="tabs tabs-inline plan-levels" role="tablist">
                      {levelsOf(c.id).map((l) => (
                        <button
                          key={l}
                          type="button"
                          role="tab"
                          aria-selected={level === l}
                          className={level === l ? 'active' : ''}
                          onClick={() => setLevel(l)}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                    {loadingTree ? (
                      <p className="note">…</p>
                    ) : lessonsOf(tree).length === 0 ? (
                      <p className="note">{t('planNoLessons')}</p>
                    ) : (
                      <ul className="plan-lessons">
                        {lessonsOf(tree).map((l) => (
                          <li key={l.id}>
                            <button
                              type="button"
                              className={`plan-lesson${preview?.id === l.id ? ' active' : ''}`}
                              onClick={() => void openLesson(l.id)}
                            >
                              {l.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 3. the chosen lesson: its content, teach it, or pick parts as homework */}
      {preview && (
        <div className="plan-block plan-preview">
          <div className="row-between">
            <strong>{preview.title}</strong>
            <button
              type="button"
              className="cta-primary"
              onClick={() => live.loadMaterialLive(preview.id)}
            >
              {t('planTeach')}
            </button>
          </div>

          {preview.objectives.length > 0 && (
            <ul className="plan-objectives">
              {preview.objectives.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          )}

          <span className="plan-label">{t('planPickHomework')}</span>
          <ul className="plan-pages">
            {preview.pages.map((p, i) => (
              <li key={p.id} className="plan-page">
                <label className="check plan-page-head">
                  <input
                    type="checkbox"
                    checked={!!pickedPages[p.id]}
                    onChange={(e) => setPickedPages({ ...pickedPages, [p.id]: e.target.checked })}
                  />
                  <span className="plan-page-name">
                    {i + 1}. {p.title || tEnum(p.type)}
                  </span>
                  <span className="muted mono-num">{p.tasks.length}</span>
                </label>
                {p.text && <p className="plan-page-text muted">{p.text}</p>}
                {p.tasks.length > 0 && (
                  <ul className="plan-tasks">
                    {p.tasks.map((tk) => (
                      <li key={tk.id}>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={!!pickedPages[p.id] || !!pickedTasks[tk.id]}
                            disabled={!!pickedPages[p.id]}
                            onChange={(e) =>
                              setPickedTasks({ ...pickedTasks, [tk.id]: e.target.checked })
                            }
                          />
                          <span className={`chip aspect-${tk.aspect.toLowerCase()}`}>
                            <span className="dot" />
                            {tk.aspect}
                          </span>
                          <span className="muted">{tk.type}</span>
                          {tk.estimatedMinutes > 0 && (
                            <span className="muted mono-num">
                              {tk.estimatedMinutes} {tl('min')}
                            </span>
                          )}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>

          {studentIds.length > 0 && (
            <button
              type="button"
              className="cta-primary plan-assign"
              disabled={busy || pickedCount === 0}
              onClick={assignHomework}
            >
              {assigned ? t('homeworkAssigned') : `${t('assignHomework')} · ${pickedCount}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
