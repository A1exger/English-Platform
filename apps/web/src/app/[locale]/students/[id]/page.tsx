import { setRequestLocale } from 'next-intl/server';
import { Sidebar } from '@/components/Sidebar';
import { StudentProfileView } from '@/components/StudentProfileView';

export default function StudentProfilePage({
  params: { locale, id }
}: {
  params: { locale: string; id: string };
}) {
  setRequestLocale(locale);
  return (
    <div className="dashboard">
      <Sidebar />
      <StudentProfileView studentProfileId={id} />
    </div>
  );
}
