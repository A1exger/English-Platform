import { setRequestLocale } from 'next-intl/server';
import { CoursesView } from '@/components/CoursesView';

export default async function CoursesPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  return <CoursesView />;
}
