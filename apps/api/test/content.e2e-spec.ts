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

  it('wordlist and grammar reference are editable and returned in lesson detail', async () => {
    await api()
      .put(`/api/v1/content/lessons/${lesson1}/wordlist`)
      .set(auth(tutor.accessToken))
      .send({ entries: [{ word: 'wake up', translation: 'просыпаться' }, { word: 'commute' }] })
      .expect(200);
    await api()
      .put(`/api/v1/content/lessons/${lesson1}/grammar`)
      .set(auth(tutor.accessToken))
      .send({ title: 'Present Simple', meaning: 'Habits.', form: 'V / V+s' })
      .expect(200);

    const detail = await api().get(`/api/v1/content/lessons/${lesson1}`).set(auth(student.accessToken)).expect(200);
    expect(detail.body.wordlist.entries.map((e: { word: string }) => e.word)).toEqual(['wake up', 'commute']);
    expect(detail.body.grammarReference.title).toBe('Present Simple');

    // Replacing overwrites, not appends.
    await api()
      .put(`/api/v1/content/lessons/${lesson1}/wordlist`)
      .set(auth(tutor.accessToken))
      .send({ entries: [{ word: 'routine' }] })
      .expect(200);
    const detail2 = await api().get(`/api/v1/content/lessons/${lesson1}`).set(auth(tutor.accessToken)).expect(200);
    expect(detail2.body.wordlist.entries.length).toBe(1);
  });

  it('deleting a lesson closes the level-wide order gap', async () => {
    await api().delete(`/api/v1/content/lessons/${lesson2}`).set(auth(tutor.accessToken)).expect(200);
    expect(await orders()).toEqual(['1:L1', '2:L1.5', '3:L3']);
  });

  // --- Stage 6: catalog fields + reorder ------------------------------------

  it('catalog: course carries cover/description, appends order, reorder persists (ФТ-К103/К104)', async () => {
    const cat = await api().post('/api/v1/content/categories').set(auth(tutor.accessToken)).send({ title: 'Reorder cat' }).expect(201);
    const catId = cat.body.id;
    const a = await api()
      .post('/api/v1/content/courses')
      .set(auth(tutor.accessToken))
      .send({ categoryId: catId, title: 'A', description: 'first', coverUrl: '/uploads/a.png' })
      .expect(201);
    const b = await api().post('/api/v1/content/courses').set(auth(tutor.accessToken)).send({ categoryId: catId, title: 'B' }).expect(201);
    const c = await api().post('/api/v1/content/courses').set(auth(tutor.accessToken)).send({ categoryId: catId, title: 'C' }).expect(201);
    expect(a.body.description).toBe('first');
    expect(a.body.coverUrl).toBe('/uploads/a.png');
    expect([a.body.order, b.body.order, c.body.order]).toEqual([0, 1, 2]);

    // Reverse the order via drag-reorder.
    await api()
      .post('/api/v1/content/courses/reorder')
      .set(auth(tutor.accessToken))
      .send({ categoryId: catId, ids: [c.body.id, b.body.id, a.body.id] })
      .expect(201);
    const catalog = await api().get('/api/v1/content/catalog').set(auth(tutor.accessToken)).expect(200);
    const reCat = catalog.body.find((x: { id: string }) => x.id === catId);
    expect(reCat.courses.map((x: { title: string }) => x.title)).toEqual(['C', 'B', 'A']);

    // A student cannot reorder (tutor/admin only, ФТ-К105).
    await api()
      .post('/api/v1/content/courses/reorder')
      .set(auth(student.accessToken))
      .send({ categoryId: catId, ids: [a.body.id] })
      .expect(403);
  });

  it('catalog: cards expose section levels; category reorder persists', async () => {
    const catalog = await api().get('/api/v1/content/catalog').set(auth(tutor.accessToken)).expect(200);
    const general = catalog.body.find((x: { title: string }) => x.title === 'General');
    const draftCourse = general.courses.find((x: { id: string }) => x.id === courseId);
    expect(draftCourse.sections.map((s: { level: string }) => s.level)).toContain('Elementary');

    const ids = catalog.body.map((x: { id: string }) => x.id).reverse();
    await api().post('/api/v1/content/categories/reorder').set(auth(tutor.accessToken)).send({ ids }).expect(201);
    const after = await api().get('/api/v1/content/catalog').set(auth(tutor.accessToken)).expect(200);
    expect(after.body.map((x: { id: string }) => x.id)).toEqual(ids);
  });

  // --- Stage 7: page media --------------------------------------------------

  it('media: attach image+audio, reorder, edit transcript; student sees it (ФТ-К302/К303/К305)', async () => {
    const page = await api()
      .post('/api/v1/content/pages')
      .set(auth(tutor.accessToken))
      .send({ courseLessonId: lesson1, type: 'listening' })
      .expect(201);
    const pageId = page.body.id;

    const img = await api()
      .post(`/api/v1/content/pages/${pageId}/media`)
      .set(auth(tutor.accessToken))
      .send({ kind: 'image', url: '/uploads/pic.png', caption: 'A picture' })
      .expect(201);
    const audio = await api()
      .post(`/api/v1/content/pages/${pageId}/media`)
      .set(auth(tutor.accessToken))
      .send({ kind: 'audio', url: '/uploads/track.mp3', transcript: 'Hello there.' })
      .expect(201);
    expect([img.body.order, audio.body.order]).toEqual([0, 1]);

    // A disallowed kind is rejected (ФТ-К305).
    await api()
      .post(`/api/v1/content/pages/${pageId}/media`)
      .set(auth(tutor.accessToken))
      .send({ kind: 'pdf', url: '/uploads/x.pdf' })
      .expect(400);

    // Reorder (audio first) and edit the transcript.
    await api()
      .post(`/api/v1/content/pages/${pageId}/media/reorder`)
      .set(auth(tutor.accessToken))
      .send({ ids: [audio.body.id, img.body.id] })
      .expect(201);
    await api()
      .patch(`/api/v1/content/media/${audio.body.id}`)
      .set(auth(tutor.accessToken))
      .send({ transcript: 'Updated transcript.' })
      .expect(200);

    // The student sees the reordered media with its transcript (course published).
    const detail = await api().get(`/api/v1/content/lessons/${lesson1}`).set(auth(student.accessToken)).expect(200);
    const p = detail.body.pages.find((x: { id: string }) => x.id === pageId);
    expect(p.media.map((m: { kind: string }) => m.kind)).toEqual(['audio', 'image']);
    expect(p.media[0].transcript).toBe('Updated transcript.');

    // Students cannot author media (RBAC).
    await api()
      .post(`/api/v1/content/pages/${pageId}/media`)
      .set(auth(student.accessToken))
      .send({ kind: 'image', url: '/x' })
      .expect(403);

    await api().delete(`/api/v1/content/media/${img.body.id}`).set(auth(tutor.accessToken)).expect(200);
    const detail2 = await api().get(`/api/v1/content/lessons/${lesson1}`).set(auth(tutor.accessToken)).expect(200);
    const p2 = detail2.body.pages.find((x: { id: string }) => x.id === pageId);
    expect(p2.media.length).toBe(1);
  });

  // --- Stage 8: editor reorder at every tree level --------------------------

  it('editor: reorder sections/units/pages/tasks persists (ФТ-К202)', async () => {
    const auth2 = auth(tutor.accessToken);
    const post = (path: string, body: object) => api().post(`/api/v1/content/${path}`).set(auth2).send(body).expect(201);
    const reorder = (path: string, body: object) => api().post(`/api/v1/content/${path}/reorder`).set(auth2).send(body).expect(201);
    const tree = () => api().get(`/api/v1/content/courses/${courseId}/tree?level=Intermediate`).set(auth2).expect(200);

    const s1 = (await post('sections', { courseId, level: 'Intermediate', title: 'B1-S1' })).body;
    const uA = (await post('units', { sectionId: s1.id, title: 'UA' })).body;
    const uB = (await post('units', { sectionId: s1.id, title: 'UB' })).body;
    const lesson = (await post('lessons', { unitId: uA.id, title: 'BL' })).body;
    const p1 = (await post('pages', { courseLessonId: lesson.id, type: 'practice' })).body;
    const p2 = (await post('pages', { courseLessonId: lesson.id, type: 'grammar' })).body;
    const mkTask = (pageId: string, q: string) =>
      post('tasks', {
        pageId,
        type: 'multiple_choice',
        gradingMode: 'AUTO',
        aspect: 'Reading',
        payload: { question: q, options: ['a', 'b'] },
        answerKey: { correct: 'a' }
      });
    const t1 = (await mkTask(p1.id, 'Q1')).body;
    const t2 = (await mkTask(p1.id, 'Q2')).body;

    // Units: reverse.
    await reorder('units', { sectionId: s1.id, ids: [uB.id, uA.id] });
    const afterUnits = await tree();
    expect(afterUnits.body.sections[0].units.map((u: { title: string }) => u.title)).toEqual(['UB', 'UA']);

    // Page text is editable (ФТ-К204).
    await api().patch(`/api/v1/content/pages/${p1.id}`).set(auth2).send({ text: 'Reading passage.' }).expect(200);

    // Pages: reverse (verified via lessonDetail).
    await reorder('pages', { courseLessonId: lesson.id, ids: [p2.id, p1.id] });
    const d1 = await api().get(`/api/v1/content/lessons/${lesson.id}`).set(auth2).expect(200);
    expect(d1.body.pages.map((p: { id: string }) => p.id)).toEqual([p2.id, p1.id]);
    expect(d1.body.pages.find((p: { id: string }) => p.id === p1.id).text).toBe('Reading passage.');

    // Tasks: reverse within p1.
    await reorder('tasks', { pageId: p1.id, ids: [t2.id, t1.id] });
    const d2 = await api().get(`/api/v1/content/lessons/${lesson.id}`).set(auth2).expect(200);
    const page1 = d2.body.pages.find((p: { id: string }) => p.id === p1.id);
    expect(page1.tasks.map((t: { id: string }) => t.id)).toEqual([t2.id, t1.id]);

    // Sections: add a second and reverse.
    const s2 = (await post('sections', { courseId, level: 'Intermediate', title: 'B1-S2' })).body;
    await reorder('sections', { courseId, ids: [s2.id, s1.id] });
    const afterSec = await tree();
    expect(afterSec.body.sections.map((s: { id: string }) => s.id)).toEqual([s2.id, s1.id]);

    // A student cannot reorder (RBAC).
    await api()
      .post('/api/v1/content/sections/reorder')
      .set(auth(student.accessToken))
      .send({ courseId, ids: [s1.id] })
      .expect(403);
  });
});
