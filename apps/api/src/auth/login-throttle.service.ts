import { Injectable } from '@nestjs/common';

/**
 * Slows down password guessing against a single account.
 *
 * Counts only FAILED attempts, per (client, email), and clears the count on a
 * successful sign-in. That is deliberate: a person getting their own password
 * right ten times in a row is not an attack and must never be locked out, while
 * someone working through a word list is doing nothing but failing.
 *
 * In memory, which is the honest scope of it: one API process, and a restart
 * forgives everyone. It costs nothing, needs no dependency and no store, and it
 * turns an unlimited online guessing attack into a few tries per window. A
 * distributed limiter belongs behind a shared cache, if this ever runs on more
 * than one node.
 */
@Injectable()
export class LoginThrottleService {
  /** Failures allowed in a window before the account stops answering. */
  private static readonly MAX_FAILURES = 8;
  private static readonly WINDOW_MS = 15 * 60 * 1000;
  /** Bound the map so a flood of made-up addresses cannot grow it forever. */
  private static readonly MAX_KEYS = 10_000;

  private readonly failures = new Map<string, { count: number; firstAt: number }>();

  private key(client: string, email: string): string {
    return `${client}|${email.trim().toLowerCase()}`;
  }

  /** True when this (client, email) has spent its attempts for now. */
  isLocked(client: string, email: string): boolean {
    const entry = this.failures.get(this.key(client, email));
    if (!entry) return false;
    if (Date.now() - entry.firstAt > LoginThrottleService.WINDOW_MS) {
      this.failures.delete(this.key(client, email));
      return false;
    }
    return entry.count >= LoginThrottleService.MAX_FAILURES;
  }

  /** Seconds until the window rolls off, for the Retry-After header. */
  retryAfterSeconds(client: string, email: string): number {
    const entry = this.failures.get(this.key(client, email));
    if (!entry) return 0;
    const left = LoginThrottleService.WINDOW_MS - (Date.now() - entry.firstAt);
    return Math.max(1, Math.ceil(left / 1000));
  }

  recordFailure(client: string, email: string): void {
    const k = this.key(client, email);
    const entry = this.failures.get(k);
    const now = Date.now();
    if (!entry || now - entry.firstAt > LoginThrottleService.WINDOW_MS) {
      if (this.failures.size >= LoginThrottleService.MAX_KEYS) this.evictStale(now);
      this.failures.set(k, { count: 1, firstAt: now });
      return;
    }
    entry.count += 1;
  }

  /** A correct password ends the streak — this is not a quota on signing in. */
  recordSuccess(client: string, email: string): void {
    this.failures.delete(this.key(client, email));
  }

  private evictStale(now: number): void {
    for (const [k, v] of this.failures) {
      if (now - v.firstAt > LoginThrottleService.WINDOW_MS) this.failures.delete(k);
    }
    // Still full of live entries: drop the oldest rather than refuse to record.
    if (this.failures.size >= LoginThrottleService.MAX_KEYS) {
      const oldest = [...this.failures.entries()]
        .sort((a, b) => a[1].firstAt - b[1].firstAt)
        .slice(0, Math.ceil(LoginThrottleService.MAX_KEYS / 10));
      for (const [k] of oldest) this.failures.delete(k);
    }
  }
}
