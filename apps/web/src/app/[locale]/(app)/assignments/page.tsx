import { setRequestLocale } from 'next-intl/server';
import { AssignmentsView } from '@/components/AssignmentsView';

export default function AssignmentsPage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return <AssignmentsView />;
}
