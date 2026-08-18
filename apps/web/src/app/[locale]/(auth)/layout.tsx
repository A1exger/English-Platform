import { setRequestLocale } from 'next-intl/server';
import { BrandLink } from '@/components/BrandLink';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

// Sign-in / sign-up chrome. Intentionally minimal: no navigation rail, no
// command palette, no account menu — a signed-out visitor has nothing to search
// and nowhere to navigate. Brand + language only.
export default function AuthLayout({
  children,
  params: { locale }
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return (
    <div className="auth-shell">
      <header className="auth-bar">
        <BrandLink />
        <LanguageSwitcher />
      </header>
      <main className="auth-main">{children}</main>
    </div>
  );
}
