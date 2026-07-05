import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Phase 2: content catalog + authoring (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tutor: { accessToken: string };
  let student: { accessToken: string };
  let courseId: string;
  let unitAId: string;
  let unitBId: string;
  let lesson1: string;
  let lesson2: string;
  let lesson3: string;
  let pageId: string;

  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const register = async (email: string, role: string) => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password123!', role, firstName: 'F', lastName: 'L' })
      .expect(201);
    return res.body as { accessToken: string };
  };

  const orders = async () => {
    const rows = await prisma.courseLesson.findMany({
      where: { courseId },
      orderBy: { order: 'asc' },
      select: { title: true, order: true },
    });
    return rows.map((r) => `${r.order}:${r.title}`);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.cleanDatabase();
    tutor = await register('c.tutor@test.com', 'tutor');
    student = await register('c.student@test.com', 'student');
  });

  afterAll(async () => {
    await prisma.cleanDatabase();
    await app.close();
  });

  it('builds the tree: category -> course -> section -> two units', async () => {
    const cat = await api().post('/api/v1/content/categories').set(auth(tutor.accessToken)).send({ title: 'General' }).expect(201);
    const course = await api()
      .post('/api/v1/content/courses')
      .set(auth(tutor.accessToken))
      .send({ categoryId: cat.body.id, title: 'Draft course' })
      .expect(201);
    courseId = course.body.id;
    expect(course.body.status).toBe('draft');

    const section = await api()
      .post('/api/v1/content/sections')
      .set(auth(tutor.accessToken))
      .send({ courseId, level: 'Elementary', title: 'S1' })
      .expect(201);
    const uA = await api().post('/api/v1/content/units').set(auth(tutor.accessToken)).send({ sectionId: section.body.id, title: 'Unit A' }).expect(201);
    const uB = await api().post('/api/v1/content/units').set(auth(tutor.accessToken)).send({ sectionId: section.body.id, title: 'Unit B', order: 1 }).expect(201);
    unitAId = uA.body.id;
    unitBId = uB.body.id;
  });

  it('INV-1: lesson order is level-wide across units; insertion shifts globally', async () => {
    const l1 = await api().post('/api/v1/content/lessons').set(auth(tutor.accessToken)).send({ unitId: unitAId, title: 'L1' }).expect(201);
    const l2 = await api().post('/api/v1/content/lessons').set(auth(tutor.accessToken)).send({ unitId: unitBId, title: 'L2' }).expect(201);
    const l3 = await api().post('/api/v1/content/lessons').set(auth(tutor.accessToken)).send({ unitId: unitBId, title: 'L3', optional: true }).expect(201);
    lesson1 = l1.body.id;
    lesson2 = l2.body.id;
    lesson3 = l3.body.id;
    expect([l1.body.order, l2.body.order, l3.body.order]).toEqual([1, 2, 3]);

    // Insert at position 2 (in unit A): L2/L3 must shift, across BOTH units.
    const inserted = await api()
      .post('/api/v1/content/lessons')
      .set(auth(tutor.accessToken))
      .send({ unitId: unitAId, title: 'L1.5', order: 2 })
      .expect(201);
    expect(inserted.body.order).toBe(2);
    expect(await orders()).toEqual(['1:L1', '2:L1.5', '3:L2', '4:L3']);
  });

  it('INV-1: reorder moves a lesson level-wide', async () => {
    // Move L3 (order 4) to position 1.
    await api().post(`/api/v1/content/lessons/${lesson3}/reorder`).set(auth(tutor.accessToken)).send({ order: 1 }).expect(201);
    expect(await orders()).toEqual(['1:L3', '2:L1', '3:L1.5', '4:L2']);

    // And back down: L3 -> position 4.
    await api().post(`/api/v1/content/lessons/${lesson3}/reorder`).set(auth(tutor.accessToken)).send({ order: 4 }).expect(201);
    expect(await orders()).toEqual(['1:L1', '2:L1.5', '3:L2', '4:L3']);
  });

  it('students cannot see draft courses; publishing opens them', async () => {
    await api().get(`/api/v1/content/courses/${courseId}/tree?level=Elementary`).set(auth(student.accessToken)).expect(403);
    await api().patch(`/api/v1/content/courses/${courseId}`).set(auth(tutor.accessToken)).send({ status: 'published' }).expect(200);
    const tree = await api().get(`/api/v1/content/courses/${courseId}/tree?level=Elementary`).set(auth(student.accessToken)).expect(200);
    expect(tree.body.sections[0].units.length).toBe(2);
  });

  it('tasks validate payloads and hide answer keys from students', async () => {
    const page = await api()
      .post('/api/v1/content/pages')
      .set(auth(tutor.accessToken))
      .send({ courseLessonId: lesson1, type: 'practice', includedInHomework: true })
      .expect(201);
    pageId = page.body.id;

    // invalid: multiple_choice without answerKey
    await api()
      .post('/api/v1/content/tasks')
      .set(auth(tutor.accessToken))
      .send({ pageId, type: 'multiple_choice', gradingMode: 'AUTO', aspect: 'Reading', payload: { question: 'Q', options: ['a', 'b'] } })
      .expect(400);

    await api()
      .post('/api/v1/content/tasks')
      .set(auth(tutor.accessToken))
      .send({
        pageId,
        type: 'multiple_choice',
        gradingMode: 'AUTO',
        aspect: 'Reading',
        payload: { question: 'He ___ up.', options: ['wake', 'wakes'] },
        answerKey: { correct: 'wakes' },
      })
      .expect(201);

    const asStudent = await api().get(`/api/v1/content/lessons/${lesson1}`).set(auth(student.accessToken)).expect(200);
    expect(asStudent.body.pages[0].tasks[0].answerKey).toBeUndefined();
    const asTutor = await api().get(`/api/v1/content/lessons/${lesson1}`).set(auth(tutor.accessToken)).expect(200);
    expect(asTutor.body.pages[0].tasks[0].answerKey.correct).toBe('wakes');
  });

  it('students cannot author content', async () => {
    await api().post('/api/v1/content/courses').set(auth(student.accessToken)).send({ categoryId: 'x', title: 'nope' }).expect(403);
  });

  it('deleting a lesson closes the level-wide order gap', async () => {
    await api().delete(`/api/v1/content/lessons/${lesson2}`).set(auth(tutor.accessToken)).expect(200);
    expect(await orders()).toEqual(['1:L1', '2:L1.5', '3:L3']);
  });
});
