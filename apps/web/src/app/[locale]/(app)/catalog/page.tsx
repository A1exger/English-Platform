import { setRequestLocale } from 'next-intl/server';
import { CourseCatalogView } from '@/components/CourseCatalogView';

export default function CatalogPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  return <CourseCatalogView />;
}
