import { setRequestLocale } from 'next-intl/server';
import { HomeworkDetailView } from '@/components/HomeworkDetailView';

export default async function HomeworkDetailPage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);
  return <HomeworkDetailView homeworkId={id} />;
}
