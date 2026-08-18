import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { RegisterForm } from '@/components/RegisterForm';

export default function RegisterPage({
  params: { locale }
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = useTranslations('register');

  return (
    <section className="hero">
      <h1>{t('title')}</h1>
      <RegisterForm />
    </section>
  );
}
