import { setRequestLocale } from 'next-intl/server';
import { WordBankView } from '@/components/WordBankView';

export default async function WordBankPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  return <WordBankView />;
}
