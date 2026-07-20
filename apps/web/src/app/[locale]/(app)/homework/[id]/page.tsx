import { setRequestLocale } from 'next-intl/server';
import { HomeworkDetailView } from '@/components/HomeworkDetailView';

export default function HomeworkDetailPage({
  params: { locale, id }
}: {
  params: { locale: string; id: string };
}) {
  setRequestLocale(locale);
  return <HomeworkDetailView homeworkId={id} />;
}
