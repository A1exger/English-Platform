import { setRequestLocale } from 'next-intl/server';
import { HomeworkView } from '@/components/HomeworkView';

export default async function HomeworkPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  return <HomeworkView />;
}
