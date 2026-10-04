import type { Metadata } from 'next';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing, isRtl, type Locale } from '@/i18n/routing';
import { fixedTimeZone } from '@/i18n/request';
import { AppIntlProvider } from '@/components/AppIntlProvider';
import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Browser-tab identity. Without this the tab showed the bare host name and the
// default globe glyph. `template` lets a page set its own title and still carry
// the brand; the SVG mark is served from /public.
export const metadata: Metadata = {
  title: { default: 'English Spark Studio', template: '%s · English Spark Studio' },
  description: 'Online English tutoring — lessons, courses, homework and progress.',
  icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }] }
};

// Root locale layout. Deliberately chrome-free: each route group brings its own
// shell — (app) = left rail + centred content, (auth) = bare centred card,
// (room) = immersive lesson. This is what makes the shell persist across
// navigation instead of remounting on every page.
export default async function LocaleLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { children } = props;
  const { locale } = await props.params;
  if (!routing.locales.includes(locale as Locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();
  // Optional fixed zone (from i18n/request.ts). Undefined when APP_TIMEZONE/TZ is
  // unset — AppIntlProvider then resolves the zone on the client (Settings pick →
  // browser). When set, it forces that one zone for everyone.
  const timeZone = fixedTimeZone();
  const dir = isRtl(locale) ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir}>
      <body>
        {/* Editorial fonts: Source Serif 4 (headings), Inter (UI/body),
            IBM Plex Mono (scores/labels), Cairo (Arabic RTL). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Cairo:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <AppIntlProvider locale={locale} messages={messages} fixedTimeZone={timeZone}>
          {children}
        </AppIntlProvider>
      </body>
    </html>
  );
}
