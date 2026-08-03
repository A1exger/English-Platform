import { setRequestLocale } from 'next-intl/server';
import { ExercisesView } from '@/components/ExercisesView';

export default function ExercisesPage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return <ExercisesView />;
}
