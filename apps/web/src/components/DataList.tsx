'use client';

import { ReactNode, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { EmptyState, EmptyStateAction } from './EmptyState';

function cmp(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

export interface SortOption<T> {
  key: string;
  label: string;
  value: (row: T) => string | number;
  dir?: 'asc' | 'desc';
}

// Sprint 5: hairline list with search, an optional sort control, an optional
// screen-specific toolbar (filter chips/tabs live there), and pagination. The
// caller renders each row; the list owns search/sort/paging and the empty state.
export function DataList<T>({
  items,
  getKey,
  renderRow,
  searchText,
  searchPlaceholder,
  sorts,
  toolbar,
  filterFn,
  pageSize = 20,
  listClassName = 'lesson-list',
  rowClassName,
  empty
}: {
  items: T[];
  getKey: (row: T) => string;
  renderRow: (row: T) => ReactNode;
  searchText: (row: T) => string;
  searchPlaceholder?: string;
  sorts?: SortOption<T>[];
  toolbar?: ReactNode;
  filterFn?: (row: T) => boolean;
  pageSize?: number;
  listClassName?: string;
  rowClassName?: string;
  empty: { title: string; body?: string; action?: EmptyStateAction };
}) {
  const tc = useTranslations('common');
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState<string>(sorts?.[0]?.key ?? '');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter(
      (r) =>
        (filterFn ? filterFn(r) : true) &&
        (needle ? searchText(r).toLowerCase().includes(needle) : true)
    );
  }, [items, q, searchText, filterFn]);

  const sorted = useMemo(() => {
    const opt = sorts?.find((s) => s.key === sortKey);
    if (!opt) return filtered;
    const arr = [...filtered].sort((a, b) => cmp(opt.value(a), opt.value(b)));
    return opt.dir === 'desc' ? arr.reverse() : arr;
  }, [filtered, sorts, sortKey]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const shown = sorted.slice(current * pageSize, current * pageSize + pageSize);

  if (items.length === 0) return <EmptyState {...empty} />;

  return (
    <div className="data-view">
      <div className="data-toolbar">
        <input
          type="search"
          className="search-input"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          placeholder={searchPlaceholder ?? tc('search')}
          aria-label={searchPlaceholder ?? tc('search')}
        />
        {sorts && sorts.length > 0 && (
          <select
            className="data-filter"
            value={sortKey}
            aria-label={tc('sortBy')}
            onChange={(e) => {
              setSortKey(e.target.value);
              setPage(0);
            }}
          >
            {sorts.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        )}
        {toolbar}
      </div>

      {shown.length === 0 ? (
        <p className="note">{tc('noResults')}</p>
      ) : (
        <ul className={listClassName}>
          {shown.map((r) => (
            <li key={getKey(r)} className={rowClassName}>{renderRow(r)}</li>
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <div className="data-pager">
          <button type="button" className="ghost" disabled={current === 0} onClick={() => setPage(current - 1)}>
            ‹
          </button>
          <span className="mono-num muted">{current + 1} / {pageCount}</span>
          <button
            type="button"
            className="ghost"
            disabled={current >= pageCount - 1}
            onClick={() => setPage(current + 1)}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
