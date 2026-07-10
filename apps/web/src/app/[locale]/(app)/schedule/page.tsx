import { setRequestLocale } from 'next-intl/server';
import { ScheduleView } from '@/components/ScheduleView';

export default function SchedulePage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return <ScheduleView />;
}
