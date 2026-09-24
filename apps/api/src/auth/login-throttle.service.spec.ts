import { LoginThrottleService } from './login-throttle.service';

describe('LoginThrottleService', () => {
  const ip = '1.2.3.4';
  const email = 'victim@test.com';
  let t: LoginThrottleService;

  beforeEach(() => {
    t = new LoginThrottleService();
  });

  it('locks the account after a run of failures', () => {
    for (let i = 0; i < 7; i++) {
      t.recordFailure(ip, email);
      expect(t.isLocked(ip, email)).toBe(false);
    }
    t.recordFailure(ip, email); // the eighth
    expect(t.isLocked(ip, email)).toBe(true);
    expect(t.retryAfterSeconds(ip, email)).toBeGreaterThan(0);
  });

  it('never locks someone who keeps getting it right', () => {
    // The failure that precedes a correct password is forgotten with it, so
    // signing in twenty times in a row is not an attack and is not treated as
    // one — which is exactly the case a naive per-endpoint limiter breaks.
    for (let i = 0; i < 20; i++) {
      t.recordFailure(ip, email);
      t.recordSuccess(ip, email);
    }
    expect(t.isLocked(ip, email)).toBe(false);
  });

  it('locks one account, not the whole client or the whole world', () => {
    for (let i = 0; i < 8; i++) t.recordFailure(ip, email);
    expect(t.isLocked(ip, email)).toBe(true);
    // Another account from the same office is unaffected...
    expect(t.isLocked(ip, 'colleague@test.com')).toBe(false);
    // ...and so is the same person from somewhere else, because this slows an
    // attacker down rather than handing them a way to lock others out.
    expect(t.isLocked('9.9.9.9', email)).toBe(false);
  });

  it('is case- and space-insensitive about the address', () => {
    for (let i = 0; i < 8; i++) t.recordFailure(ip, email);
    expect(t.isLocked(ip, '  VICTIM@Test.com ')).toBe(true);
  });

  it('forgives once the window has passed', () => {
    jest.useFakeTimers();
    try {
      for (let i = 0; i < 8; i++) t.recordFailure(ip, email);
      expect(t.isLocked(ip, email)).toBe(true);
      jest.advanceTimersByTime(16 * 60 * 1000);
      expect(t.isLocked(ip, email)).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
