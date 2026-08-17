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

  it('private courses stay hidden until the student is granted access', async () => {
    const cat = await api()
      .post('/api/v1/content/categories')
      .set(auth(tutor.accessToken))
      .send({ title: 'Individual' })
      .expect(201);
    // Published, but built for named students only.
    const course = await api()
      .post('/api/v1/content/courses')
      .set(auth(tutor.accessToken))
      .send({ categoryId: cat.body.id, title: 'One-to-one', visibility: 'private' })
      .expect(201);
    const privateId = course.body.id as string;
    expect(course.body.visibility).toBe('private');
    await api()
      .patch(`/api/v1/content/courses/${privateId}`)
      .set(auth(tutor.accessToken))
      .send({ status: 'published' })
      .expect(200);

    const visibleTitles = async () => {
      const cat = await api()
        .get('/api/v1/content/catalog')
        .set(auth(student.accessToken))
        .expect(200);
      return (cat.body as { courses: { title: string }[] }[]).flatMap((c) =>
        c.courses.map((x) => x.title),
      );
    };

    // Published but not shared: invisible in the catalog and closed on direct hit.
    expect(await visibleTitles()).not.toContain('One-to-one');
    await api()
      .get(`/api/v1/content/courses/${privateId}/tree?level=Elementary`)
      .set(auth(student.accessToken))
      .expect(403);

    // Grant it to this student.
    const profile = await prisma.studentProfile.findFirstOrThrow({
      where: { user: { email: 'c.student@test.com' } },
    });
    await api()
      .put(`/api/v1/content/courses/${privateId}/access`)
      .set(auth(tutor.accessToken))
      .send({ studentProfileIds: [profile.id] })
      .expect(200);

    expect(await visibleTitles()).toContain('One-to-one');
    await api()
      .get(`/api/v1/content/courses/${privateId}/tree?level=Elementary`)
      .set(auth(student.accessToken))
      .expect(200);
    const access = await api()
      .get(`/api/v1/content/courses/${privateId}/access`)
      .set(auth(tutor.accessToken))
      .expect(200);
    expect(access.body).toHaveLength(1);

    // Revoking closes it again (empty list replaces the grants).
    await api()
      .put(`/api/v1/content/courses/${privateId}/access`)
      .set(auth(tutor.accessToken))
      .send({ studentProfileIds: [] })
      .expect(200);
    await api()
      .get(`/api/v1/content/courses/${privateId}/tree?level=Elementary`)
      .set(auth(student.accessToken))
      .expect(403);
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

  it('translate-wordlist reports 503 when AI is not configured (no key in tests)', async () => {
    await api()
      .post(`/api/v1/content/lessons/${lesson1}/translate-wordlist`)
      .set(auth(tutor.accessToken))
      .expect(503);
  });

  it('manual per-locale wordlist translations are served by request locale', async () => {
    await api()
      .put(`/api/v1/content/lessons/${lesson1}/wordlist`)
      .set(auth(tutor.accessToken))
      .send({ entries: [{ word: 'commute', translation: 'ехать' }] })
      .expect(200);
    await api()
      .put(`/api/v1/content/lessons/${lesson1}/wordlist-translations`)
      .set(auth(tutor.accessToken))
      .send({ entries: [{ word: 'commute', translations: { fr: 'faire la navette', de: 'pendeln' } }] })
      .expect(200);

    // A French student gets the French gloss…
    const fr = await api()
      .get(`/api/v1/content/lessons/${lesson1}`)
      .set(auth(student.accessToken))
      .set('x-lang', 'fr')
      .expect(200);
    expect(fr.body.wordlist.entries.find((e: { word: string }) => e.word === 'commute').translation).toBe(
      'faire la navette',
    );
    // …a Dutch student (no nl translation) falls back to the authored default.
    const nl = await api()
      .get(`/api/v1/content/lessons/${lesson1}`)
      .set(auth(student.accessToken))
      .set('x-lang', 'nl')
      .expect(200);
    expect(nl.body.wordlist.entries.find((e: { word: string }) => e.word === 'commute').translation).toBe(
      'ехать',
    );
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
  // --- deleting a section / unit takes its subtree with it -------------------

  it('deletes units and sections, repacking the level-wide lesson order', async () => {
    const auth2 = auth(tutor.accessToken);
    const post = (path: string, body: object) => api().post(`/api/v1/content/${path}`).set(auth2).send(body).expect(201);
    // A level of its own so the other suites' fixtures are untouched.
    const orders = async () => {
      const t = await api().get(`/api/v1/content/courses/${courseId}/tree?level=Advanced`).set(auth2).expect(200);
      return t.body.sections
        .flatMap((s: { units: { lessons: { order: number; title: string }[] }[] }) =>
          s.units.flatMap((u) => u.lessons))
        .sort((a: { order: number }, b: { order: number }) => a.order - b.order)
        .map((l: { order: number; title: string }) => `${l.order}:${l.title}`);
    };

    const s1 = (await post('sections', { courseId, level: 'Advanced', title: 'C1-S1' })).body;
    const s2 = (await post('sections', { courseId, level: 'Advanced', title: 'C1-S2' })).body;
    const uA = (await post('units', { sectionId: s1.id, title: 'UA' })).body;
    const uB = (await post('units', { sectionId: s1.id, title: 'UB' })).body;
    const uC = (await post('units', { sectionId: s2.id, title: 'UC' })).body;
    // Interleaved across units, so order is genuinely level-wide (INV-1).
    await post('lessons', { unitId: uA.id, title: 'A1' });
    await post('lessons', { unitId: uB.id, title: 'B1' });
    await post('lessons', { unitId: uA.id, title: 'A2' });
    await post('lessons', { unitId: uC.id, title: 'C1' });
    expect(await orders()).toEqual(['1:A1', '2:B1', '3:A2', '4:C1']);

    // Removing a unit takes its lessons and closes the gap it left mid-sequence.
    await api().delete(`/api/v1/content/units/${uA.id}`).set(auth2).expect(200);
    expect(await orders()).toEqual(['1:B1', '2:C1']);

    // Removing a section takes its remaining units + lessons the same way.
    await api().delete(`/api/v1/content/sections/${s1.id}`).set(auth2).expect(200);
    expect(await orders()).toEqual(['1:C1']);
    const left = await api().get(`/api/v1/content/courses/${courseId}/tree?level=Advanced`).set(auth2).expect(200);
    expect(left.body.sections.map((s: { id: string }) => s.id)).toEqual([s2.id]);

    // A dense order means the next lesson still appends cleanly.
    const appended = (await post('lessons', { unitId: uC.id, title: 'C2' })).body;
    expect(appended.order).toBe(2);

    // RBAC + unknown ids.
    await api().delete(`/api/v1/content/sections/${s2.id}`).set(auth(student.accessToken)).expect(403);
    await api().delete(`/api/v1/content/units/does-not-exist`).set(auth2).expect(404);
  });

  it('true_false: statements are gradable, per-statement, and hide their answers', async () => {
    const auth2 = auth(tutor.accessToken);
    const s = (await api().post('/api/v1/content/sections').set(auth2)
      .send({ courseId, level: 'Beginner', title: 'Reading' }).expect(201)).body;
    const u = (await api().post('/api/v1/content/units').set(auth2).send({ sectionId: s.id, title: 'U' }).expect(201)).body;
    const lesson = (await api().post('/api/v1/content/lessons').set(auth2).send({ unitId: u.id, title: 'Article' }).expect(201)).body;
    // A reading page is an article page: text + tasks answerable from it.
    const page = (await api().post('/api/v1/content/pages').set(auth2)
      .send({ courseLessonId: lesson.id, type: 'reading', text: 'Peter lives in London. He is a teacher.' }).expect(201)).body;

    const task = (await api().post('/api/v1/content/tasks').set(auth2).send({
      pageId: page.id,
      type: 'true_false',
      gradingMode: 'AUTO',
      aspect: 'Reading',
      payload: { statements: ['Peter lives in London.', 'Peter is a doctor.'] },
      answerKey: { values: [true, false] }
    }).expect(201)).body;

    // statements[] and values[] must line up.
    await api().post('/api/v1/content/tasks').set(auth2).send({
      pageId: page.id,
      type: 'true_false',
      gradingMode: 'AUTO',
      aspect: 'Reading',
      payload: { statements: ['One.', 'Two.'] },
      answerKey: { values: [true] }
    }).expect(400);

    await api().patch(`/api/v1/content/courses/${courseId}`).set(auth2).send({ status: 'published' }).expect(200);

    // The student gets the statements but never the booleans.
    const detail = await api().get(`/api/v1/content/lessons/${lesson.id}`).set(auth(student.accessToken)).expect(200);
    const served = detail.body.pages.find((p: { id: string }) => p.id === page.id).tasks[0];
    expect(served.question.statements).toEqual(['Peter lives in London.', 'Peter is a doctor.']);
    expect(JSON.stringify(served)).not.toContain('values');

    // Scored per statement, not all-or-nothing.
    const half = await api().post(`/api/v1/content/tasks/${task.id}/check`).set(auth(student.accessToken))
      .send({ state: { values: [true, true] } }).expect(201);
    expect(half.body.score).toBe(5);
    expect(half.body.correct).toBe(false);

    const full = await api().post(`/api/v1/content/tasks/${task.id}/check`).set(auth(student.accessToken))
      .send({ state: { values: [true, false] } }).expect(201);
    expect(full.body.score).toBe(10);
    expect(full.body.correct).toBe(true);
  });

  it('backfills answer keys the generator used to omit, and is idempotent', async () => {
    const auth2 = auth(tutor.accessToken);
    const admin = await register('c.admin@test.com', 'admin');
    const s = (await api().post('/api/v1/content/sections').set(auth2)
      .send({ courseId, level: 'Advanced', title: 'Backfill' }).expect(201)).body;
    const u = (await api().post('/api/v1/content/units').set(auth2).send({ sectionId: s.id, title: 'U' }).expect(201)).body;
    const lesson = (await api().post('/api/v1/content/lessons').set(auth2).send({ unitId: u.id, title: 'BF' }).expect(201)).body;
    const page = (await api().post('/api/v1/content/pages').set(auth2)
      .send({ courseLessonId: lesson.id, type: 'practice' }).expect(201)).body;
    const task = (await api().post('/api/v1/content/tasks').set(auth2).send({
      pageId: page.id,
      type: 'sentence_ordering',
      gradingMode: 'AUTO',
      aspect: 'Grammar',
      payload: { words: ['I', 'will', 'go'] },
      answerKey: { order: ['I', 'will', 'go'] }
    }).expect(201)).body;

    // Reproduce the old generator output: a task stored with no answer key at
    // all, which scores 0/10 whatever the student answers.
    await prisma.lessonTask.update({ where: { id: task.id }, data: { answerKey: null } });
    await api().patch(`/api/v1/content/courses/${courseId}`).set(auth2).send({ status: 'published' }).expect(200);
    const before = await api().post(`/api/v1/content/tasks/${task.id}/check`).set(auth(student.accessToken))
      .send({ state: { order: ['I', 'will', 'go'] } }).expect(201);
    expect(before.body.score).toBe(0);

    // Only an admin may run it, and it repairs from the payload itself.
    await api().post('/api/v1/content/tasks/backfill-answer-keys').set(auth2).expect(403);
    const run = await api().post('/api/v1/content/tasks/backfill-answer-keys').set(auth(admin.accessToken)).expect(201);
    expect(run.body.repaired).toBeGreaterThanOrEqual(1);

    const after = await api().post(`/api/v1/content/tasks/${task.id}/check`).set(auth(student.accessToken))
      .send({ state: { order: ['I', 'will', 'go'] } }).expect(201);
    expect(after.body.score).toBe(10);

    // Re-running touches nothing, so a hand-authored key is never overwritten.
    const again = await api().post('/api/v1/content/tasks/backfill-answer-keys').set(auth(admin.accessToken)).expect(201);
    expect(again.body.repaired).toBe(0);
  });

  it('word bank: tutor imports, student copies into their own dictionary', async () => {
    const auth2 = auth(tutor.accessToken);
    const authS = auth(student.accessToken);

    // Duplicate line on purpose: the later one wins, and only one row is made.
    await api().post('/api/v1/content/word-bank/import').set(auth2).send({
      text: 'deadline = срок\ndeadline = крайний срок\nnegotiate = вести переговоры\nbandwidth\n   ',
      topic: 'Business'
    }).expect(201).expect((r) => expect(r.body.imported).toBe(3));

    const all = await api().get('/api/v1/content/word-bank?topic=Business').set(authS).expect(200);
    expect(all.body.map((w: { word: string }) => w.word).sort()).toEqual(['bandwidth', 'deadline', 'negotiate']);
    const deadline = all.body.find((w: { word: string }) => w.word === 'deadline');
    expect(deadline.translation).toBe('крайний срок');
    // A word with no "=" still lands, just without a translation.
    expect(all.body.find((w: { word: string }) => w.word === 'bandwidth').translation).toBeNull();

    // Re-importing updates rather than duplicating.
    await api().post('/api/v1/content/word-bank/import').set(auth2)
      .send({ text: 'deadline = дедлайн', topic: 'Business' }).expect(201);
    const after = await api().get('/api/v1/content/word-bank?q=deadline').set(authS).expect(200);
    expect(after.body.length).toBe(1);
    expect(after.body[0].translation).toBe('дедлайн');

    expect(await api().get('/api/v1/content/word-bank/topics').set(authS).expect(200)
      .then((r) => r.body)).toContain('Business');

    // The student copies it into their own dictionary; twice is idempotent.
    await api().post(`/api/v1/content/word-bank/${deadline.id}/add`).set(authS).expect(201);
    await api().post(`/api/v1/content/word-bank/${deadline.id}/add`).set(authS).expect(201);
    const mine = await api().get('/api/v1/content/dictionary').set(authS).expect(200);
    expect(mine.body.filter((e: { word: string }) => e.word === 'deadline').length).toBe(1);

    // Glosses come back in the reader's own language, not just Russian.
    await api().post('/api/v1/content/word-bank/seed').set(auth2).expect(201);
    const ru = await api().get('/api/v1/content/word-bank?q=water').set(auth2).set('x-lang', 'ru').expect(200);
    const de = await api().get('/api/v1/content/word-bank?q=water').set(auth2).set('x-lang', 'de').expect(200);
    const fr = await api().get('/api/v1/content/word-bank?q=water').set(auth2).set('x-lang', 'fr').expect(200);
    const pick = (r: { body: { word: string; translation: string }[] }) =>
      r.body.find((w) => w.word === 'water')?.translation;
    expect(pick(ru)).toBe('вода');
    expect(pick(de)).toBe('Wasser');
    expect(pick(fr)).toBe('eau');
    // The English definition rides along regardless of locale: the UI shows it
    // first and reveals the translation only on request.
    const def = (r: { body: { word: string; definition: string }[] }) =>
      r.body.find((w) => w.word === 'water')?.definition;
    expect(def(ru)).toBe('what you drink');
    expect(def(de)).toBe('what you drink');

    // The bundled starter pack loads once and skips what is already there.
    const again2 = await api().post('/api/v1/content/word-bank/seed').set(auth2).expect(201);
    expect(again2.body.added).toBe(0);
    expect(again2.body.total).toBeGreaterThan(300);

    // Students may read the bank but never curate it.
    await api().post('/api/v1/content/word-bank/import').set(authS).send({ text: 'x' }).expect(403);
    await api().delete(`/api/v1/content/word-bank/${deadline.id}`).set(authS).expect(403);
    await api().delete(`/api/v1/content/word-bank/${deadline.id}`).set(auth2).expect(200);
  });

  it('word bank: a polysemous word carries its meanings, and the student picks one', async () => {
    const auth2 = auth(tutor.accessToken);
    const authS = auth(student.accessToken);
    // The previous test already seeded; seeding is idempotent so this is safe
    // to repeat and makes the test readable on its own.
    await api().post('/api/v1/content/word-bank/seed').set(auth2).expect(201);

    const found = await api().get('/api/v1/content/word-bank?q=book').set(authS).expect(200);
    const book = found.body.find((w: { word: string }) => w.word === 'book');
    // The list ships a count, never the sense bodies — with a thousand words
    // those would dominate the payload for something the UI keeps collapsed.
    expect(book.senseCount).toBeGreaterThan(1);
    expect(book.senses).toBeUndefined();

    const senses = await api()
      .get(`/api/v1/content/word-bank/${book.id}/senses`)
      .set(authS)
      .set('x-lang', 'ru')
      .expect(200);
    expect(senses.body.length).toBeGreaterThan(1);
    expect(senses.body[0].order).toBe(1);
    // The point of the whole feature: one word, two different translations.
    const glosses = senses.body.map((s: { translation: string }) => s.translation);
    expect(glosses).toContain('книга');
    expect(glosses).toContain('бронировать');
    // Each meaning is spelled out in English, with its part of speech.
    expect(senses.body[0].definition).toContain('pages');
    expect(senses.body.map((s: { partOfSpeech: string }) => s.partOfSpeech)).toContain('verb');

    // Adding a chosen meaning stores that meaning's gloss, not the word's default.
    const verb = senses.body.find((s: { partOfSpeech: string }) => s.partOfSpeech === 'verb');
    await api()
      .post(`/api/v1/content/word-bank/${book.id}/add?senseId=${verb.id}`)
      .set(authS)
      .set('x-lang', 'ru')
      .expect(201);
    const mine = await api().get('/api/v1/content/dictionary').set(authS).expect(200);
    const entry = mine.body.find((e: { word: string }) => e.word === 'book');
    expect(entry.translation).toBe('бронировать');
    expect(entry.senseId).toBe(verb.id);

    // German asks the same question and gets the German answer.
    const de = await api()
      .get(`/api/v1/content/word-bank/${book.id}/senses`)
      .set(authS)
      .set('x-lang', 'de')
      .expect(200);
    expect(de.body.map((s: { translation: string }) => s.translation)).toContain('buchen');

    // A sense id that is not this word's is refused rather than silently ignored.
    await api()
      .post(`/api/v1/content/word-bank/${book.id}/add?senseId=nope`)
      .set(authS)
      .expect(404);
    await api().get('/api/v1/content/word-bank/nope/senses').set(authS).expect(404);
  });

  it('renames sections and units', async () => {
    const auth2 = auth(tutor.accessToken);
    const s = (await api().post('/api/v1/content/sections').set(auth2)
      .send({ courseId, level: 'UpperIntermediate', title: 'Old section' }).expect(201)).body;
    const u = (await api().post('/api/v1/content/units').set(auth2)
      .send({ sectionId: s.id, title: 'Old unit' }).expect(201)).body;

    await api().patch(`/api/v1/content/sections/${s.id}`).set(auth2).send({ title: 'New section' }).expect(200);
    await api().patch(`/api/v1/content/units/${u.id}`).set(auth2).send({ title: 'New unit' }).expect(200);

    const tree = await api()
      .get(`/api/v1/content/courses/${courseId}/tree?level=UpperIntermediate`)
      .set(auth2)
      .expect(200);
    expect(tree.body.sections[0].title).toBe('New section');
    expect(tree.body.sections[0].units[0].title).toBe('New unit');

    // An empty title is rejected, and a student cannot rename at all.
    await api().patch(`/api/v1/content/sections/${s.id}`).set(auth2).send({ title: '' }).expect(400);
    await api().patch(`/api/v1/content/units/${u.id}`).set(auth(student.accessToken)).send({ title: 'x' }).expect(403);
    await api().patch(`/api/v1/content/sections/nope`).set(auth2).send({ title: 'x' }).expect(404);
  });
});
