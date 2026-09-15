import { setRequestLocale } from 'next-intl/server';
import { ProgressView } from '@/components/ProgressView';

export default async function ProgressPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  return <ProgressView />;
}
