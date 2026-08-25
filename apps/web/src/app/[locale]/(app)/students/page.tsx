import { setRequestLocale } from 'next-intl/server';
import { StudentsView } from '@/components/StudentsView';

export default async function StudentsPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  return <StudentsView />;
}
