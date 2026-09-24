import { setRequestLocale } from 'next-intl/server';
import { CourseCreateView } from '@/components/CourseCreateView';

export default async function CourseCreatePage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  return <CourseCreateView />;
}
