import { setRequestLocale } from 'next-intl/server';
import { StudentsView } from '@/components/StudentsView';

export default function StudentsPage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return <StudentsView />;
}
