'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';
import { ContentTask, ContentTaskPlayer } from './ContentTaskPlayer';
import { AssignmentBuilder } from './AssignmentBuilder';

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
  courseId: string;
  objectives: string[];
  pages: PageRow[];
  wordlist?: { entries: { word: string; translation?: string | null }[] } | null;
  grammarReference?: { title: string; meaning: string; form: string } | null;
}

// The single lesson player used by every runtime context. Page 0 is the
// Preparation view (objectives + wordlist -> dictionary + grammar reference),
// followed by the lesson pages with their tasks.
export function LessonPlayerView({ lessonId }: { lessonId: string }) {
  const t = useTranslations('learn');
  const tAssign = useTranslations('assignments');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const router = useRouter();

  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [isStudent, setIsStudent] = useState(false);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [pageIdx, setPageIdx] = useState(0); // 0 = Preparation
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [showAssign, setShowAssign] = useState(false);

  const load = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    try {
      const me = await fetchMe(token, locale);
      setIsStudent(me.role === 'student');
      setLesson(await apiFetch<LessonDetail>(`/content/lessons/${lessonId}`, { token, locale }));
      setState('ready');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push('/');
        return;
      }
      setState('error');
    }
  }, [lessonId, locale, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addToDictionary(word: string, translation?: string | null) {
    const token = tokenStore.get();
    if (!token) return;
    await apiFetch('/content/dictionary', {
      method: 'POST',
      token,
      locale,
      body: { word, translation: translation ?? undefined, sourceLessonId: lessonId }
    }).catch(() => undefined);
    setAdded({ ...added, [word]: true });
  }

  if (state === 'loading') return <div className="content"><p className="note">…</p></div>;
  if (state === 'error' || !lesson) return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  const totalSteps = lesson.pages.length + 1; // + Preparation
  const page = pageIdx > 0 ? lesson.pages[pageIdx - 1] : null;
  const allTasks = lesson.pages.flatMap((p) => p.tasks);

  return (
    <div className="content learn">
      <Link className="link" href={`/courses/${lesson.courseId}`}>← {t('back')}</Link>
      <div className="row-between">
        <h2>{lesson.title}</h2>
        {!isStudent && allTasks.length > 0 && (
          <button type="button" onClick={() => setShowAssign((v) => !v)}>
            {tAssign('assignHomework')}
          </button>
        )}
      </div>

      {showAssign && !isStudent && (
        <AssignmentBuilder
          lessonId={lessonId}
          tasks={allTasks.map((tk) => ({ id: tk.id, type: tk.type, aspect: tk.aspect }))}
          onClose={() => setShowAssign(false)}
        />
      )}

      <div className="learn-nav">
        <button type="button" className="ghost" disabled={pageIdx === 0} onClick={() => setPageIdx(pageIdx - 1)}>
          ‹ {t('prev')}
        </button>
        <div className="learn-steps">
          <button
            type="button"
            className={`step${pageIdx === 0 ? ' active' : ''}`}
            onClick={() => setPageIdx(0)}
          >
            {t('preparation')}
          </button>
          {lesson.pages.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={`step${pageIdx === i + 1 ? ' active' : ''}`}
              onClick={() => setPageIdx(i + 1)}
            >
              {i + 1} · {p.type}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ghost"
          disabled={pageIdx >= totalSteps - 1}
          onClick={() => setPageIdx(pageIdx + 1)}
        >
          {t('next')} ›
        </button>
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
                    <span>
                      <b>{e.word}</b>
                      {e.translation ? <span className="muted"> — {e.translation}</span> : null}
                    </span>
                    {isStudent && (
                      <button
                        type="button"
                        className="ghost"
                        disabled={!!added[e.word]}
                        onClick={() => addToDictionary(e.word, e.translation)}
                      >
                        {added[e.word] ? t('added') : `✦ ${t('addToDict')}`}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lesson.grammarReference && (
            <div className="card">
              <strong>{t('grammar')}: {lesson.grammarReference.title}</strong>
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
            {page.tasks.map((task) => (
              <ContentTaskPlayer key={task.id} task={task} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
