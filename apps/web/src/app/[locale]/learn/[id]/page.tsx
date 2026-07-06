import { setRequestLocale } from 'next-intl/server';
import { Sidebar } from '@/components/Sidebar';
import { LessonPlayerView } from '@/components/LessonPlayerView';

export default function LearnPage({
  params: { locale, id }
}: {
  params: { locale: string; id: string };
}) {
  setRequestLocale(locale);
  return (
    <div className="dashboard">
      <Sidebar />
      <LessonPlayerView lessonId={id} />
    </div>
  );
}
