import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Tutor student creation, lesson + live-exercise deletion (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tutor: { accessToken: string };

  const api = () => request(app.getHttpServer());
  const auth = (tok: string) => ({ Authorization: `Bearer ${tok}` });
  const register = async (email: string, role: string) => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password123!', role, firstName: 'F', lastName: 'L' })
      .expect(201);
    return res.body as { accessToken: string };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.cleanDatabase();
    tutor = await register('m2.tutor@test.com', 'tutor');
  });

  afterAll(async () => {
    await prisma.cleanDatabase();
    await app.close();
  });

  it('tutor creates a student account (auto-enrolled) and sees all students', async () => {
    const created = await api()
      .post('/api/v1/crm/students/new')
      .set(auth(tutor.accessToken))
      .send({ email: 'made.by.tutor@test.com', password: 'Password123!', firstName: 'New', lastName: 'Pupil' })
      .expect(201);
    expect(created.body.studentProfileId).toBeDefined();

    // Auto-enrolled -> appears in the tutor roster.
    const roster = await api().get('/api/v1/crm/students').set(auth(tutor.accessToken)).expect(200);
    expect(roster.body.some((s: { studentProfileId: string }) => s.studentProfileId === created.body.studentProfileId)).toBe(true);

    // And in the global "all students" list.
    const all = await api().get('/api/v1/crm/students/all').set(auth(tutor.accessToken)).expect(200);
    expect(all.body.some((s: { studentProfileId: string }) => s.studentProfileId === created.body.studentProfileId)).toBe(true);
  });

  it('tutor deletes a lesson from the schedule', async () => {
    const lesson = await api()
      .post('/api/v1/lessons')
      .set(auth(tutor.accessToken))
      .send({ title: 'Temp', startsAt: new Date(Date.now() + 3600000).toISOString(), endsAt: new Date(Date.now() + 7200000).toISOString() })
      .expect(201);
    await api().delete(`/api/v1/lessons/${lesson.body.id}`).set(auth(tutor.accessToken)).expect(200);
    const gone = await prisma.lesson.findUnique({ where: { id: lesson.body.id } });
    expect(gone).toBeNull();
  });

  it('tutor removes a live exercise from a lesson board', async () => {
    const ex = await api()
      .post('/api/v1/exercises')
      .set(auth(tutor.accessToken))
      .send({ type: 'order', title: 'X', payload: { words: ['a', 'b', 'c'] } })
      .expect(201);
    const lesson = await api()
      .post('/api/v1/lessons')
      .set(auth(tutor.accessToken))
      .send({ title: 'L', startsAt: new Date(Date.now() + 3600000).toISOString(), endsAt: new Date(Date.now() + 7200000).toISOString() })
      .expect(201);
    const inst = await api()
      .post(`/api/v1/lessons/${lesson.body.id}/board/exercises`)
      .set(auth(tutor.accessToken))
      .send({ exerciseId: ex.body.id })
      .expect(201);

    await api()
      .delete(`/api/v1/lessons/${lesson.body.id}/board/exercises/${inst.body.id}`)
      .set(auth(tutor.accessToken))
      .expect(200);

    const list = await api().get(`/api/v1/lessons/${lesson.body.id}/board/exercises`).set(auth(tutor.accessToken)).expect(200);
    expect(list.body.length).toBe(0);
  });
});
