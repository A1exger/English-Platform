import { setRequestLocale } from 'next-intl/server';
import { Sidebar } from '@/components/Sidebar';

// Persistent app shell for authenticated screens. Rendering the sidebar in this
// route-group layout (instead of per page) keeps it mounted across navigation —
// no remount/refetch flash. The top bar lives in the root [locale] layout so it
// also covers auth + the immersive lesson room; login/register/room stay outside
// this group and therefore render without a sidebar.
export default function AppLayout({
  children,
  params: { locale }
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return (
    <div className="dashboard">
      <Sidebar />
      {children}
    </div>
  );
}
