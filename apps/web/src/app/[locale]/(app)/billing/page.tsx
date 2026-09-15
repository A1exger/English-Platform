import { setRequestLocale } from 'next-intl/server';
import { BillingView } from '@/components/BillingView';

export default async function BillingPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  return <BillingView />;
}
