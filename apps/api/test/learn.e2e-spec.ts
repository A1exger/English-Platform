import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Phase 3: task runtime + preparation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tutor: { accessToken: string };
  let student: { accessToken: string };
  let lessonId: string;
  const taskIds: Record<string, string> = {};

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
    tutor = await register('l.tutor@test.com', 'tutor');
    student = await register('l.student@test.com', 'student');

    // Build a published course with one lesson and all gradable task types.
    const cat = await api().post('/api/v1/content/categories').set(auth(tutor.accessToken)).send({ title: 'C' }).expect(201);
    const course = await api().post('/api/v1/content/courses').set(auth(tutor.accessToken)).send({ categoryId: cat.body.id, title: 'K' }).expect(201);
    await api().patch(`/api/v1/content/courses/${course.body.id}`).set(auth(tutor.accessToken)).send({ status: 'published' }).expect(200);
    const section = await api().post('/api/v1/content/sections').set(auth(tutor.accessToken)).send({ courseId: course.body.id, level: 'Elementary', title: 'S' }).expect(201);
    const unit = await api().post('/api/v1/content/units').set(auth(tutor.accessToken)).send({ sectionId: section.body.id, title: 'U' }).expect(201);
    const lesson = await api().post('/api/v1/content/lessons').set(auth(tutor.accessToken)).send({ unitId: unit.body.id, title: 'L' }).expect(201);
    lessonId = lesson.body.id;
    const page = await api().post('/api/v1/content/pages').set(auth(tutor.accessToken)).send({ courseLessonId: lessonId, type: 'practice' }).expect(201);

    const mk = async (type: string, gradingMode: string, payload: unknown, answerKey?: unknown) => {
      const res = await api()
        .post('/api/v1/content/tasks')
        .set(auth(tutor.accessToken))
        .send({ pageId: page.body.id, type, gradingMode, aspect: 'Grammar', payload, answerKey })
        .expect(201);
      taskIds[type] = res.body.id;
    };
    await mk('sentence_ordering', 'AUTO', { words: ['I', 'go', 'home'] }, { order: ['I', 'go', 'home'] });
    await mk('word_matching', 'AUTO', { pairs: [{ left: 'dog', right: 'chien' }, { left: 'cat', right: 'chat' }] }, { map: { dog: 'chien', cat: 'chat' } });
    await mk('gap_fill', 'AUTO', { text: 'I [go] to [school].' }, { answers: ['go', 'school'] });
    await mk('categorization', 'AUTO', { categories: ['a', 'b'], items: [{ text: 'x', category: 'a' }, { text: 'y', category: 'b' }] }, { placement: { x: 'a', y: 'b' } });
    await mk('multiple_choice', 'AUTO', { question: 'He ___', options: ['wake', 'wakes'] }, { correct: 'wakes' });
    await mk('essay', 'MANUAL', { prompt: 'Write about your day' });
    await mk('discussion', 'COMPLETION', { prompt: 'Discuss' });
  });

  afterAll(async () => {
    await prisma.cleanDatabase();
    await app.close();
  });

  it('student receives sanitized questions: no payload/answerKey, shuffled tokens present', async () => {
    const detail = await api().get(`/api/v1/content/lessons/${lessonId}`).set(auth(student.accessToken)).expect(200);
    const tasks = detail.body.pages[0].tasks;
    const ordering = tasks.find((t: { type: string }) => t.type === 'sentence_ordering');
    expect(ordering.payload).toBeUndefined();
    expect(ordering.answerKey).toBeUndefined();
    expect(ordering.question.tokens).toHaveLength(3); // shuffled bank, no order info
    const fill = tasks.find((t: { type: string }) => t.type === 'gap_fill');
    expect(fill.question.segments).toBeDefined();
    expect(JSON.stringify(fill.question)).not.toContain('[go]');
  });

  it('AUTO checks score on the 0-10 scale with partial credit', async () => {
    const full = await api()
      .post(`/api/v1/content/tasks/${taskIds.sentence_ordering}/check`)
      .set(auth(student.accessToken))
      .send({ state: { order: ['I', 'go', 'home'] } })
      .expect(201);
    expect(full.body.score).toBe(10);
    expect(full.body.correct).toBe(true);
    expect(full.body.solution.order).toEqual(['I', 'go', 'home']);

    const half = await api()
      .post(`/api/v1/content/tasks/${taskIds.gap_fill}/check`)
      .set(auth(student.accessToken))
      .send({ state: { answers: ['go', 'wrong'] } })
      .expect(201);
    expect(half.body.score).toBe(5);
    expect(half.body.correct).toBe(false);

    const mcWrong = await api()
      .post(`/api/v1/content/tasks/${taskIds.multiple_choice}/check`)
      .set(auth(student.accessToken))
      .send({ state: { answer: 'wake' } })
      .expect(201);
    expect(mcWrong.body.score).toBe(0);

    const match = await api()
      .post(`/api/v1/content/tasks/${taskIds.word_matching}/check`)
      .set(auth(student.accessToken))
      .send({ state: { map: { dog: 'chien', cat: 'chien' } } })
      .expect(201);
    expect(match.body.score).toBe(5);

    const cat = await api()
      .post(`/api/v1/content/tasks/${taskIds.categorization}/check`)
      .set(auth(student.accessToken))
      .send({ state: { placement: { x: 'a', y: 'a' } } })
      .expect(201);
    expect(cat.body.score).toBe(5);
  });

  it('MANUAL and COMPLETION checks return completed without a score (INV-5)', async () => {
    const essay = await api()
      .post(`/api/v1/content/tasks/${taskIds.essay}/check`)
      .set(auth(student.accessToken))
      .send({ state: { text: 'my essay' } })
      .expect(201);
    expect(essay.body.completed).toBe(true);
    expect(essay.body.score).toBeUndefined();

    const disc = await api()
      .post(`/api/v1/content/tasks/${taskIds.discussion}/check`)
      .set(auth(student.accessToken))
      .send({ state: {} })
      .expect(201);
    expect(disc.body.completed).toBe(true);
  });

  it('dictionary: add from wordlist, list, dedupe by word', async () => {
    await api()
      .post('/api/v1/content/dictionary')
      .set(auth(student.accessToken))
      .send({ word: 'commute', translation: 'добираться', sourceLessonId: lessonId })
      .expect(201);
    await api()
      .post('/api/v1/content/dictionary')
      .set(auth(student.accessToken))
      .send({ word: 'commute', translation: 'ездить на работу' })
      .expect(201);
    const list = await api().get('/api/v1/content/dictionary').set(auth(student.accessToken)).expect(200);
    expect(list.body.length).toBe(1);
    expect(list.body[0].translation).toBe('ездить на работу');
  });
});
