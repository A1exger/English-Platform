import { setRequestLocale } from 'next-intl/server';
import { AdminUsersView } from '@/components/AdminUsersView';

export default function AdminUsersPage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return <AdminUsersView />;
}
