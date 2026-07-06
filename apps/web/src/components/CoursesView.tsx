'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';

interface Course {
  id: string;
  title: string;
  status: string;
  selfStudy: boolean;
  isNew: boolean;
}
interface Category {
  id: string;
  title: string;
  courses: Course[];
}

export function CoursesView() {
  const t = useTranslations('courses');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const router = useRouter();

  const [cats, setCats] = useState<Category[]>([]);
  const [canAuthor, setCanAuthor] = useState(false);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [busy, setBusy] = useState(false);
  const [catTitle, setCatTitle] = useState('');
  const [course, setCourse] = useState({ categoryId: '', title: '' });

  const load = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    try {
      const me = await fetchMe(token, locale);
      setCanAuthor(me.role === 'tutor' || me.role === 'admin');
      setCats(await apiFetch<Category[]>('/content/catalog', { token, locale }));
      setState('ready');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push('/');
        return;
      }
      setState('error');
    }
  }, [locale, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    try {
      await apiFetch('/content/categories', { method: 'POST', token, locale, body: { title: catTitle } });
      setCatTitle('');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function addCourse(e: FormEvent) {
    e.preventDefault();
    const token = tokenStore.get();
    if (!token || !course.categoryId) return;
    setBusy(true);
    try {
      await apiFetch('/content/courses', { method: 'POST', token, locale, body: course });
      setCourse({ categoryId: '', title: '' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish(c: Course) {
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    try {
      await apiFetch(`/content/courses/${c.id}`, {
        method: 'PATCH',
        token,
        locale,
        body: { status: c.status === 'published' ? 'draft' : 'published' }
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return <div className="content"><p className="note">…</p></div>;
  if (state === 'error') return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  return (
    <div className="content">
      <h2>{t('title')}</h2>

      {canAuthor && (
        <div className="two-col">
          <form className="card form-grid" onSubmit={addCategory}>
            <strong>{t('newCategory')}</strong>
            <label>
              {t('courseTitle')}
              <input required value={catTitle} onChange={(e) => setCatTitle(e.target.value)} />
            </label>
            <button type="submit" disabled={busy}>{t('create')}</button>
          </form>

          <form className="card form-grid" onSubmit={addCourse}>
            <strong>{t('newCourse')}</strong>
            <label>
              {t('category')}
              <select
                required
                value={course.categoryId}
                onChange={(e) => setCourse({ ...course, categoryId: e.target.value })}
              >
                <option value="" disabled />
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </label>
            <label>
              {t('courseTitle')}
              <input required value={course.title} onChange={(e) => setCourse({ ...course, title: e.target.value })} />
            </label>
            <button type="submit" disabled={busy}>{t('create')}</button>
          </form>
        </div>
      )}

      {cats.length === 0 ? (
        <div className="card"><p className="note">{t('empty')}</p></div>
      ) : (
        cats.map((cat) => (
          <div key={cat.id} className="card" style={{ marginTop: 16 }}>
            <strong>{cat.title}</strong>
            {cat.courses.length === 0 ? (
              <p className="note">{t('empty')}</p>
            ) : (
              <ul className="lesson-list">
                {cat.courses.map((c) => (
                  <li key={c.id}>
                    <span>
                      {c.title}{' '}
                      <span className={`status-pill ${c.status}`}>{t(c.status as 'draft' | 'published')}</span>
                    </span>
                    <span className="row-actions">
                      {canAuthor && (
                        <button type="button" className="ghost" disabled={busy} onClick={() => togglePublish(c)}>
                          {c.status === 'published' ? t('unpublish') : t('publish')}
                        </button>
                      )}
                      <Link className="link" href={`/courses/${c.id}`}>
                        {t('open')} →
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))
      )}
    </div>
  );
}
