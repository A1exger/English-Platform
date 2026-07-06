import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Materials + Notifications + Analytics (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let tutor: { accessToken: string };
  let student: { accessToken: string };
  let admin: { accessToken: string };
  let studentProfileId: string;
  let materialId: string;
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

    tutor = await register('ptutor@test.com', 'tutor');
    student = await register('pstudent@test.com', 'student', 'fr'); // French locale
    admin = await register('padmin@test.com', 'admin');

    const enroll = await api()
      .post('/api/v1/crm/students')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({ email: 'pstudent@test.com' })
      .expect(201);
    studentProfileId = enroll.body.studentProfileId;
  });

  afterAll(async () => {
    await prisma.cleanDatabase();
    await app.close();
  });

  // --- Materials ------------------------------------------------------------

  it('tutor creates a material', async () => {
    const res = await api()
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({ type: 'pdf', title: 'Unit 5', language: 'en' })
      .expect(201);
    expect(res.body.type).toBe('pdf');
    materialId = res.body.id;
  });

  it('student cannot create a material -> 403', async () => {
    await api()
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ type: 'pdf', title: 'x' })
      .expect(403);
  });

  it("enrolled student sees the tutor's materials", async () => {
    const res = await api()
      .get('/api/v1/materials')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe(materialId);
  });

  it('tutor deletes a material', async () => {
    await api()
      .delete(`/api/v1/materials/${materialId}`)
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .expect(200);
    const res = await api()
      .get('/api/v1/materials')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(200);
    expect(res.body.length).toBe(0);
  });

  // --- Notifications --------------------------------------------------------

  it('assigning homework queues a notification in the student locale', async () => {
    await api()
      .post('/api/v1/homework')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({ studentProfileId, title: 'Devoir 1' })
      .expect(201);

    const res = await api()
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].templateKey).toBe('homework_assigned');
    expect(res.body[0].locale).toBe('fr');
    expect(res.body[0].status).toBe('queued');
  });

  it('booking a lesson queues a second notification', async () => {
    const lesson = await api()
      .post('/api/v1/lessons')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({
        title: 'Conversation',
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        endsAt: new Date(Date.now() + 7200000).toISOString(),
        priceCents: 5000,
      })
      .expect(201);
    lessonId = lesson.body.id;

    await api()
      .post(`/api/v1/lessons/${lessonId}/book`)
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(201);

    const res = await api()
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(200);
    expect(res.body.length).toBe(2);
  });

  it('admin dispatches the queue and messages render in French', async () => {
    const res = await api()
      .post('/api/v1/notifications/dispatch')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(201);
    const texts = res.body.map((n: { text: string }) => n.text).join(' | ');
    expect(texts).toContain('Nouveau devoir'); // fr homework_assigned
    expect(texts).toContain('Cours réservé'); // fr lesson_booked

    const after = await api()
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(200);
    expect(after.body.every((n: { status: string }) => n.status === 'sent')).toBe(true);
  });

  it('student marks a notification read', async () => {
    const list = await api()
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(200);
    const res = await api()
      .patch(`/api/v1/notifications/${list.body[0].id}/read`)
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(200);
    expect(res.body.updated).toBe(1);
  });

  // --- Analytics ------------------------------------------------------------

  it('overview reflects a completed lesson with attendance', async () => {
    await api()
      .post(`/api/v1/lessons/${lessonId}/attendance`)
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ status: 'present' })
      .expect(201);

    await api()
      .patch(`/api/v1/lessons/${lessonId}`)
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({ status: 'completed' })
      .expect(200);

    const res = await api()
      .get('/api/v1/analytics/overview')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .expect(200);
    expect(res.body.lessonsCompleted).toBe(1);
    expect(res.body.revenueCents).toBe(5000);
    expect(res.body.activeStudents).toBe(1);
    expect(res.body.attendanceRate).toBe(100);
  });

  it('students cannot access tutor analytics -> 403', async () => {
    await api()
      .get('/api/v1/analytics/overview')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(403);
  });
});
