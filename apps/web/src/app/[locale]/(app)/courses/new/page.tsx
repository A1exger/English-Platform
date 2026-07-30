import { setRequestLocale } from 'next-intl/server';
import { CourseCreateView } from '@/components/CourseCreateView';

export default function CourseCreatePage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return <CourseCreateView />;
}
