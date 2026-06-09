import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { DashboardData } from '@/components/DashboardData';

// Server-rendered shell (localized sidebar) + a client component that loads the
// signed-in user's real profile and lessons from the API.
export default function DashboardPage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const nav = useTranslations('nav');

  const items = [
    'overview',
    'students',
    'schedule',
    'materials',
    'homework',
    'billing',
    'analytics',
    'settings'
  ] as const;

  return (
    <div className="dashboard">
      <nav className="sidebar">
        {items.map((k) => (
          <span key={k} className="nav-item">
            {nav(k)}
          </span>
        ))}
      </nav>

      <DashboardData />
    </div>
  );
}
