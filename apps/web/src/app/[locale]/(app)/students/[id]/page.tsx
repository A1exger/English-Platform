import { setRequestLocale } from 'next-intl/server';
import { StudentProfileView } from '@/components/StudentProfileView';

export default async function StudentProfilePage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);
  return <StudentProfileView studentProfileId={id} />;
}
