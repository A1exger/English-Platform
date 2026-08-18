import { setRequestLocale } from 'next-intl/server';
import { WordBankView } from '@/components/WordBankView';

export default function WordBankPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  return <WordBankView />;
}
