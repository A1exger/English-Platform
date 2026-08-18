import { setRequestLocale } from 'next-intl/server';
import { AssignmentPlayerView } from '@/components/AssignmentPlayerView';

export default function AssignmentPage({
  params: { locale, id }
}: {
  params: { locale: string; id: string };
}) {
  setRequestLocale(locale);
  return <AssignmentPlayerView assignmentId={id} />;
}
