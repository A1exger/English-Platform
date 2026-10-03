import { setRequestLocale } from 'next-intl/server';
import { AdminUsersView } from '@/components/AdminUsersView';

export default async function AdminUsersPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  return <AdminUsersView />;
}
