import { setRequestLocale } from 'next-intl/server';
import { Sidebar } from '@/components/Sidebar';
import { BillingView } from '@/components/BillingView';

export default function BillingPage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return (
    <div className="dashboard">
      <Sidebar />
      <BillingView />
    </div>
  );
}
