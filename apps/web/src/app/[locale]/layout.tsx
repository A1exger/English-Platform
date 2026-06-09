import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing, isRtl, type Locale } from '@/i18n/routing';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params: { locale }
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!routing.locales.includes(locale as Locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();
  const dir = isRtl(locale) ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <header className="topbar">
            <span className="brand">LinguaDesk</span>
            <LanguageSwitcher />
          </header>
          <main className="container">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
