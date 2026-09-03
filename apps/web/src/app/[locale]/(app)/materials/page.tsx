import { setRequestLocale } from 'next-intl/server';
import { MaterialsView } from '@/components/MaterialsView';

export default async function MaterialsPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  return <MaterialsView />;
}
