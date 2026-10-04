import { setRequestLocale } from 'next-intl/server';
import { BrandLink } from '@/components/BrandLink';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

// Sign-in / sign-up chrome. Intentionally minimal: no navigation rail, no
// command palette, no account menu — a signed-out visitor has nothing to search
// and nowhere to navigate. Brand + language only.
export default async function AuthLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { children } = props;
  const { locale } = await props.params;
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
