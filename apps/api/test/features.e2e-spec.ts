import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Homework + CRM + Video (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let tutor: { accessToken: string };
  let tutor2: { accessToken: string };
  let student: { accessToken: string };
  let studentProfileId: string;
  let homeworkId: string;

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

    tutor = await register('ftutor@test.com', 'tutor');
    tutor2 = await register('ftutor2@test.com', 'tutor');
    student = await register('fstudent@test.com', 'student');
  });

  afterAll(async () => {
    await prisma.cleanDatabase();
    await app.close();
  });

  // --- CRM enrollment -------------------------------------------------------

  it('tutor enrolls a student by email', async () => {
    const res = await api()
      .post('/api/v1/crm/students')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({ email: 'fstudent@test.com' })
      .expect(201);
    studentProfileId = res.body.studentProfileId;
    expect(studentProfileId).toBeDefined();
  });

  it('enrolling an unknown email -> 400', async () => {
    await api()
      .post('/api/v1/crm/students')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({ email: 'nobody@test.com' })
      .expect(400);
  });

  it('tutor lists their students', async () => {
    const res = await api()
      .get('/api/v1/crm/students')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .expect(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].email).toBe('fstudent@test.com');
  });

  // --- Homework -------------------------------------------------------------

  it('tutor assigns homework', async () => {
    const res = await api()
      .post('/api/v1/homework')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({ studentProfileId, title: 'Past Simple exercises' })
      .expect(201);
    expect(res.body.status).toBe('assigned');
    homeworkId = res.body.id;
  });

  it('student cannot assign homework -> 403', async () => {
    await api()
      .post('/api/v1/homework')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ studentProfileId, title: 'nope' })
      .expect(403);
  });

  it('student sees and submits the homework', async () => {
    const list = await api()
      .get('/api/v1/homework')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(200);
    expect(list.body.length).toBe(1);

    const res = await api()
      .post(`/api/v1/homework/${homeworkId}/submit`)
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ content: 'My answers', fileUrls: ['https://files/a.pdf'] })
      .expect(201);
    expect(res.body.status).toBe('submitted');
    expect(res.body.submissions.length).toBe(1);
  });

  it('tutor grades the submission', async () => {
    const res = await api()
      .post(`/api/v1/homework/${homeworkId}/grade`)
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({ grade: 'A', feedback: 'Great work' })
      .expect(201);
    expect(res.body.status).toBe('graded');
    expect(res.body.submissions[0].grade).toBe('A');
  });

  // --- CRM card + notes -----------------------------------------------------

  it('tutor adds a private note and reads the student card', async () => {
    await api()
      .post(`/api/v1/crm/students/${studentProfileId}/notes`)
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({ body: 'Needs work on tenses' })
      .expect(201);

    const card = await api()
      .get(`/api/v1/crm/students/${studentProfileId}`)
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .expect(200);
    expect(card.body.notes.length).toBe(1);
    expect(card.body.homework[0].status).toBe('graded');
  });

  it('single-tutor platform: any tutor can read the student card', async () => {
    const card = await api()
      .get(`/api/v1/crm/students/${studentProfileId}`)
      .set('Authorization', `Bearer ${tutor2.accessToken}`)
      .expect(200);
    expect(card.body.profile).toBeDefined();
  });

  // --- Video join token -----------------------------------------------------

  it('participant gets a LiveKit join token for the lesson', async () => {
    const lesson = await api()
      .post('/api/v1/lessons')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({
        title: 'Video lesson',
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        endsAt: new Date(Date.now() + 7200000).toISOString(),
      })
      .expect(201);

    await api()
      .post(`/api/v1/lessons/${lesson.body.id}/book`)
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(201);

    const res = await api()
      .post(`/api/v1/lessons/${lesson.body.id}/join`)
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(201);

    expect(res.body.roomName).toBe(`lesson_${lesson.body.id}`);
    expect(res.body.url).toContain('wss://');

    const parts = res.body.token.split('.');
    expect(parts.length).toBe(3);
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    expect(payload.video.room).toBe(`lesson_${lesson.body.id}`);
    expect(payload.video.roomJoin).toBe(true);
  });

  it('a non-participant cannot get a join token -> 403', async () => {
    const lesson = await api()
      .post('/api/v1/lessons')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({
        title: 'Private lesson',
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        endsAt: new Date(Date.now() + 7200000).toISOString(),
      })
      .expect(201);

    // tutor2 is neither owner nor participant
    await api()
      .post(`/api/v1/lessons/${lesson.body.id}/join`)
      .set('Authorization', `Bearer ${tutor2.accessToken}`)
      .expect(403);
  });
});
