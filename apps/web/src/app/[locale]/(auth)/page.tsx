import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { LoginForm } from '@/components/LoginForm';

// Landing + login. The form is a client component that calls the real API.
export default async function HomePage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const t = await getTranslations('common');

  return (
    <section className="hero">
      <h1>{t('appName')}</h1>
      <p className="tagline">{t('tagline')}</p>

      <LoginForm />

      <Link className="link" href="/register">
        {t('createAccount')}
      </Link>
    </section>
  );
}
