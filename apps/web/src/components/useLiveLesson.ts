'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';
import { SessionEnvelope, SessionState, useSession } from '@/lib/session';
import { ContentTask } from './ContentTaskPlayer';
import { ExerciseState } from './ExerciseRenderer';
import type { PageMediaItem } from './PageMediaBlock';

// Shared live-lesson state for the room. Called ONCE (in LessonRoom) so the
// material hero and the answer rail read the same /session — never two sockets.
// The envelope transport is untouched: this only wraps the existing client.

export const CONTENT_LEVELS = [
  'Beginner',
  'Elementary',
  'PreIntermediate',
  'Intermediate',
  'UpperIntermediate',
  'Advanced'
];

export interface LivePageRow {
  id: string;
  type: string;
  title?: string | null;
  order: number;
  includedInHomework?: boolean;
  text?: string | null;
  mediaUrl?: string | null;
  media?: PageMediaItem[];
  tasks: ContentTask[];
}
export interface LiveLesson {
  id: string;
  title: string;
  level?: string | null;
  objectives: string[];
  pages: LivePageRow[];
  wordlist?: { entries: { word: string; translation?: string | null }[] } | null;
  grammarReference?: { title: string; meaning: string; form: string } | null;
}
export interface CourseRow {
  id: string;
  title: string;
  description?: string | null;
  // Levels this course actually has content for — drives the level chips in the
  // plan panel so a teacher never picks an empty one.
  sections?: { level: string }[];
}
export interface TreeLesson {
  id: string;
  title: string;
}

/** A task the student has checked: the answer plus how it scored. */
export interface LiveResult {
  state?: ExerciseState;
  score?: number;
  correct?: boolean;
  completed: boolean;
}

export interface LiveLessonApi {
  role: 'teacher' | 'student' | 'other';
  isTeacher: boolean;
  isStudent: boolean;
  joined: boolean;
  lesson: LiveLesson | null;
  pageIdx: number;
  page: LivePageRow | null;
  totalSteps: number;
  goTo: (idx: number) => void;
  answers: Record<string, ExerciseState>;
  // Checked answers, streamed by the student on submit so the teacher sees the
  // score instead of a task stuck on "answering".
  results: Record<string, LiveResult>;
  emitProgress: (taskId: string, state: ExerciseState) => void;
  emitResult: (taskId: string, result: LiveResult) => void;
  courses: CourseRow[];
  courseId: string;
  setCourseId: (v: string) => void;
  level: string;
  setLevel: (v: string) => void;
  treeLessons: TreeLesson[];
  loadTree: () => void;
  loadMaterialLive: (id: string) => void;
  // Student profile ids booked on this calendar lesson (for assigning homework).
  studentIds: string[];
}

// Sprint 3 #7: remember the material a teacher last taught in THIS lesson so the
// room reopens ready. (True schedule-attachment would persist on the calendar
// lesson server-side — that needs a backend field, which is out of scope here.)
const materialKey = (lessonId: string) => `room-material:${lessonId}`;

export function useLiveLesson(lessonId: string): LiveLessonApi {
  const locale = useLocale();

  const [role, setRole] = useState<'teacher' | 'student' | 'other'>('other');
  const [lesson, setLesson] = useState<LiveLesson | null>(null);
  const [pageIdx, setPageIdx] = useState(0); // 0 = Preparation
  const lessonRef = useRef<LiveLesson | null>(null);
  useEffect(() => {
    lessonRef.current = lesson;
  }, [lesson]);

  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [courseId, setCourseId] = useState('');
  const [level, setLevel] = useState('Elementary');
  const [treeLessons, setTreeLessons] = useState<TreeLesson[]>([]);
  const [answers, setAnswers] = useState<Record<string, ExerciseState>>({});
  const [results, setResults] = useState<Record<string, LiveResult>>({});
  const [studentIds, setStudentIds] = useState<string[]>([]);

  const isTeacher = role === 'teacher';
  const isStudent = role === 'student';

  const loadLesson = useCallback(
    async (id: string) => {
      const token = tokenStore.get();
      if (!token) return;
      const l = await apiFetch<LiveLesson>(`/content/lessons/${id}`, { token, locale }).catch(
        () => null
      );
      if (l) {
        setLesson(l);
        setPageIdx(0);
        setAnswers({});
        setResults({});
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
      } else if (e.type === 'exercise:result') {
        const p = e.payload as { taskId?: string } & LiveResult;
        if (p.taskId) {
          const taskId = p.taskId;
          if (p.state) setAnswers((prev) => ({ ...prev, [taskId]: p.state as ExerciseState }));
          setResults((prev) => ({
            ...prev,
            [taskId]: { state: p.state, score: p.score, correct: p.correct, completed: true },
          }));
        }
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

  const loadMaterialLive = useCallback(
    (id: string) => {
      void loadLesson(id);
      emit('session:loadMaterial', { lessonId: id });
      try {
        localStorage.setItem(materialKey(lessonId), id);
      } catch {
        /* ignore */
      }
      // Persist the attachment on the calendar lesson (tutor-only endpoint) so
      // it survives a device change and the student reliably opens onto it.
      const token = tokenStore.get();
      if (token) {
        void apiFetch(`/lessons/${lessonId}`, {
          method: 'PATCH',
          token,
          locale,
          body: { materialLessonId: id }
        }).catch(() => undefined);
      }
    },
    [loadLesson, emit, lessonId, locale]
  );

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) return;
    void (async () => {
      const me = await fetchMe(token, locale).catch(() => null);
      if (!me) return;
      const r =
        me.role === 'tutor' || me.role === 'admin'
          ? 'teacher'
          : me.role === 'student'
            ? 'student'
            : 'other';
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
      if (r === 'other') return;
      // Open onto the material attached to this calendar lesson (server-side, so
      // it survives a device change). Teachers fall back to the last material
      // they taught here (localStorage). Guarded by lessonRef so this only fills
      // in material — it never overrides one an active /session already pushed.
      const cal = await apiFetch<{
        materialLessonId?: string | null;
        participants?: { studentProfileId: string }[];
      }>(`/lessons/${lessonId}`, { token, locale }).catch(() => null);
      setStudentIds((cal?.participants ?? []).map((p) => p.studentProfileId));
      let attached = cal?.materialLessonId ?? null;
      if (!attached && r === 'teacher') {
        try {
          attached = localStorage.getItem(materialKey(lessonId));
        } catch {
          /* ignore */
        }
      }
      if (attached && !lessonRef.current) {
        if (r === 'teacher') loadMaterialLive(attached);
        else void loadLesson(attached);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, lessonId]);

  const loadTree = useCallback(async () => {
    const token = tokenStore.get();
    if (!token || !courseId) return;
    const tree = await apiFetch<{ sections: { units: { lessons: TreeLesson[] }[] }[] }>(
      `/content/courses/${courseId}/tree?level=${level}`,
      { token, locale }
    ).catch(() => null);
    setTreeLessons(tree ? tree.sections.flatMap((s) => s.units.flatMap((u) => u.lessons)) : []);
  }, [courseId, level, locale]);

  const goTo = useCallback(
    (idx: number) => {
      setPageIdx(idx);
      const pageId = idx === 0 ? 'prep' : lessonRef.current?.pages[idx - 1]?.id;
      emit('nav:goto', { pageId });
    },
    [emit]
  );

  const emitProgress = useCallback(
    (taskId: string, state: ExerciseState) => emit('exercise:progress', { taskId, state }),
    [emit]
  );

  const emitResult = useCallback(
    (taskId: string, result: LiveResult) => {
      // Record it locally too: the socket only relays to the OTHER side, so a
      // student would otherwise never see their own answers in the progress
      // gauge. The teacher fills the same map from exercise:result.
      setResults((prev) => ({ ...prev, [taskId]: result }));
      emit('exercise:result', { taskId, ...result });
    },
    [emit]
  );

  const page = pageIdx > 0 ? (lesson?.pages[pageIdx - 1] ?? null) : null;
  const totalSteps = (lesson?.pages.length ?? 0) + 1;

  return {
    role,
    isTeacher,
    isStudent,
    joined,
    lesson,
    pageIdx,
    page,
    totalSteps,
    goTo,
    answers,
    results,
    emitProgress,
    emitResult,
    courses,
    courseId,
    setCourseId,
    level,
    setLevel,
    treeLessons,
    loadTree,
    loadMaterialLive,
    studentIds
  };
}
