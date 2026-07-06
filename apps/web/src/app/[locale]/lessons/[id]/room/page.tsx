import { setRequestLocale } from 'next-intl/server';
import { LessonRoom } from '@/components/LessonRoom';

export default function LessonRoomPage({
  params: { locale, id }
}: {
  params: { locale: string; id: string };
}) {
  setRequestLocale(locale);
  return <LessonRoom lessonId={id} />;
}
