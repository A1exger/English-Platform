import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AiClient } from '../src/generation/ai-client';

// The main content suite deliberately runs with no model configured — it asserts
// the 503 you get without one — so the translate path needs its own app with the
// client stubbed. The stub answers in the shape the prompt asks for.
const mockAi = {
  enabled: true,
  json: async (_system: string, user: string) => {
    const { words } = JSON.parse(user) as { words: { word: string }[] };
    return {
      items: words.map((w) => ({
        t: {
          en: `meaning of ${w.word}`,
          ru: `ru:${w.word}`,
          de: `de:${w.word}`,
          fr: `fr:${w.word}`,
          nl: `nl:${w.word}`,
          ar: `ar:${w.word}`,
        },
      })),
    };
  },
};

describe('word bank: filling in missing translations (e2e, mocked model)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tutor: { accessToken: string };

  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

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
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email: 'wb.tutor@test.com', password: 'Password123!', role: 'tutor', firstName: 'F', lastName: 'L' })
      .expect(201);
    tutor = res.body as { accessToken: string };
  });

  afterAll(async () => {
    await prisma.cleanDatabase();
    await app.close();
  });

  const at = async (word: string, lang: string) =>
    (
      await api()
        .get(`/api/v1/content/word-bank?q=${encodeURIComponent(word)}`)
        .set(auth(tutor.accessToken))
        .set('x-lang', lang)
        .expect(200)
    ).body.find((w: { word: string }) => w.word === word);

  /** Translation after an import runs in the background; give it a moment. */
  const untilTranslated = async () => {
    for (let i = 0; i < 40; i++) {
      const r = await api().get('/api/v1/content/word-bank/untranslated').set(auth(tutor.accessToken));
      if (r.body.missing === 0) return;
      await new Promise((res) => setTimeout(res, 50));
    }
    throw new Error('background translation did not finish');
  };

  it('translates words as they are imported, without holding up the paste', async () => {
    const a = auth(tutor.accessToken);
    // One word with no translation at all, one with a Russian gloss of the
    // tutor's own — their wording must survive the fill.
    const imported = await api().post('/api/v1/content/word-bank/import').set(a).set('x-lang', 'ru')
      .send({ text: 'take over\nstand down = отступить', topic: 'Phrasal' }).expect(201);
    // The import answers immediately and says the filling is under way, rather
    // than making the tutor wait a model call per 40 words.
    expect(imported.body).toMatchObject({ imported: 2, translating: true });

    await untilTranslated();

    // A blank word now reads in every language, and gains an English meaning.
    expect((await at('take over', 'de')).translation).toBe('de:take over');
    expect((await at('take over', 'fr')).translation).toBe('fr:take over');
    expect((await at('take over', 'de')).definition).toBe('meaning of take over');
    // The tutor's Russian is untouched; the rest is filled around it.
    expect((await at('stand down', 'ru')).translation).toBe('отступить');
    expect((await at('stand down', 'nl')).translation).toBe('nl:stand down');
  });

  it('fills words that were already in the bank, which no import will revisit', async () => {
    const a = auth(tutor.accessToken);
    // Exactly the state a bank is left in by hand-added words: one with nothing,
    // one with only the language it was typed in.
    await prisma.wordBankEntry.create({ data: { word: 'take up', topic: 'Phrasal' } });
    await prisma.wordBankEntry.create({
      data: {
        word: 'carry on',
        translation: 'продолжать',
        translations: JSON.stringify({ ru: 'продолжать' }),
        topic: 'Phrasal',
      },
    });
    expect((await api().get('/api/v1/content/word-bank/untranslated').set(a).expect(200)).body.missing)
      .toBe(2);

    const res = await api().post('/api/v1/content/word-bank/translate').set(a).expect(201);
    expect(res.body).toMatchObject({ translated: 2, remaining: 0, failed: 0 });
    expect((await at('take up', 'ar')).translation).toBe('ar:take up');
    expect((await at('carry on', 'ru')).translation).toBe('продолжать');
    expect((await at('carry on', 'de')).translation).toBe('de:carry on');
  });

  it('is a no-op once nothing is missing, and never rewrites a gloss', async () => {
    const a = auth(tutor.accessToken);
    const again = await api().post('/api/v1/content/word-bank/translate').set(a).expect(201);
    expect(again.body.translated).toBe(0);
    expect((await at('stand down', 'ru')).translation).toBe('отступить');
  });

  it('counts the starter pack as complete — it ships glossed in every language', async () => {
    const a = auth(tutor.accessToken);
    await api().post('/api/v1/content/word-bank/seed').set(a).expect(201);
    expect((await api().get('/api/v1/content/word-bank/untranslated').set(a).expect(200)).body.missing)
      .toBe(0);
  });

  it('only staff may fill or count', async () => {
    const student = (
      await api()
        .post('/api/v1/auth/register')
        .send({ email: 'wb.student@test.com', password: 'Password123!', role: 'student', firstName: 'F', lastName: 'L' })
        .expect(201)
    ).body as { accessToken: string };
    await api().post('/api/v1/content/word-bank/translate').set(auth(student.accessToken)).expect(403);
    await api().get('/api/v1/content/word-bank/untranslated').set(auth(student.accessToken)).expect(403);
  });
});
