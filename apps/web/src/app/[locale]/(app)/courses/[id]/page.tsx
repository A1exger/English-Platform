import { setRequestLocale } from 'next-intl/server';
import { CourseBuilderView } from '@/components/CourseBuilderView';

export default async function CourseBuilderPage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);
  return <CourseBuilderView courseId={id} />;
}
