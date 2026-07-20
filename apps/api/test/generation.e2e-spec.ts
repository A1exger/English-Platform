import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AiClient } from '../src/generation/ai-client';

// Canned AI responses so the whole pipeline runs without a real API key. The
// mock keys off the prompt text (skeleton vs lesson) and fails FAIL_TOPIC.
const SKELETON = {
  units: [
    {
      title: 'Unit 1',
      lessons: [
        { title: 'Lesson 1', objectives: ['Understand the present perfect'] },
        { title: 'Lesson 2', objectives: ['Practise it'] }
      ]
    }
  ]
};
const LESSON = {
  pages: [
    {
      type: 'listening',
      text: 'Read and practise.',
      media: [
        { kind: 'audio', note: 'A short dialogue', transcript: 'A: Have you finished? B: Yes, I have.' },
        { kind: 'image', note: 'A photo of London' }
      ],
      tasks: [
        { type: 'sentence_ordering', aspect: 'Grammar', payload: { words: ['I', 'have', 'arrived'] } },
        { type: 'multiple_choice', aspect: 'Reading', payload: { question: 'Which is correct?', options: ['have gone', 'has went'] }, answerKey: { correct: 'have gone' } },
        { type: 'gap_fill', aspect: 'Grammar', payload: { text: 'this has no bracketed answer' } } // dropped by К403
      ]
    }
  ],
  wordlist: [{ word: 'arrive', translation: 'прибыть' }],
  grammar: { title: 'Present Perfect', meaning: 'Past action with present relevance.', form: 'have/has + V3' }
};
const REVISED_LESSON = { ...LESSON, wordlist: [{ word: 'revised', translation: 'изменено' }] };

const mockAi = {
  enabled: true,
  json: async (_system: string, user: string) => {
    if (/FAIL_TOPIC/.test(user)) throw new Error('mock generation failure');
    if (/skeleton/i.test(user)) return SKELETON;
    return /REVISION INSTRUCTION/.test(user) ? REVISED_LESSON : LESSON;
  }
};

describe('AI generation (e2e, mocked model)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tutor: { accessToken: string };
  let student: { accessToken: string };

  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const register = async (email: string, role: string) => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password123!', role, firstName: 'F', lastName: 'L' })
      .expect(201);
    return res.body as { accessToken: string };
  };

  const settle = async (
    jobId: string,
  ): Promise<{ status: string; courseId: string | null; courseLessonId: string | null; error: string | null }> => {
    for (let i = 0; i < 60; i++) {
      const r = await api().get(`/api/v1/content/generate/${jobId}`).set(auth(tutor.accessToken)).expect(200);
      if (r.body.status !== 'generating') return r.body;
      await new Promise((res) => setTimeout(res, 25));
    }
    throw new Error('job did not settle');
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AiClient)
      .useValue(mockAi)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.cleanDatabase();
    tutor = await register('gen.tutor@test.com', 'tutor');
    student = await register('gen.student@test.com', 'student');
  });

  afterAll(async () => {
    await prisma.cleanDatabase();
    await app.close();
  });

  it('generates a draft course, materialises + validates it, then approves (ФТ-К401/К402/К403/К404)', async () => {
    const gen = await api()
      .post('/api/v1/content/generate')
      .set(auth(tutor.accessToken))
      .send({ topic: 'Present Perfect', level: 'Intermediate', units: 1, lessonsPerUnit: 1, aspects: ['Grammar', 'Reading'] })
      .expect(201);
    expect(gen.body.status).toBe('generating'); // ФТ-К401

    const done = await settle(gen.body.id);
    expect(done.status).toBe('ready_for_review'); // ФТ-К402
    expect(done.courseId).toBeTruthy();
    const courseId = done.courseId as string;

    // Draft: invisible to students until approved (ДИ-1).
    await api().get(`/api/v1/content/courses/${courseId}/tree?level=Intermediate`).set(auth(student.accessToken)).expect(403);

    const tree = await api().get(`/api/v1/content/courses/${courseId}/tree?level=Intermediate`).set(auth(tutor.accessToken)).expect(200);
    const lessonId = tree.body.sections[0].units[0].lessons[0].id;
    const detail = await api().get(`/api/v1/content/lessons/${lessonId}`).set(auth(tutor.accessToken)).expect(200);
    // The malformed gap_fill was dropped; two valid tasks remain (ФТ-К403).
    expect(detail.body.pages[0].tasks.length).toBe(2);
    expect(detail.body.wordlist.entries.length).toBe(1);
    expect(detail.body.grammarReference.title).toBe('Present Perfect');
    // Media plan: an audio slot with a transcript + an image slot (ФТ-К407).
    expect(detail.body.pages[0].media.length).toBe(2);
    const audio = detail.body.pages[0].media.find((m: { kind: string }) => m.kind === 'audio');
    expect(audio.transcript).toContain('finished');
    expect(audio.url).toBe(''); // an empty slot for the teacher to fill

    // Approve → published; now the student can see it (ФТ-К404).
    await api().post(`/api/v1/content/generate/${gen.body.id}/approve`).set(auth(tutor.accessToken)).expect(201);
    await api().get(`/api/v1/content/courses/${courseId}/tree?level=Intermediate`).set(auth(student.accessToken)).expect(200);
  });

  it('a failed job carries an error and leaves no published course (ФТ-К409)', async () => {
    const bad = await api()
      .post('/api/v1/content/generate')
      .set(auth(tutor.accessToken))
      .send({ topic: 'FAIL_TOPIC', level: 'Intermediate' })
      .expect(201);
    const failed = await settle(bad.body.id);
    expect(failed.status).toBe('failed');
    expect(failed.error).toBeTruthy();
    expect(failed.courseId).toBeNull(); // skeleton failed before any course was made
    await api().delete(`/api/v1/content/generate/${bad.body.id}`).set(auth(tutor.accessToken)).expect(200);
    await api().get(`/api/v1/content/generate/${bad.body.id}`).set(auth(tutor.accessToken)).expect(404);
  });

  it('deleting an unapproved job removes its draft course (ФТ-К409)', async () => {
    const g = await api()
      .post('/api/v1/content/generate')
      .set(auth(tutor.accessToken))
      .send({ topic: 'Throwaway', level: 'Intermediate', units: 1, lessonsPerUnit: 1 })
      .expect(201);
    const done = await settle(g.body.id);
    expect(done.status).toBe('ready_for_review');
    await api().delete(`/api/v1/content/generate/${g.body.id}`).set(auth(tutor.accessToken)).expect(200);
    // The draft course is gone.
    await api().get(`/api/v1/content/courses/${done.courseId}/tree?level=Intermediate`).set(auth(tutor.accessToken)).expect(404);
  });

  it('revise re-generates only the scoped lesson and records the revision (ФТ-К406)', async () => {
    const gen = await api()
      .post('/api/v1/content/generate')
      .set(auth(tutor.accessToken))
      .send({ topic: 'Revise me', level: 'Intermediate', units: 1, lessonsPerUnit: 2 })
      .expect(201);
    const done = await settle(gen.body.id);
    expect(done.status).toBe('ready_for_review');
    const courseId = done.courseId as string;
    const tree = await api().get(`/api/v1/content/courses/${courseId}/tree?level=Intermediate`).set(auth(tutor.accessToken)).expect(200);
    const lessons = tree.body.sections[0].units[0].lessons;
    expect(lessons.length).toBe(2);
    const [l1, l2] = lessons;

    await api()
      .post(`/api/v1/content/generate/${gen.body.id}/revise`)
      .set(auth(tutor.accessToken))
      .send({ scope: `lesson:${l1.id}`, instruction: 'make it harder' })
      .expect(201);
    const revised = await settle(gen.body.id);
    expect(revised.status).toBe('ready_for_review');

    const d1 = await api().get(`/api/v1/content/lessons/${l1.id}`).set(auth(tutor.accessToken)).expect(200);
    const d2 = await api().get(`/api/v1/content/lessons/${l2.id}`).set(auth(tutor.accessToken)).expect(200);
    expect(d1.body.wordlist.entries[0].word).toBe('revised'); // scoped lesson changed
    expect(d2.body.wordlist.entries[0].word).toBe('arrive'); // the other lesson is untouched

    const revs = await prisma.generationRevision.findMany({ where: { jobId: gen.body.id } });
    expect(revs.length).toBe(1);
    expect(revs[0].scope).toBe(`lesson:${l1.id}`);
  });

  it('generates a single lesson INTO a draft course, lists it, then unwinds on delete (ФТ-К402/К409, D2)', async () => {
    const cat = await api().post('/api/v1/content/categories').set(auth(tutor.accessToken)).send({ title: 'Lesson gen' }).expect(201);
    const course = await api()
      .post('/api/v1/content/courses')
      .set(auth(tutor.accessToken))
      .send({ categoryId: cat.body.id, title: 'Host course' })
      .expect(201);
    const courseId = course.body.id as string;

    const gen = await api()
      .post('/api/v1/content/generate')
      .set(auth(tutor.accessToken))
      .send({ targetType: 'LESSON', courseId, topic: 'Present Perfect', level: 'Intermediate', aspects: ['Grammar'] })
      .expect(201);
    const done = await settle(gen.body.id);
    expect(done.status).toBe('ready_for_review'); // ФТ-К402
    expect(done.courseId).toBe(courseId);
    expect(done.courseLessonId).toBeTruthy();

    // The lesson materialised inside the host course.
    const tree = await api().get(`/api/v1/content/courses/${courseId}/tree?level=Intermediate`).set(auth(tutor.accessToken)).expect(200);
    const lessonId = tree.body.sections[0].units[0].lessons[0].id;
    expect(lessonId).toBe(done.courseLessonId);
    const detail = await api().get(`/api/v1/content/lessons/${lessonId}`).set(auth(tutor.accessToken)).expect(200);
    expect(detail.body.pages[0].tasks.length).toBe(2); // К403 dropped the malformed gap_fill

    // §13 — the generated lesson lives in a draft course, invisible to students (ДИ-1).
    await api().get(`/api/v1/content/courses/${courseId}/tree?level=Intermediate`).set(auth(student.accessToken)).expect(403);

    // D2 — the editor lists the job for this course.
    const list = await api().get(`/api/v1/content/generate?courseId=${courseId}`).set(auth(tutor.accessToken)).expect(200);
    expect(list.body.length).toBe(1);
    expect(list.body[0].id).toBe(gen.body.id);
    expect(list.body[0].status).toBe('ready_for_review');

    // К409 — deleting the job unwinds the generated lesson (and its section/unit).
    await api().delete(`/api/v1/content/generate/${gen.body.id}`).set(auth(tutor.accessToken)).expect(200);
    const after = await api().get(`/api/v1/content/courses/${courseId}/tree?level=Intermediate`).set(auth(tutor.accessToken)).expect(200);
    const sections = after.body.sections as { units: { lessons: unknown[] }[] }[];
    const lessonsLeft = sections.reduce((n, s) => n + s.units.reduce((m, u) => m + u.lessons.length, 0), 0);
    expect(lessonsLeft).toBe(0);
  });

  it('refuses to generate a lesson into a PUBLISHED course (ДИ-1)', async () => {
    const cat = await api().post('/api/v1/content/categories').set(auth(tutor.accessToken)).send({ title: 'Pub gen' }).expect(201);
    const course = await api()
      .post('/api/v1/content/courses')
      .set(auth(tutor.accessToken))
      .send({ categoryId: cat.body.id, title: 'Published host' })
      .expect(201);
    const courseId = course.body.id as string;
    await api().patch(`/api/v1/content/courses/${courseId}`).set(auth(tutor.accessToken)).send({ status: 'published' }).expect(200);

    const gen = await api()
      .post('/api/v1/content/generate')
      .set(auth(tutor.accessToken))
      .send({ targetType: 'LESSON', courseId, topic: 'Blocked', level: 'Intermediate' })
      .expect(201);
    const done = await settle(gen.body.id);
    expect(done.status).toBe('failed'); // never edits a published course
    expect(done.error).toMatch(/draft/i);
  });

  it('students cannot request generation (ФТ-У801/RBAC)', async () => {
    await api()
      .post('/api/v1/content/generate')
      .set(auth(student.accessToken))
      .send({ topic: 'x', level: 'Intermediate' })
      .expect(403);
  });
});
