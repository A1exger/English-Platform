import { setRequestLocale } from 'next-intl/server';
import { Sidebar } from '@/components/Sidebar';
import { ToastProvider } from '@/components/Toast';
import { IdleGuard } from '@/components/IdleGuard';

// The authenticated shell. Mounts ONCE for every route in this group, so the
// rail no longer remounts (and no longer refetches the profile) on navigation.
// Layout: fixed left rail | main, whose content sits in a centred measure.
export default async function AppLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { children } = props;
  const { locale } = await props.params;
  setRequestLocale(locale);
  return (
    <ToastProvider>
      <IdleGuard />
      <div className="app-shell">
        <Sidebar />
        <main className="app-main">
          <div className="measure">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
