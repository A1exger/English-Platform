import { setRequestLocale } from 'next-intl/server';
import { BoardCanvas } from '@/components/BoardCanvas';

export default function BoardPage({
  params: { locale, id }
}: {
  params: { locale: string; id: string };
}) {
  setRequestLocale(locale);
  return <BoardCanvas lessonId={id} />;
}
