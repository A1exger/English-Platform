import { useTranslations, useFormatter } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';

// Демо-дашборд репетитора: показывает локализацию текста, чисел и валюты,
// а также ключевой бизнес-инвариант (язык — у каждого свой).
export default function DashboardPage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = useTranslations('dashboard');
  const nav = useTranslations('nav');
  const format = useFormatter();

  const metrics = [
    { key: 'lessonsToday', value: format.number(5) },
    {
      key: 'monthlyRevenue',
      value: format.number(1240, { style: 'currency', currency: 'EUR' })
    },
    { key: 'activeStudents', value: format.number(18) },
    { key: 'attendance', value: format.number(0.94, { style: 'percent' }) }
  ] as const;

  return (
    <div className="dashboard">
      <nav className="sidebar">
        {(
          ['overview', 'students', 'schedule', 'materials', 'homework', 'billing', 'analytics', 'settings'] as const
        ).map((k) => (
          <span key={k} className="nav-item">
            {nav(k)}
          </span>
        ))}
      </nav>

      <div className="content">
        <h2>{t('greeting', { name: 'Anna' })}</h2>

        <div className="metrics">
          {metrics.map((m) => (
            <div key={m.key} className="metric card">
              <span className="metric-value">{m.value}</span>
              <span className="metric-label">{t(m.key)}</span>
            </div>
          ))}
        </div>

        <div className="card next-lesson">
          <strong>{t('nextLesson')}</strong>
          <button type="button">{t('joinLesson')}</button>
        </div>

        <p className="note">{t('everyoneOwnLanguage')}</p>
      </div>
    </div>
  );
}
