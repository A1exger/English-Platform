import { setRequestLocale } from 'next-intl/server';
import { CourseBuilderView } from '@/components/CourseBuilderView';

export default function CourseBuilderPage({
  params: { locale, id }
}: {
  params: { locale: string; id: string };
}) {
  setRequestLocale(locale);
  return <CourseBuilderView courseId={id} />;
}
