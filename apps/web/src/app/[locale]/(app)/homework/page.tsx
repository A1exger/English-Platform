import { setRequestLocale } from 'next-intl/server';
import { HomeworkView } from '@/components/HomeworkView';

export default function HomeworkPage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return <HomeworkView />;
}
