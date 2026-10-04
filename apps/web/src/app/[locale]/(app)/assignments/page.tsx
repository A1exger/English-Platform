import { setRequestLocale } from 'next-intl/server';
import { AssignmentsView } from '@/components/AssignmentsView';

export default async function AssignmentsPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  return <AssignmentsView />;
}
