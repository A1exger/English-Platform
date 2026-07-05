import { setRequestLocale } from 'next-intl/server';
import { Sidebar } from '@/components/Sidebar';
import { CourseBuilderView } from '@/components/CourseBuilderView';

export default function CourseBuilderPage({
  params: { locale, id }
}: {
  params: { locale: string; id: string };
}) {
  setRequestLocale(locale);
  return (
    <div className="dashboard">
      <Sidebar />
      <CourseBuilderView courseId={id} />
    </div>
  );
}
