'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, apiFetch, apiUpload, fileUrl } from '@/lib/api';
import { tokenStore } from '@/lib/auth';
import { PageHeader } from './PageHeader';
import { GenerateCourseForm } from './GenerateCourseForm';

interface Category {
  id: string;
  title: string;
}

// Dedicated "create a course" page (moved out of the courses-list drawer) so
// authoring a course — category, title, cover, or AI generation — has room.
export function CourseCreateView() {
  const t = useTranslations('courses');
  const locale = useLocale();
  const router = useRouter();

  const [cats, setCats] = useState<Category[]>([]);
  const [catTitle, setCatTitle] = useState('');
  const [course, setCourse] = useState({ categoryId: '', title: '', description: '', coverUrl: '' });
  const [busy, setBusy] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);

  const loadCats = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    try {
      const data = await apiFetch<Category[]>('/content/catalog', { token, locale });
      setCats(data.map((c) => ({ id: c.id, title: c.title })));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.push('/');
    }
  }, [locale, router]);

  useEffect(() => {
    void loadCats();
  }, [loadCats]);

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    const token = tokenStore.get();
    if (!token || !catTitle.trim()) return;
    setBusy(true);
    try {
      const created = await apiFetch<{ id?: string }>('/content/categories', {
        method: 'POST',
        token,
        locale,
        body: { title: catTitle.trim() }
      });
      setCatTitle('');
      await loadCats();
      if (created?.id) setCourse((prev) => ({ ...prev, categoryId: created.id! }));
    } finally {
      setBusy(false);
    }
  }

  async function uploadCover(file: File) {
    const token = tokenStore.get();
    if (!token) return;
    setCoverBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiUpload<{ url: string }>('/materials/upload', fd, { token, locale });
      setCourse((prev) => ({ ...prev, coverUrl: res.url }));
    } catch {
      /* the cover is optional */
    } finally {
      setCoverBusy(false);
    }
  }

  async function addCourse(e: FormEvent) {
    e.preventDefault();
    const token = tokenStore.get();
    if (!token || !course.categoryId) return;
    setBusy(true);
    try {
      const created = await apiFetch<{ id?: string }>('/content/courses', {
        method: 'POST',
        token,
        locale,
        body: {
          categoryId: course.categoryId,
          title: course.title,
          description: course.description || undefined,
          coverUrl: course.coverUrl || undefined
        }
      });
      // Land in the new course so the author can start adding lessons right away.
      router.push(created?.id ? `/courses/${created.id}` : '/courses');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content">
      <Link href="/courses" className="link">← {t('back')}</Link>
      <PageHeader title={t('newCourse')} />

      <div className="two-col" style={{ alignItems: 'start' }}>
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
          <label>
            {t('description')}
            <textarea value={course.description} onChange={(e) => setCourse({ ...course, description: e.target.value })} />
          </label>
          <label>
            {t('cover')}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])}
            />
          </label>
          {course.coverUrl && (
            <div className="cover-preview" style={{ backgroundImage: `url(${fileUrl(course.coverUrl)})` }} aria-hidden />
          )}
          <button type="submit" disabled={busy || coverBusy || !course.categoryId}>
            {coverBusy ? t('creating') : t('create')}
          </button>
        </form>

        <div className="card">
          <form className="form-grid" onSubmit={addCategory}>
            <strong>{t('newCategory')}</strong>
            <label>
              {t('courseTitle')}
              <input required value={catTitle} onChange={(e) => setCatTitle(e.target.value)} />
            </label>
            <button type="submit" disabled={busy}>{t('create')}</button>
          </form>
          <GenerateCourseForm onDone={() => router.push('/courses')} />
        </div>
      </div>
    </div>
  );
}
