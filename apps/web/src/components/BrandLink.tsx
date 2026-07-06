'use client';

import { useEffect, useState } from 'react';
import { Link, usePathname } from '@/i18n/routing';
import { tokenStore } from '@/lib/auth';

// Clicking the logo goes to the dashboard when signed in, otherwise to the
// login page. Re-checks on navigation.
export function BrandLink() {
  const pathname = usePathname();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(Boolean(tokenStore.get()));
  }, [pathname]);

  return (
    <Link
      href={authed ? '/dashboard' : '/'}
      className="brand"
      aria-label="English Spark Studio — home"
    >
      English Spark Studio
    </Link>
  );
}
