import { ReactNode, SVGProps } from 'react';

// Sprint 6.2: a tiny inline-SVG icon set — no dependency. Icons inherit
// currentColor (stroke or fill) so they take the surrounding text colour, and
// render identically across OSes, unlike the emoji they replace. Decorative by
// default (aria-hidden); pass a label on the button, not the glyph.
export type IconName =
  | 'close'
  | 'check'
  | 'spark'
  | 'edit'
  | 'globe'
  | 'award'
  | 'lock'
  | 'star'
  | 'eye'
  | 'search';

const STROKE: Partial<Record<IconName, ReactNode>> = {
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M20 6L9 17l-5-5" />,
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </>
  ),
  award: (
    <>
      <circle cx="12" cy="8" r="7" />
      <path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12" />
    </>
  ),
  lock: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  )
};

const FILLED: Partial<Record<IconName, ReactNode>> = {
  spark: <path d="M12 2l1.9 7.6L21 12l-7.1 2.4L12 22l-1.9-7.6L3 12l7.1-2.4z" />,
  star: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
};

export function Icon({
  name,
  size = 16,
  ...rest
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  const filled = name in FILLED;
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {filled ? FILLED[name] : STROKE[name]}
    </svg>
  );
}
