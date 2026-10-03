'use client';

import { useTranslations } from 'next-intl';

// Every (app) screen opens with its data behind this header (Sprint 4.1): a serif
// title, one accent primary action, and optional search + filter chips. Creation
// forms move out of the main flow and into a <Drawer> opened by the primary.
export interface PageHeaderProps {
  title: string;
  primary?: { label: string; onClick: () => void };
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  filters?: React.ReactNode;
}

export function PageHeader({ title, primary, search, filters }: PageHeaderProps) {
  const tc = useTranslations('common');
  return (
    <div className="page-header">
      <div className="row-between page-head">
        <h2>{title}</h2>
        {primary && (
          <button type="button" onClick={primary.onClick}>
            {primary.label}
          </button>
        )}
      </div>
      {(search || filters) && (
        <div className="page-header-tools">
          {search && (
            <input
              type="search"
              className="search-input"
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder ?? tc('search')}
              aria-label={search.placeholder ?? tc('search')}
            />
          )}
          {filters}
        </div>
      )}
    </div>
  );
}
