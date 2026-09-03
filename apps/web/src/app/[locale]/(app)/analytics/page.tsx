import { setRequestLocale } from 'next-intl/server';
import { AnalyticsView } from '@/components/AnalyticsView';

export default async function AnalyticsPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  return <AnalyticsView />;
}
