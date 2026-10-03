import { setRequestLocale } from 'next-intl/server';
import { DictionaryView } from '@/components/DictionaryView';

export default async function DictionaryPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  return <DictionaryView />;
}
