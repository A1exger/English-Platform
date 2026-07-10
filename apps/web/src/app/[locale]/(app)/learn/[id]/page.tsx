import { setRequestLocale } from 'next-intl/server';
import { LessonPlayerView } from '@/components/LessonPlayerView';

export default function LearnPage({
  params: { locale, id }
}: {
  params: { locale: string; id: string };
}) {
  setRequestLocale(locale);
  return <LessonPlayerView lessonId={id} />;
}
