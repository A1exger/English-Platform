'use client';

import { apiFetch } from './api';

const ACCESS = 'ld_access';
const REFRESH = 'ld_refresh';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface Me {
  id: string;
  email: string;
  role: 'tutor' | 'student' | 'parent' | 'admin';
  firstName: string;
  lastName: string;
  locale: string;
  greeting?: string;
}

export const tokenStore = {
  get(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACCESS);
  },
  set(t: Tokens): void {
    localStorage.setItem(ACCESS, t.accessToken);
    localStorage.setItem(REFRESH, t.refreshToken);
  },
  clear(): void {
    localStorage.removeItem(ACCESS);
    localStorage.removeItem(REFRESH);
  },
};

export function login(
  email: string,
  password: string,
  locale: string,
): Promise<Tokens> {
  return apiFetch<Tokens>('/auth/login', {
    method: 'POST',
    body: { email, password },
    locale,
  });
}

export function fetchMe(token: string, locale: string): Promise<Me> {
  return apiFetch<Me>('/auth/me', { token, locale });
}
