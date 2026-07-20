'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';
import { SessionEnvelope, SessionState, useSession } from '@/lib/session';
import { ContentTask } from './ContentTaskPlayer';
import { ExerciseState } from './ExerciseRenderer';

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
  order: number;
  text?: string | null;
  mediaUrl?: string | null;
  tasks: ContentTask[];
}
export interface LiveLesson {
  id: string;
  title: string;
  objectives: string[];
  pages: LivePageRow[];
  wordlist?: { entries: { word: string; translation?: string | null }[] } | null;
  grammarReference?: { title: string; meaning: string; form: string } | null;
}
export interface CourseRow {
  id: string;
  title: string;
}
export interface TreeLesson {
  id: string;
  title: string;
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
  emitProgress: (taskId: string, state: ExerciseState) => void;
  courses: CourseRow[];
  courseId: string;
  setCourseId: (v: string) => void;
  level: string;
  setLevel: (v: string) => void;
  treeLessons: TreeLesson[];
  loadTree: () => void;
  loadMaterialLive: (id: string) => void;
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

  const loadMaterialLive = useCallback(
    (id: string) => {
      void loadLesson(id);
      emit('session:loadMaterial', { lessonId: id });
      try {
        localStorage.setItem(materialKey(lessonId), id);
      } catch {
        /* ignore */
      }
    },
    [loadLesson, emit, lessonId]
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
        // Reopen ready: push the remembered material for this lesson (#7).
        try {
          const remembered = localStorage.getItem(materialKey(lessonId));
          if (remembered) loadMaterialLive(remembered);
        } catch {
          /* ignore */
        }
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
    emitProgress,
    courses,
    courseId,
    setCourseId,
    level,
    setLevel,
    treeLessons,
    loadTree,
    loadMaterialLive
  };
}
