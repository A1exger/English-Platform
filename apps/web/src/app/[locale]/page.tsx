import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { LoginForm } from '@/components/LoginForm';

// Landing + login. The form is a client component that calls the real API.
export default function HomePage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = useTranslations('common');

  return (
    <section className="hero">
      <h1>{t('appName')}</h1>
      <p className="tagline">{t('tagline')}</p>

      <LoginForm />

      <Link className="link" href="/dashboard">
        {t('dashboard')} →
      </Link>
    </section>
  );
}
