import { setRequestLocale } from 'next-intl/server';
import { AssignmentPlayerView } from '@/components/AssignmentPlayerView';

export default async function AssignmentPage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);
  return <AssignmentPlayerView assignmentId={id} />;
}
