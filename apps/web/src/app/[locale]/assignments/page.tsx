import { setRequestLocale } from 'next-intl/server';
import { Sidebar } from '@/components/Sidebar';
import { AssignmentsView } from '@/components/AssignmentsView';

export default function AssignmentsPage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return (
    <div className="dashboard">
      <Sidebar />
      <AssignmentsView />
    </div>
  );
}
