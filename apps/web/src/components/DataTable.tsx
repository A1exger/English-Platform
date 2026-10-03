'use client';

import { ReactNode, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { EmptyState, EmptyStateAction } from './EmptyState';

function cmp(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  align?: 'start' | 'end';
}

export interface TableFilter {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}

// Sprint 5: sortable, searchable, paginated table for the genuinely tabular
// screens (students, users). Columns declare how to render and how to sort;
// search runs over searchText(row); one optional filter select.
export function DataTable<T>({
  columns,
  rows,
  getKey,
  searchText,
  searchPlaceholder,
  filter,
  filterFn,
  pageSize = 20,
  empty
}: {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T) => string;
  searchText: (row: T) => string;
  searchPlaceholder?: string;
  filter?: TableFilter;
  filterFn?: (row: T) => boolean;
  pageSize?: number;
  empty: { title: string; body?: string; action?: EmptyStateAction };
}) {
  const tc = useTranslations('common');
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (filterFn ? filterFn(r) : true) &&
        (needle ? searchText(r).toLowerCase().includes(needle) : true)
    );
  }, [rows, q, searchText, filterFn]);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return filtered;
    const sortVal = col.sortValue;
    const arr = [...filtered].sort((a, b) => cmp(sortVal(a), sortVal(b)));
    return dir === 'asc' ? arr : arr.reverse();
  }, [filtered, columns, sortKey, dir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const shown = sorted.slice(current * pageSize, current * pageSize + pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setDir('asc');
    }
    setPage(0);
  }

  if (rows.length === 0) return <EmptyState {...empty} />;

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
        {filter && (
          <select
            className="data-filter"
            value={filter.value}
            aria-label={filter.label}
            onChange={(e) => {
              filter.onChange(e.target.value);
              setPage(0);
            }}
          >
            <option value="">{tc('all')}</option>
            {filter.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="note">{tc('noResults')}</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={c.align === 'end' ? 'col-end' : undefined}>
                    {c.sortValue ? (
                      <button type="button" className="th-sort" onClick={() => toggleSort(c.key)}>
                        {c.label}
                        <span className="th-arrow" aria-hidden="true">
                          {sortKey === c.key ? (dir === 'asc' ? '↑' : '↓') : ''}
                        </span>
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={getKey(r)}>
                  {columns.map((c) => (
                    <td key={c.key} className={c.align === 'end' ? 'col-end' : undefined}>
                      {c.render ? c.render(r) : String(c.sortValue ? c.sortValue(r) : '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
