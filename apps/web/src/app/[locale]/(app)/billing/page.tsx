import { setRequestLocale } from 'next-intl/server';
import { BillingView } from '@/components/BillingView';

export default function BillingPage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return <BillingView />;
}
