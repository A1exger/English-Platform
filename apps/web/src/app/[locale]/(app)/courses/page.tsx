import { setRequestLocale } from 'next-intl/server';
import { CoursesView } from '@/components/CoursesView';

export default function CoursesPage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return <CoursesView />;
}
