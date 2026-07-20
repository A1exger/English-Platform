import { setRequestLocale } from 'next-intl/server';
import { MaterialsView } from '@/components/MaterialsView';

export default function MaterialsPage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return <MaterialsView />;
}
