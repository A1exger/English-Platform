import { setRequestLocale } from 'next-intl/server';
import { ExercisesView } from '@/components/ExercisesView';

export default async function ExercisesPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  return <ExercisesView />;
}
