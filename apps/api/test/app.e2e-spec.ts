import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('English-Platform API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let tutorTokens: { accessToken: string; refreshToken: string };
  let studentTokens: { accessToken: string; refreshToken: string };
  let groupLessonId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.cleanDatabase();
  });

  afterAll(async () => {
    await prisma.cleanDatabase();
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  it('GET /health -> ok', async () => {
    const res = await api().get('/api/v1/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('POST /auth/register (tutor) returns tokens', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({
        email: 'tutor@test.com',
        password: 'Password123!',
        role: 'tutor',
        firstName: 'Tessa',
        lastName: 'Tutor',
        locale: 'en',
      })
      .expect(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    tutorTokens = res.body;
  });

  it('POST /auth/register (student, ar locale) returns tokens', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({
        email: 'student@test.com',
        password: 'Password123!',
        role: 'student',
        firstName: 'Sara',
        lastName: 'Student',
        locale: 'ar',
      })
      .expect(201);
    studentTokens = res.body;
  });

  it('POST /auth/register rejects invalid payload (whitelist/validation)', async () => {
    await api()
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: 'x' })
      .expect(400);
  });

  it('POST /auth/login returns tokens', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'tutor@test.com', password: 'Password123!' })
      .expect(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    tutorTokens = res.body;
  });

  it('POST /auth/login wrong password -> 401 with localized message', async () => {
    const res = await api()
      .post('/api/v1/auth/login?lang=ar')
      .send({ email: 'student@test.com', password: 'wrong' })
      .expect(401);
    // Arabic invalid_credentials message
    expect(res.body.message).toContain('غير صحيحة');
  });

  it('GET /auth/me without token -> 401', async () => {
    await api().get('/api/v1/auth/me').expect(401);
  });

  it('GET /auth/me with token -> profile + localized greeting', async () => {
    const res = await api()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${studentTokens.accessToken}`)
      .expect(200);
    expect(res.body.email).toBe('student@test.com');
    // Arabic greeting for the student (locale "ar")
    expect(res.body.greeting).toContain('مرحبًا');
  });

  it('POST /auth/refresh issues a new token pair', async () => {
    const res = await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: tutorTokens.refreshToken })
      .expect(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    tutorTokens = res.body;
  });

  it('PATCH /users/me updates locale and student profile', async () => {
    const res = await api()
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${studentTokens.accessToken}`)
      .send({ timezone: 'Asia/Dubai', cefrLevel: 'B1', goals: 'IELTS' })
      .expect(200);
    expect(res.body.timezone).toBe('Asia/Dubai');
    expect(res.body.studentProfile.cefrLevel).toBe('B1');
  });

  it('POST /lessons as student -> 403 (tutor only)', async () => {
    await api()
      .post('/api/v1/lessons')
      .set('Authorization', `Bearer ${studentTokens.accessToken}`)
      .send({
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        endsAt: new Date(Date.now() + 90000000).toISOString(),
      })
      .expect(403);
  });

  it('POST /lessons as tutor creates a group lesson', async () => {
    const res = await api()
      .post('/api/v1/lessons')
      .set('Authorization', `Bearer ${tutorTokens.accessToken}`)
      .send({
        type: 'group',
        title: 'Beginner group class',
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        endsAt: new Date(Date.now() + 90000000).toISOString(),
        priceCents: 1000,
      })
      .expect(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe('Beginner group class');
    groupLessonId = res.body.id;
  });

  it('GET /lessons as tutor lists their lessons', async () => {
    const res = await api()
      .get('/api/v1/lessons')
      .set('Authorization', `Bearer ${tutorTokens.accessToken}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /lessons as student is empty before booking', async () => {
    const res = await api()
      .get('/api/v1/lessons')
      .set('Authorization', `Bearer ${studentTokens.accessToken}`)
      .expect(200);
    expect(res.body.length).toBe(0);
  });

  it('POST /lessons/:id/book as student books the slot', async () => {
    const res = await api()
      .post(`/api/v1/lessons/${groupLessonId}/book`)
      .set('Authorization', `Bearer ${studentTokens.accessToken}`)
      .expect(201);
    expect(res.body.participants.length).toBe(1);
  });

  it('GET /lessons as student now shows the booked lesson', async () => {
    const res = await api()
      .get('/api/v1/lessons')
      .set('Authorization', `Bearer ${studentTokens.accessToken}`)
      .expect(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe(groupLessonId);
  });

  it('POST /lessons/:id/book again -> 400 already booked', async () => {
    await api()
      .post(`/api/v1/lessons/${groupLessonId}/book`)
      .set('Authorization', `Bearer ${studentTokens.accessToken}`)
      .expect(400);
  });

  it('POST /lessons/:id/attendance marks the student present', async () => {
    const res = await api()
      .post(`/api/v1/lessons/${groupLessonId}/attendance`)
      .set('Authorization', `Bearer ${studentTokens.accessToken}`)
      .send({ status: 'present' })
      .expect(201);
    expect(res.body.status).toBe('present');
  });

  it('PATCH /lessons/:id as tutor cancels the lesson', async () => {
    const res = await api()
      .patch(`/api/v1/lessons/${groupLessonId}`)
      .set('Authorization', `Bearer ${tutorTokens.accessToken}`)
      .send({ status: 'cancelled' })
      .expect(200);
    expect(res.body.status).toBe('cancelled');
  });
});
