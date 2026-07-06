'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { tokenStore } from '@/lib/auth';
import { LanguageSwitcher } from './LanguageSwitcher';

// Header controls shown on every page: language switcher + a Log out button
// that appears whenever the user is signed in. Re-checks auth on navigation so
// it updates right after login/logout without a full reload.
export function HeaderActions() {
  const tApp = useTranslations('app');
  const router = useRouter();
  const pathname = usePathname();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(Boolean(tokenStore.get()));
  }, [pathname]);

  return (
    <div className="header-actions">
      <LanguageSwitcher />
      {authed && (
        <button
          type="button"
          className="logout-btn"
          onClick={() => {
            tokenStore.clear();
            setAuthed(false);
            router.push('/');
          }}
        >
          {tApp('logout')}
        </button>
      )}
    </div>
  );
}
