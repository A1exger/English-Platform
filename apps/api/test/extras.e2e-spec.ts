import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Admin CRM / student profile / progress / uploads / notes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let admin: { accessToken: string };
  let tutor: { accessToken: string };
  let student: { accessToken: string };
  let studentProfileId: string;
  let lessonId: string;

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

    admin = await register('x.admin@test.com', 'admin');
    tutor = await register('x.tutor@test.com', 'tutor');
    student = await register('x.student@test.com', 'student');

    const enroll = await api()
      .post('/api/v1/crm/students')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({ email: 'x.student@test.com' })
      .expect(201);
    studentProfileId = enroll.body.studentProfileId;
  });

  afterAll(async () => {
    await prisma.cleanDatabase();
    await app.close();
  });

  it('admin can list all students (CRM)', async () => {
    const res = await api()
      .get('/api/v1/crm/students')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(res.body.some((s: { studentProfileId: string }) => s.studentProfileId === studentProfileId)).toBe(true);
  });

  it('tutor updates a student profile (name + country + level)', async () => {
    const res = await api()
      .patch(`/api/v1/crm/students/${studentProfileId}`)
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({ firstName: 'Yusuf', lastName: 'Ben Ali', country: 'Tunisia', cefrLevel: 'A2', birthDate: '2008-05-01' })
      .expect(200);
    expect(res.body.user.firstName).toBe('Yusuf');
    expect(res.body.country).toBe('Tunisia');
    expect(res.body.cefrLevel).toBe('A2');
  });

  it('admin can edit any student profile too', async () => {
    await api()
      .patch(`/api/v1/crm/students/${studentProfileId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ address: '12 Rue de Tunis' })
      .expect(200);
  });

  it('student progress endpoint returns stats + achievements', async () => {
    const res = await api()
      .get('/api/v1/analytics/progress')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(200);
    expect(res.body).toHaveProperty('achievements');
    expect(Array.isArray(res.body.achievements)).toBe(true);
  });

  it('admin can view analytics overview (platform-wide)', async () => {
    const res = await api()
      .get('/api/v1/analytics/overview')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(res.body).toHaveProperty('activeStudents');
  });

  it('tutor uploads a material file', async () => {
    const res = await api()
      .post('/api/v1/materials/upload')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .field('title', 'Worksheet')
      .attach('file', Buffer.from('%PDF-1.4 test'), 'worksheet.pdf')
      .expect(201);
    expect(res.body.url).toMatch(/^\/uploads\//);
    expect(res.body.type).toBe('pdf');
  });

  it('tutor saves shared board notes', async () => {
    const lesson = await api()
      .post('/api/v1/lessons')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({
        title: 'Notes lesson',
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        endsAt: new Date(Date.now() + 7200000).toISOString(),
      })
      .expect(201);
    lessonId = lesson.body.id;

    const res = await api()
      .post(`/api/v1/lessons/${lessonId}/board/notes`)
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({ notes: 'Remember past tense' })
      .expect(201);
    expect(res.body.notes).toBe('Remember past tense');

    const board = await api()
      .get(`/api/v1/lessons/${lessonId}/board`)
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .expect(200);
    expect(board.body.notes).toBe('Remember past tense');
  });
});
