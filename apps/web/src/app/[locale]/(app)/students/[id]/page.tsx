import { setRequestLocale } from 'next-intl/server';
import { StudentProfileView } from '@/components/StudentProfileView';

export default function StudentProfilePage({
  params: { locale, id }
}: {
  params: { locale: string; id: string };
}) {
  setRequestLocale(locale);
  return <StudentProfileView studentProfileId={id} />;
}
