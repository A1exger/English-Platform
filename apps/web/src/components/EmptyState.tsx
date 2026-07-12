'use client';

import { ReactNode } from 'react';
import { Link } from '@/i18n/routing';

export interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

// Sprint 5: every list ends in one of these instead of a bare "—". Title, an
// optional line of context, and the screen's primary next action (a button when
// it opens a drawer, a link when it navigates).
export function EmptyState({
  title,
  body,
  action,
  icon
}: {
  title: string;
  body?: string;
  action?: EmptyStateAction;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon" aria-hidden="true">{icon}</div>}
      <strong className="empty-state-title">{title}</strong>
      {body && <p className="empty-state-body">{body}</p>}
      {action &&
        (action.href ? (
          <Link className="cta-primary" href={action.href}>{action.label}</Link>
        ) : (
          <button type="button" className="cta-primary" onClick={action.onClick}>{action.label}</button>
        ))}
    </div>
  );
}
