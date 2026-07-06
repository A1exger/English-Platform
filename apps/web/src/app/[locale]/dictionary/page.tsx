import { setRequestLocale } from 'next-intl/server';
import { Sidebar } from '@/components/Sidebar';
import { DictionaryView } from '@/components/DictionaryView';

export default function DictionaryPage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return (
    <div className="dashboard">
      <Sidebar />
      <DictionaryView />
    </div>
  );
}
