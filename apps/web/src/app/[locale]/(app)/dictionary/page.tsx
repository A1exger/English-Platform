import { setRequestLocale } from 'next-intl/server';
import { DictionaryView } from '@/components/DictionaryView';

export default function DictionaryPage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return <DictionaryView />;
}
