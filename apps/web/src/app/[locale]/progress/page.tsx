import { setRequestLocale } from 'next-intl/server';
import { Sidebar } from '@/components/Sidebar';
import { ProgressView } from '@/components/ProgressView';

export default function ProgressPage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return (
    <div className="dashboard">
      <Sidebar />
      <ProgressView />
    </div>
  );
}
