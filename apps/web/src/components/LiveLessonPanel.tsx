'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';
import { SessionEnvelope, SessionState, useSession } from '@/lib/session';
import { ContentTask, ContentTaskPlayer } from './ContentTaskPlayer';
import { ExerciseState } from './ExerciseRenderer';

const CONTENT_LEVELS = [
  'Beginner',
  'Elementary',
  'PreIntermediate',
  'Intermediate',
  'UpperIntermediate',
  'Advanced'
];

interface PageRow {
  id: string;
  type: string;
  order: number;
  text?: string | null;
  mediaUrl?: string | null;
  tasks: ContentTask[];
}
interface LessonDetail {
  id: string;
  title: string;
  objectives: string[];
  pages: PageRow[];
  wordlist?: { entries: { word: string; translation?: string | null }[] } | null;
  grammarReference?: { title: string; meaning: string; form: string } | null;
}
interface CourseRow {
  id: string;
  title: string;
}
interface TreeLesson {
  id: string;
  title: string;
}

function summarizeState(s: ExerciseState | undefined): string {
  if (!s || Object.keys(s).length === 0) return '—';
  if (typeof s.answer === 'string') return s.answer;
  if (Array.isArray(s.answers)) return (s.answers as string[]).join(', ');
  if (Array.isArray(s.order)) return (s.order as string[]).join(' → ');
  if (typeof s.text === 'string') return s.text.slice(0, 80);
  return JSON.stringify(s).slice(0, 80);
}

// The synchronized material panel used by the live room for both roles.
// Teacher owns navigation + material (nav:goto / session:loadMaterial); the
// student follows synchronously and streams answers (exercise:progress) which
// the teacher sees live. All of this rides the /session envelope channel.
export function LiveLessonPanel({ lessonId }: { lessonId: string }) {
  const t = useTranslations('learn');
  const tr = useTranslations('room');
  const locale = useLocale();

  const [role, setRole] = useState<'teacher' | 'student' | 'other'>('other');
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [pageIdx, setPageIdx] = useState(0); // 0 = Preparation
  const lessonRef = useRef<LessonDetail | null>(null);
  useEffect(() => {
    lessonRef.current = lesson;
  }, [lesson]);

  // Teacher material picker + live read-model of the student's answers.
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [courseId, setCourseId] = useState('');
  const [level, setLevel] = useState('Elementary');
  const [treeLessons, setTreeLessons] = useState<TreeLesson[]>([]);
  const [answers, setAnswers] = useState<Record<string, ExerciseState>>({});

  const isTeacher = role === 'teacher';
  const isStudent = role === 'student';

  const loadLesson = useCallback(
    async (id: string) => {
      const token = tokenStore.get();
      if (!token) return;
      const l = await apiFetch<LessonDetail>(`/content/lessons/${id}`, { token, locale }).catch(
        () => null
      );
      if (l) {
        setLesson(l);
        setPageIdx(0);
        setAnswers({});
      }
    },
    [locale]
  );

  const pageIndexOf = useCallback((pageId?: string): number => {
    if (!pageId || pageId === 'prep') return 0;
    const pages = lessonRef.current?.pages ?? [];
    const i = pages.findIndex((p) => p.id === pageId);
    return i >= 0 ? i + 1 : 0;
  }, []);

  const onEvent = useCallback(
    (e: SessionEnvelope) => {
      if (e.type === 'session:loadMaterial') {
        const p = e.payload as { lessonId?: string };
        if (p.lessonId) void loadLesson(p.lessonId);
      } else if (e.type === 'nav:goto') {
        const p = e.payload as { pageId?: string };
        setPageIdx(pageIndexOf(p.pageId));
      } else if (e.type === 'exercise:progress') {
        const p = e.payload as { taskId?: string; state?: ExerciseState };
        if (p.taskId) setAnswers((prev) => ({ ...prev, [p.taskId as string]: p.state ?? {} }));
      }
    },
    [loadLesson, pageIndexOf]
  );

  const onJoin = useCallback(
    (state: SessionState) => {
      if (state.lessonId) {
        void loadLesson(state.lessonId).then(() => {
          if (state.pageId) setPageIdx(pageIndexOf(state.pageId));
        });
      }
    },
    [loadLesson, pageIndexOf]
  );

  const { emit, joined } = useSession(lessonId, { onEvent, onJoin });

  // Resolve role + (teacher) load the course list for the material picker.
  useEffect(() => {
    const token = tokenStore.get();
    if (!token) return;
    void (async () => {
      const me = await fetchMe(token, locale).catch(() => null);
      if (!me) return;
      const r = me.role === 'tutor' || me.role === 'admin' ? 'teacher' : me.role === 'student' ? 'student' : 'other';
      setRole(r);
      if (r === 'teacher') {
        const catalog = await apiFetch<{ courses: CourseRow[] }[]>('/content/catalog', {
          token,
          locale
        }).catch(() => []);
        const flat = catalog.flatMap((c) => c.courses ?? []);
        setCourses(flat);
        if (flat[0]) setCourseId(flat[0].id);
      }
    })();
  }, [locale]);

  async function loadTree() {
    const token = tokenStore.get();
    if (!token || !courseId) return;
    const tree = await apiFetch<{
      sections: { units: { lessons: TreeLesson[] }[] }[];
    }>(`/content/courses/${courseId}/tree?level=${level}`, { token, locale }).catch(() => null);
    const lessons = tree
      ? tree.sections.flatMap((s) => s.units.flatMap((u) => u.lessons))
      : [];
    setTreeLessons(lessons);
  }

  // Teacher pushes material into the session and loads it locally.
  function loadMaterialLive(id: string) {
    void loadLesson(id);
    emit('session:loadMaterial', { lessonId: id });
  }

  // Teacher-authoritative navigation; students never call this.
  function goTo(idx: number) {
    setPageIdx(idx);
    const pageId = idx === 0 ? 'prep' : lesson?.pages[idx - 1]?.id;
    emit('nav:goto', { pageId });
  }

  const page = pageIdx > 0 ? lesson?.pages[pageIdx - 1] : null;
  const totalSteps = (lesson?.pages.length ?? 0) + 1;

  return (
    <div className="lesson-right-inner live-panel">
      <div className="row-between">
        <strong>{tr('material')}</strong>
        <span className="muted mono-num">{joined ? `● ${tr('live')}` : `○ …`}</span>
      </div>

      {/* Teacher material picker */}
      {isTeacher && (
        <div className="live-picker">
          <div className="inline-form">
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              {courses.length === 0 && <option value="">—</option>}
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              {CONTENT_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <button type="button" onClick={loadTree} disabled={!courseId}>
              {tr('loadLessons')}
            </button>
          </div>
          {treeLessons.length > 0 && (
            <div className="live-lesson-list">
              {treeLessons.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={`ghost${lesson?.id === l.id ? ' active' : ''}`}
                  onClick={() => loadMaterialLive(l.id)}
                >
                  {l.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!lesson ? (
        <p className="note">{isTeacher ? tr('pickMaterial') : tr('waiting')}</p>
      ) : (
        <>
          <h3>{lesson.title}</h3>

          {/* Navigation: teacher drives; student follows (read-only). */}
          <div className="learn-nav">
            {isTeacher && (
              <button type="button" className="ghost" disabled={pageIdx === 0} onClick={() => goTo(pageIdx - 1)}>
                ‹
              </button>
            )}
            <div className="learn-steps">
              <button
                type="button"
                className={`step${pageIdx === 0 ? ' active' : ''}`}
                disabled={!isTeacher}
                onClick={() => isTeacher && goTo(0)}
              >
                {t('preparation')}
              </button>
              {lesson.pages.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  className={`step${pageIdx === i + 1 ? ' active' : ''}`}
                  disabled={!isTeacher}
                  onClick={() => isTeacher && goTo(i + 1)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            {isTeacher && (
              <button
                type="button"
                className="ghost"
                disabled={pageIdx >= totalSteps - 1}
                onClick={() => goTo(pageIdx + 1)}
              >
                ›
              </button>
            )}
          </div>

          {pageIdx === 0 ? (
            <div className="learn-prep">
              {lesson.objectives.length > 0 && (
                <div className="card">
                  <strong>{t('objectives')}</strong>
                  <ul>
                    {lesson.objectives.map((o) => (
                      <li key={o}>{o}</li>
                    ))}
                  </ul>
                </div>
              )}
              {lesson.wordlist && lesson.wordlist.entries.length > 0 && (
                <div className="card">
                  <strong>{t('wordlist')}</strong>
                  <ul className="lesson-list">
                    {lesson.wordlist.entries.map((e) => (
                      <li key={e.word}>
                        <b>{e.word}</b>
                        {e.translation ? <span className="muted"> — {e.translation}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {lesson.grammarReference && (
                <div className="card">
                  <strong>
                    {t('grammar')}: {lesson.grammarReference.title}
                  </strong>
                  <div className="grammar-table">
                    <div className="grammar-row">
                      <span className="grammar-key">{t('meaning')}</span>
                      <span>{lesson.grammarReference.meaning}</span>
                    </div>
                    <div className="grammar-row">
                      <span className="grammar-key">{t('form')}</span>
                      <span>{lesson.grammarReference.form}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            page && (
              <div className="learn-page">
                {page.text && (
                  <div className="card">
                    <p>{page.text}</p>
                  </div>
                )}
                {page.tasks.map((task) =>
                  isStudent ? (
                    <ContentTaskPlayer
                      key={task.id}
                      task={task}
                      onStateChange={(taskId, s) => emit('exercise:progress', { taskId, state: s })}
                    />
                  ) : (
                    <div key={task.id} className="card ex-card">
                      <div className="row-between">
                        <span className={`chip aspect-${task.aspect.toLowerCase()}`}>
                          <span className="dot" />
                          {task.aspect}
                        </span>
                        <span className="muted mono-num">{task.type}</span>
                      </div>
                      {/* Teacher live read-model: the student's current answer. */}
                      <p className="live-answer">
                        <span className="muted">{tr('studentAnswer')}: </span>
                        {summarizeState(answers[task.id])}
                      </p>
                    </div>
                  )
                )}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
