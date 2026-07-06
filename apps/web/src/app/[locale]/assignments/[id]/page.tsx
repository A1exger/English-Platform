import { setRequestLocale } from 'next-intl/server';
import { Sidebar } from '@/components/Sidebar';
import { AssignmentPlayerView } from '@/components/AssignmentPlayerView';

export default function AssignmentPage({
  params: { locale, id }
}: {
  params: { locale: string; id: string };
}) {
  setRequestLocale(locale);
  return (
    <div className="dashboard">
      <Sidebar />
      <AssignmentPlayerView assignmentId={id} />
    </div>
  );
}
