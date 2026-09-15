import { setRequestLocale } from 'next-intl/server';
import { DashboardData } from '@/components/DashboardData';

// Server-rendered shell (localized sidebar) + a client component that loads the
// signed-in user's real profile and lessons from the API.
export default async function DashboardPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  return <DashboardData />;
}
