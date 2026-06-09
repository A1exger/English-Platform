import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';

// Лендинг + форма входа (демо-каркас, без реальной аутентификации).
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

      <form className="card login" action={`/${locale}/dashboard`}>
        <label>
          {t('email')}
          <input type="email" name="email" placeholder="you@example.com" />
        </label>
        <label>
          {t('password')}
          <input type="password" name="password" placeholder="••••••••" />
        </label>
        <button type="submit">{t('signIn')}</button>
      </form>

      <Link className="link" href="/dashboard">
        {t('dashboard')} →
      </Link>
    </section>
  );
}
