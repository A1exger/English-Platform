import { setRequestLocale } from 'next-intl/server';
import { BoardCanvas } from '@/components/BoardCanvas';

export default async function BoardPage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);
  return <BoardCanvas lessonId={id} />;
}
