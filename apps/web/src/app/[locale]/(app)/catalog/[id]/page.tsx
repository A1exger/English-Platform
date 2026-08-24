import { setRequestLocale } from 'next-intl/server';
import { CatalogCourseView } from '@/components/CatalogCourseView';

export default function CatalogCoursePage({
  params: { locale, id },
  searchParams
}: {
  params: { locale: string; id: string };
  searchParams: { level?: string };
}) {
  setRequestLocale(locale);
  return <CatalogCourseView courseId={id} initialLevel={searchParams.level} />;
}
