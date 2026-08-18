import { setRequestLocale } from 'next-intl/server';
import { DashboardData } from '@/components/DashboardData';

// Server-rendered shell (localized sidebar) + a client component that loads the
// signed-in user's real profile and lessons from the API.
export default function DashboardPage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return <DashboardData />;
}
