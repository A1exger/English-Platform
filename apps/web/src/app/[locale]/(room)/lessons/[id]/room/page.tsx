import { setRequestLocale } from 'next-intl/server';
import { LessonRoom } from '@/components/LessonRoom';

export default async function LessonRoomPage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);
  return <LessonRoom lessonId={id} />;
}
