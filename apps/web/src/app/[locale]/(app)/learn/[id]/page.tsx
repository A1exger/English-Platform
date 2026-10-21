import { setRequestLocale } from 'next-intl/server';
import { LessonPlayerView } from '@/components/LessonPlayerView';

export default async function LearnPage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);
  return <LessonPlayerView lessonId={id} />;
}
