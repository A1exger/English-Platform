import { setRequestLocale } from 'next-intl/server';
import { Sidebar } from '@/components/Sidebar';
import { AdminUsersView } from '@/components/AdminUsersView';

export default function AdminUsersPage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return (
    <div className="dashboard">
      <Sidebar />
      <AdminUsersView />
    </div>
  );
}
