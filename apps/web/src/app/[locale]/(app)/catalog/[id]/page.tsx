import { setRequestLocale } from 'next-intl/server';
import { CatalogCourseView } from '@/components/CatalogCourseView';

export default async function CatalogCoursePage(props: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ level?: string }>;
}) {
  const { locale, id } = await props.params;
  const searchParams = await props.searchParams;
  setRequestLocale(locale);
  return <CatalogCourseView courseId={id} initialLevel={searchParams.level} />;
}
