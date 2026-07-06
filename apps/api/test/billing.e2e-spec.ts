import { createHmac } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const STRIPE_SECRET = 'test-stripe-webhook-secret';
const PAYPAL_SECRET = 'test-paypal-webhook-secret';

function sign(raw: string, secret: string): string {
  return createHmac('sha256', secret).update(raw).digest('hex');
}

describe('Billing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let tutor: { accessToken: string };
  let studentA: { accessToken: string };
  let studentB: { accessToken: string };
  let packageId: string;

  const api = () => request(app.getHttpServer());

  const register = async (email: string, role: string, locale = 'en') => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password123!', role, firstName: 'F', lastName: 'L', locale })
      .expect(201);
    return res.body as { accessToken: string };
  };

  // Drive a successful payment webhook for a given checkout. Returns the
  // supertest chain so callers can attach .expect().
  const succeed = (
    provider: 'stripe' | 'paypal',
    externalId: string,
    secret: string,
  ) => {
    const body = JSON.stringify({ type: 'payment.succeeded', externalId, status: 'succeeded' });
    return api()
      .post(`/api/v1/billing/webhook/${provider}`)
      .set('Content-Type', 'application/json')
      .set('x-webhook-signature', sign(body, secret))
      .send(body);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.cleanDatabase();

    tutor = await register('btutor@test.com', 'tutor');
    studentA = await register('sa@test.com', 'student', 'de');
    studentB = await register('sb@test.com', 'student');
  });

  afterAll(async () => {
    await prisma.cleanDatabase();
    await app.close();
  });

  it('tutor creates a package', async () => {
    const res = await api()
      .post('/api/v1/billing/packages')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({ name: '5 lessons', lessonsCount: 5, priceCents: 20000, currency: 'EUR' })
      .expect(201);
    expect(res.body.lessonsCount).toBe(5);
    packageId = res.body.id;
  });

  it('student creating a package is forbidden (tutor only)', async () => {
    await api()
      .post('/api/v1/billing/packages')
      .set('Authorization', `Bearer ${studentA.accessToken}`)
      .send({ name: 'x', lessonsCount: 1, priceCents: 100 })
      .expect(403);
  });

  it('student lists active packages', async () => {
    const res = await api()
      .get('/api/v1/billing/packages')
      .set('Authorization', `Bearer ${studentA.accessToken}`)
      .expect(200);
    expect(res.body.some((p: { id: string }) => p.id === packageId)).toBe(true);
  });

  it('student checks out a package via Stripe and webhook grants the package', async () => {
    const checkout = await api()
      .post('/api/v1/billing/checkout')
      .set('Authorization', `Bearer ${studentA.accessToken}`)
      .send({ provider: 'stripe', packageId })
      .expect(201);
    expect(checkout.body.checkoutUrl).toContain('stripe');
    expect(checkout.body.externalId).toBe(`cs_test_${checkout.body.transactionId}`);

    const hook = await succeed('stripe', checkout.body.externalId, STRIPE_SECRET).expect(201);
    expect(hook.body.status).toBe('succeeded');

    const balance = await api()
      .get('/api/v1/billing/balance')
      .set('Authorization', `Bearer ${studentA.accessToken}`)
      .expect(200);
    expect(balance.body.lessonsRemaining).toBe(5);
    expect(balance.body.balanceCents).toBe(0); // package purchase != cash balance
  });

  it('replaying the same webhook is idempotent (no double grant)', async () => {
    const checkout = await prisma.transaction.findFirst({
      where: { provider: 'stripe' },
      orderBy: { createdAt: 'desc' },
    });
    const replay = await succeed('stripe', checkout!.externalId!, STRIPE_SECRET).expect(201);
    expect(replay.body.status).toBe('already_processed');

    const balance = await api()
      .get('/api/v1/billing/balance')
      .set('Authorization', `Bearer ${studentA.accessToken}`)
      .expect(200);
    expect(balance.body.lessonsRemaining).toBe(5);
  });

  it('rejects a webhook with an invalid signature', async () => {
    const body = JSON.stringify({ type: 'payment.succeeded', externalId: 'cs_test_x', status: 'succeeded' });
    await api()
      .post('/api/v1/billing/webhook/stripe')
      .set('Content-Type', 'application/json')
      .set('x-webhook-signature', 'deadbeef')
      .send(body)
      .expect(401);
  });

  it('student tops up balance via PayPal', async () => {
    const checkout = await api()
      .post('/api/v1/billing/checkout')
      .set('Authorization', `Bearer ${studentB.accessToken}`)
      .send({ provider: 'paypal', amountCents: 5000 })
      .expect(201);
    expect(checkout.body.checkoutUrl).toContain('paypal');

    await succeed('paypal', checkout.body.externalId, PAYPAL_SECRET).expect(201);

    const balance = await api()
      .get('/api/v1/billing/balance')
      .set('Authorization', `Bearer ${studentB.accessToken}`)
      .expect(200);
    expect(balance.body.balanceCents).toBe(5000);
  });

  it('issues invoices for successful payments', async () => {
    const res = await api()
      .get('/api/v1/billing/invoices')
      .set('Authorization', `Bearer ${studentA.accessToken}`)
      .expect(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].status).toBe('paid');
    expect(res.body[0].locale).toBe('de'); // invoice in payer's locale
  });

  it('completing a lesson consumes a package lesson (auto-charge)', async () => {
    const lesson = await api()
      .post('/api/v1/lessons')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({
        title: 'Package lesson',
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        endsAt: new Date(Date.now() + 7200000).toISOString(),
        priceCents: 4000,
      })
      .expect(201);

    await api()
      .post(`/api/v1/lessons/${lesson.body.id}/book`)
      .set('Authorization', `Bearer ${studentA.accessToken}`)
      .expect(201);

    await api()
      .patch(`/api/v1/lessons/${lesson.body.id}`)
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({ status: 'completed' })
      .expect(200);

    const balance = await api()
      .get('/api/v1/billing/balance')
      .set('Authorization', `Bearer ${studentA.accessToken}`)
      .expect(200);
    expect(balance.body.lessonsRemaining).toBe(4); // 5 -> 4
    expect(balance.body.balanceCents).toBe(0); // cash untouched

    // Re-saving the completed lesson must not double-charge.
    await api()
      .patch(`/api/v1/lessons/${lesson.body.id}`)
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({ status: 'completed' })
      .expect(200);
    const after = await api()
      .get('/api/v1/billing/balance')
      .set('Authorization', `Bearer ${studentA.accessToken}`)
      .expect(200);
    expect(after.body.lessonsRemaining).toBe(4);
  });

  it('completing a lesson debits cash balance when no package (ledger)', async () => {
    const lesson = await api()
      .post('/api/v1/lessons')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({
        title: 'Paid-from-balance lesson',
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        endsAt: new Date(Date.now() + 7200000).toISOString(),
        priceCents: 3000,
      })
      .expect(201);

    await api()
      .post(`/api/v1/lessons/${lesson.body.id}/book`)
      .set('Authorization', `Bearer ${studentB.accessToken}`)
      .expect(201);

    await api()
      .patch(`/api/v1/lessons/${lesson.body.id}`)
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({ status: 'completed' })
      .expect(200);

    const balance = await api()
      .get('/api/v1/billing/balance')
      .set('Authorization', `Bearer ${studentB.accessToken}`)
      .expect(200);
    expect(balance.body.balanceCents).toBe(2000); // 5000 - 3000
    expect(balance.body.ledger.some((e: { reason: string }) => e.reason === 'charge')).toBe(true);
  });

  it('lists transactions for the current user', async () => {
    const res = await api()
      .get('/api/v1/billing/transactions')
      .set('Authorization', `Bearer ${studentB.accessToken}`)
      .expect(200);
    // one top-up + one charge
    expect(res.body.length).toBe(2);
  });
});
