import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Money transfers — Western Union / MoneyGram (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let student: { accessToken: string };
  let admin: { accessToken: string };
  let transferId: string;

  const api = () => request(app.getHttpServer());

  const register = async (email: string, role: string, locale = 'en') => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password123!', role, firstName: 'F', lastName: 'L', locale })
      .expect(201);
    return res.body as { accessToken: string };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.cleanDatabase();

    student = await register('wu.student@test.com', 'student', 'fr');
    admin = await register('wu.admin@test.com', 'admin');
  });

  afterAll(async () => {
    await prisma.cleanDatabase();
    await app.close();
  });

  it('student starts a Western Union top-up and gets instructions + reference', async () => {
    const res = await api()
      .post('/api/v1/billing/transfer')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ method: 'westernunion', amountCents: 5000 })
      .expect(201);
    expect(res.body.method).toBe('westernunion');
    expect(res.body.status).toBe('pending');
    expect(res.body.reference).toMatch(/^WU-/);
    expect(res.body.instructions).toContain('Western Union');
    transferId = res.body.transactionId;
  });

  it('student submits the MTCN tracking number', async () => {
    const res = await api()
      .post(`/api/v1/billing/transfer/${transferId}/reference`)
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ reference: 'MTCN1234567' })
      .expect(201);
    expect(res.body.metadata).toContain('MTCN1234567');
    // Not credited yet.
    const bal = await api()
      .get('/api/v1/billing/balance')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(200);
    expect(bal.body.balanceCents).toBe(0);
  });

  it('student cannot confirm their own transfer (staff only)', async () => {
    await api()
      .post(`/api/v1/billing/transfer/${transferId}/confirm`)
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(403);
  });

  it('admin sees the pending transfer and confirms it -> balance credited', async () => {
    const pending = await api()
      .get('/api/v1/billing/transfers/pending')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(pending.body.some((t: { id: string }) => t.id === transferId)).toBe(true);

    await api()
      .post(`/api/v1/billing/transfer/${transferId}/confirm`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(201);

    const bal = await api()
      .get('/api/v1/billing/balance')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(200);
    expect(bal.body.balanceCents).toBe(5000);

    // Invoice issued in the payer's locale.
    const inv = await api()
      .get('/api/v1/billing/invoices')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(200);
    expect(inv.body.length).toBe(1);
    expect(inv.body[0].locale).toBe('fr');
  });

  it('confirming again is rejected (idempotent guard)', async () => {
    await api()
      .post(`/api/v1/billing/transfer/${transferId}/confirm`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(400);
  });

  it('MoneyGram package purchase grants lessons after confirmation', async () => {
    // Tutor + package
    const tutor = await register('wu.tutor@test.com', 'tutor');
    const pkg = await api()
      .post('/api/v1/billing/packages')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({ name: '5 lessons', lessonsCount: 5, priceCents: 20000 })
      .expect(201);

    const transfer = await api()
      .post('/api/v1/billing/transfer')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ method: 'moneygram', packageId: pkg.body.id })
      .expect(201);
    expect(transfer.body.reference).toMatch(/^MG-/);

    await api()
      .post(`/api/v1/billing/transfer/${transfer.body.transactionId}/confirm`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(201);

    const bal = await api()
      .get('/api/v1/billing/balance')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(200);
    expect(bal.body.lessonsRemaining).toBe(5);
    expect(bal.body.balanceCents).toBe(5000); // cash unchanged by a package buy
  });

  it('the tutor confirms their own student, and only their own', async () => {
    // The money is received by the tutor, so the tutor settles it.
    const mine = await register('wu.tutor2@test.com', 'tutor');
    const other = await register('wu.tutor3@test.com', 'tutor');
    await api()
      .post('/api/v1/crm/students')
      .set('Authorization', `Bearer ${mine.accessToken}`)
      .send({ email: 'wu.student@test.com' })
      .expect(201);

    const transfer = await api()
      .post('/api/v1/billing/transfer')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ method: 'westernunion', amountCents: 3000 })
      .expect(201);
    const txId = transfer.body.transactionId as string;

    // A tutor the student is not assigned to sees nothing and cannot confirm.
    const otherPending = await api()
      .get('/api/v1/billing/transfers/pending')
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(200);
    expect(otherPending.body.some((t: { id: string }) => t.id === txId)).toBe(false);
    await api()
      .post(`/api/v1/billing/transfer/${txId}/confirm`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(403);

    // Their own tutor sees it and confirms — the balance is credited.
    const pending = await api()
      .get('/api/v1/billing/transfers/pending')
      .set('Authorization', `Bearer ${mine.accessToken}`)
      .expect(200);
    expect(pending.body.some((t: { id: string }) => t.id === txId)).toBe(true);
    await api()
      .post(`/api/v1/billing/transfer/${txId}/confirm`)
      .set('Authorization', `Bearer ${mine.accessToken}`)
      .expect(201);

    const bal = await api()
      .get('/api/v1/billing/balance')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(200);
    expect(bal.body.balanceCents).toBe(8000); // 5000 + 3000
  });
});
