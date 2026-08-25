// Point the e2e suite at a dedicated SQLite test database so it never touches
// the dev database. The file is created/pushed in the global setup script.
process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '7d';
process.env.STRIPE_WEBHOOK_SECRET = 'test-stripe-webhook-secret';
process.env.PAYPAL_WEBHOOK_SECRET = 'test-paypal-webhook-secret';
// The Telegram webhook is public and refuses calls without this, so the suite
// runs with one configured exactly as production does.
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-telegram-webhook-secret';
// Tests provision admin accounts via the register endpoint.
process.env.ALLOW_ADMIN_REGISTRATION = 'true';
// Never run the background notification dispatcher during tests — the suites
// drive dispatchQueued() themselves so delivery is deterministic.
process.env.NOTIFY_DISPATCH = 'off';
