import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Phase 4 (content homework: snapshot assignments, cards, results) + Phase 6
// (dictionary trainer + progress counters). Traceable acceptance for INV-3/4/5/7.
describe('Phase 4/6: homework, results, dictionary, progress (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tutor: { accessToken: string };
  let student: { accessToken: string };
  let other: { accessToken: string };
  let studentProfileId: string;
  let lessonId: string;
  const master: Record<string, string> = {}; // type -> master task id
  let assignmentId: string;
  const cardByType: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
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
    tutor = await register('h.tutor@test.com', 'tutor');
    student = await register('h.student@test.com', 'student');
    other = await register('h.other@test.com', 'student');
    studentProfileId = (
      await prisma.studentProfile.findFirstOrThrow({ where: { user: { email: 'h.student@test.com' } } })
    ).id;

    const cat = await api().post('/api/v1/content/categories').set(auth(tutor.accessToken)).send({ title: 'C' }).expect(201);
    const course = await api().post('/api/v1/content/courses').set(auth(tutor.accessToken)).send({ categoryId: cat.body.id, title: 'K' }).expect(201);
    await api().patch(`/api/v1/content/courses/${course.body.id}`).set(auth(tutor.accessToken)).send({ status: 'published' }).expect(200);
    const section = await api().post('/api/v1/content/sections').set(auth(tutor.accessToken)).send({ courseId: course.body.id, level: 'Elementary', title: 'S' }).expect(201);
    const unit = await api().post('/api/v1/content/units').set(auth(tutor.accessToken)).send({ sectionId: section.body.id, title: 'U' }).expect(201);
    const lesson = await api().post('/api/v1/content/lessons').set(auth(tutor.accessToken)).send({ unitId: unit.body.id, title: 'L' }).expect(201);
    lessonId = lesson.body.id;
    const page = await api()
      .post('/api/v1/content/pages')
      .set(auth(tutor.accessToken))
      .send({ courseLessonId: lessonId, type: 'practice', includedInHomework: true })
      .expect(201);

    const mk = async (type: string, gradingMode: string, aspect: string, payload: unknown, answerKey?: unknown) => {
      const res = await api()
        .post('/api/v1/content/tasks')
        .set(auth(tutor.accessToken))
        .send({ pageId: page.body.id, type, gradingMode, aspect, payload, answerKey })
        .expect(201);
      master[type] = res.body.id;
    };
    await mk('multiple_choice', 'AUTO', 'Grammar', { question: 'G?', options: ['a', 'b'] }, { correct: 'a' });
    await mk('gap_fill', 'AUTO', 'Reading', { text: 'I [go].' }, { answers: ['go'] });
    await mk('essay', 'MANUAL', 'Writing', { prompt: 'Write' });
  });

  afterAll(async () => {
    await prisma.cleanDatabase();
    await app.close();
  });

  it('tutor assigns a lesson as homework, snapshotting its tasks (INV-7)', async () => {
    const res = await api()
      .post('/api/v1/assignments')
      .set(auth(tutor.accessToken))
      .send({ studentProfileId, kind: 'homework', courseLessonId: lessonId, topicTag: 'Present Simple' })
      .expect(201);
    assignmentId = res.body.id;
    expect(res.body.cards).toHaveLength(3);
    expect(res.body.status).toBe('assigned');
    for (const c of res.body.cards) cardByType[c.type] = c.id;
    // Student-facing cards never leak the answer key.
    expect(JSON.stringify(res.body.cards)).not.toContain('answerKey');
  });

  it('INV-7: editing the master task after assigning does not change the card', async () => {
    // Tutor flips the master MC answer to 'b' AFTER the snapshot was taken.
    await api()
      .patch(`/api/v1/content/tasks/${master.multiple_choice}`)
      .set(auth(tutor.accessToken))
      .send({ answerKey: { correct: 'b' } })
      .expect(200);
    // Student answers the ORIGINAL correct 'a' -> still full marks vs the snapshot.
    const r = await api()
      .post(`/api/v1/assignments/cards/${cardByType.multiple_choice}/submit`)
      .set(auth(student.accessToken))
      .send({ state: { answer: 'a' } })
      .expect(201);
    expect(r.body.score).toBe(10);
  });

  it('student submits the rest; AUTO scores, MANUAL completes (INV-5)', async () => {
    const gap = await api()
      .post(`/api/v1/assignments/cards/${cardByType.gap_fill}/submit`)
      .set(auth(student.accessToken))
      .send({ state: { answers: ['go'] } })
      .expect(201);
    expect(gap.body.score).toBe(10);

    const essay = await api()
      .post(`/api/v1/assignments/cards/${cardByType.essay}/submit`)
      .set(auth(student.accessToken))
      .send({ state: { text: 'My essay.' } })
      .expect(201);
    expect(essay.body.completed).toBe(true);
    expect(essay.body.score).toBeUndefined();
  });

  it('result aggregates AUTO only (INV-4) and the assignment is done (INV-3)', async () => {
    const detail = await api().get(`/api/v1/assignments/${assignmentId}`).set(auth(student.accessToken)).expect(200);
    expect(detail.body.status).toBe('done');
    expect(detail.body.result.overall).toBe(10);
    expect(detail.body.result.perAspect).toEqual({ Grammar: 10, Reading: 10 });
    expect(detail.body.result.perAspect.Writing).toBeUndefined(); // MANUAL excluded
    expect(detail.body.result.completion).toBe(100);
    expect(detail.body.result.motivationTier).toBe('excellent');
  });

  it('tutor leaves manual feedback on the essay card', async () => {
    await api()
      .post(`/api/v1/assignments/cards/${cardByType.essay}/grade`)
      .set(auth(tutor.accessToken))
      .send({ feedback: 'Great work!' })
      .expect(201);
    const detail = await api().get(`/api/v1/assignments/${assignmentId}`).set(auth(tutor.accessToken)).expect(200);
    const essayCard = detail.body.cards.find((c: { type: string }) => c.type === 'essay');
    expect(essayCard.feedback).toBe('Great work!');
  });

  it('assignments are private: another student cannot view, students cannot grade', async () => {
    await api().get(`/api/v1/assignments/${assignmentId}`).set(auth(other.accessToken)).expect(403);
    await api()
      .post(`/api/v1/assignments/cards/${cardByType.essay}/grade`)
      .set(auth(student.accessToken))
      .send({ feedback: 'x' })
      .expect(403);
  });

  it('pool mode: assign explicit tasks by id', async () => {
    const res = await api()
      .post('/api/v1/assignments')
      .set(auth(tutor.accessToken))
      .send({ studentProfileId, kind: 'homework', taskIds: [master.gap_fill] })
      .expect(201);
    expect(res.body.cards).toHaveLength(1);
    expect(res.body.cards[0].type).toBe('gap_fill');
  });

  it('dictionary trainer: add, list due, review promotes and defers (Phase 6)', async () => {
    await api()
      .post('/api/v1/content/dictionary')
      .set(auth(student.accessToken))
      .send({ word: 'commute', translation: 'ездить', sourceLessonId: lessonId })
      .expect(201);
    const list = await api().get('/api/v1/content/dictionary').set(auth(student.accessToken)).expect(200);
    const entry = list.body.find((e: { word: string }) => e.word === 'commute');
    expect(entry.due).toBe(true); // never reviewed -> due now

    const reviewed = await api()
      .post(`/api/v1/content/dictionary/${entry.id}/review`)
      .set(auth(student.accessToken))
      .send({ remembered: true })
      .expect(201);
    expect(reviewed.body.repetitions).toBe(1);
    expect(reviewed.body.due).toBe(false); // deferred by the schedule
  });

  it('progress: both counters + forecast reflect the finished lesson (INV-3)', async () => {
    const prog = await api().get('/api/v1/content/progress').set(auth(student.accessToken)).expect(200);
    const course = prog.body.courses.find((c: { level: string }) => c.level === 'Elementary');
    expect(course.courseCompletion).toBe(100); // 1 of 1 required lesson done
    expect(course.goalProgress).toBe(10);
    expect(course.forecast.remaining).toBe(0);
    expect(prog.body.overall.goalProgress).toBe(10);
  });
});
