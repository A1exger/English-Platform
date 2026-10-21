import { setRequestLocale } from 'next-intl/server';
import { SettingsView } from '@/components/SettingsView';

export default async function SettingsPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  return <SettingsView />;
}
