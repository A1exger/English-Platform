import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ResetPasswordForm } from '@/components/ResetPasswordForm';

// Landing page for the link emailed by "forgot password". The token rides in
// the query string; the form posts it back with the new password.
export default async function ResetPasswordPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const t = await getTranslations('common');

  return (
    <section className="hero">
      <h1>{t('resetTitle')}</h1>
      {/* The form reads the token from the query string; Suspense lets the
          shell prerender statically around it. */}
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </section>
  );
}
