import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { ToastProvider } from '@/components/Toast';
import { IdleGuard } from '@/components/IdleGuard';

// Immersive lesson shell: no rail (the lesson is the whole screen), just a slim
// bar so there is always a way back out.
export default async function RoomLayout({
  children,
  params: { locale }
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('room');
  return (
    <ToastProvider>
      <IdleGuard />
      <div className="room-shell">
        <header className="room-bar">
          <Link href="/dashboard" className="room-exit">
            ← {t('exit')}
          </Link>
        </header>
        {children}
      </div>
    </ToastProvider>
  );
}
