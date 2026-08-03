import { setRequestLocale } from 'next-intl/server';
import { AnalyticsView } from '@/components/AnalyticsView';

export default function AnalyticsPage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return <AnalyticsView />;
}
