import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Interactive exercises (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tutor: { accessToken: string };
  let student: { accessToken: string };
  let studentProfileId: string;
  let orderId: string;
  let fillId: string;
  let lessonId: string;
  let canonicalId: string;

  const api = () => request(app.getHttpServer());
  const register = async (email: string, role: string) => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password123!', role, firstName: 'F', lastName: 'L' })
      .expect(201);
    return res.body as { accessToken: string };
  };
  const auth = (tok: string) => ({ Authorization: `Bearer ${tok}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.cleanDatabase();
    tutor = await register('ex.tutor@test.com', 'tutor');
    student = await register('ex.student@test.com', 'student');
    studentProfileId = (await prisma.studentProfile.findFirst({ where: { user: { email: 'ex.student@test.com' } } }))!.id;
  });

  afterAll(async () => {
    await prisma.cleanDatabase();
    await app.close();
  });

  it('tutor creates an order exercise; getOne reveals the solution to the owner', async () => {
    const res = await api()
      .post('/api/v1/exercises')
      .set(auth(tutor.accessToken))
      .send({ type: 'order', title: 'Word order', payload: { words: ['I', 'go', 'to', 'school'] } })
      .expect(201);
    orderId = res.body.id;
    const full = await api().get(`/api/v1/exercises/${orderId}`).set(auth(tutor.accessToken)).expect(200);
    expect(full.body.payload.words).toEqual(['I', 'go', 'to', 'school']);
  });

  it('rejects an invalid exercise payload', async () => {
    await api()
      .post('/api/v1/exercises')
      .set(auth(tutor.accessToken))
      .send({ type: 'order', title: 'bad', payload: { words: ['only'] } })
      .expect(400);
  });

  it('student cannot create exercises', async () => {
    await api()
      .post('/api/v1/exercises')
      .set(auth(student.accessToken))
      .send({ type: 'order', title: 'x', payload: { words: ['a', 'b'] } })
      .expect(403);
  });

  it('duplicate creates a copy', async () => {
    const res = await api().post(`/api/v1/exercises/${orderId}/duplicate`).set(auth(tutor.accessToken)).expect(201);
    expect(res.body.title).toContain('(copy)');
  });

  it('live: push to a booked lesson, student gets a sanitized question and scores 100', async () => {
    const lesson = await api()
      .post('/api/v1/lessons')
      .set(auth(tutor.accessToken))
      .send({ title: 'L', startsAt: new Date(Date.now() + 3600000).toISOString(), endsAt: new Date(Date.now() + 7200000).toISOString() })
      .expect(201);
    lessonId = lesson.body.id;
    await api().post(`/api/v1/lessons/${lessonId}/book`).set(auth(student.accessToken)).expect(201);

    const pushed = await api()
      .post(`/api/v1/lessons/${lessonId}/board/exercises`)
      .set(auth(tutor.accessToken))
      .send({ exerciseId: orderId })
      .expect(201);
    const instanceId = pushed.body.id;

    const view = await api().get(`/api/v1/exercise-instances/${instanceId}`).set(auth(student.accessToken)).expect(200);
    expect(view.body.question.tokens).toHaveLength(4);
    expect(view.body.question.words).toBeUndefined(); // no solution leaked

    await api()
      .patch(`/api/v1/exercise-instances/${instanceId}/state`)
      .set(auth(student.accessToken))
      .send({ state: { order: ['I', 'go', 'to', 'school'] } })
      .expect(200);
    const check = await api().post(`/api/v1/exercise-instances/${instanceId}/check`).set(auth(student.accessToken)).expect(201);
    expect(check.body.score).toBe(100);
    expect(check.body.correct).toBe(true);

    // student can list active lesson exercises
    const listed = await api().get(`/api/v1/lessons/${lessonId}/board/exercises`).set(auth(student.accessToken)).expect(200);
    expect(listed.body.length).toBe(1);
  });

  it('fill-in scores partially', async () => {
    const ex = await api()
      .post('/api/v1/exercises')
      .set(auth(tutor.accessToken))
      .send({ type: 'fill', title: 'Fill', payload: { text: 'I [go] to [school].' } })
      .expect(201);
    fillId = ex.body.id;
    const pushed = await api().post(`/api/v1/lessons/${lessonId}/board/exercises`).set(auth(tutor.accessToken)).send({ exerciseId: fillId }).expect(201);
    await api()
      .patch(`/api/v1/exercise-instances/${pushed.body.id}/state`)
      .set(auth(student.accessToken))
      .send({ state: { answers: ['go', 'wrong'] } })
      .expect(200);
    const check = await api().post(`/api/v1/exercise-instances/${pushed.body.id}/check`).set(auth(student.accessToken)).expect(201);
    expect(check.body.score).toBe(50);
  });

  it('homework: assign exercises to a student, who solves and gets graded', async () => {
    await api()
      .post('/api/v1/homework/assign')
      .set(auth(tutor.accessToken))
      .send({ studentProfileIds: [studentProfileId], exerciseIds: [orderId], title: 'HW exercises' })
      .expect(201);

    const hwList = await api().get('/api/v1/homework').set(auth(student.accessToken)).expect(200);
    const hw = hwList.body.find((h: { title: string }) => h.title === 'HW exercises');
    expect(hw.exercises.length).toBe(1);
    const instanceId = hw.exercises[0].id;

    await api()
      .patch(`/api/v1/exercise-instances/${instanceId}/state`)
      .set(auth(student.accessToken))
      .send({ state: { order: ['I', 'go', 'to', 'school'] } })
      .expect(200);
    await api().post(`/api/v1/exercise-instances/${instanceId}/check`).set(auth(student.accessToken)).expect(201);

    const after = await api().get('/api/v1/homework').set(auth(student.accessToken)).expect(200);
    const gradedHw = after.body.find((h: { title: string }) => h.title === 'HW exercises');
    expect(gradedHw.status).toBe('graded');
    expect(gradedHw.exercises[0].score).toBe(100);
  });

  // --- Stage 2: canonical standalone exercises ------------------------------

  it('canonical: creates a sentence_ordering exercise; owner sees the tokens', async () => {
    const res = await api()
      .post('/api/v1/exercises')
      .set(auth(tutor.accessToken))
      .send({
        type: 'sentence_ordering',
        title: 'Never been',
        prompt: 'Put the words in order',
        aspect: 'Grammar',
        payload: { tokens: ['I', 'have', 'never', 'been', 'to', 'London'] },
      })
      .expect(201);
    canonicalId = res.body.id;
    const full = await api()
      .get(`/api/v1/exercises/${canonicalId}`)
      .set(auth(tutor.accessToken))
      .expect(200);
    expect(full.body.type).toBe('sentence_ordering');
    expect(full.body.payload.tokens).toHaveLength(6);
    expect(full.body.answerKey).toBeNull(); // order is the answer; nothing extra to hide
  });

  it('canonical: blocks a sentence with fewer than 2 tokens (ФТ-У105)', async () => {
    await api()
      .post('/api/v1/exercises')
      .set(auth(tutor.accessToken))
      .send({ type: 'sentence_ordering', title: 'bad', payload: { tokens: ['only'] } })
      .expect(400);
  });

  it('canonical: blocks a gap_fill whose answer is not in the bank (ФТ-У105)', async () => {
    await api()
      .post('/api/v1/exercises')
      .set(auth(tutor.accessToken))
      .send({
        type: 'gap_fill',
        title: 'bad gap',
        payload: { segments: ['I ', { gap: 'g1' }, ' to school.'], bank: ['run', 'walk'] },
        answerKey: { g1: 'go' },
      })
      .expect(400);
  });

  it('canonical: accepts a valid gap_fill and keeps the answerKey server-side', async () => {
    const res = await api()
      .post('/api/v1/exercises')
      .set(auth(tutor.accessToken))
      .send({
        type: 'gap_fill',
        title: 'good gap',
        payload: { segments: ['I ', { gap: 'g1' }, ' to school.'], bank: ['go', 'went'] },
        answerKey: { g1: 'go' },
      })
      .expect(201);
    const full = await api()
      .get(`/api/v1/exercises/${res.body.id}`)
      .set(auth(tutor.accessToken))
      .expect(200);
    expect(full.body.answerKey).toEqual({ g1: 'go' });
  });

  it('canonical: still cannot be assigned as homework (arrives in Stage 5)', async () => {
    await api()
      .post('/api/v1/homework/assign')
      .set(auth(tutor.accessToken))
      .send({
        studentProfileIds: [studentProfileId],
        exerciseIds: [canonicalId],
        title: 'HW canon',
      })
      .expect(400);
  });

  // --- Stage 3: canonical tasks on the live board ---------------------------

  it('canonical board: push sentence_ordering; server seeds a shuffled order', async () => {
    const pushed = await api()
      .post(`/api/v1/lessons/${lessonId}/board/exercises`)
      .set(auth(tutor.accessToken))
      .send({ exerciseId: canonicalId })
      .expect(201);
    expect(pushed.body.kind).toBe('canonical');
    expect(pushed.body.taskType).toBe('sentence_ordering');
    expect(pushed.body.state.order).toHaveLength(6); // seeded on the server

    const instId = pushed.body.id;
    const view = await api()
      .get(`/api/v1/exercise-instances/${instId}`)
      .set(auth(student.accessToken))
      .expect(200);
    expect(view.body.kind).toBe('canonical');
    expect(view.body.def.tokens).toHaveLength(6); // sanitized def
    expect(view.body.answerKey).toBeUndefined(); // эталон never reaches the student
    expect(view.body.result).toBeNull();

    // Student arranges the correct order (payload tokens are already correct).
    await api()
      .patch(`/api/v1/exercise-instances/${instId}/state`)
      .set(auth(student.accessToken))
      .send({ state: { order: [0, 1, 2, 3, 4, 5] } })
      .expect(200);
    const check = await api()
      .post(`/api/v1/exercise-instances/${instId}/check`)
      .set(auth(student.accessToken))
      .expect(201);
    expect(check.body.correct).toBe(true);
    expect(check.body.score).toBe(100);
    expect(check.body.solution).toBeUndefined(); // canonical never returns the эталон

    // Reload restores the persisted result (ФТ-У203/У503).
    const restored = await api()
      .get(`/api/v1/exercise-instances/${instId}`)
      .set(auth(student.accessToken))
      .expect(200);
    expect(restored.body.result.correct).toBe(true);

    const listed = await api()
      .get(`/api/v1/lessons/${lessonId}/board/exercises`)
      .set(auth(student.accessToken))
      .expect(200);
    expect(listed.body.some((i: { id: string }) => i.id === instId)).toBe(true);
  });

  it('canonical board: gap_fill returns per-gap marking, no answer leak', async () => {
    const ex = await api()
      .post('/api/v1/exercises')
      .set(auth(tutor.accessToken))
      .send({
        type: 'gap_fill',
        title: 'Board gaps',
        payload: { segments: ['I ', { gap: 'g1' }, ' to ', { gap: 'g2' }, '.'], bank: ['go', 'school', 'went', 'home'] },
        answerKey: { g1: 'go', g2: 'school' }
      })
      .expect(201);
    const pushed = await api()
      .post(`/api/v1/lessons/${lessonId}/board/exercises`)
      .set(auth(tutor.accessToken))
      .send({ exerciseId: ex.body.id })
      .expect(201);
    const instId = pushed.body.id;

    const view = await api()
      .get(`/api/v1/exercise-instances/${instId}`)
      .set(auth(student.accessToken))
      .expect(200);
    expect(view.body.def.bank).toEqual(expect.arrayContaining(['go', 'school']));
    expect(view.body.answerKey).toBeUndefined();

    // One gap right, one wrong → 50, with a per-gap map.
    await api()
      .patch(`/api/v1/exercise-instances/${instId}/state`)
      .set(auth(student.accessToken))
      .send({ state: { filled: { g1: 'go', g2: 'home' } } })
      .expect(200);
    const check = await api()
      .post(`/api/v1/exercise-instances/${instId}/check`)
      .set(auth(student.accessToken))
      .expect(201);
    expect(check.body.score).toBe(50);
    expect(check.body.perToken).toEqual({ g1: true, g2: false });
  });

  // --- Stage 4: the remaining canonical types (create + ФТ-У105) ------------

  it('canonical: word_matching creates, and needs at least 2 pairs', async () => {
    await api()
      .post('/api/v1/exercises')
      .set(auth(tutor.accessToken))
      .send({
        type: 'word_matching',
        title: 'Animals',
        payload: { rightType: 'text', pairs: [{ id: 'p1', left: 'cat', right: 'кошка' }, { id: 'p2', left: 'dog', right: 'собака' }] }
      })
      .expect(201);
    await api()
      .post('/api/v1/exercises')
      .set(auth(tutor.accessToken))
      .send({ type: 'word_matching', title: 'bad', payload: { rightType: 'text', pairs: [{ id: 'p1', left: 'cat', right: 'кошка' }] } })
      .expect(400);
  });

  it('canonical: categorization creates, and rejects an unknown category', async () => {
    await api()
      .post('/api/v1/exercises')
      .set(auth(tutor.accessToken))
      .send({
        type: 'categorization',
        title: 'Parts of speech',
        payload: {
          categories: [{ id: 'c1', label: 'Verbs' }, { id: 'c2', label: 'Nouns' }],
          items: [{ id: 'i1', text: 'run' }, { id: 'i2', text: 'table' }]
        },
        answerKey: { i1: 'c1', i2: 'c2' }
      })
      .expect(201);
    await api()
      .post('/api/v1/exercises')
      .set(auth(tutor.accessToken))
      .send({
        type: 'categorization',
        title: 'bad',
        payload: { categories: [{ id: 'c1', label: 'Verbs' }, { id: 'c2', label: 'Nouns' }], items: [{ id: 'i1', text: 'run' }] },
        answerKey: { i1: 'c9' } // not a real category
      })
      .expect(400);
  });

  it('canonical: multiple_choice creates, and rejects an out-of-range answer', async () => {
    await api()
      .post('/api/v1/exercises')
      .set(auth(tutor.accessToken))
      .send({ type: 'multiple_choice', title: 'Capitals', payload: { question: 'Capital of France?', options: ['Paris', 'Rome', 'Berlin'] }, answerKey: { correct: 0 } })
      .expect(201);
    await api()
      .post('/api/v1/exercises')
      .set(auth(tutor.accessToken))
      .send({ type: 'multiple_choice', title: 'bad', payload: { question: 'x', options: ['a', 'b'] }, answerKey: { correct: 5 } })
      .expect(400);
  });
});
