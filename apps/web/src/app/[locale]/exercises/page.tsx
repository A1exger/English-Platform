import { setRequestLocale } from 'next-intl/server';
import { Sidebar } from '@/components/Sidebar';
import { ExercisesView } from '@/components/ExercisesView';

export default function ExercisesPage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return (
    <div className="dashboard">
      <Sidebar />
      <ExercisesView />
    </div>
  );
}
