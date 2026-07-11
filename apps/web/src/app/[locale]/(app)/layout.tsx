import { setRequestLocale } from 'next-intl/server';
import { Sidebar } from '@/components/Sidebar';
import { ToastProvider } from '@/components/Toast';

// The authenticated shell. Mounts ONCE for every route in this group, so the
// rail no longer remounts (and no longer refetches the profile) on navigation.
// Layout: fixed left rail | main, whose content sits in a centred measure.
export default function AppLayout({
  children,
  params: { locale }
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return (
    <ToastProvider>
      <div className="app-shell">
        <Sidebar />
        <main className="app-main">
          <div className="measure">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
