import { setRequestLocale } from 'next-intl/server';
import { CourseCatalogView } from '@/components/CourseCatalogView';

export default async function CatalogPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  return <CourseCatalogView />;
}
