import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RegisterForm } from '@/components/RegisterForm';

export default async function RegisterPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const t = await getTranslations('register');

  return (
    <section className="hero">
      <h1>{t('title')}</h1>
      <RegisterForm />
    </section>
  );
}
