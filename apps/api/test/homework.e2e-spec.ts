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

  it('everything handed in, essay unread -> needs_review, not done (INV-3)', async () => {
    const detail = await api().get(`/api/v1/assignments/${assignmentId}`).set(auth(student.accessToken)).expect(200);
    // The student is finished; the tutor is not. "done" would claim otherwise.
    expect(detail.body.status).toBe('needs_review');
    expect(detail.body.result.overall).toBe(10);
    expect(detail.body.result.perAspect).toEqual({ Grammar: 10, Reading: 10 });
    // Ungraded, so it has no average to contribute yet.
    expect(detail.body.result.perAspect.Writing).toBeUndefined();
    expect(detail.body.result.completion).toBe(100);
    expect(detail.body.result.motivationTier).toBe('excellent');
  });

  it('a lesson waiting on review still counts as done for the student', async () => {
    // The tutor's queue is not the student's problem: course progress counts
    // the lesson the moment they hand it in.
    const progress = await api().get('/api/v1/content/progress').set(auth(student.accessToken)).expect(200);
    const course = progress.body.courses.find((c: { level: string }) => c.level === 'Elementary');
    expect(course.lessonsDone).toBe(1);
    expect(course.courseCompletion).toBe(100);
  });

  it('the tutor list shows how many tasks are waiting to be read', async () => {
    const list = await api().get('/api/v1/assignments').set(auth(tutor.accessToken)).expect(200);
    const row = list.body.find((a: { id: string }) => a.id === assignmentId);
    expect(row.status).toBe('needs_review');
    expect(row.awaitingReview).toBe(1);
  });

  it('a nonsense score is refused, not stored (0–10)', async () => {
    for (const score of ['abc', 999, -5]) {
      await api()
        .post(`/api/v1/assignments/cards/${cardByType.essay}/grade`)
        .set(auth(tutor.accessToken))
        .send({ score })
        .expect(400);
    }
    const detail = await api().get(`/api/v1/assignments/${assignmentId}`).set(auth(tutor.accessToken)).expect(200);
    const essayCard = detail.body.cards.find((c: { type: string }) => c.type === 'essay');
    expect(essayCard.score).toBeNull();
  });

  it('tutor grades the essay: the score lands in the result and the status flips to done', async () => {
    await api()
      .post(`/api/v1/assignments/cards/${cardByType.essay}/grade`)
      .set(auth(tutor.accessToken))
      .send({ score: 7, feedback: 'Great work!' })
      .expect(201);
    const detail = await api().get(`/api/v1/assignments/${assignmentId}`).set(auth(tutor.accessToken)).expect(200);
    const essayCard = detail.body.cards.find((c: { type: string }) => c.type === 'essay');
    expect(essayCard.feedback).toBe('Great work!');
    expect(essayCard.score).toBe(7);
    // Nothing left unread -> done, and the tutor's 7 is in the average.
    expect(detail.body.status).toBe('done');
    expect(detail.body.awaitingReview).toBe(0);
    expect(detail.body.result.perAspect.Writing).toBe(7);
    expect(detail.body.result.overall).toBe(9);
  });

  it('notifies the tutor when homework is finished and the student when feedback lands', async () => {
    // Finishing the assignment (previous tests) pinged the tutor…
    const tutorUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'h.tutor@test.com' },
    });
    const toTutor = await prisma.notification.findMany({
      where: { userId: tutorUser.id, templateKey: 'homework_submitted' },
    });
    expect(toTutor.length).toBeGreaterThan(0);

    // …and the tutor's written feedback pinged the student, on every channel.
    const studentUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'h.student@test.com' },
    });
    const toStudent = await prisma.notification.findMany({
      where: { userId: studentUser.id, templateKey: 'homework_feedback' },
    });
    expect(toStudent.map((n) => n.channel).sort()).toEqual(['email', 'in_app']);
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
    // 10, 10 auto-scored and the essay the tutor marked 7 -> 9.
    expect(course.goalProgress).toBe(9);
    expect(course.forecast.remaining).toBe(0);
    expect(prog.body.overall.goalProgress).toBe(9);
  });
});
