'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';
import { Skeleton } from './Skeleton';
import { PageHeader } from './PageHeader';

interface CourseCard {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  visibility?: string;
}
interface CategoryRow {
  id: string;
  title: string;
  courses: CourseCard[];
}

/**
 * The course library: finished, published courses, the same list for tutors and
 * students. A card leads to the course's own page (/catalog/:id) rather than
 * opening it in place, so a course can be linked to, refreshed and navigated
 * back to like anything else.
 *
 * Deliberately separate from the builder (/courses): that screen is for making
 * courses and is full of edit affordances. This one never edits — it is where a
 * tutor picks something already built and hands it out, and where a student
 * finds what to work through.
 */
export function CourseCatalogView() {
  const t = useTranslations('courses');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const router = useRouter();

  const [cats, setCats] = useState<CategoryRow[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');

  const load = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    try {
      // Students get the same screen, minus the teaching actions on the course
      // page. The catalog endpoint already limits them to published courses
      // shared with them, so the filter below is a no-op on their side.
      const data = await apiFetch<CategoryRow[]>('/content/catalog', { token, locale });
      // Published only: this library is "what is ready to teach", and a draft
      // course is by definition not.
      setCats(
        data
          .map((c) => ({ ...c, courses: c.courses.filter((x) => x.status === 'published') }))
          .filter((c) => c.courses.length > 0)
      );
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

  if (state === 'loading') return <div className="content"><Skeleton lines={5} /></div>;
  if (state === 'error') return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  return (
    <div className="content">
      <PageHeader title={t('catalogTitle')} />

      {cats.length === 0 ? (
        <p className="note">{t('catalogEmpty')}</p>
      ) : (
        cats.map((cat) => (
          <div key={cat.id} className="catalog-group">
            <h3>{cat.title}</h3>
            <div className="catalog-cards">
              {cat.courses.map((c) => (
                <Link key={c.id} className="card catalog-card" href={`/catalog/${c.id}`}>
                  <strong>{c.title}</strong>
                  {c.visibility === 'private' && (
                    <span className="badge-private">{t('visibilityPrivate')}</span>
                  )}
                  {c.description && <span className="muted">{c.description}</span>}
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
