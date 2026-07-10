import { setRequestLocale } from 'next-intl/server';
import { ProgressView } from '@/components/ProgressView';

export default function ProgressPage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return <ProgressView />;
}
