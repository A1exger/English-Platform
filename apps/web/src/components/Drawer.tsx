'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from './Icon';

// Side panel where every creation form lives (Sprint 2.1 builds it; Sprint 4.1
// reuses it). Closes on overlay click or Escape. RTL-safe (slides from the
// inline-end edge via logical properties in globals.css).
export function Drawer({
  open,
  onClose,
  title,
  children
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const tc = useTranslations('common');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="drawer-overlay" onMouseDown={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <strong>{title}</strong>
          <button type="button" className="ghost" onClick={onClose} aria-label={tc('close')}>
            <Icon name="close" />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}
