import { setRequestLocale } from 'next-intl/server';
import { Sidebar } from '@/components/Sidebar';
import { AnalyticsView } from '@/components/AnalyticsView';

export default function AnalyticsPage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return (
    <div className="dashboard">
      <Sidebar />
      <AnalyticsView />
    </div>
  );
}
